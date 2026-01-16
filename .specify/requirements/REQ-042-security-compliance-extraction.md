# REQ-042: Security & Compliance Extraction

**Status:** Draft
**Priority:** P3
**Created:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-033 (Code Knowledge Mesh), REQ-034 (Extraction Context Provider), REQ-036 (Data Model Extraction)
**Layer:** L3 (draagon-forge) - Programming-specific

---

## Summary

Extract semantic knowledge about security controls, compliance requirements, and sensitive data handling. Enable the Code Knowledge Mesh to understand not just "what code exists" but "what security measures protect it, what compliance requirements apply, and where sensitive data flows."

**Key Capabilities:**
- **Data Classification Mapping**: PII/PHI/PCI field identification and data flow
- **Authentication/Authorization Mapping**: Auth flows, guards, RBAC/ABAC
- **Input Validation Detection**: Sanitization, validation, encoding
- **Encryption Boundary Detection**: Data encryption at rest and in transit
- **Audit Logging Points**: Where security events are logged
- **Vulnerability Pattern Detection**: Common security anti-patterns

---

## Problem Statement

### Why Security Extraction Matters

Security is everyone's responsibility, but knowledge is scattered:

```typescript
// What structural extraction sees:
// - Decorator: @UseGuards(JwtAuthGuard)
// - Field: email (string)
// - Function: hashPassword()

// What we NEED to understand:
// - This endpoint requires JWT authentication
// - Required role: 'admin' or 'manager'
// - 'email' field is PII (privacy implications)
// - Password is hashed with bcrypt (12 rounds)
// - Input is sanitized for XSS
// - Action is audit-logged
// - GDPR: User can request deletion
// - SOC2: Access must be reviewed quarterly
```

### The Security Knowledge Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  SECURITY KNOWLEDGE SCATTERED                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Code          │  │   Config        │  │   Documentation             │ │
│  │   Decorators    │  │   Files         │  │   (may be stale)            │ │
│  │   Comments      │  │   IAM policies  │  │                            │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│         │                    │                        │                     │
│     Auth guards,        CORS, CSP,              Compliance                 │
│     RBAC, input        encryption              requirements               │
│     validation         settings                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Questions We Can't Answer Today

- Where does PII data flow through the system?
- Which endpoints accept user input without validation?
- What authentication is required for the `/admin` routes?
- Are there any SQL injection vulnerabilities?
- Which fields are encrypted at rest?
- What security events are audit-logged?
- Are we GDPR compliant? HIPAA? SOC2?

---

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY EXTRACTION                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    SECURITY ANALYZERS                                    │   │
│  │   Auth | Data Classification | Input Validation | Encryption | Audit    │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │               SECURITY-SPECIFIC EXTRACTORS                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │   Auth      │ │   Data      │ │  Vuln       │ │   Compliance    │   │   │
│  │  │  Extractor  │ │  Classifier │ │  Scanner    │ │   Mapper        │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    SECURITY GRAPH NODES                                  │   │
│  │  AuthControl | DataClassification | SecurityControl | ComplianceReq     │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                    RELATIONSHIP EDGES                                    │   │
│  │  PROTECTS | HANDLES_DATA | VALIDATES | ENCRYPTS | LOGS | COMPLIES_WITH  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema - Security Nodes

### R1: Data Classification Nodes

**R1.1: DataClassification Node Type**

```typescript
interface DataClassificationNode {
  type: 'DataClassification';
  classification: 'PII' | 'PHI' | 'PCI' | 'SENSITIVE' | 'CONFIDENTIAL' | 'PUBLIC' | 'INTERNAL';

  // Source
  entity?: string;      // Entity/table name
  field?: string;       // Field/column name
  file: string;
  line: number;

  // Sub-classification
  data_type?: string;   // 'email', 'ssn', 'credit_card', 'health_record', etc.

  // Detection
  detection_method: 'explicit' | 'inferred' | 'pattern';
  confidence: number;

  // Handling requirements
  handling_requirements: {
    encryption_required: boolean;
    masking_required: boolean;
    retention_limit_days?: number;
    deletion_on_request: boolean;  // GDPR right to deletion
    access_logging_required: boolean;
  };

  // Regulations
  applicable_regulations: string[];  // ['GDPR', 'HIPAA', 'PCI-DSS']
}
```

