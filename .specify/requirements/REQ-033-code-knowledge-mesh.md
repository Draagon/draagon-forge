# REQ-033: Code Knowledge Mesh

**Status:** Draft
**Priority:** P0
**Created:** 2025-01-14
**Revised:** 2026-01-15
**Author:** Doug / Claude
**Depends On:** REQ-001 (MCP Context Server)
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific

---

## Summary

Build a unified **Code Knowledge Mesh** - a multi-layer knowledge graph of code structure, data flows, dependencies, and cross-service relationships. The mesh is built using an **agentic three-tier extraction system** (schema-based → AI-assisted → AI-discovery) that learns and adapts to new languages/frameworks automatically.

**Key Capabilities:**
- **Structural Intelligence**: Understand call graphs, data flows, dependencies
- **Cross-Codebase Linking**: Track queue/API/database relationships across repos
- **Self-Learning Extraction**: AI discovers new patterns and generates schemas
- **Documentation as Queries**: Always-current docs generated from graph
- **Project Registry**: Auto-pull and re-extract git repos on changes

---

## Problem Statement

### Why Current Tools Fail

| Tool | What it Does | What it Misses |
|------|--------------|----------------|
| **grep/ripgrep** | Text pattern matching | Semantic relationships, cross-file flows |
| **LSP** | Single-file intelligence | Cross-repo dependencies, data flows |
| **RAG on code** | Semantic similarity chunks | Structural relationships, call graphs |
| **Static analyzers** | Language-specific parsing | Cross-language, framework patterns |

### The Cross-Codebase Problem

Modern systems are distributed. Understanding requires:

```
Service A (Python/FastAPI)          Service B (TypeScript/NestJS)
┌─────────────────────────┐        ┌─────────────────────────┐
│ def process_order():    │        │ @EventPattern('orders') │
│   sqs.send_message(     │───────►│ handleOrder(data) {     │
│     QueueUrl=ORDER_Q    │        │   // process order      │
│   )                     │        │ }                       │
└─────────────────────────┘        └─────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   PostgreSQL            │        │   MongoDB               │
│   orders table          │        │   order_events          │
└─────────────────────────┘        └─────────────────────────┘
```

**Questions static analysis cannot answer:**
- What consumes messages from `ORDER_Q`?
- What happens if Service A's schema changes?
- Which services access PHI data?
- What's the end-to-end flow for an order?

### The Framework Problem

New frameworks appear constantly:
- Hardcoding parsers: 100K+ lines, always behind
- Regex patterns: Break on edge cases, no semantics
- Tree-sitter alone: AST only, no framework awareness

**We need:** A system that learns new patterns with minimal upfront investment.

---

## Vision: Multi-Layer Knowledge Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CODE KNOWLEDGE MESH                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        SEMANTIC LAYER                                  │  │
│  │   Beliefs, Principles, Patterns, Architectural Decisions              │  │
│  │   "This is the auth entry point" / "Always use prepared statements"  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         CODE LAYER                                     │  │
│  │   Files, Functions, Classes, Modules, Routes                          │  │
│  │   With file:line references, signatures, docstrings                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       DATA FLOW LAYER                                  │  │
│  │   Call graphs, request traces, queue flows, event propagation         │  │
│  │   Producer → Queue → Consumer chains across services                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      DATA STORE LAYER                                  │  │
│  │   Databases, tables, columns (with PII/PHI tags)                      │  │
│  │   Redis keys, S3 buckets, Kafka topics, queues                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       LIBRARY LAYER                                    │  │
│  │   Pre-indexed open source (FastAPI, React, Spring)                    │  │
│  │   API schemas for closed source (Stripe, AWS, Twilio)                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ECOSYSTEM LAYER                                   │  │
│  │   Cross-repo dependencies, microservice topology                      │  │
│  │   Shared libraries, API contracts, message contracts                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Graph Schema

### R1: Code Structure Nodes

**R1.1: Core Node Types**

