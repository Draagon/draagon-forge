# REQ-040: Configuration & Environment Extraction

**Status:** Draft
**Priority:** P2
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge from application configuration, environment variables, feature flags, and runtime settings. Enable the Code Knowledge Mesh to understand not just "what code exists" but "how it's configured, what environment variables it needs, and what features can be toggled."

**Key Capabilities:**
- **Environment Variable Extraction**: Required env vars, types, defaults
- **Configuration Schema Detection**: Config validation, nested structures
- **Feature Flag Mapping**: Flag definitions, conditions, affected code
- **Secret Detection**: Identifying sensitive configuration (without values)
- **Environment-Specific Config**: Dev/staging/prod differences
- **Config-to-Code Tracing**: What code depends on what config

---

## Problem Statement

### Why Configuration Extraction Matters

Configuration is scattered across files, environment variables, and code:

```typescript
// What structural extraction sees:
// - Variable: process.env.DATABASE_URL
// - Import: @nestjs/config

// What we NEED to understand:
// - DATABASE_URL is required for the app to start
// - It should be a valid PostgreSQL connection string
// - Default in development: localhost:5432
// - Must be set in production (no default)
// - Used by: DatabaseModule, UserRepository, OrderService
// - This is a SECRET - should not be logged
```

### The Configuration Complexity Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONFIGURATION SOURCES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   .env files    │  │  Config files   │  │   Environment              │ │
│  │   .env.local    │  │  config.json    │  │   Variables                │ │
│  │   .env.prod     │  │  config.yaml    │  │   (runtime)                │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  Feature Flags  │  │   Secrets       │  │   Build-time               │ │
│  │  LaunchDarkly   │  │   Manager       │  │   Constants                │ │
│  │  Split.io       │  │   Vault/AWS     │  │   process.env.NODE_ENV     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- What environment variables does this service need to run?
- Which config values are secrets vs. public settings?
- If I add a new feature flag, what code paths are affected?
- What's the difference between dev and prod configuration?
- Which environment variables have no default and will fail if missing?
- What configuration is validated at startup vs. runtime?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION EXTRACTION                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    SOURCE DETECTION                                      │   │
│  │   .env | .yaml | .json | process.env | ConfigService | Vault            │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               SOURCE-SPECIFIC EXTRACTORS                                 │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │    .env     │ │   YAML/     │ │  Code-based │ │  Feature Flag   │   │   │
│  │  │   Parser    │ │   JSON      │ │    Config   │ │   Services      │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    CONFIG GRAPH NODES                                    │   │
│  │  EnvVar | ConfigKey | FeatureFlag | Secret | ConfigSchema               │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  READS_CONFIG | DEPENDS_ON_FLAG | VALIDATES | OVERRIDES                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Configuration Nodes

### R1: Environment Variable Nodes

**R1.1: EnvVar Node Type**

```typescript
interface EnvVarNode {
  type: 'EnvVar';
  name: string;
  file: string;  // Where defined or first used
  line: number;

  // Type information
  expected_type: 'string' | 'number' | 'boolean' | 'json' | 'url' | 'unknown';
  format?: string;  // URL, email, path, etc.

  // Requirements
  required: boolean;
  has_default: boolean;
  default_value?: string;  // Don't store secret values

  // Classification
  is_secret: boolean;
  classification: 'public' | 'internal' | 'secret' | 'sensitive';

  // Environment-specific defaults
  env_defaults?: Record<string, string>;  // { development: 'localhost', staging: 'staging.example.com' }

  // Validation
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: string[];
  };

  // Usage
  used_in_files: string[];
  used_count: number;

  // Documentation
  description?: string;
}
```

**R1.2: ConfigKey Node Type**

```typescript
interface ConfigKeyNode {
  type: 'ConfigKey';
  key: string;  // e.g., 'database.host'
  file: string;
  line: number;

  // Nesting
  path: string[];  // ['database', 'host']
  parent_key?: string;

  // Value info
  value_type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default_value?: unknown;

  // Source
  source_type: 'env' | 'file' | 'hardcoded' | 'computed';
  env_var_source?: string;  // If from environment

  // Classification
  is_secret: boolean;

  // Schema
  schema?: JSONSchema;

  // Environment overrides
  environment_values?: Record<string, unknown>;  // By environment
}
```

### R2: Feature Flag Nodes

**R2.1: FeatureFlag Node Type**