**R1.2: DataFlow Node Type**

```typescript
interface DataFlowNode {
  type: 'DataFlow';
  name: string;
  description: string;

  // Flow path
  source: DataFlowEndpoint;
  destination: DataFlowEndpoint;

  // Data in transit
  data_fields: string[];
  classifications: string[];

  // Protection
  encrypted_in_transit: boolean;
  encryption_protocol?: string;  // TLS 1.3, etc.

  // Cross-boundary
  crosses_boundary: boolean;
  boundary_type?: 'service' | 'network' | 'region' | 'third_party';
}

interface DataFlowEndpoint {
  type: 'api' | 'database' | 'queue' | 'file' | 'external_service';
  name: string;
  location?: string;
}
```

### R2: Authentication/Authorization Nodes

**R2.1: AuthenticationControl Node Type**

```typescript
interface AuthenticationControlNode {
  type: 'AuthenticationControl';
  name: string;
  file: string;
  line: number;

  // Auth type
  auth_type: 'jwt' | 'session' | 'api_key' | 'oauth2' | 'basic' | 'mtls' | 'saml' | 'custom';

  // Configuration
  config: {
    // JWT specific
    algorithm?: string;  // RS256, HS256
    expiry_seconds?: number;
    refresh_enabled?: boolean;

    // Session specific
    session_duration?: number;
    secure_cookie?: boolean;
    same_site?: string;

    // OAuth2 specific
    flows?: string[];  // authorization_code, client_credentials
    scopes?: string[];

    // MFA
    mfa_enabled?: boolean;
    mfa_methods?: string[];
  };

  // Applied to
  applies_to: Array<{
    type: 'global' | 'controller' | 'endpoint';
    target: string;
  }>;
}
```

**R2.2: AuthorizationControl Node Type**

```typescript
interface AuthorizationControlNode {
  type: 'AuthorizationControl';
  name: string;
  file: string;
  line: number;

  // Authorization model
  model: 'RBAC' | 'ABAC' | 'ACL' | 'custom';

  // RBAC
  roles?: Array<{
    name: string;
    permissions: string[];
    inherits?: string[];
  }>;

  // ABAC
  policies?: Array<{
    name: string;
    condition: string;
    effect: 'allow' | 'deny';
  }>;

  // Enforcement
  enforcement_point: 'middleware' | 'decorator' | 'service' | 'database';

  // Applied to
  protects: Array<{
    type: 'endpoint' | 'function' | 'resource';
    target: string;
    required_permissions: string[];
  }>;
}
```

### R3: Input Validation Nodes

**R3.1: InputValidation Node Type**

```typescript
interface InputValidationNode {
  type: 'InputValidation';
  name: string;
  file: string;
  line: number;

  // What's validated
  validates: 'body' | 'query' | 'params' | 'headers' | 'file';
  field_name?: string;

  // Validation rules
  rules: Array<{
    type: ValidationRuleType;
    config?: Record<string, unknown>;
    error_message?: string;
  }>;

  // Sanitization
  sanitization: Array<{
    type: SanitizationType;
    config?: Record<string, unknown>;
  }>;

  // Encoding
  output_encoding?: 'html' | 'url' | 'javascript' | 'sql' | 'none';
}

type ValidationRuleType =
  | 'required' | 'type' | 'length' | 'pattern' | 'enum'
  | 'email' | 'url' | 'uuid' | 'numeric' | 'alpha'
  | 'custom';

type SanitizationType =
  | 'trim' | 'escape_html' | 'escape_sql' | 'strip_tags'
  | 'normalize' | 'lowercase' | 'custom';
```

**R3.2: SecurityWeakness Node Type**

