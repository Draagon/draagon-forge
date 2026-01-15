# REQ-033: Code Knowledge Mesh

**Status:** Draft
**Priority:** High
**Created:** 2025-01-14
**Author:** Doug / Claude

## Summary

Build a unified **Code Knowledge Mesh** that combines static code analysis with semantic understanding, creating a queryable graph of code structure, data flows, dependencies, and architectural knowledge. This enables Claude Code to understand codebases at a structural level rather than relying on text search.

## Problem Statement

Current code intelligence (including Claude Code) relies heavily on:
- **grep/ripgrep** - Text pattern matching, no semantic understanding
- **LSP** - Single-file focus, limited cross-file intelligence
- **RAG** - Semantic similarity on code chunks, loses structural relationships

This misses:
- How data flows through the system
- What calls what (and from where)
- How code connects to data stores
- Library/framework semantic patterns
- Cross-repo and ecosystem dependencies
- Version-aware API evolution

## Vision

A multi-layer knowledge graph that Claude can query to understand:

```
┌─────────────────────────────────────────────────────────────────┐
│                     SEMANTIC LAYER                               │
│   Beliefs, Principles, Patterns, Architectural Decisions        │
│   "This is the auth entry point" / "Always use prepared stmts"  │
├─────────────────────────────────────────────────────────────────┤
│                      CODE LAYER                                  │
│   Functions, Classes, Modules, Files                            │
│   With file:line references, signatures, docstrings             │
├─────────────────────────────────────────────────────────────────┤
│                    DATA FLOW LAYER                               │
│   Call graphs, data dependencies, control flow                  │
│   Request traces, queue flows, event propagation                │
├─────────────────────────────────────────────────────────────────┤
│                   DATA STORE LAYER                               │
│   Databases, tables, columns, indexes                           │
│   Redis keys, S3 buckets, Kafka topics                          │
│   PII/PHI annotations on columns                                │
├─────────────────────────────────────────────────────────────────┤
│                    LIBRARY LAYER                                 │
│   Pre-indexed open source (FastAPI, React, Spring, etc.)        │
│   API schemas for closed source (Stripe, AWS, Twilio)           │
│   Version-aware with deprecation/migration edges                │
├─────────────────────────────────────────────────────────────────┤
│                   ECOSYSTEM LAYER                                │
│   Cross-repo dependencies, shared libraries                     │
│   Microservice communication, API contracts                     │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

### R1: Code Structure Graph

**R1.1: Node Types**

| Node Type | Properties | Source |
|-----------|------------|--------|
| `File` | path, language, size, last_modified | File system |
| `Module` | name, file, exports | AST parsing |
| `Class` | name, file, line_start, line_end, docstring | AST parsing |
| `Function` | name, file, line_start, line_end, signature, async, docstring | AST parsing |
| `Method` | name, class, file, line_start, line_end, visibility | AST parsing |
| `Variable` | name, scope, type_hint, file, line | AST parsing |
| `Import` | module, alias, file, line | AST parsing |
| `Decorator` | name, arguments, file, line | AST parsing |
| `Route` | method, path, handler, file, line | Framework-specific |

**R1.2: Edge Types**

| Edge Type | From | To | Properties |
|-----------|------|-----|------------|
| `CONTAINS` | File/Class/Module | Function/Class/Method | - |
| `CALLS` | Function | Function | line, async |
| `IMPORTS` | File | Module | alias |
| `INHERITS` | Class | Class | - |
| `IMPLEMENTS` | Class | Interface | - |
| `USES` | Function | Variable/Class | read/write |
| `RETURNS` | Function | Type | - |
| `ACCEPTS` | Function | Parameter | position, type |
| `DECORATES` | Decorator | Function/Class | - |
| `RAISES` | Function | Exception | - |

**R1.3: Source Location Tracking**

Every code node MUST include:
```python
{
    "file": "src/api/routes.py",      # Relative to repo root
    "line_start": 45,                  # First line of definition
    "line_end": 67,                    # Last line of definition
    "column_start": 0,                 # For precise navigation
    "column_end": 42,
    "git_commit": "abc123",            # Version tracking
    "last_modified": "2025-01-14T..."  # For incremental updates
}
```

### R2: Data Store Integration

**R2.1: Database Schema Nodes**

| Node Type | Properties |
|-----------|------------|
| `Database` | name, type (postgres/mysql/mongo), host, version |
| `Schema` | name, database |
| `Table` | name, schema, row_count_estimate |
| `Column` | name, table, type, nullable, default, pii, phi, pci |
| `Index` | name, table, columns, unique |
| `ForeignKey` | from_column, to_column, on_delete |
| `StoredProcedure` | name, schema, parameters |

**R2.2: Other Data Stores**

| Store Type | Nodes |
|------------|-------|
| Redis | `RedisKey` (pattern, ttl, type), `RedisStream` |
| Kafka | `KafkaTopic`, `KafkaConsumerGroup`, `KafkaPartition` |
| S3/Blob | `Bucket`, `Prefix`, `ObjectPattern` |
| Elasticsearch | `Index`, `Mapping`, `Field` |
| Queue | `Queue`, `Exchange`, `Binding` (RabbitMQ) |

**R2.3: Code-to-Data Edges**

| Edge Type | Description |
|-----------|-------------|
| `READS_FROM` | Function reads from table/key |
| `WRITES_TO` | Function writes to table/key |
| `QUERIES` | Function queries specific columns |
| `PUBLISHES_TO` | Function publishes to topic/queue |
| `CONSUMES_FROM` | Function consumes from topic/queue |

**R2.4: Data Classification**

Columns/fields should be tagged:
```python
{
    "pii": true,       # Personally Identifiable Information
    "phi": true,       # Protected Health Information
    "pci": false,      # Payment Card Industry data
    "encrypted": true, # Is this column encrypted at rest?
    "masked": false,   # Is this masked in logs/responses?
}
```

### R3: Library Ecosystem

**R3.1: Pre-indexed Library Graphs**

Maintain pre-built graphs for popular libraries:

| Category | Libraries |
|----------|-----------|
| Python Web | FastAPI, Django, Flask, Starlette |
| Python Data | Pandas, NumPy, SQLAlchemy, Pydantic |
| JavaScript | React, Vue, Next.js, Express |
| TypeScript | NestJS, TypeORM, Prisma |
| Java | Spring Boot, Hibernate, Jackson |
| Go | Gin, GORM, Chi |
| Rust | Axum, Tokio, Serde |

Each library graph includes:
- Exported classes, functions, decorators
- Common usage patterns
- Type signatures
- Semantic descriptions of purpose

**R3.2: Version-Aware Graphs**

```
(:Function {name: "Query.get"})
  -[:AVAILABLE_IN {versions: ["1.3", "1.4"]}]-> (:Library {name: "sqlalchemy"})
  -[:DEPRECATED_IN {version: "2.0", replacement: "Session.get"}]-> ...

