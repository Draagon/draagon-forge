# Schema Evolution & Self-Improving Extraction Architecture

## The Core Insight

Schemas/scripts for extraction shouldn't be static files - they should be **living entities in the knowledge graph itself**, evolving based on:
1. Verification feedback (what the LLM corrected)
2. Framework detection (what patterns appear in this codebase)
3. Community contributions (shared schemas that work well)
4. Self-improvement cycles (Claude refining prompts based on outcomes)

## Current Problem

```
Static Files                    vs.        Living Knowledge
─────────────────────────────────           ─────────────────────────────────
schemas/python/base.json                    Schema node in Neo4j
  - Manual updates                            - Auto-evolves from feedback
  - Version in git                            - Linked to trust scores
  - No learning                               - Cross-project learning
  - One-size-fits-all                         - Project-specific adaptations
```

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SCHEMA EVOLUTION SYSTEM                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      KNOWLEDGE GRAPH (Neo4j)                             │   │
│  │                                                                          │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │   │
│  │  │   Schema     │    │   Pattern    │    │  Framework   │              │   │
│  │  │   Nodes      │───▶│   Nodes      │◀───│   Nodes      │              │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘              │   │
│  │         │                   │                   │                       │   │
│  │         ▼                   ▼                   ▼                       │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │   │
│  │  │   Trust      │    │  Prompt      │    │  Detection   │              │   │
│  │  │   Scores     │    │  Templates   │    │  Signatures  │              │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘              │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐                   │
│  │   Bootstrap   │    │   Evolution   │    │    Export     │                   │
│  │   (Start w/0) │───▶│   (Learn)     │───▶│   (Share)     │                   │
│  └───────────────┘    └───────────────┘    └───────────────┘                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Complete Extraction Scenario Map

### 1. Source Code Projects

```
Project Types:
├── Pure Language (Python, TypeScript, Go, Rust)
│   └── Pattern: def/class/function signatures, imports
├── Framework-Based
│   ├── FastAPI → routes, dependencies, schemas
│   ├── React → components, hooks, state
│   ├── Django → models, views, urls, admin
│   ├── Express → middleware, routes, handlers
│   └── Spring → annotations, beans, controllers
├── Monorepo
│   └── Pattern: workspace config, cross-package refs
└── Microservices
    └── Pattern: service boundaries, API contracts

Extraction Flow:
1. Detect project type (package.json, pyproject.toml, etc.)
2. Identify frameworks from dependencies
3. Load matching schemas from graph
4. Apply Tier 1 extraction
5. Tier 2 verify + capture corrections
6. Evolve schemas based on corrections
```

### 2. Databases

```
Database Types:
├── SQL (PostgreSQL, MySQL, SQLite)
│   ├── Schema: tables, columns, constraints, indexes
│   ├── Relationships: foreign keys, junction tables
│   ├── Stored procedures, triggers, views
│   └── Migration history (if available)
├── NoSQL
│   ├── MongoDB: collections, indexes, validators
│   ├── Redis: key patterns, data structures
│   └── DynamoDB: tables, GSIs, LSIs
├── Graph (Neo4j, Neptune)
│   ├── Node labels, relationship types
│   ├── Constraints, indexes
│   └── APOC procedures
└── Vector (Qdrant, Pinecone)
    ├── Collections, indexes
    └── Metadata schemas

Extraction Approach:
- Connect to DB or parse schema dumps
- Extract structure → mesh nodes
- Infer relationships from FKs, naming conventions
- Link to code that uses each table/collection
```

### 3. APIs & Services

```
API Types:
├── REST
│   ├── OpenAPI/Swagger specs
│   ├── Route handlers in code
│   └── Request/response schemas
├── GraphQL
│   ├── Schema definitions
│   ├── Resolvers
│   └── Fragments, directives
├── gRPC
│   ├── Proto definitions
│   ├── Service implementations
│   └── Message types
└── Message Queues
    ├── Topic/queue definitions
    ├── Publishers, consumers
    └── Message schemas

Extraction Approach:
- Parse spec files (OpenAPI, GraphQL SDL, Proto)
- Extract from code annotations/decorators
- Link endpoints to handlers to models
```

### 4. Infrastructure