```typescript
interface SecurityWeaknessNode {
  type: 'SecurityWeakness';
  weakness_type: SecurityWeaknessType;
  file: string;
  line: number;

  // Severity
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cwe_id?: string;  // CWE-89, CWE-79, etc.
  owasp_category?: string;  // A1:2021, etc.

  // Details
  description: string;
  vulnerable_code: string;
  attack_vector?: string;

  // Remediation
  recommendation: string;
  fix_example?: string;

  // Confidence
  detection_confidence: number;
  false_positive_likelihood: 'low' | 'medium' | 'high';
}

type SecurityWeaknessType =
  | 'sql_injection' | 'xss' | 'csrf' | 'path_traversal'
  | 'command_injection' | 'xxe' | 'ssrf' | 'insecure_deserialization'
  | 'broken_authentication' | 'sensitive_data_exposure'
  | 'security_misconfiguration' | 'insufficient_logging'
  | 'mass_assignment' | 'idor' | 'hardcoded_secret';
```

### R4: Encryption Nodes

**R4.1: EncryptionControl Node Type**

```typescript
interface EncryptionControlNode {
  type: 'EncryptionControl';
  name: string;
  file: string;
  line: number;

  // What's encrypted
  encryption_scope: 'field' | 'document' | 'file' | 'database' | 'transport';
  targets: string[];  // Field names, file patterns, etc.

  // Encryption details
  algorithm: string;  // AES-256-GCM, RSA-OAEP, etc.
  key_management: 'local' | 'kms' | 'vault' | 'hsm';
  key_rotation_enabled: boolean;

  // At rest vs in transit
  at_rest: boolean;
  in_transit: boolean;

  // Key reference (not the actual key!)
  key_reference?: string;  // KMS key ID, Vault path
}
```

**R4.2: HashingControl Node Type**

```typescript
interface HashingControlNode {
  type: 'HashingControl';
  name: string;
  file: string;
  line: number;

  // What's hashed
  purpose: 'password' | 'token' | 'integrity' | 'identifier';
  target_field?: string;

  // Algorithm
  algorithm: string;  // bcrypt, argon2, sha256, etc.
  config?: {
    cost_factor?: number;  // bcrypt rounds
    memory_cost?: number;  // argon2 memory
    time_cost?: number;    // argon2 iterations
    salt_length?: number;
  };

  // Security assessment
  is_secure: boolean;
  weakness?: string;  // If insecure, explain why
}
```

### R5: Audit Logging Nodes

**R5.1: AuditLogPoint Node Type**

```typescript
interface AuditLogPointNode {
  type: 'AuditLogPoint';
  name: string;
  file: string;
  line: number;

  // Event type
  event_category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' |
                  'admin_action' | 'security_event' | 'compliance' | 'system';
  event_type: string;  // 'user_login', 'permission_change', etc.

  // What's logged
  logged_fields: Array<{
    name: string;
    source: string;
    is_pii: boolean;
    is_masked: boolean;
  }>;

  // Context
  includes_user_context: boolean;
  includes_request_context: boolean;
  includes_timestamp: boolean;
  includes_correlation_id: boolean;

  // Storage
  log_destination: 'file' | 'database' | 'siem' | 'cloud_logging' | 'multiple';
  retention_days?: number;

  // Compliance mapping
  compliance_requirements: string[];  // Which requirements this satisfies
}
```

### R6: Compliance Nodes

**R6.1: ComplianceRequirement Node Type**

```typescript
interface ComplianceRequirementNode {
  type: 'ComplianceRequirement';
  regulation: 'GDPR' | 'HIPAA' | 'PCI-DSS' | 'SOC2' | 'CCPA' | 'LGPD' | 'ISO27001' | 'custom';
  requirement_id: string;  // 'GDPR-Art17', 'PCI-DSS-3.4', etc.

  // Requirement details
  title: string;
  description: string;

  // Implementation status
  implementation_status: 'implemented' | 'partial' | 'not_implemented' | 'not_applicable';

  // Evidence
  implemented_by: Array<{
    type: 'control' | 'policy' | 'code' | 'process';
    reference: string;
    file?: string;
    line?: number;
  }>;

  // Gap
  gaps?: Array<{
    description: string;
    remediation: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>;
}
```

**R6.2: PrivacyControl Node Type**