(:Class {name: "BaseSettings"})
  -[:MOVED_IN {version: "2.0", from: "pydantic", to: "pydantic_settings"}]-> ...
```

**R3.3: Closed Source API Schemas**

For APIs without source code, index from OpenAPI/Swagger:
- Stripe API
- Twilio API
- AWS SDK
- Google Cloud
- Azure

### R4: Data Flow Analysis

**R4.1: Request Traces**

Track data flow through the system:
```
[HTTP POST /api/patients]
  → routes.py:45 create_patient()
    → services/patient.py:23 validate_patient(data)  # PHI in memory
    → dal/patient.py:67 INSERT INTO patients         # PHI persisted
    → services/audit.py:12 log_access()              # Audit created
  ← routes.py:52 return PatientResponse              # PHI in response
```

**R4.2: Taint Analysis**

Track sensitive data propagation:
- Mark sources: user input, database reads, file reads
- Mark sinks: responses, logs, external APIs
- Trace paths between sources and sinks
- Alert on unvalidated/unescaped paths

**R4.3: Queue/Event Flows**

```
(:Function {name: "process_order"})
  -[:PUBLISHES_TO]-> (:KafkaTopic {name: "orders.created"})

(:Function {name: "send_confirmation"})
  -[:CONSUMES_FROM]-> (:KafkaTopic {name: "orders.created"})
```

### R5: Language-Specific Extractors

**R5.1: Extractor Interface**

```python
class CodeExtractor(Protocol):
    """Extract code graph from source files."""

    languages: list[str]  # ["python", "py"]

    async def extract_file(
        self,
        path: Path,
        content: str,
    ) -> list[Node], list[Edge]

    async def extract_framework_patterns(
        self,
        nodes: list[Node],
    ) -> list[Node], list[Edge]  # Routes, DI, etc.