| Node Type | Properties | Source |
|-----------|------------|--------|
| `File` | path, language, size, last_modified, git_commit | File system |
| `Module` | name, file, exports | AST parsing |
| `Class` | name, file, line_start, line_end, docstring | AST parsing |
| `Function` | name, file, line_start, line_end, signature, async, docstring | AST parsing |
| `Method` | name, class, file, line_start, line_end, visibility | AST parsing |
| `Variable` | name, scope, type_hint, file, line | AST parsing |
| `Import` | module, alias, file, line | AST parsing |
| `Decorator` | name, arguments, file, line | AST parsing |
| `ApiEndpoint` | method, path, handler, file, line | Framework detection |

**R1.2: Edge Types**

| Edge Type | From | To | Properties |
|-----------|------|-----|------------|
| `CONTAINS` | File/Class/Module | Function/Class/Method | - |
| `CALLS` | Function | Function | line, async, cross_service |
| `IMPORTS` | File | Module | alias |
| `INHERITS` | Class | Class | - |
| `IMPLEMENTS` | Class | Interface | - |
| `USES` | Function | Variable/Class | read/write |
| `RETURNS` | Function | Type | - |
| `ACCEPTS` | Function | Parameter | position, type |
| `DECORATES` | Decorator | Function/Class | - |
| `EXPOSES` | File | ApiEndpoint | - |
| `HANDLED_BY` | ApiEndpoint | Function | - |

**R1.3: Source Location (Required on All Code Nodes)**

```python
{
    "file": "src/api/routes.py",
    "line_start": 45,
    "line_end": 67,
    "column_start": 0,
    "column_end": 42,
    "git_commit": "abc123",
    "last_modified": "2026-01-15T...",
    "project_id": "order-service"
}
```

### R2: Data Store Nodes

**R2.1: Database Schema**

| Node Type | Properties |
|-----------|------------|
| `Database` | name, type (postgres/mysql/mongo), host, version |
| `Schema` | name, database |
| `Table` | name, schema, row_count_estimate |
| `Column` | name, table, type, nullable, default, pii, phi, pci, encrypted |
| `Index` | name, table, columns, unique |
| `ForeignKey` | from_column, to_column, on_delete |

**R2.2: Other Data Stores**

| Store Type | Node Types |
|------------|------------|
| Redis | `RedisKey` (pattern, ttl, type), `RedisStream` |
| Kafka | `KafkaTopic`, `KafkaConsumerGroup` |
| SQS | `Queue` (name, arn, fifo) |
| RabbitMQ | `Queue`, `Exchange`, `Binding` |
| S3/Blob | `Bucket`, `Prefix`, `ObjectPattern` |

**R2.3: Code-to-Data Edges**

| Edge Type | Description |
|-----------|-------------|
| `READS_FROM` | Function reads from table/key |
| `WRITES_TO` | Function writes to table/key |
| `QUERIES` | Function queries specific columns |
| `PUBLISHES_TO` | Function publishes to topic/queue |
| `SUBSCRIBES_TO` | Function subscribes to topic/queue |

**R2.4: Data Classification Tags**

```python
{
    "pii": true,       # Personally Identifiable Information
    "phi": true,       # Protected Health Information
    "pci": false,      # Payment Card Industry data
    "encrypted": true, # Encrypted at rest
    "masked": false,   # Masked in logs/responses
}
```

### R3: Cross-Service Edges

| Edge Type | From | To | Properties |
|-----------|------|-----|------------|
| `CALLS_SERVICE` | Function | ApiEndpoint (other service) | http_method, path |
| `PRODUCES_TO` | Function | Queue/Topic | - |
| `CONSUMES_FROM` | Function | Queue/Topic | - |
| `SHARES_DATABASE` | Service | Database | access_type |

---

## Part 2: Agentic Extraction System