```
Infrastructure Types:
├── Docker
│   ├── Dockerfiles → build stages, dependencies
│   ├── docker-compose → service relationships
│   └── Multi-stage builds
├── Kubernetes
│   ├── Deployments, Services, Ingress
│   ├── ConfigMaps, Secrets
│   └── Helm charts
├── Terraform/CloudFormation
│   ├── Resources, modules
│   ├── Dependencies between resources
│   └── Variables, outputs
└── CI/CD
    ├── GitHub Actions, GitLab CI
    ├── Pipeline stages
    └── Deployment targets

Extraction Approach:
- Parse config files (YAML, HCL, JSON)
- Build dependency graph
- Link to code/services they deploy
```

### 5. Documentation & Specs

```
Doc Types:
├── README, CLAUDE.md
│   └── Project overview, principles, patterns
├── ADRs (Architecture Decision Records)
│   └── Decisions, context, consequences
├── OpenAPI/AsyncAPI specs
│   └── API contracts
├── Database schemas
│   └── ERDs, migration docs
└── Runbooks
    └── Operational procedures

Extraction Approach:
- Parse markdown structure
- Extract principles, patterns, decisions
- Link to related code/infra
```

## Schema Storage & Evolution Design

### Graph Schema for Schemas (Meta!)

```cypher
// Schema node - represents an extraction schema
(:Schema {
  id: UUID,
  name: "fastapi-routes",
  version: "1.2.3",
  language: "python",
  framework: "fastapi",

  // Evolution tracking
  parent_version: "1.2.2",
  created_at: datetime,
  created_by: "auto-evolution" | "human" | "import",

  // Trust metrics
  extractions_total: 1000,
  accuracy_score: 0.95,
  trust_level: "trusted"
})

// Pattern node - individual extraction pattern
(:Pattern {
  id: UUID,
  name: "route_decorator",
  regex: "^@(app|router)\\.(get|post|put|delete)\\(",

  // Evolution
  version: 3,
  evolved_from: UUID,

  // Trust
  accuracy: 0.92,
  corrections: 45,

  // AI prompts for this pattern
  verification_prompt: "...",
  discovery_prompt: "..."
})

// Relationships
(:Schema)-[:CONTAINS]->(:Pattern)
(:Schema)-[:APPLIES_TO]->(:Framework)
(:Schema)-[:EVOLVED_FROM]->(:Schema)
(:Pattern)-[:EVOLVED_FROM]->(:Pattern)
(:Project)-[:USES_SCHEMA]->(:Schema)
```

### Bootstrap Flow (Start with Zero)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BOOTSTRAP: NEW PROJECT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DETECT PROJECT TYPE                                                     │
│     ├── Read package.json, pyproject.toml, go.mod, Cargo.toml              │
│     ├── Identify language(s)                                                │
│     └── Identify frameworks from dependencies                               │
│                                                                              │
│  2. CHECK GRAPH FOR EXISTING SCHEMAS                                        │
│     ├── Query: MATCH (s:Schema)-[:APPLIES_TO]->(f:Framework)               │
│     │          WHERE f.name IN $detected_frameworks                         │
│     │          RETURN s ORDER BY s.trust_level DESC                         │
│     └── If found: Use existing schemas (skip to step 4)                     │
│                                                                              │
│  3. NO SCHEMAS? → GENERATE WITH LLM                                         │
│     ├── Prompt Claude: "Analyze this {framework} codebase..."              │
│     ├── Ask for: key patterns, file structures, conventions                │
│     ├── Generate initial regex patterns                                     │
│     └── Create Schema + Pattern nodes in graph                              │
│                                                                              │
│  4. EXTRACT WITH SCHEMAS                                                    │
│     ├── Tier 1: Apply patterns (fast)                                       │
│     ├── Tier 2: LLM verification (sample or all)                           │
│     └── Tier 3: Discovery for unknowns                                      │
│                                                                              │
│  5. EVOLVE BASED ON FEEDBACK                                                │
│     ├── Corrections → Pattern improvements                                  │
│     ├── Rejections → Pattern deletions or rewrites                          │
│     ├── Discoveries → New patterns                                          │
│     └── Create new version, link EVOLVED_FROM                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Evolution Triggers & Process