```typescript
interface PrivacyControlNode {
  type: 'PrivacyControl';
  control_type: 'consent' | 'deletion' | 'export' | 'rectification' | 'restriction' | 'portability';
  file: string;
  line: number;

  // Implementation
  handler_function: string;
  api_endpoint?: string;

  // Data scope
  data_categories: string[];  // What data this control affects

  // Automation
  is_automated: boolean;
  manual_steps?: string[];

  // Verification
  verification_method?: string;
  retention_after_deletion?: number;  // Days before full deletion
}
```

---

## Part 2: Graph Schema - Security Edges

### R7: Relationship Types

**R7.1: PROTECTS Edge**

```typescript
interface ProtectsEdge {
  type: 'PROTECTS';
  from: AuthenticationControlNode | AuthorizationControlNode | InputValidationNode;
  to: APIEndpointNode | FunctionNode | ResourceNode;

  protection_type: 'auth' | 'authz' | 'validation' | 'encryption';
}
```

**R7.2: HANDLES_DATA Edge**

```typescript
interface HandlesDataEdge {
  type: 'HANDLES_DATA';
  from: FunctionNode | APIEndpointNode;
  to: DataClassificationNode;

  operation: 'read' | 'write' | 'delete' | 'transfer';
  volume: 'single' | 'bulk' | 'stream';
}
```

**R7.3: ENCRYPTS Edge**

```typescript
interface EncryptsEdge {
  type: 'ENCRYPTS';
  from: EncryptionControlNode;
  to: FieldNode | DataFlowNode;
}
```

**R7.4: LOGS Edge**

```typescript
interface LogsEdge {
  type: 'LOGS';
  from: AuditLogPointNode;
  to: FunctionNode | APIEndpointNode;

  trigger: 'before' | 'after' | 'on_error' | 'always';
}
```

**R7.5: COMPLIES_WITH Edge**

```typescript
interface CompliesWithEdge {
  type: 'COMPLIES_WITH';
  from: SecurityControlNode;  // Any security control
  to: ComplianceRequirementNode;

  coverage: 'full' | 'partial';
  evidence?: string;
}
```

**R7.6: FLOWS_TO Edge (Data)**

```typescript
interface DataFlowsToEdge {
  type: 'FLOWS_TO';
  from: DataFlowEndpoint;
  to: DataFlowEndpoint;

  data_classifications: string[];
  is_encrypted: boolean;
  crosses_trust_boundary: boolean;
}
```

---

## Part 3: Security Pattern Detection

### R8: Authentication Pattern Detection

**R8.1: Auth Decorator/Annotation Patterns**

```typescript
const authPatterns = {
  // NestJS
  nestjsGuard: /@UseGuards\s*\(\s*([^)]+)\s*\)/g,
  nestjsRoles: /@Roles\s*\(\s*([^)]+)\s*\)/g,
  nestjsPublic: /@Public\s*\(\s*\)/,

  // Express/Passport
  passportAuth: /passport\.authenticate\s*\(\s*['"](\w+)['"]/g,
  expressMiddleware: /app\.use\s*\(\s*['"][^'"]+['"]\s*,\s*(\w+Auth\w*)/g,

  // FastAPI/Python
  dependsAuth: /Depends\s*\(\s*(\w+(?:auth|authenticate|token)\w*)\s*\)/gi,
  fastApiSecurity: /Security\s*\(\s*(\w+)\s*\)/g,

  // Spring
  preAuthorize: /@PreAuthorize\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  secured: /@Secured\s*\(\s*\{?\s*([^})]+)\s*\}?\s*\)/g,

  // ASP.NET
  authorize: /\[Authorize(?:\s*\(([^)]*)\))?\]/g,
};
```

**R8.2: JWT/Session Detection**

```typescript
const tokenPatterns = {
  // JWT
  jwtSign: /jwt\.sign\s*\(/g,
  jwtVerify: /jwt\.verify\s*\(/g,
  jwtDecode: /jwt\.decode\s*\(/g,

  // Session
  sessionCreate: /req\.session\s*=|session\[['"]|session\.set\s*\(/g,
  sessionDestroy: /req\.session\.destroy|session\.clear\s*\(/g,

  // OAuth
  oauth2: /OAuth2|passport\.use\s*\(\s*new\s+\w*OAuth/g,
};
```