### R4: Three-Tier Detection Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THREE-TIER EXTRACTION PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │              TIER 1: SCHEMA-BASED EXTRACTION                          │  │
│  │  Speed: <100ms/file | Cost: $0 | Coverage: ~80% of files             │  │
│  │                                                                        │  │
│  │  JSON schemas define patterns for known languages/frameworks.         │  │
│  │  Pure regex + template substitution. No LLM calls.                    │  │
│  │                                                                        │  │
│  │  If confidence >= 0.8 → DONE                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│                   confidence < 0.8  ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │              TIER 2: AI-ASSISTED ENHANCEMENT                          │  │
│  │  Speed: 1-3s/file | Cost: ~$0.001/file | Coverage: ~15%              │  │
│  │                                                                        │  │
│  │  LLM receives schema hints + source, resolves:                        │  │
│  │  • Ambiguous patterns ("is this producer or consumer?")               │  │
│  │  • Environment variable resolution                                    │  │
│  │  • Framework variant detection                                        │  │
│  │  • Business context inference                                         │  │
│  │                                                                        │  │
│  │  Model: Haiku-class (fast, cheap)                                     │  │
│  │  If confidence >= 0.7 → DONE                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│                   confidence < 0.7  ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │              TIER 3: AI-DISCOVERY + SELF-LEARNING                     │  │
│  │  Speed: 5-10s/file | Cost: ~$0.01/file | Coverage: ~5%               │  │
│  │                                                                        │  │
│  │  LLM performs full analysis when no schema matches:                   │  │
│  │  • Unknown framework detection                                        │  │
│  │  • Custom pattern extraction                                          │  │
│  │  • Complex metaprogramming analysis                                   │  │
│  │                                                                        │  │
│  │  Model: Sonnet-class (better reasoning)                               │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  SELF-LEARNING: Successful extractions generate new schemas!   │  │  │
│  │  │                                                                 │  │  │
│  │  │  Discovery → Extract Patterns → Generate JSON Schema           │  │  │
│  │  │                                      ↓                         │  │  │
│  │  │                           Next time: Tier 1!                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### R5: JSON Schema System

**R5.1: Schema Directory Structure**

```
schemas/
├── languages/
│   ├── python.json           # def, class, async def, decorators
│   ├── typescript.json       # function, class, interface, type
│   ├── java.json             # class, interface, method, annotation
│   └── ...
│
├── frameworks/
│   ├── python/
│   │   ├── fastapi.json      # @app.get, Depends(), Pydantic
│   │   ├── django.json       # views, models, urlpatterns
│   │   └── sqlalchemy.json   # Column, relationship
│   ├── typescript/
│   │   ├── nestjs.json       # @Controller, @Injectable
│   │   ├── express.json      # router.get, app.use
│   │   └── prisma.json       # model definitions
│   └── java/
│       └── spring.json       # @RestController, @Autowired
│
├── data-stores/
│   ├── postgresql.json
│   ├── mongodb.json
│   └── redis.json
│
├── messaging/
│   ├── sqs.json              # boto3 SQS patterns
│   ├── kafka.json            # KafkaProducer/Consumer
│   └── rabbitmq.json
│
├── infrastructure/
│   ├── terraform.json        # AWS resource definitions
│   ├── cloudformation.json
│   └── kubernetes.json
│
└── custom/                   # Auto-generated from Tier 3
    └── (learned schemas)
```