```typescript
interface EvolutionTrigger {
  type: 'correction_threshold' | 'rejection_threshold' | 'discovery' | 'manual';

  // Thresholds
  correction_rate?: number;  // If > 10%, evolve
  rejection_rate?: number;   // If > 5%, rewrite or delete
  min_samples?: number;      // Require N samples before evolving
}

interface EvolutionResult {
  pattern_id: string;
  action: 'improved' | 'rewritten' | 'deleted' | 'split' | 'merged';

  // What changed
  old_regex?: string;
  new_regex?: string;

  // Who did it
  evolved_by: 'groq-70b' | 'claude-sonnet' | 'claude-opus' | 'human';

  // Confidence
  confidence: number;
  reasoning: string;
}
```

### Model Escalation Strategy

```
                    ┌─────────────────────────────────────────┐
                    │         PATTERN EVOLUTION               │
                    └─────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  TIER 1: Groq (llama3.3-70b) - Fast, cheap                                   │
│  ─────────────────────────────────────────────                               │
│  • Verify extractions                                                         │
│  • Simple corrections (line numbers, names)                                   │
│  • Pattern accuracy feedback                                                  │
│                                                                               │
│  IF: Correction complex OR confidence < 0.7                                  │
│      └──────────────────────────────────────────────────────────┐            │
└─────────────────────────────────────────────────────────────────│────────────┘
                                                                   │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  TIER 2: Claude Sonnet - Better reasoning                                    │
│  ─────────────────────────────────────────                                   │
│  • Rewrite problematic patterns                                              │
│  • Understand semantic intent                                                 │
│  • Generate new patterns for missed code                                      │
│                                                                               │
│  IF: Pattern still failing OR framework unknown                              │
│      └──────────────────────────────────────────────────────────┐            │
└─────────────────────────────────────────────────────────────────│────────────┘
                                                                   │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  TIER 3: Claude Opus - Deep understanding                                    │
│  ────────────────────────────────────────                                    │
│  • Understand entire framework architecture                                   │
│  • Create comprehensive schema from scratch                                   │
│  • Cross-reference documentation                                              │
│  • Design extraction strategy                                                 │
│                                                                               │
│  OUTPUT: Complete schema for new framework                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Import/Export System

### Export for Version Control

```bash
# Export all schemas to git-friendly format
mesh-builder schemas export --output ./schemas-export/

# Output structure:
schemas-export/
├── manifest.json           # Version info, checksums
├── python/
│   ├── base-python.yaml    # Human-readable schema
│   ├── fastapi.yaml
│   └── django.yaml
├── typescript/
│   ├── base-typescript.yaml
│   ├── react.yaml
│   └── nextjs.yaml
└── trust-scores.json       # Optional: include trust data
```

### Import from Repository

```bash
# Import community schemas
mesh-builder schemas import --from https://github.com/draagon/schemas

# Import with merge strategy
mesh-builder schemas import --from ./schemas-export/ --merge-strategy=prefer-higher-trust

# Import specific framework
mesh-builder schemas import --framework fastapi --from community
```

### Schema YAML Format (Human-Editable)

```yaml
# schemas-export/python/fastapi.yaml
schema:
  name: fastapi
  version: 2.1.0
  language: python
  framework: fastapi

  # For human review
  description: |
    Extract FastAPI routes, dependencies, and Pydantic models.
    Evolved from 847 extractions with 94.2% accuracy.

  # Trust info (from graph)
  trust:
    level: high
    accuracy: 0.942
    extractions: 847
    last_evolved: 2024-01-15

  detection:
    dependencies:
      - fastapi
      - starlette
    files:
      - "main.py"
      - "app/*.py"
      - "routers/*.py"

patterns:
  - name: route_decorator
    description: FastAPI route decorators (@app.get, @router.post, etc.)
    regex: |
      ^@(?:app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"](.*?)['"]
    captures:
      method: { group: 1, transform: uppercase }
      path: { group: 2 }
    node_template:
      type: APIEndpoint
      name_from: path
      properties:
        http_method: method
        framework: fastapi

    # AI prompts for this pattern
    verification_prompt: |
      Verify this FastAPI route extraction is correct.
      Check that the HTTP method and path match the decorator.

    discovery_prompt: |
      Look for FastAPI routes that might not match the regex pattern.
      Consider: class-based views, include_router, APIRouter prefixes.

    # Evolution history
    evolution:
      - version: 1
        date: 2024-01-01
        change: Initial pattern
      - version: 2
        date: 2024-01-10
        change: Added support for router prefix
        evolved_by: claude-sonnet
        reason: 12% of routes used APIRouter with prefix

  - name: dependency_injection
    description: FastAPI Depends() for dependency injection
    # ... etc