### R9: Input Validation Detection

**R9.1: Validation Library Patterns**

```typescript
const validationPatterns = {
  // class-validator (NestJS)
  classValidator: /@(?:IsString|IsNumber|IsEmail|IsNotEmpty|Min|Max|Length|Matches|IsEnum|ValidateNested)\s*\(/g,

  // Joi
  joiValidation: /Joi\.(?:string|number|boolean|object|array|any)\s*\(\)/g,
  joiRequired: /\.required\s*\(\)/g,

  // Zod
  zodSchema: /z\.(?:string|number|boolean|object|array)\s*\(/g,
  zodParse: /\.parse\s*\(|\.safeParse\s*\(/g,

  // Yup
  yupSchema: /yup\.(?:string|number|boolean|object|array)\s*\(/g,

  // Express-validator
  expressValidator: /body\s*\(\s*['"]|query\s*\(\s*['"]|param\s*\(\s*['"]/g,

  // Pydantic
  pydanticField: /Field\s*\([^)]*(?:min_length|max_length|regex|gt|lt|ge|le)/g,
};
```

**R9.2: Sanitization Detection**

```typescript
const sanitizationPatterns = {
  // HTML encoding
  htmlEncode: /escape\s*\(|encodeHTML|htmlspecialchars|escapeHtml|sanitizeHtml/gi,

  // SQL parameterization
  parameterizedQuery: /\?\s*,|\$\d+|:\w+|@\w+/g,
  preparedStatement: /prepare\s*\(|PreparedStatement|parameterize/g,

  // XSS prevention
  xssPrevention: /DOMPurify|xss|sanitize|bleach\.clean/gi,
};
```

### R10: Vulnerability Pattern Detection

**R10.1: SQL Injection Patterns**