```typescript
interface FeatureFlagNode {
  type: 'FeatureFlag';
  name: string;
  key: string;  // 'enable-new-checkout'
  file: string;
  line: number;

  // Flag configuration
  flag_type: 'boolean' | 'string' | 'number' | 'json';
  default_value: unknown;

  // Targeting
  targeting_rules?: Array<{
    condition: string;
    value: unknown;
  }>;

  // Lifecycle
  status: 'active' | 'deprecated' | 'archived';
  created_date?: string;
  owner?: string;

  // Service
  service: 'launchdarkly' | 'split' | 'unleash' | 'flagsmith' | 'custom' | 'env_based';

  // Usage tracking
  code_references: Array<{
    file: string;
    line: number;
    context: string;  // Function/class name
  }>;

  // Documentation
  description?: string;
  jira_ticket?: string;
}
```

**R2.2: FlagEvaluation Node Type**

```typescript
interface FlagEvaluationNode {
  type: 'FlagEvaluation';
  flag_key: string;
  file: string;
  line: number;

  // Evaluation context
  evaluation_context?: {
    user_id?: boolean;
    tenant_id?: boolean;
    custom_attributes?: string[];
  };

  // Fallback
  fallback_value: unknown;

  // Code path
  affects_code_path: string[];  // Functions affected by this flag
  condition_type: 'if' | 'ternary' | 'switch' | 'early_return';
}
```

### R3: Configuration Schema Nodes

**R3.1: ConfigSchema Node Type**

```typescript
interface ConfigSchemaNode {
  type: 'ConfigSchema';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Schema definition
  schema_type: 'joi' | 'zod' | 'yup' | 'class_validator' | 'pydantic' | 'json_schema';

  // Fields
  fields: Array<{
    key: string;
    type: string;
    required: boolean;
    default?: unknown;
    validation_rules: string[];
    env_var?: string;
  }>;

  // Validation timing
  validated_at: 'startup' | 'runtime' | 'lazy';

  // Module association
  associated_module?: string;
}
```

**R3.2: Secret Node Type**

```typescript
interface SecretNode {
  type: 'Secret';
  name: string;
  file: string;
  line: number;

  // Secret source
  source: 'env' | 'vault' | 'aws_secrets_manager' | 'azure_keyvault' | 'gcp_secret_manager' | 'file';

  // Reference
  reference_key: string;  // ARN, vault path, env var name

  // Usage
  used_for: 'database' | 'api_key' | 'encryption' | 'oauth' | 'jwt' | 'other';

  // Rotation
  rotation_enabled?: boolean;
  rotation_schedule?: string;

  // Classification
  sensitivity: 'high' | 'medium' | 'low';
}
```

### R4: Constants & Enums

**R4.1: AppConstant Node Type**

```typescript
interface AppConstantNode {
  type: 'AppConstant';
  name: string;
  file: string;
  line: number;

  // Value
  value: unknown;
  value_type: string;

  // Scope
  scope: 'global' | 'module' | 'file';
  exported: boolean;

  // Category
  category: 'config' | 'limit' | 'timeout' | 'url' | 'regex' | 'error_code' | 'other';

  // Usage
  used_in: string[];
}
```

**R4.2: ConfigEnum Node Type**

```typescript
interface ConfigEnumNode {
  type: 'ConfigEnum';
  name: string;
  file: string;
  line_start: number;
  line_end: number;

  // Values
  values: Array<{
    key: string;
    value: string | number;
    description?: string;
  }>;

  // Domain
  domain: 'status' | 'type' | 'role' | 'environment' | 'feature' | 'other';

  // Usage
  used_in_fields: Array<{
    entity: string;
    field: string;
  }>;
}
```

---

## Part 2: Graph Schema - Configuration Edges

### R5: Relationship Types

**R5.1: READS_CONFIG Edge**

```typescript
interface ReadsConfigEdge {
  type: 'READS_CONFIG';
  from: FunctionNode | ClassNode;
  to: EnvVarNode | ConfigKeyNode;

  access_pattern: 'direct' | 'service' | 'injected';
  line: number;
}
```

**R5.2: DEPENDS_ON_FLAG Edge**

```typescript
interface DependsOnFlagEdge {
  type: 'DEPENDS_ON_FLAG';
  from: FunctionNode | ComponentNode;
  to: FeatureFlagNode;

  condition_type: 'enabled' | 'disabled' | 'value_equals' | 'variation';
  expected_value?: unknown;
}
```

**R5.3: VALIDATES Edge**

```typescript
interface ValidatesEdge {
  type: 'VALIDATES';
  from: ConfigSchemaNode;
  to: EnvVarNode | ConfigKeyNode;

  validation_rules: string[];
}
```