```

## Self-Improvement Pipeline

### Continuous Learning Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELF-IMPROVEMENT PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐                                                            │
│  │  EXTRACT    │  Run extraction on project                                 │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │  VERIFY     │  Tier 2 checks sample of extractions                       │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ├──────────────────────────────────────────┐                        │
│         │                                          │                        │
│         ▼                                          ▼                        │
│  ┌─────────────┐                           ┌─────────────┐                  │
│  │  FEEDBACK   │  Record verification      │  DISCOVER   │  LLM finds      │
│  │  LOOP       │  results in graph         │  GAPS       │  missed items   │
│  └──────┬──────┘                           └──────┬──────┘                  │
│         │                                          │                        │
│         └──────────────────┬───────────────────────┘                        │
│                            │                                                 │
│                            ▼                                                 │
│                     ┌─────────────┐                                         │
│                     │  ANALYZE    │  Aggregate feedback                     │
│                     │  FEEDBACK   │  Identify problem patterns              │
│                     └──────┬──────┘                                         │
│                            │                                                 │
│            ┌───────────────┼───────────────┐                                │
│            │               │               │                                │
│            ▼               ▼               ▼                                │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│     │ IMPROVE  │    │ REWRITE  │    │ CREATE   │                           │
│     │ PATTERN  │    │ PATTERN  │    │ PATTERN  │                           │
│     │ (minor)  │    │ (major)  │    │ (new)    │                           │
│     └────┬─────┘    └────┬─────┘    └────┬─────┘                           │
│          │               │               │                                  │
│          └───────────────┴───────────────┘                                  │
│                          │                                                   │
│                          ▼                                                   │
│                   ┌─────────────┐                                           │
│                   │  VERSION    │  Create new schema version                │
│                   │  SCHEMA     │  Link EVOLVED_FROM in graph               │
│                   └──────┬──────┘                                           │
│                          │                                                   │
│                          ▼                                                   │
│                   ┌─────────────┐                                           │
│                   │  VALIDATE   │  Test new version on same project         │
│                   │  EVOLUTION  │  Compare accuracy                         │
│                   └──────┬──────┘                                           │
│                          │                                                   │
│                          ▼                                                   │
│                   ┌─────────────┐                                           │
│                   │  PROMOTE    │  If better, set as default                │
│                   │  OR REVERT  │  If worse, keep old version               │
│                   └─────────────┘                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prompt Templates for Evolution

```typescript
// Stored in graph, linked to Pattern nodes
interface EvolutionPrompts {
  // For minor improvements (Groq)
  improve_prompt: `
    This regex pattern has ${corrections} corrections out of ${total} extractions.

    Current pattern: ${regex}

    Common corrections:
    ${correction_examples}

    Suggest an improved regex that handles these cases.
    Keep changes minimal - only fix the identified issues.
  `;

  // For rewrites (Claude Sonnet)
  rewrite_prompt: `
    This pattern is not working well (${accuracy}% accuracy).

    Pattern purpose: ${description}
    Current regex: ${regex}

    Failure examples:
    ${failure_examples}

    Please:
    1. Analyze why the pattern fails
    2. Propose a new regex or set of regexes
    3. Consider edge cases in ${framework}
    4. Explain your reasoning
  `;