**R5.2: Schema Format**

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "fastapi",
  "version": "1.0.0",
  "language": "python",

  "detection": {
    "imports": ["fastapi", "from fastapi"],
    "files": ["main.py", "app.py", "routers/*.py"],
    "confidence_boost": 0.3
  },

  "extractors": {
    "api_endpoints": {
      "patterns": [
        {
          "regex": "@(?:app|router)\\.(get|post|put|delete|patch)\\([\"']([^\"']+)[\"']",
          "captures": {
            "method": { "group": 1, "transform": "uppercase" },
            "path": { "group": 2 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "properties": {
              "method": "${method}",
              "path": "${path}"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "app = FastAPI() is the main application instance",
      "router = APIRouter() creates sub-routers"
    ]
  }
}
```

**R5.3: Schema Registry Interface**

```typescript
interface SchemaRegistry {
  loadSchemas(schemaDir: string): Promise<void>;
  findMatchingSchemas(file: SourceFile): Promise<Schema[]>;
  getSchema(name: string): Schema | undefined;
  addSchema(schema: Schema, persist: boolean): Promise<void>;
  listSchemas(): SchemaInfo[];
}
```

### R6: Self-Learning Pipeline

When Tier 3 successfully extracts from an unknown framework:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  AI Finds   │───►│  Extract    │───►│  Validate   │───►│  Persist    │
│  New        │    │  Pattern    │    │  Against    │    │  to         │
│  Framework  │    │  Regexes    │    │  Samples    │    │  custom/    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                         ┌─────────────────────────────────────┘
                         ▼
              Future files → Tier 1 (fast, free)
```

**R6.1: Schema Generator Interface**

```typescript
interface SchemaGenerator {
  generateSchema(
    discovery: DiscoveryResult,
    samples: SourceFile[]
  ): Promise<GeneratedSchema>;

  validateSchema(
    schema: Schema,
    samples: SourceFile[]
  ): Promise<ValidationResult>;

  persistSchema(
    schema: Schema,
    location: 'custom' | 'community'
  ): Promise<void>;
}
```

---

## Part 3: Project Registry & Auto-Pull

### R7: Multi-Project Management

**R7.1: Project Registry**

Track multiple git repositories for cross-codebase analysis:

```typescript
interface ProjectRegistry {
  // Register a git repository
  registerProject(config: ProjectConfig): Promise<Project>;

  // List all registered projects
  listProjects(): Promise<Project[]>;

  // Get project by ID
  getProject(projectId: string): Promise<Project | undefined>;

  // Remove project from registry
  removeProject(projectId: string): Promise<void>;

  // Check for updates across all projects
  checkForUpdates(): Promise<ProjectUpdate[]>;
}

interface ProjectConfig {
  // Git repository URL (HTTPS or SSH)
  gitUrl: string;

  // Branch to track (default: main)
  branch?: string;

  // Local clone path (auto-generated if not provided)
  localPath?: string;

  // Human-readable name
  name: string;

  // Optional: specific paths to extract (default: entire repo)
  includePaths?: string[];

  // Optional: paths to exclude
  excludePaths?: string[];

  // Auto-pull settings
  autoPull?: {
    enabled: boolean;
    // Poll interval in minutes (for repos without webhook support)
    pollInterval?: number;
    // Webhook secret (if using webhooks)
    webhookSecret?: string;
  };
}

interface Project {
  id: string;
  config: ProjectConfig;
  status: 'active' | 'syncing' | 'error';
  lastSync: Date | null;
  lastCommit: string | null;
  fileCount: number;
  nodeCount: number;
  errorMessage?: string;
}
```

**R7.2: Auto-Pull Mechanisms**

Two modes of operation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTO-PULL STRATEGIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OPTION A: Webhook-Based (Preferred for GitHub/GitLab)                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │   GitHub/GitLab ──webhook──► Draagon Forge API ──► Pull + Re-extract  │  │
│  │                                                                        │  │
│  │   Pros: Instant updates, no polling overhead                          │  │
│  │   Cons: Requires webhook configuration, firewall access               │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  OPTION B: Polling-Based (For any git remote)                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │   Background Job ──(every N min)──► git fetch ──► Compare ──► Pull    │  │
│  │                                                                        │  │
│  │   Pros: Works with any git remote, no external config                 │  │
│  │   Cons: Delayed updates, polling overhead                             │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**R7.3: Sync Manager**

```typescript
interface SyncManager {
  // Pull latest changes for a project
  syncProject(projectId: string): Promise<SyncResult>;

  // Pull all projects
  syncAll(): Promise<SyncResult[]>;

  // Get changes since last sync
  getChangedFiles(projectId: string): Promise<ChangedFile[]>;

  // Handle webhook payload
  handleWebhook(
    payload: WebhookPayload,
    signature: string
  ): Promise<SyncResult>;
}

interface SyncResult {
  projectId: string;
  success: boolean;
  previousCommit: string;
  newCommit: string;
  changedFiles: ChangedFile[];
  extractionTriggered: boolean;
  error?: string;
}

interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;  // For renames
}
```

**R7.4: Incremental Re-Extraction**

When a project updates, only re-extract changed files:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  git pull   │───►│  Diff       │───►│  Re-extract │───►│  Update     │
│  detects    │    │  Changed    │    │  Only       │    │  Cross-     │
│  new commit │    │  Files      │    │  Changed    │    │  Links      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                            │
                                            ▼
                               Delete nodes for deleted files
                               Update nodes for modified files
                               Add nodes for new files
                               Re-run cross-project linking
```

### R8: Cross-Codebase Linking

**R8.1: Reference Collection**

Scan all projects for external references:

```typescript
interface ReferenceCollector {
  // Collect all queue references across projects
  collectQueueReferences(): Promise<QueueReference[]>;

  // Collect all API client calls
  collectApiClientCalls(): Promise<ApiClientCall[]>;

  // Collect all shared database references
  collectDatabaseReferences(): Promise<DatabaseReference[]>;
}

interface QueueReference {
  projectId: string;
  file: string;
  line: number;
  direction: 'publish' | 'subscribe';
  queueIdentifier: string;  // Could be literal, env var, or config ref
  resolvedName?: string;    // After resolution
  confidence: number;
}
```

**R8.2: Reference Resolution**

Resolve indirect references (env vars, config files, IaC):

```typescript
interface ReferenceResolver {
  // Resolve queue name from env var or config
  resolveQueueName(ref: QueueReference): Promise<string | null>;

  // Parse terraform for resource definitions
  parseTerraform(projectId: string): Promise<InfraResources>;

  // Parse kubernetes manifests
  parseKubernetes(projectId: string): Promise<InfraResources>;

  // Parse docker-compose for service definitions
  parseDockerCompose(projectId: string): Promise<ServiceDefinitions>;
}
```

**R8.3: AI-Assisted Matching**

When static resolution fails, use LLM reasoning:

```xml
<context>
  <unresolved_references>
    <queue project="order-service" env_var="SQS_ORDERS_QUEUE" direction="publish"/>
    <queue project="fulfillment-service" literal="orders-created" direction="subscribe"/>
    <terraform resource="aws_sqs_queue.orders" name="prod-orders-queue"/>
  </unresolved_references>
</context>

<task>
  Determine which queue references refer to the same logical queue.
  Consider naming conventions, project relationships, and terraform resources.

  Output confidence scores for each match.
</task>
```

**R8.4: Cross-Project Link Types**

| Link Type | Description | Detection Method |
|-----------|-------------|------------------|
| Queue Link | Producer → Queue → Consumer | Queue name matching |
| API Link | Client → Server endpoint | URL/path matching |
| Database Link | Multiple services → Same DB | Connection string matching |
| Library Link | Shared library → Consumers | Import/dependency analysis |
| Config Link | Shared config source | Environment variable tracing |

---

## Part 4: Query & Visualization

### R9: Query Interface

**R9.1: Natural Language Queries**

```python
@mcp.tool
async def query_mesh(
    query: str,
    query_type: str = "natural",  # "natural" | "cypher"
    scope: str = "all",           # "all" | project_id
) -> list[dict]:
    """Query the code knowledge mesh.

    Examples:
    - "What functions call UserService.authenticate()?"
    - "How does user input reach the database?"
    - "What code accesses PHI data?"
    - "Show me the data flow for order processing"
    - "What services publish to the orders queue?"
    """
```

**R9.2: Graph Query Examples**

```cypher
// Find all paths from API routes to PHI columns
MATCH path = (r:ApiEndpoint)-[:HANDLED_BY]->(:Function)-[:CALLS*1..5]->
             (f:Function)-[:QUERIES]->(c:Column {phi: true})
RETURN r.path, c.table + "." + c.name AS phi_column, path

// Find queue producer/consumer pairs across services
MATCH (producer:Function)-[:PUBLISHES_TO]->(q:Queue)<-[:SUBSCRIBES_TO]-(consumer:Function)
WHERE producer.project_id <> consumer.project_id
RETURN producer.project_id, producer.name, q.name, consumer.project_id, consumer.name

// Find orphaned queue publishers (no consumer)
MATCH (f:Function)-[:PUBLISHES_TO]->(q:Queue)
WHERE NOT EXISTS { (q)<-[:SUBSCRIBES_TO]-(:Function) }
RETURN f.project_id, f.file, f.name, q.name AS orphaned_queue

// Impact analysis: what's affected if this function changes?
MATCH (changed:Function {name: "calculate_tax"})
MATCH (caller)-[:CALLS*1..5]->(changed)
RETURN DISTINCT caller.project_id, caller.file, caller.name
```

**R9.3: MCP Tools**

```python
@mcp.tool
async def build_mesh(
    project_path: str | None = None,  # None = all registered projects
    incremental: bool = True,
    enable_ai: bool = True,
) -> dict:
    """Build or update the code knowledge mesh."""

@mcp.tool
async def register_project(
    git_url: str,
    name: str,
    branch: str = "main",
    auto_pull: bool = True,
) -> dict:
    """Register a git repository for mesh extraction."""

@mcp.tool
async def query_mesh(
    query: str,
    query_type: str = "natural",
) -> list[dict]:
    """Query the code knowledge mesh."""

@mcp.tool
async def trace_data_flow(
    from_point: str,  # Function, route, or service name
    to_point: str,    # Table, queue, or external API
    include_cross_service: bool = True,
) -> list[dict]:
    """Trace data flow between two points in the mesh."""

@mcp.tool
async def find_cross_service_links(
    project_id: str | None = None,
) -> list[dict]:
    """Find all cross-service relationships (queues, APIs, shared DBs)."""
```

### R10: Visualization

**R10.1: 2D Graph View**

- Nodes colored by type (function=blue, class=green, etc.)
- Edge types with different line styles
- Clustering by project/module
- Cross-service edges highlighted

**R10.2: Service Topology View**

```
┌─────────────┐      orders-queue      ┌─────────────┐
│   Order     │─────────────────────►  │ Fulfillment │
│   Service   │                        │   Service   │
│   (Python)  │                        │    (TS)     │
└─────────────┘                        └─────────────┘
       │                                      │
       │ WRITES_TO                           │ READS_FROM
       ▼                                      ▼
┌─────────────┐                        ┌─────────────┐
│  PostgreSQL │                        │   MongoDB   │
│   orders    │                        │   events    │
└─────────────┘                        └─────────────┘
```

**R10.3: Flow Visualization**

Sequence diagrams generated from mesh:

```
User -> OrderService: POST /orders
OrderService -> PostgreSQL: INSERT order
OrderService -> SQS: publish(orders-queue)
SQS -> FulfillmentService: consume
FulfillmentService -> MongoDB: INSERT event
FulfillmentService -> User: email confirmation
```

---

## Part 5: Documentation Generation

### R11: Documentation as Graph Queries

**The Key Insight:** Documentation is a **view** of the mesh, not a separate artifact.

```python
@mcp.tool
async def generate_docs(
    project_id: str | None = None,  # None = all projects
    doc_type: str = "api",          # "api" | "architecture" | "data-flow" | "dependencies"
    format: str = "markdown",       # "markdown" | "html" | "openapi"
) -> str:
    """Generate documentation from the code knowledge mesh.

    Because the mesh is always current, docs are always current.
    """
```

**R11.1: Documentation Types**

| Doc Type | Graph Query | Output Format |
|----------|-------------|---------------|
| API Documentation | All ApiEndpoint nodes + handlers | OpenAPI spec, Markdown |
| Architecture Overview | Service nodes + cross-service edges | Mermaid diagrams |
| Data Flow | Paths from routes → data stores | Sequence diagrams |
| Dependencies | Import graph, library usage | Dependency tree |
| Queue Topology | All PUBLISHES_TO / SUBSCRIBES_TO | Message flow diagram |
| Database Schema | Table/Column nodes | ERD diagrams |
| Cross-Service Contracts | API + Queue links across projects | Contract documentation |

**R11.2: Example - API Documentation Query**

```cypher
MATCH (file:File)-[:CONTAINS]->(endpoint:ApiEndpoint)
MATCH (endpoint)-[:HANDLED_BY]->(handler:Function)
OPTIONAL MATCH (handler)-[:ACCEPTS]->(param:Parameter)
OPTIONAL MATCH (handler)-[:RETURNS]->(response:Type)
RETURN endpoint.method, endpoint.path,
       handler.name, handler.docstring,
       collect(param) as params, response
ORDER BY endpoint.path
```

→ Transforms to OpenAPI spec or Markdown.

**R11.3: Always-Current Guarantee**

```
Traditional Docs:          Mesh-Based Docs:
┌─────────────┐           ┌─────────────┐
│ Write docs  │           │ Query mesh  │
│    ↓        │           │    ↓        │
│ Code changes│           │ Code changes│
│    ↓        │           │    ↓        │
│ Docs stale! │           │ Mesh updates│
│    ↓        │           │    ↓        │
│ Update docs │           │ Query mesh  │◄── Same query,
│  (manual)   │           │             │    new results!
└─────────────┘           └─────────────┘
```

---

## Part 6: Implementation Architecture

### R12: TypeScript/Python Split

**TypeScript (mesh-builder/):**
- Schema registry and loading
- Pattern matching
- Language/framework detection
- Tier 1 extraction
- Tier 2/3 AI client calls
- Cross-project linking logic
- CLI interface
- JSON output

**Python (draagon_forge/):**
- Neo4j graph storage
- MCP tool exposure
- Integration with draagon-ai
- Webhook handlers
- Code review integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION SPLIT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TYPESCRIPT (src/mesh-builder/)                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  schemas/          → JSON pattern definitions                         │  │
│  │  core/             → SchemaRegistry, PatternMatcher, TierRouter       │  │
│  │  extractors/       → File, Function, API, Queue extractors            │  │
│  │  ai/               → LLM client, Tier2/3 handlers, SchemaGenerator    │  │
│  │  cross-project/    → MultiProjectCoordinator, ReferenceResolver       │  │
│  │  output/           → MeshExporter (JSON)                              │  │
│  │  cli/              → mesh-builder extract, link, schema commands      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼  mesh.json                             │
│                                                                              │
│  PYTHON (src/draagon_forge/)                                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  mesh/             → MeshImporter, MeshDiffer, GraphQueries           │  │
│  │  projects/         → ProjectRegistry, SyncManager, WebhookHandler     │  │
│  │  mcp/tools/mesh.py → build_mesh, query_mesh, register_project, etc.   │  │
│  │  docs/             → DocGenerator (queries mesh for docs)             │  │
│  │  agents/code_review/ → MeshAwareReviewer                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### R13: File Structure

```
draagon-forge/
├── src/
│   ├── mesh-builder/           # TypeScript
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── schemas/
│   │   │   ├── languages/
│   │   │   ├── frameworks/
│   │   │   ├── data-stores/
│   │   │   ├── messaging/
│   │   │   ├── infrastructure/
│   │   │   └── custom/
│   │   ├── core/
│   │   ├── extractors/
│   │   ├── ai/
│   │   ├── cross-project/
│   │   ├── output/
│   │   └── cli/
│   │
│   └── draagon_forge/          # Python
│       ├── mesh/
│       │   ├── __init__.py
│       │   ├── importer.py
│       │   ├── differ.py
│       │   └── queries.py
│       ├── projects/
│       │   ├── __init__.py
│       │   ├── registry.py
│       │   ├── sync.py
│       │   └── webhook.py
│       ├── docs/
│       │   ├── __init__.py
│       │   └── generator.py
│       └── mcp/tools/
│           └── mesh.py
```

---

## Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Tier 1 coverage | >80% of files | Most files use fast schema path |
| Tier 2 escalation | <15% of files | AI-assisted only for ambiguous |
| Tier 3 discovery | <5% of files | Full AI only for unknown |
| Cross-service link accuracy | >85% | Queue/API links correct |
| Schema generation success | >70% | Generated schemas work |
| Full extraction (10K files) | <2 minutes | Fast enough for CI |
| Incremental update | <10 seconds | Fast enough for save-time |
| Documentation accuracy | >90% | Generated docs match reality |
| Query latency | <100ms | Interactive experience |
| Auto-sync latency | <30 seconds | Near real-time updates |

---

## Cost Analysis

| Tier | % of Files | Tokens/File | Total (10K files) | Cost |
|------|------------|-------------|-------------------|------|
| Tier 1 | 80% | 0 | 0 | $0.00 |
| Tier 2 | 15% | 500 | 750K | ~$0.15 |
| Tier 3 | 5% | 2000 | 1M | ~$0.30 |
| **Total** | 100% | - | 1.75M | **~$0.45** |

- Full scan of 10,000 file codebase: **~$0.45**
- Incremental update (10 files): **~$0.005**

---

## Implementation Phases

### Phase 1: Core Infrastructure (2 weeks)
- TypeScript mesh-builder skeleton
- Schema registry with JSON loading
- Pattern matcher
- Basic extractors (File, Function, Class)
- JSON output format

### Phase 2: Framework Schemas (1 week)
- Python: FastAPI, Django, SQLAlchemy
- TypeScript: NestJS, Express, Prisma
- Initial data store schemas

### Phase 3: AI Tiers (2 weeks)
- LLM client (Groq)
- Tier 2 enhancement
- Tier 3 discovery
- Schema generator

### Phase 4: Project Registry (1 week)
- Project registration
- Git clone/pull
- Polling-based sync
- Webhook support

### Phase 5: Cross-Project Linking (2 weeks)
- Reference collection
- Config resolution (env, terraform, k8s)
- AI-assisted matching
- Cross-service edges

### Phase 6: Python Integration (1 week)
- Neo4j importer
- MCP tools
- Code review integration

### Phase 7: Documentation (1 week)
- Graph queries for doc types
- OpenAPI, Markdown, Mermaid output
- generate_docs tool

**Total: ~10 weeks**

---

## Open Questions

1. **Schema sharing**: Share generated schemas across users/orgs? Privacy?
2. **Large codebases**: Partitioning strategy for 100K+ file repos?
3. **Webhook security**: How to validate webhook payloads from various sources?
4. **Caching**: How long to cache AI results? Invalidation?
5. **Multi-tenant**: Ecosystem graphs shared or isolated?

---

## Appendix: Example Workflows

### Workflow 1: Initial Setup

```bash
# Register projects
mesh register https://github.com/myorg/order-service --name "Order Service"
mesh register https://github.com/myorg/fulfillment-service --name "Fulfillment"
mesh register https://github.com/myorg/infrastructure --name "Infrastructure"

# Build initial mesh
mesh build --all

# View cross-service links
mesh query "What services consume from order queues?"
```

### Workflow 2: Code Review with Mesh

```python
# In code review agent
diff = get_staged_changes()

# Build incremental mesh for changed files
await build_mesh(incremental=True)

# Check for structural violations
violations = await query_mesh("""
  Find any broken cross-service links after these changes:
  - Queues with no consumers
  - API calls to non-existent endpoints
  - Database writes without corresponding reads
""")

# Include in review
if violations:
    review.add_issue("Structural violations detected", violations)
```

### Workflow 3: Generate Documentation

```bash
# Generate API docs for all services
mesh docs --type api --format openapi > api-spec.yaml

# Generate architecture diagram
mesh docs --type architecture --format mermaid > architecture.md

# Generate data flow for specific route
mesh trace "/api/orders" "orders table" --format sequence > order-flow.md
```

---

**Document Status:** Draft
**Created:** 2025-01-14
**Revised:** 2026-01-15
**Last Updated:** 2026-01-15