**R5.4: OVERRIDES Edge**

```typescript
interface OverridesEdge {
  type: 'OVERRIDES';
  from: ConfigKeyNode;  // Environment-specific
  to: ConfigKeyNode;    // Default

  environment: string;
}
```

**R5.5: SOURCES_FROM Edge**

```typescript
interface SourcesFromEdge {
  type: 'SOURCES_FROM';
  from: ConfigKeyNode;
  to: EnvVarNode | SecretNode;

  transform?: string;  // parseInt, JSON.parse, etc.
}
```

---

## Part 3: Source-Specific Extractors

### R6: .env File Extractor

**R6.1: Env File Patterns**

```typescript
const envFilePatterns = {
  // Standard .env format
  envLine: /^([A-Z][A-Z0-9_]*)=(.*)$/gm,

  // Comments with description
  commentedVar: /^#\s*@(\w+)\s+(.+)\n^([A-Z][A-Z0-9_]*)=/gm,

  // Common patterns
  secretIndicators: [
    /SECRET/i, /KEY/i, /PASSWORD/i, /TOKEN/i, /CREDENTIAL/i,
    /API_KEY/i, /PRIVATE/i, /AUTH/i, /_PWD$/i,
  ],

  urlPatterns: [
    /_URL$/i, /_URI$/i, /_ENDPOINT$/i, /_HOST$/i,
  ],
};
```

**R6.2: Env File Locations**

```typescript
const envFileLocations = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.staging',
  '.env.production',
  '.env.test',
  '.env.example',
  '.env.template',
  'config/.env',
  'env/.env',
];
```

### R7: Config File Extractor

**R7.1: JSON/YAML Config**

```typescript
const configFilePatterns = {
  jsonFiles: ['config.json', 'settings.json', 'app.config.json', 'appsettings.json'],
  yamlFiles: ['config.yaml', 'config.yml', 'settings.yaml', 'application.yml'],

  // Nested key extraction
  extractKeys: (obj: unknown, prefix = ''): ConfigKey[] => {
    // Recursively extract all config keys
  },

  // Environment variable references
  envReference: /\$\{([A-Z_][A-Z0-9_]*)\}/g,
  envFallback: /\$\{([A-Z_][A-Z0-9_]*):([^}]*)\}/g,
};
```

**R7.2: NestJS Config Module**

```typescript
const nestjsConfigPatterns = {
  // ConfigModule.forRoot
  configModule: /ConfigModule\.forRoot\s*\(\s*\{([^}]+)\}/,

  // ConfigService usage
  configGet: /configService\.get(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
  configGetOrThrow: /configService\.getOrThrow(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Environment validation (Joi)
  joiValidation: /Joi\.object\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/,

  // @nestjs/config decorators
  configurable: /@Configurable\s*\(/,
};
```

**R7.3: Python Config Patterns**

```python
python_config_patterns = {
    # pydantic BaseSettings
    'base_settings': r'class\s+(\w+)\s*\(\s*BaseSettings\s*\)',

    # Field with env
    'field_env': r'(\w+)\s*:\s*(\w+)\s*=\s*Field\s*\([^)]*env=[\'"]([^\'"]+)[\'"]',

    # os.environ
    'os_environ': r'os\.environ(?:\.get)?\s*\(\s*[\'"]([^\'"]+)[\'"]',

    # python-dotenv
    'load_dotenv': r'load_dotenv\s*\(',

    # django settings
    'django_env': r'env\s*\(\s*[\'"]([^\'"]+)[\'"]',
}
```

### R8: Feature Flag Service Extractors

**R8.1: LaunchDarkly**