  // For new patterns (Claude Opus)
  create_prompt: `
    We need to extract ${node_type} from ${framework} codebases.

    Framework documentation: ${doc_link}
    Example code:
    ${example_code}

    Please:
    1. Identify all patterns for ${node_type} in ${framework}
    2. Create regex patterns with named capture groups
    3. Define the node template (type, properties)
    4. Write verification and discovery prompts
    5. Provide test cases
  `;
}
```

## Community Schema Registry

### Future: Shared Schema Repository

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMMUNITY SCHEMA REGISTRY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  registry.draagon.ai                                                 │   │
│  │                                                                      │   │
│  │  Popular Schemas:                                                    │   │
│  │  ├── fastapi (94.2% accuracy, 12.4k extractions) ⭐⭐⭐⭐⭐          │   │
│  │  ├── react-hooks (91.8% accuracy, 8.2k extractions) ⭐⭐⭐⭐         │   │
│  │  ├── django-rest (89.5% accuracy, 5.1k extractions) ⭐⭐⭐⭐         │   │
│  │  └── springboot (87.2% accuracy, 3.8k extractions) ⭐⭐⭐            │   │
│  │                                                                      │   │
│  │  Recent Contributions:                                               │   │
│  │  ├── @user123 improved fastapi-dependencies (+2.1% accuracy)        │   │
│  │  ├── @company-x added terraform-modules (new)                        │   │
│  │  └── Auto-evolved: react-server-components (from 847 extractions)   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Operations:                                                                 │
│  • Upload schema: mesh-builder schemas publish --name my-schema             │
│  • Download: mesh-builder schemas pull fastapi                              │
│  • Fork & improve: mesh-builder schemas fork fastapi --name my-fastapi     │
│  • Submit improvement: mesh-builder schemas contribute                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Recommendation: Hybrid Storage

### Implementation Strategy

```
Phase 1 (Now): Graph-First with File Export
───────────────────────────────────────────
• Store schemas in Neo4j as primary source
• Export to YAML files for human review
• Import from YAML (manual contributions)
• Start with zero schemas - evolve from LLM

Phase 2 (Soon): Local Schema Cache
───────────────────────────────────────────
• Cache hot schemas in ~/.draagon-forge/schemas/
• Sync with Neo4j on startup
• Offline operation supported
• Fast pattern matching without DB queries

Phase 3 (Future): Community Registry
───────────────────────────────────────────
• Central registry service
• OAuth for contributions
• Automated testing of submissions
• Trust scores aggregated across users
```

### Why Graph > Files

| Aspect | Files | Graph |
|--------|-------|-------|
| Evolution tracking | Git history | Native EVOLVED_FROM edges |
| Trust aggregation | Manual JSON | Computed from relationships |
| Framework detection | Pattern matching | Query existing nodes |
| Cross-project learning | None | Shared graph |
| Human editing | Easy | Export → Edit → Import |
| AI editing | File rewrite | Node/property update |
| Versioning | Git | Native with rollback |
| Discovery | None | Query for missing patterns |

## Final Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE EXTRACTION SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         NEO4J GRAPH                                  │   │
│  │                                                                      │   │
│  │   (:Project)──[:USES_SCHEMA]──▶(:Schema)──[:CONTAINS]──▶(:Pattern)  │   │
│  │        │                           │                         │       │   │
│  │        │                           │                         │       │   │
│  │   [:HAS_FILE]              [:APPLIES_TO]              [:HAS_TRUST]  │   │
│  │        │                           │                         │       │   │
│  │        ▼                           ▼                         ▼       │   │
│  │   (:File)──[:HAS_NODE]──▶  (:Framework)             (:TrustScore)   │   │
│  │        │                                                             │   │
│  │        ▼                                                             │   │
│  │   (:Class)──[:INHERITS]──▶(:Class)                                  │   │
│  │   (:Function)──[:CALLS]──▶(:Function)                               │   │
│  │   (:APIEndpoint)──[:USES]──▶(:Model)                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │  Bootstrap  │   │  Extract    │   │  Verify     │   │  Evolve     │    │
│  │  (LLM gen)  │──▶│  (Tier 1)   │──▶│  (Tier 2)   │──▶│  (Tier 2/3) │    │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    FILE EXPORT/IMPORT                                │   │
│  │   mesh-builder schemas export → schemas/*.yaml                      │   │
│  │   mesh-builder schemas import ← schemas/*.yaml                      │   │
│  │   Human review, git version control, community sharing              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

This gives us:
1. **Start with zero** - LLM generates initial schemas
2. **Self-improvement** - Patterns evolve from verification feedback
3. **Human review** - YAML export for inspection and manual tuning
4. **Version control** - Git-friendly format with evolution history
5. **Community sharing** - Import/export enables schema marketplace
6. **Cost efficiency** - Groq for routine, Claude for complex evolution