```typescript
const sqlInjectionPatterns = {
  // String concatenation in queries
  stringConcat: /(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\+\s*(?:req\.|params\.|body\.|query\.)/gi,
  templateLiteral: /(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\$\{(?!sanitize)/gi,

  // f-strings in Python
  fStringQuery: /f['"]\s*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/gi,

  // Raw queries without parameters
  rawQuery: /\.raw\s*\(\s*[`'"](?:SELECT|INSERT|UPDATE|DELETE)/gi,
  executeRaw: /executeRaw\s*\(\s*[`'"]/gi,
};
```

**R10.2: XSS Patterns**

```typescript
const xssPatterns = {
  // innerHTML without sanitization
  innerHTML: /\.innerHTML\s*=(?!.*sanitize)/gi,

  // dangerouslySetInnerHTML without sanitization
  dangerouslySetInnerHTML: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*(?!.*sanitize)/g,

  // v-html in Vue
  vHtml: /v-html\s*=\s*["'](?!.*sanitize)/g,

  // [innerHTML] in Angular
  angularInnerHtml: /\[innerHTML\]\s*=\s*["'](?!.*sanitize)/g,
};
```

**R10.3: Other OWASP Patterns**

```typescript
const owaspPatterns = {
  // Path traversal
  pathTraversal: /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/gi,
  unsafePathJoin: /path\.join\s*\([^)]*(?:req\.|params\.|body\.|query\.)/gi,

  // Command injection
  commandInjection: /exec\s*\(|spawn\s*\(|system\s*\(/g,
  shellExec: /child_process|subprocess\.(?:run|call|Popen)/g,

  // Hardcoded secrets
  hardcodedSecrets: /(?:password|secret|apikey|api_key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,

  // Insecure random
  insecureRandom: /Math\.random\s*\(\)|random\.random\s*\(\)/g,

  // Weak crypto
  weakCrypto: /MD5|SHA1(?![\d])|DES(?!3)|RC4/gi,
};
```

---

## Part 4: Data Classification

### R11: Automatic Classification

**R11.1: Field Name Pattern Matching**

```typescript
const classificationPatterns: Record<string, DataClassificationRule[]> = {
  PII: [
    { pattern: /email|e_mail/i, confidence: 0.95, dataType: 'email' },
    { pattern: /phone|mobile|cell|telephone/i, confidence: 0.9, dataType: 'phone' },
    { pattern: /ssn|social_security|national_id/i, confidence: 0.99, dataType: 'ssn' },
    { pattern: /passport|driver.?license/i, confidence: 0.95, dataType: 'government_id' },
    { pattern: /birth.?date|dob|date.?of.?birth/i, confidence: 0.9, dataType: 'dob' },
    { pattern: /first.?name|last.?name|full.?name|surname/i, confidence: 0.85, dataType: 'name' },
    { pattern: /address|street|city|zip|postal/i, confidence: 0.85, dataType: 'address' },
    { pattern: /ip.?address/i, confidence: 0.7, dataType: 'ip_address' },
  ],
  PHI: [
    { pattern: /diagnosis|condition|disease|illness/i, confidence: 0.95, dataType: 'diagnosis' },
    { pattern: /medication|prescription|drug|treatment/i, confidence: 0.9, dataType: 'medication' },
    { pattern: /medical.?record|health.?record|patient/i, confidence: 0.95, dataType: 'medical_record' },
    { pattern: /insurance.?id|policy.?number|member.?id/i, confidence: 0.85, dataType: 'insurance' },
    { pattern: /blood.?type|allerg/i, confidence: 0.9, dataType: 'health_info' },
    { pattern: /physician|doctor|provider.?id/i, confidence: 0.8, dataType: 'provider' },
  ],
  PCI: [
    { pattern: /card.?number|credit.?card|cc.?num|pan/i, confidence: 0.99, dataType: 'card_number' },
    { pattern: /cvv|cvc|security.?code|cvv2/i, confidence: 0.99, dataType: 'cvv' },
    { pattern: /expir|exp.?date|exp.?month|exp.?year/i, confidence: 0.85, dataType: 'expiry' },
    { pattern: /cardholder|card.?holder/i, confidence: 0.9, dataType: 'cardholder' },
    { pattern: /account.?number|routing.?number|iban|swift/i, confidence: 0.9, dataType: 'financial_account' },
  ],
  SENSITIVE: [
    { pattern: /password|passwd|pwd/i, confidence: 0.95, dataType: 'password' },
    { pattern: /secret|api.?key|private.?key/i, confidence: 0.9, dataType: 'secret' },
    { pattern: /token|jwt|bearer/i, confidence: 0.8, dataType: 'token' },
    { pattern: /salary|income|compensation|wage/i, confidence: 0.85, dataType: 'financial' },
    { pattern: /race|ethnicity|religion|political/i, confidence: 0.9, dataType: 'demographic' },
    { pattern: /sexual|orientation|gender.?identity/i, confidence: 0.9, dataType: 'sensitive_demographic' },
  ],
};
```

**R11.2: Annotation/Decorator Detection**

```typescript
const classificationAnnotationPatterns = {
  // Custom decorators
  decorators: [
    /@(?:Pii|PII|PersonalData|SensitiveData)\s*\(/i,
    /@(?:Phi|PHI|HealthData|ProtectedHealth)\s*\(/i,
    /@(?:Pci|PCI|PaymentData|CardData)\s*\(/i,
    /@(?:Encrypted|Sensitive|Confidential)\s*\(/i,
  ],

  // Comments
  comments: [
    /\/\/\s*(?:PII|PHI|PCI|SENSITIVE):/i,
    /\/\*\*?\s*@(?:pii|phi|pci|sensitive)/i,
    /#\s*(?:PII|PHI|PCI|SENSITIVE):/i,
  ],
};
```

---

## Part 5: Compliance Mapping

### R12: GDPR Compliance Detection

**R12.1: GDPR Article Mapping**

```typescript
const gdprPatterns = {
  // Right to deletion (Art. 17)
  rightToDeletion: {
    patterns: [
      /delete.?user|remove.?user|purge.?data|anonymize/i,
      /gdpr.?delete|right.?to.?forget|data.?erasure/i,
    ],
    requirement: 'GDPR-Art17',
  },

  // Right to access (Art. 15)
  rightToAccess: {
    patterns: [
      /export.?data|download.?data|subject.?access/i,
      /gdpr.?export|data.?portability/i,
    ],
    requirement: 'GDPR-Art15',
  },

  // Consent management (Art. 6, 7)
  consentManagement: {
    patterns: [
      /consent|opt.?in|opt.?out|marketing.?preference/i,
      /gdpr.?consent|cookie.?consent/i,
    ],
    requirement: 'GDPR-Art6',
  },

  // Data protection by design (Art. 25)
  privacyByDesign: {
    patterns: [
      /encrypt|hash|mask|anonymize|pseudonymize/i,
      /data.?minimization|purpose.?limitation/i,
    ],
    requirement: 'GDPR-Art25',
  },
};
```

### R13: HIPAA Compliance Detection

**R13.1: HIPAA Rule Mapping**

```typescript
const hipaaPatterns = {
  // Access controls (164.312(a)(1))
  accessControls: {
    patterns: [
      /role.?based|rbac|access.?control|permission/i,
      /authenticate|authorize|identity.?verify/i,
    ],
    requirement: 'HIPAA-164.312(a)(1)',
  },

  // Audit controls (164.312(b))
  auditControls: {
    patterns: [
      /audit.?log|access.?log|activity.?log/i,
      /track|monitor|record.?access/i,
    ],
    requirement: 'HIPAA-164.312(b)',
  },

  // Encryption (164.312(e)(1))
  encryption: {
    patterns: [
      /encrypt|tls|ssl|https|aes/i,
      /at.?rest|in.?transit|end.?to.?end/i,
    ],
    requirement: 'HIPAA-164.312(e)(1)',
  },
};
```

### R14: PCI-DSS Compliance Detection

**R14.1: PCI Requirement Mapping**

```typescript
const pciPatterns = {
  // Protect stored cardholder data (3.4)
  dataProtection: {
    patterns: [
      /encrypt.?card|mask.?pan|truncate.?card/i,
      /tokenize|vault|secure.?storage/i,
    ],
    requirement: 'PCI-DSS-3.4',
  },

  // Strong cryptography (4.1)
  strongCrypto: {
    patterns: [
      /aes.?256|rsa.?2048|tls.?1\.[23]/i,
      /strong.?cipher|approved.?algorithm/i,
    ],
    requirement: 'PCI-DSS-4.1',
  },

  // Track access (10.2)
  accessTracking: {
    patterns: [
      /log.?access|audit.?trail|access.?history/i,
      /track.?cardholder|monitor.?payment/i,
    ],
    requirement: 'PCI-DSS-10.2',
  },
};
```

---

## Part 6: Use Cases

### R15: Query Examples

**R15.1: Data Classification Queries**

```cypher
// Find all PII fields in the system
MATCH (dc:DataClassification)
WHERE dc.classification = 'PII'
RETURN dc.entity, dc.field, dc.data_type, dc.file

// Trace PII data flow
MATCH path = (src)-[:FLOWS_TO*]->(dest)
WHERE any(c IN relationships(path) WHERE 'PII' IN c.data_classifications)
RETURN path

// Find unencrypted PII
MATCH (dc:DataClassification {classification: 'PII'})
WHERE NOT (dc)<-[:ENCRYPTS]-()
RETURN dc.entity, dc.field
```

**R15.2: Security Control Queries**

```cypher
// Find unprotected endpoints
MATCH (e:APIEndpoint)
WHERE NOT (e)<-[:PROTECTS]-(:AuthenticationControl)
AND e.method IN ['POST', 'PUT', 'DELETE']
RETURN e.method, e.path, e.file

// Get auth requirements for admin routes
MATCH (e:APIEndpoint)-[:PROTECTED_BY]->(ac:AuthorizationControl)
WHERE e.path CONTAINS 'admin'
RETURN e.path, ac.model, ac.roles

// Find endpoints without input validation
MATCH (e:APIEndpoint)
WHERE e.method = 'POST'
AND NOT (e)<-[:PROTECTS]-(:InputValidation)
RETURN e.path, e.file
```

**R15.3: Compliance Queries**

```cypher
// GDPR compliance status
MATCH (cr:ComplianceRequirement)
WHERE cr.regulation = 'GDPR'
RETURN cr.requirement_id, cr.title, cr.implementation_status, cr.gaps

// Find code implementing HIPAA requirements
MATCH (cr:ComplianceRequirement {regulation: 'HIPAA'})<-[:COMPLIES_WITH]-(sc)
RETURN cr.requirement_id, sc.name, sc.file

// Compliance gaps
MATCH (cr:ComplianceRequirement)
WHERE cr.implementation_status <> 'implemented'
RETURN cr.regulation, cr.requirement_id, cr.gaps
```

**R15.4: Vulnerability Queries**

```cypher
// Find security weaknesses
MATCH (sw:SecurityWeakness)
WHERE sw.severity IN ['critical', 'high']
RETURN sw.weakness_type, sw.file, sw.line, sw.description

// SQL injection risks
MATCH (sw:SecurityWeakness {weakness_type: 'sql_injection'})
RETURN sw.file, sw.line, sw.vulnerable_code, sw.recommendation

// Get OWASP category summary
MATCH (sw:SecurityWeakness)
RETURN sw.owasp_category, count(*) as count
ORDER BY count DESC
```

---

## Part 7: Integration

### R16: Mesh Builder Integration

**R16.1: Schema Files**

```
schemas/security/
├── authentication.json
├── authorization.json
├── data-classification.json
├── input-validation.json
├── encryption.json
├── audit-logging.json
├── compliance.json
└── vulnerabilities.json
```

**R16.2: Extractor Classes**

```typescript
// src/mesh-builder/src/extractors/security/
export class AuthExtractor extends BaseSecurityExtractor { ... }
export class DataClassificationExtractor extends BaseSecurityExtractor { ... }
export class ValidationExtractor extends BaseSecurityExtractor { ... }
export class EncryptionExtractor extends BaseSecurityExtractor { ... }
export class AuditLogExtractor extends BaseSecurityExtractor { ... }
export class ComplianceMapper extends BaseSecurityExtractor { ... }
export class VulnerabilityScanner extends BaseSecurityExtractor { ... }
```

**R16.3: Security Report Generator**

```typescript
// Generate security documentation and reports
export class SecurityReportGenerator {
  generateDataFlowDiagram(): DataFlowDiagram;
  generateComplianceReport(regulation: string): ComplianceReport;
  generateSecurityAssessment(): SecurityAssessment;
  generatePrivacyImpactAssessment(): PIA;
  generateVulnerabilityReport(): VulnReport;
}
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| PII field detection accuracy | > 90% |
| Auth control extraction | > 95% |
| Input validation detection | > 85% |
| SQL injection detection | > 90% |
| XSS detection | > 85% |
| Encryption boundary detection | > 90% |
| Compliance requirement mapping | > 80% |
| False positive rate | < 20% |
| Extraction time (1000 files) | < 60s |

---

## Implementation Phases

### Phase 1: Data Classification (P3)
- Field-level classification patterns
- Data flow detection
- Annotation/decorator detection

### Phase 2: Auth/Authz Extraction (P3)
- Authentication control detection
- RBAC/ABAC pattern extraction
- Guard/middleware mapping

### Phase 3: Vulnerability Detection (P3)
- SQL injection patterns
- XSS patterns
- OWASP Top 10 scanning

### Phase 4: Compliance Mapping (P3)
- GDPR requirement mapping
- HIPAA requirement mapping
- PCI-DSS requirement mapping
- Gap analysis

### Phase 5: Reporting (P3)
- Data flow diagrams
- Compliance reports
- Security assessments

---

## Open Questions

1. **SAST Integration**: Should we integrate with existing SAST tools (Snyk, SonarQube)?
2. **Runtime Analysis**: Should we support runtime security analysis (DAST)?
3. **Secret Scanning**: How to handle secret detection without storing secrets?
4. **Third-Party Libraries**: Should we analyze transitive dependency vulnerabilities?

---

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- GDPR: https://gdpr.eu/
- HIPAA: https://www.hhs.gov/hipaa/
- PCI-DSS: https://www.pcisecuritystandards.org/
- CWE Database: https://cwe.mitre.org/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