```typescript
const launchDarklyPatterns = {
  // SDK initialization
  init: /LDClient\.init\s*\(\s*['"`]([^'"`]+)['"`]/,

  // Flag evaluation
  variation: /\.variation\s*\(\s*['"`]([^'"`]+)['"`]/g,
  boolVariation: /\.boolVariation\s*\(\s*['"`]([^'"`]+)['"`]/g,
  stringVariation: /\.stringVariation\s*\(\s*['"`]([^'"`]+)['"`]/g,
  numberVariation: /\.numberVariation\s*\(\s*['"`]([^'"`]+)['"`]/g,
  jsonVariation: /\.jsonVariation\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // React SDK
  useFlags: /useFlags\s*\(\s*\)/,
  useLDClient: /useLDClient\s*\(\s*\)/,
  withLDConsumer: /withLDConsumer\s*\(/,
};
```

**R8.2: Unleash**

```typescript
const unleashPatterns = {
  // Client
  client: /new\s+Unleash\s*\(/,

  // Flag check
  isEnabled: /\.isEnabled\s*\(\s*['"`]([^'"`]+)['"`]/g,
  getVariant: /\.getVariant\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Context
  context: /UnleashContext\s*\.\s*builder\s*\(/,
};
```

**R8.3: Environment-Based Flags**

```typescript
const envBasedFlagPatterns = {
  // Direct env check
  envFlag: /process\.env\.(?:FEATURE_|FLAG_|ENABLE_)(\w+)/g,

  // Conditional on env
  featureCheck: /if\s*\(\s*(?:process\.env\.)?(?:FEATURE_|FLAG_|ENABLE_)(\w+)/g,

  // Config-based
  configFlag: /config\.(?:get|has)\s*\(\s*['"`](?:features?|flags?)\.([^'"`]+)['"`]/g,
};
```

### R9: Secret Management Extractors

**R9.1: AWS Secrets Manager**

```typescript
const awsSecretsPatterns = {
  // SDK
  getSecretValue: /new\s+GetSecretValueCommand\s*\(\s*\{\s*SecretId\s*:\s*['"`]([^'"`]+)['"`]/g,

  // ARN pattern
  secretArn: /arn:aws:secretsmanager:[^:]+:[^:]+:secret:([^'":\s]+)/g,
};
```

**R9.2: HashiCorp Vault**

```typescript
const vaultPatterns = {
  // Node.js vault client
  vaultRead: /vault\.read\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Path patterns
  vaultPath: /secret\/(?:data\/)?([a-z0-9\-\/]+)/gi,
};
```

---

## Part 4: Configuration Analysis

### R10: Usage Tracking

**R10.1: Config Access Detection**

```typescript
const configAccessPatterns = {
  // Direct process.env
  processEnv: /process\.env\.([A-Z_][A-Z0-9_]*)/g,

  // process.env with bracket notation
  processEnvBracket: /process\.env\[['"`]([A-Z_][A-Z0-9_]*)['"`]\]/g,

  // Config service (NestJS/general)
  configService: /(?:config|configService|configuration)\.(?:get|getOrThrow|has)\s*\(\s*['"`]([^'"`]+)['"`]/g,

  // Python os.environ
  osEnviron: /os\.environ\.get\s*\(\s*['"`]([^'"`]+)['"`]/g,
  osEnvironDirect: /os\.environ\[['"`]([^'"`]+)['"`]\]/g,

  // Settings object
  settingsAccess: /settings\.([A-Z_][A-Z0-9_]*)/g,
};
```

**R10.2: Missing Config Detection**

```typescript
interface MissingConfigAnalysis {
  required_vars: Array<{
    name: string;
    used_in: string[];
    has_default: boolean;
    required_in_envs: string[];
  }>;

  unused_vars: Array<{
    name: string;
    defined_in: string;
    last_used?: string;  // Git history
  }>;

  potential_issues: Array<{
    type: 'no_default' | 'type_mismatch' | 'deprecated' | 'hardcoded_secret';
    var_name: string;
    location: string;
    suggestion: string;
  }>;
}
```

### R11: Environment Comparison

**R11.1: Env Diff Analysis**

```typescript
interface EnvDiffAnalysis {
  environments: string[];  // ['development', 'staging', 'production']

  differences: Array<{
    var_name: string;
    by_environment: Record<string, {
      present: boolean;
      value_hint?: string;  // 'localhost', 'staging.example.com', '***' for secrets
    }>;
  }>;

  missing_in_production: string[];  // Vars present in dev but not prod
  extra_in_production: string[];    // Vars only in prod
}
```

---

## Part 5: Feature Flag Analysis

### R12: Flag Impact Analysis

**R12.1: Code Path Analysis**

```typescript
interface FlagImpactAnalysis {
  flag_key: string;

  // Affected code
  affected_files: string[];
  affected_functions: Array<{
    name: string;
    file: string;
    line: number;
    condition: 'enabled' | 'disabled' | 'variation';
  }>;

  // Component tree (for UI flags)
  affected_components?: string[];

  // API endpoints affected
  affected_endpoints?: Array<{
    method: string;
    path: string;
    condition: string;
  }>;

  // Test coverage
  tests_covering_flag: string[];
}
```

**R12.2: Flag Lifecycle Detection**

```typescript
const flagLifecyclePatterns = {
  // TODO/FIXME comments indicating temporary flags
  temporaryFlag: /(?:TODO|FIXME|TEMP)[:\s]*.*(?:feature flag|flag|toggle)/i,

  // Deprecated flag markers
  deprecated: /@deprecated|DEPRECATED|flag.*deprecated/i,

  // Kill switch patterns
  killSwitch: /kill.?switch|emergency.?disable|circuit.?breaker/i,
};
```

---

## Part 6: Use Cases

### R13: Query Examples

**R13.1: Configuration Discovery**

```cypher
// Get all required env vars without defaults
MATCH (e:EnvVar)
WHERE e.required = true AND e.has_default = false
RETURN e.name, e.used_in_files

// Find all secrets
MATCH (e:EnvVar)
WHERE e.is_secret = true
RETURN e.name, e.classification, e.used_in_files

// Config dependencies for a service
MATCH (f:Function)-[:READS_CONFIG]->(c:EnvVar)
WHERE f.file CONTAINS 'OrderService'
RETURN f.name, collect(c.name) as config_deps
```

**R13.2: Feature Flag Analysis**

```cypher
// Get all active feature flags
MATCH (f:FeatureFlag)
WHERE f.status = 'active'
RETURN f.key, f.description, size(f.code_references)

// Code affected by a specific flag
MATCH (func:Function)-[:DEPENDS_ON_FLAG]->(f:FeatureFlag {key: 'new-checkout'})
RETURN func.name, func.file

// Flags without tests
MATCH (f:FeatureFlag)
WHERE NOT EXISTS {
  MATCH (t:TestCase)-[:TESTS_FLAG]->(f)
}
RETURN f.key
```

**R13.3: Environment Analysis**

```cypher
// Compare dev vs prod config
MATCH (e:EnvVar)
WHERE 'development' IN keys(e.env_defaults) OR 'production' IN keys(e.env_defaults)
RETURN e.name, e.env_defaults.development, e.env_defaults.production

// Find hardcoded config that should be env vars
MATCH (c:AppConstant)
WHERE c.category = 'config' AND c.scope = 'global'
RETURN c.name, c.value, c.file
```

---

## Part 7: Integration

### R14: Mesh Builder Integration

**R14.1: Schema Files**

```
schemas/config/
├── env-files.json
├── json-yaml-config.json
├── nestjs-config.json
├── feature-flags.json
├── secrets.json
└── constants.json
```

**R14.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/config/
export class EnvFileExtractor extends BaseConfigExtractor { ... }
export class JsonYamlConfigExtractor extends BaseConfigExtractor { ... }
export class NestJSConfigExtractor extends BaseConfigExtractor { ... }
export class FeatureFlagExtractor extends BaseConfigExtractor { ... }
export class SecretExtractor extends BaseConfigExtractor { ... }
export class ConstantExtractor extends BaseConfigExtractor { ... }
```

**R14.3: Config Report Generator**

```typescript
// Generate configuration documentation
export class ConfigReportGenerator {
  generateEnvTemplate(): string;  // .env.example content
  generateConfigDocs(): string;   // Markdown documentation
  generateMissingConfigReport(): MissingConfigAnalysis;
  compareEnvironments(envs: string[]): EnvDiffAnalysis;
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Env var detection accuracy | > 95% |
| Config file parsing accuracy | > 98% |
| Feature flag detection | > 90% |
| Secret classification accuracy | > 95% |
| Config usage tracking | > 85% |
| Missing config detection | > 90% |
| Extraction time (100 env vars) | < 5s |

---

## Implementation Phases

### Phase 1: Environment Variables (P2)
- .env file parsing
- process.env usage detection
- Basic type inference
- Secret classification

### Phase 2: Config Files (P2)
- JSON/YAML config parsing
- NestJS ConfigModule extraction
- Pydantic BaseSettings
- Config key hierarchy

### Phase 3: Feature Flags (P2)
- LaunchDarkly extraction
- Unleash extraction
- Env-based flag detection
- Flag impact analysis

### Phase 4: Analysis & Reporting (P2)
- Missing config detection
- Environment comparison
- Config documentation generation
- Secret audit

---

## Open Questions

1. **Secret Values**: Should we ever store/display secret values or always mask them?
2. **Remote Config**: How to handle runtime-fetched configuration (e.g., from Consul)?
3. **Feature Flag Sync**: Should we sync with feature flag service APIs?
4. **Build-time vs Runtime**: How to distinguish webpack/env-cmd injected vars?

---

## References

- dotenv: https://github.com/motdotla/dotenv
- NestJS Configuration: https://docs.nestjs.com/techniques/configuration
- Pydantic Settings: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- LaunchDarkly: https://docs.launchdarkly.com/
- Unleash: https://docs.getunleash.io/