```

**R5.2: Framework Pattern Detection**

| Framework | Patterns to Detect |
|-----------|-------------------|
| FastAPI | Routes (`@app.get`), Dependencies (`Depends`), Pydantic models |
| Django | Views, Models, URL patterns, Middleware |
| React | Components, Hooks, Props flow, Context |
| Spring | Beans, `@Autowired`, `@Transactional`, JPA entities |
| Express | Routes, Middleware chain |
| NestJS | Controllers, Providers, Modules |

**R5.3: Database Query Detection**

Detect and parse:
- SQLAlchemy queries → link to tables/columns
- Raw SQL strings → parse and link
- ORM operations → map to schema
- Redis commands → link to key patterns

### R6: Visualization

**R6.1: 2D Graph View**

Interactive graph visualization showing:
- Nodes colored by type (function=blue, class=green, etc.)
- Edge types with different line styles
- Clustering by module/package
- Search and filter capabilities

**R6.2: 3D Layered View**

Three-dimensional representation:
```
Z-axis (layers):
  Layer 3: Semantic (beliefs, principles)
  Layer 2: Code (functions, classes)
  Layer 1: Infrastructure (data stores, APIs)

Traces: Animated paths showing request/data flows
Colors: Red=PHI, Yellow=PII, Green=public
```

**R6.3: Flow Visualization**

Sequence diagram generation from traces:
```
User -> API: POST /patients
API -> Service: create_patient()
Service -> DAO: insert()
DAO -> Database: INSERT
Database -> DAO: result
DAO -> Service: patient_id
Service -> Audit: log_access()
Service -> API: PatientResponse
API -> User: 201 Created
```

### R7: Query Interface

**R7.1: Natural Language Queries**

Claude can ask questions like:
- "What functions call UserService.authenticate()?"
- "How does user input reach the database?"
- "What code accesses PHI data?"
- "Show me the data flow for order processing"
- "What uses the deprecated API?"

**R7.2: Graph Query Language**

Support Cypher-like queries:
```cypher
// Find all paths from API routes to PHI columns
MATCH path = (r:Route)-[:CALLS*1..5]->(f:Function)-[:QUERIES]->(c:Column {phi: true})
RETURN path

// Find deprecated API usage
MATCH (f:Function)-[:USES]->(lib:LibraryFunction {deprecated: true})
RETURN f.file, f.line_start, lib.name, lib.replacement
```

**R7.3: MCP Tool Integration**

```python
@mcp.tool
async def query_code_graph(
    query: str,  # Natural language or Cypher
    query_type: str = "natural",  # "natural" | "cypher"
) -> list[dict]:
    """Query the code knowledge mesh."""
    ...

@mcp.tool
async def trace_data_flow(
    from_node: str,  # Function or route name
    to_node: str,    # Table, column, or sink
    data_type: str = None,  # "phi" | "pii" | "all"
) -> list[dict]:
    """Trace data flow between two points."""
    ...

@mcp.tool
async def find_usages(
    symbol: str,     # Function, class, or variable name
    scope: str = "project",  # "file" | "project" | "ecosystem"
) -> list[dict]:
    """Find all usages of a symbol with file:line references."""
    ...
```

### R8: Incremental Updates

**R8.1: File Change Detection**

On file save:
1. Parse changed file with Tree-sitter
2. Diff against existing graph nodes
3. Update only changed nodes/edges
4. Propagate changes to dependent nodes

**R8.2: Git Integration**

- Track git commit for each node version
- Support querying graph at specific commits
- Detect schema migrations in commits
- Link code changes to schema changes

### R9: Security Analysis

**R9.1: Automated Checks**

| Check | Description |
|-------|-------------|
| PHI Exposure | PHI data in API responses without audit |
| SQL Injection | User input reaching raw SQL |
| Auth Bypass | Routes reachable without auth middleware |
| Sensitive Logging | PII/PHI in log statements |
| Unencrypted Storage | Sensitive data to unencrypted columns |

**R9.2: Compliance Reporting**

Generate reports for:
- HIPAA: PHI data flow audit
- PCI-DSS: Cardholder data handling
- GDPR: PII processing inventory
- SOC2: Access control verification

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Code Knowledge Mesh                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Parsers    │  │  Extractors  │  │   Graph Builder      │  │
│  │              │  │              │  │                      │  │
│  │ Tree-sitter  │→ │ Python/TS/   │→ │  Neo4j + Qdrant     │  │
│  │ SQL Parser   │  │ Java/Go/etc  │  │  (structure+embed)   │  │
│  │ Schema Dump  │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         ↑                                       ↓               │
│  ┌──────────────┐                    ┌──────────────────────┐  │
│  │ File Watcher │                    │   Query Engine       │  │
│  │              │                    │                      │  │
│  │ Incremental  │                    │  NL → Cypher         │  │
│  │ Updates      │                    │  MCP Tools           │  │
│  └──────────────┘                    └──────────────────────┘  │
│                                                 ↓               │
│  ┌──────────────┐                    ┌──────────────────────┐  │
│  │ Library Hub  │                    │   Visualizer         │  │
│  │              │                    │                      │  │
│  │ Pre-indexed  │                    │  2D Graph / 3D Mesh  │  │
│  │ OSS + APIs   │                    │  Flow Traces         │  │
│  └──────────────┘                    └──────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| AST Parsing | Tree-sitter | 40+ languages, incremental, fast |
| Graph Storage | Neo4j | Cypher queries, ACID, enterprise |
| Embeddings | Qdrant | Semantic search overlay |
| Schema Extraction | SQLAlchemy inspect, pg_dump | Database introspection |
| Library Index | Pre-built, versioned | Fast startup, consistent |

## Success Metrics

| Metric | Target |
|--------|--------|
| Query latency | < 100ms for common queries |
| Index time | < 5 min for 100K LOC |
| Incremental update | < 500ms per file |
| Library coverage | Top 50 libraries indexed |
| Accuracy | 95%+ for call graph edges |

## Research References

Based on state-of-the-art research (2024-2025):

- **CodexGraph** (NAACL 2025) - LLM + code graph integration
- **Joern** - Code Property Graphs (AST + CFG + PDG)
- **Sourcegraph SCIP** - Cross-repo semantic indexing
- **Microsoft GraphRAG** - Knowledge graph + RAG patterns
- **Semgrep** - Taint analysis patterns

## Phased Implementation

### Phase 1: Core Graph (MVP)
- Tree-sitter parsing for Python/TypeScript
- Basic node types: File, Function, Class
- Basic edges: CALLS, CONTAINS, IMPORTS
- Neo4j storage
- Simple MCP query tool

### Phase 2: Data Stores
- PostgreSQL schema extraction
- Code-to-table linking
- PHI/PII column tagging
- Data flow edges

### Phase 3: Library Ecosystem
- Pre-index top 10 Python libraries
- Version-aware edges
- Framework pattern detection (FastAPI, Django)

### Phase 4: Advanced Analysis
- Taint analysis
- Security checks
- Compliance reporting
- Flow visualization

### Phase 5: Ecosystem
- Cross-repo graphs
- API schema indexing
- 3D visualization
- Full language coverage

## Open Questions

1. **Storage scale**: How to handle 1M+ node graphs efficiently?
2. **Freshness**: How often to rebuild vs. incremental update?
3. **Library hosting**: Self-hosted pre-indexed graphs or cloud service?
4. **Privacy**: How to handle sensitive code in graph?
5. **Multi-tenant**: Ecosystem graphs shared across users?

---

## Appendix: Example Queries

### Find PHI Data Flows
```cypher
MATCH path = (route:Route)-[:CALLS*1..10]->(func:Function)-[:QUERIES]->(col:Column {phi: true})
WHERE NOT exists((func)-[:CALLS]->(:Function {name: "audit_access"}))
RETURN route.path, col.table + "." + col.name AS phi_column,
       [n IN nodes(path) | n.file + ":" + n.line_start] AS trace
```

### Find Deprecated API Usage
```cypher
MATCH (f:Function)-[:USES]->(dep:LibraryFunction)
WHERE dep.deprecated_in <= "2.0"
RETURN f.file, f.line_start, dep.name, dep.replacement
ORDER BY f.file
```

### Trace Request Flow
```cypher
MATCH path = (r:Route {path: "/api/orders"})-[:CALLS*]->(sink)
WHERE sink:Table OR sink:KafkaTopic OR sink:ExternalAPI
RETURN path
```

### Impact Analysis
```cypher
MATCH (changed:Function {name: "calculate_tax"})
MATCH (caller)-[:CALLS*1..5]->(changed)
RETURN DISTINCT caller.file, caller.name, caller.line_start
ORDER BY caller.file
```
