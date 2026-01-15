# Code Knowledge Mesh: Deep Analysis & Research

**Document Type:** Research & Vision Analysis
**Created:** 2025-01-14
**Authors:** Doug Mealing, Claude
**Status:** Research Complete, Ready for Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Core Insight: Structure + Meaning](#2-the-core-insight-structure--meaning)
3. [Research Foundation](#3-research-foundation)
4. [The Complete Vision](#4-the-complete-vision)
5. [Technical Deep Dive](#5-technical-deep-dive)
6. [Complexity Analysis](#6-complexity-analysis)
7. [Feasibility Assessment](#7-feasibility-assessment)
8. [Implementation Strategy](#8-implementation-strategy)
9. [Risk Analysis](#9-risk-analysis)
10. [Appendices](#appendices)

---

## 1. Executive Summary

### The Problem

Modern AI coding assistants, including Claude Code, rely primarily on **text search** (grep, ripgrep) and **semantic similarity** (embeddings, RAG) to understand codebases. This approach has fundamental limitations:

| Limitation | Impact |
|------------|--------|
| No structural understanding | Can't trace "what calls this function" without reading every file |
| No data flow awareness | Can't answer "where does user input go" |
| No dependency knowledge | Treats library code as opaque |
| No persistence awareness | Doesn't know how data is stored or transformed |
| Version blindness | Can't distinguish API changes across versions |

### The Solution

A **Code Knowledge Mesh** - a multi-layer graph database that captures:
- **Code structure** (AST, call graphs, dependencies)
- **Data flows** (how information moves through the system)
- **Data stores** (databases, caches, queues)
- **Library ecosystem** (pre-indexed, version-aware)
- **Semantic understanding** (beliefs, patterns, architectural decisions)

### Why This Matters for Draagon

Draagon Forge's unique value proposition is the combination of **structural intelligence** with **semantic understanding**. The Code Knowledge Mesh is the structural foundation that makes semantic beliefs actionable:

```
Traditional: "Always use parameterized queries" (belief stored, but where does it apply?)

With Mesh:   "Always use parameterized queries"
             → linked to → all SQL execution points in codebase
             → can verify → which follow the pattern
             → can alert → when violations occur
```

---

## 2. The Core Insight: Structure + Meaning

### The Draagon Philosophy

Most code intelligence tools focus on ONE dimension:

| Tool Category | Focus | Limitation |
|--------------|-------|------------|
| Static Analysis (CodeQL, Semgrep) | Structure | No semantic context, can't learn |
| RAG/Embeddings (Cursor, Copilot) | Meaning | Loses structural relationships |
| Knowledge Graphs (standalone) | Relationships | No code-specific semantics |

**Draagon's insight**: These must be unified. Structure without meaning is noisy. Meaning without structure is imprecise.

### The Mesh Concept

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           THE KNOWLEDGE MESH                                     │
│                                                                                  │
│    MEANING LAYER (Semantic)                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐  │
│    │  "This is the auth entry point"                                         │  │
│    │  "Always validate before database writes"                               │  │
│    │  "This pattern handles retry logic"                                     │  │
│    └───────────────────────────────┬─────────────────────────────────────────┘  │
│                                    │ LINKS TO                                    │
│    STRUCTURE LAYER (Graph)         ▼                                            │
│    ┌─────────────────────────────────────────────────────────────────────────┐  │
│    │  authenticate() ─CALLS→ verify_token() ─CALLS→ decode_jwt()            │  │
│    │       │                      │                      │                   │  │
│    │       └──READS_FROM──→ users.session_token ←──WRITES_TO──┘              │  │
│    └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│    Result: "The auth entry point is authenticate() at auth/service.py:45,       │
│             which reads session_token and should always validate first"         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Why Both Layers Are Essential

**Structure alone** can tell you:
- `authenticate()` calls `verify_token()`
- `verify_token()` reads from `users.session_token`

**Meaning alone** can tell you:
- "Authentication should happen before any protected operation"
- "Session tokens should be validated server-side"

**Together** they enable:
- "Show me all code paths to protected operations that bypass authenticate()"
- "Verify that session_token is always validated before use"
- "When this belief is violated, here's exactly where: file.py:123"

---

## 3. Research Foundation

### 3.1 Academic Research (2024-2025)

#### CodexGraph (NAACL 2025)
**Paper**: "Bridging Large Language Models and Code Repositories via Code Graph Databases"

**Key Contributions**:
- Demonstrates LLM + graph database integration for code understanding
- Achieves 27.90% Exact Match on CrossCodeEval Lite with GPT-4o
- Uses "write then translate" strategy: LLM generates NL query → specialized model translates to Cypher

**Graph Schema Used**:
```
Nodes: MODULE, CLASS, FUNCTION, GLOBAL_VARIABLE
Edges: CONTAINS, INHERITS, USES, CALLS, INSTANTIATES
```

**Relevance to Draagon**: Validates the core approach. Their schema is simpler than what we propose, but proves the concept works.

**Source**: https://arxiv.org/html/arXiv:2408.03910

---

#### RANGER (2025)
**Paper**: "Repository-level Agent for Graph-Enhanced Retrieval"

**Key Contributions**:
- Creates repository-level knowledge graphs with intra-file and inter-file structure
- Multi-hop traversal for complex queries
- Demonstrates 15-20% improvement over baseline RAG

**Relevance to Draagon**: Their inter-file dependency tracking is exactly what we need for cross-file data flow analysis.

**Source**: https://arxiv.org/html/2509.25257v1

---

#### GraphCoder (ASE 2024)
**Paper**: "Code Context Graphs for Repository-Level Code Completion"

**Key Contributions**:
- Introduces Code Context Graph (CCG) - combines control flow + data dependence
- Statement-level granularity (finer than function-level)
- Shows improved code completion accuracy

**Graph Structure**:
```
Nodes: Individual statements
Edges: CONTROL_FLOW, DATA_DEPENDENCE, FUNCTION_CALL
```

**Relevance to Draagon**: Statement-level tracking enables precise taint analysis for security.

**Source**: https://dl.acm.org/doi/10.1145/3691620.3695054

---

#### LLMxCPG (USENIX Security 2025)
**Paper**: "Context-aware Vulnerability Detection Combining Code Property Graphs with LLMs"

**Key Contributions**:
- Combines traditional Code Property Graphs with LLM analysis
- Significant improvement in vulnerability detection accuracy
- Demonstrates that structure + semantics beats either alone

**Relevance to Draagon**: Direct validation of our "structure + meaning" hypothesis for security use cases.

**Source**: https://arxiv.org/abs/2507.16585

---

#### DeepDFA (ICSE 2024)
**Paper**: "Dataflow Analysis-Inspired Deep Learning for Efficient Vulnerability Detection"

**Key Contributions**:
- Combines classical program analysis with deep learning
- Dataflow-aware graph neural networks
- State-of-the-art vulnerability detection

**Relevance to Draagon**: Their dataflow analysis approach is directly applicable to our PHI/PII tracking requirements.

**Source**: https://conf.researchr.org/details/icse-2024/icse-2024-research-track/63/

---

### 3.2 Industry Tools & Platforms

#### Joern - Code Property Graphs
**Type**: Open Source
**URL**: https://github.com/joernio/joern

**What It Does**:
- Creates Code Property Graphs (CPG) merging AST + CFG + PDG
- Queryable with Scala-based DSL
- Supports C/C++, Java, Python, JavaScript, TypeScript, Kotlin, LLVM, x86

**CPG Structure**:
```
                    Code Property Graph
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    Abstract Syntax   Control Flow    Program Dependence
         Tree            Graph             Graph
         (AST)           (CFG)             (PDG)
           │               │               │
           └───────────────┴───────────────┘
                           │
                    Unified Queryable
                        Graph
```

**Key Insight**: The CPG is the gold standard for security analysis. Combining AST (structure), CFG (execution paths), and PDG (data dependencies) enables sophisticated queries like:

```scala
// Find buffer overflows
cpg.call("memcpy")
   .where(_.argument(3).isLiteral)
   .filter(_.argument(3).code.toInt > _.argument(2).code.toInt)
```

**Relevance to Draagon**: We should adopt CPG-style structure for security-critical analysis, but extend it with semantic layers.

---

#### Sourcegraph SCIP Protocol
**Type**: Open Standard
**URL**: https://github.com/sourcegraph/scip

**What It Does**:
- Semantic Code Intelligence Protocol (successor to LSIF)
- Language-agnostic format for code navigation data
- 8x smaller indexes than LSIF, 3x faster processing

**Key Features**:
- Cross-repository navigation
- Symbol versioning for multi-version support
- Package ecosystem awareness

**SCIP Data Model**:
```protobuf
message Document {
  string relative_path = 1;
  repeated Occurrence occurrences = 2;
  repeated SymbolInformation symbols = 3;
}

message SymbolInformation {
  string symbol = 1;           // Globally unique symbol ID
  repeated string documentation = 2;
  repeated Relationship relationships = 3;  // REFERENCES, IMPLEMENTS, etc.
}
```

**Relevance to Draagon**: SCIP's symbol versioning is exactly what we need for version-aware library graphs. Consider adopting their symbol naming convention.

---

#### GitHub CodeQL
**Type**: Commercial (Free for OSS)
**URL**: https://codeql.github.com/

**What It Does**:
- Treats code as queryable data
- Powerful taint tracking for security analysis
- 3000+ pre-built security queries

**Query Example** (SQL Injection):
```ql
from DataFlow::PathNode source, DataFlow::PathNode sink
where SqlInjection::Flow::hasFlowPath(source, sink)
select sink.getNode(), source, sink, "SQL injection from $@.", source.getNode(), "user input"
```

**Key Insight**: CodeQL's query language is incredibly powerful but has a steep learning curve. Our NL → Cypher translation approach (like CodexGraph) is more accessible.

**Relevance to Draagon**: Don't try to replace CodeQL for deep security analysis. Instead, integrate with it or use similar patterns for our security checks.

---

#### JetBrains Qodana
**Type**: Commercial
**URL**: https://www.jetbrains.com/qodana/

**2025.2 Release Capabilities**:
- IFDS-based reachability analysis (7M LOC in <30 minutes)
- OWASP Top 10:2021 coverage
- Cross-file taint analysis

**Key Insight**: Qodana proves that sophisticated analysis at scale is achievable. Their IFDS preprocessing is worth studying.

---

### 3.3 AI Coding Assistant Architectures

#### How Current Tools Work

**Cursor**:
- RAG indexing with Tree-sitter AST parsing
- Struggles with enterprise scale (100GB+ RAM reported for large codebases)
- Focus on autocomplete, evolving toward agents

**Aider**:
- Four-layer system:
  1. Tree-sitter AST parsing
  2. NetworkX graph analysis with PageRank
  3. Repository mapping
  4. Context selection
- Emphasizes graph topology over semantic similarity

**Windsurf/Codeium**:
- "Cascade Memories" for session context retention
- Focus on flow state, less on structural analysis

**Key Insight**: None of these have a unified code + data + library + semantic graph. This is the gap Draagon can fill.

---

### 3.4 Graph Database Research

#### Microsoft GraphRAG (2024)
**URL**: https://github.com/microsoft/graphrag

**Key Contributions**:
- Uses LLMs to extract knowledge graphs from text
- Community detection via Leiden algorithm for hierarchical clustering
- Outperforms naive RAG by 70-80% on comprehensiveness metrics

**Query Modes**:
```
┌─────────────────────────────────────────────────────────────────┐
│                      GraphRAG Query Modes                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Global Search: Hierarchical community summaries                 │
│                 Good for: "What are the main themes?"            │
│                                                                  │
│  Local Search:  Entity-based with relationship context           │
│                 Good for: "Tell me about X"                      │
│                                                                  │
│  DRIFT Search:  Dynamic, iterative exploration                   │
│                 Good for: Complex multi-hop queries              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Relevance to Draagon**: DRIFT search mode is particularly relevant for our "trace data flow" queries.

---

### 3.5 Scale & Performance Research

#### ATLAS System (2025)
**Stats**: 900M+ nodes, 5.9B edges from 50M documents

**Key Learnings**:
- Hierarchical summarization essential at scale
- Community detection enables efficient global queries
- Incremental updates critical for freshness

#### Sourcegraph Scale
**Stats**: 54B+ lines indexed across 800K+ developers

**Key Learnings**:
- SCIP's protobuf format enables efficient transmission
- Remote indexing with local caching
- Incremental indexing essential

---

## 4. The Complete Vision

### 4.1 Multi-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CODE KNOWLEDGE MESH                                    │
│                                                                                  │
│  ╔═══════════════════════════════════════════════════════════════════════════╗  │
│  ║                     LAYER 5: SEMANTIC OVERLAY                              ║  │
│  ║                                                                            ║  │
│  ║   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   ║  │
│  ║   │    Beliefs      │  │   Principles    │  │      Patterns           │   ║  │
│  ║   │                 │  │                 │  │                         │   ║  │
│  ║   │ "Auth entry     │  │ "Always use     │  │ "Retry pattern:         │   ║  │
│  ║   │  point is here" │  │  parameterized  │  │  exponential backoff"   │   ║  │
│  ║   │                 │  │  queries"       │  │                         │   ║  │
│  ║   └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   ║  │
│  ║            │ APPLIES_TO         │ GOVERNS                │ IMPLEMENTED_BY  ║  │
│  ╚════════════╪════════════════════╪════════════════════════╪════════════════╝  │
│               │                    │                        │                    │
│  ╔════════════╪════════════════════╪════════════════════════╪════════════════╗  │
│  ║            ▼       LAYER 4: CODE STRUCTURE               ▼                 ║  │
│  ║                                                                            ║  │
│  ║   ┌─────────────────────────────────────────────────────────────────────┐ ║  │
│  ║   │                                                                     │ ║  │
│  ║   │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │ ║  │
│  ║   │  │  Files   │───▶│ Modules  │───▶│ Classes  │───▶│Functions │     │ ║  │
│  ║   │  │          │    │          │    │          │    │          │     │ ║  │
│  ║   │  │ path     │    │ exports  │    │ methods  │    │ params   │     │ ║  │
│  ║   │  │ lang     │    │ imports  │    │ inherits │    │ returns  │     │ ║  │
│  ║   │  │ size     │    │          │    │          │    │ calls    │     │ ║  │
│  ║   │  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │ ║  │
│  ║   │                                                                     │ ║  │
│  ║   │  Every node has: file, line_start, line_end, git_commit            │ ║  │
│  ║   │                                                                     │ ║  │
│  ║   └─────────────────────────────────────────────────────────────────────┘ ║  │
│  ╚════════════════════════════════════════════════════╤══════════════════════╝  │
│                                                       │                          │
│  ╔════════════════════════════════════════════════════╪══════════════════════╗  │
│  ║                  LAYER 3: DATA FLOW                │                       ║  │
│  ║                                                    ▼                       ║  │
│  ║   ┌────────────────────────────────────────────────────────────────────┐  ║  │
│  ║   │                                                                    │  ║  │
│  ║   │     User Input ──▶ Validation ──▶ Service ──▶ DAO ──▶ Database    │  ║  │
│  ║   │         │              │             │          │          │       │  ║  │
│  ║   │         │              │             │          │          │       │  ║  │
│  ║   │     [SOURCE]      [SANITIZER]    [TRANSFORM] [SINK]    [PERSIST]  │  ║  │
│  ║   │                                                                    │  ║  │
│  ║   │     Taint tracking: SOURCE → SINK paths                           │  ║  │
│  ║   │     PHI/PII annotations propagate through flows                    │  ║  │
│  ║   │                                                                    │  ║  │
│  ║   └────────────────────────────────────────────────────────────────────┘  ║  │
│  ╚════════════════════════════════════════════════════╤══════════════════════╝  │
│                                                       │                          │
│  ╔════════════════════════════════════════════════════╪══════════════════════╗  │
│  ║                  LAYER 2: DATA STORES              ▼                       ║  │
│  ║                                                                            ║  │
│  ║   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────┐  ║  │
│  ║   │   PostgreSQL  │  │     Redis     │  │     Kafka     │  │    S3     │  ║  │
│  ║   │               │  │               │  │               │  │           │  ║  │
│  ║   │ ┌───────────┐ │  │ key:user:*    │  │ orders.created│  │ /uploads/ │  ║  │
│  ║   │ │  users    │ │  │ key:session:* │  │ audit.log     │  │ /exports/ │  ║  │
│  ║   │ │ ─────────│ │  │ TTL: 3600     │  │               │  │           │  ║  │
│  ║   │ │ id       │ │  │               │  │ consumer:     │  │           │  ║  │
│  ║   │ │ email    │ │  └───────────────┘  │  order-svc    │  └───────────┘  ║  │
│  ║   │ │ ssn [PII]│ │                     │  audit-svc    │                  ║  │
│  ║   │ │ dx [PHI] │ │                     │               │                  ║  │
│  ║   │ └───────────┘ │                     └───────────────┘                  ║  │
│  ║   └───────────────┘                                                        ║  │
│  ╚════════════════════════════════════════════════════╤══════════════════════╝  │
│                                                       │                          │
│  ╔════════════════════════════════════════════════════╪══════════════════════╗  │
│  ║                 LAYER 1: LIBRARY ECOSYSTEM         ▼                       ║  │
│  ║                                                                            ║  │
│  ║   ┌─────────────────────────────────────────────────────────────────────┐ ║  │
│  ║   │                                                                     │ ║  │
│  ║   │  OPEN SOURCE (Pre-indexed)           CLOSED SOURCE (API Schemas)   │ ║  │
│  ║   │  ┌─────────────────────────────┐    ┌─────────────────────────────┐│ ║  │
│  ║   │  │ fastapi 0.110.0             │    │ Stripe API v2024-01        ││ ║  │
│  ║   │  │  ├─ FastAPI (class)         │    │  ├─ /v1/charges            ││ ║  │
│  ║   │  │  ├─ @app.get (decorator)    │    │  ├─ /v1/customers          ││ ║  │
│  ║   │  │  ├─ Depends (DI)            │    │  └─ Webhook events         ││ ║  │
│  ║   │  │  └─ HTTPException           │    │                            ││ ║  │
│  ║   │  │                             │    │ AWS SDK boto3 1.34         ││ ║  │
│  ║   │  │ sqlalchemy 2.0.25           │    │  ├─ S3Client               ││ ║  │
│  ║   │  │  ├─ create_engine           │    │  ├─ DynamoDB               ││ ║  │
│  ║   │  │  ├─ Session (2.0 style)     │    │  └─ Lambda                 ││ ║  │
│  ║   │  │  └─ select() (2.0 style)    │    │                            ││ ║  │
│  ║   │  │                             │    └─────────────────────────────┘│ ║  │
│  ║   │  │ VERSION EDGES:              │                                   │ ║  │
│  ║   │  │ Query.get ──DEPRECATED_IN──▶ 2.0                               │ ║  │
│  ║   │  │ Session.get ◀──REPLACES─── Query.get                           │ ║  │
│  ║   │  └─────────────────────────────┘                                   │ ║  │
│  ║   │                                                                     │ ║  │
│  ║   └─────────────────────────────────────────────────────────────────────┘ ║  │
│  ╚═══════════════════════════════════════════════════════════════════════════╝  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Node & Edge Taxonomy

#### Complete Node Types

```yaml
# Layer 5: Semantic
Belief:
  properties: [id, content, conviction, category, domain, source]
  example: "Always validate user input at API boundaries"

Principle:
  properties: [id, content, domain, examples, conviction]
  example: "Use dependency injection for loose coupling"

Pattern:
  properties: [id, name, description, code_examples, domain]
  example: "Repository pattern for data access"

# Layer 4: Code Structure
File:
  properties: [path, language, size, last_modified, git_commit]
  example: "src/api/routes.py"

Module:
  properties: [name, file, exports, docstring]
  example: "api.routes"

Class:
  properties: [name, file, line_start, line_end, docstring, decorators]
  example: "UserService"

Function:
  properties: [name, file, line_start, line_end, signature, async, docstring, decorators]
  example: "authenticate(username: str, password: str) -> User"

Method:
  properties: [name, class, file, line_start, line_end, visibility, static, classmethod]
  example: "UserService.find_by_email"

Variable:
  properties: [name, scope, type_hint, file, line]
  example: "current_user: User"

Parameter:
  properties: [name, function, position, type_hint, default, required]
  example: "username: str"

Decorator:
  properties: [name, arguments, file, line]
  example: "@app.get('/users/{id}')"

Route:
  properties: [method, path, handler, middleware, file, line]
  example: "GET /api/users/{id}"

# Layer 3: Data Flow
DataFlow:
  properties: [source, sink, path, tainted, data_type]
  example: "user_input → database"

TaintSource:
  properties: [type, function, parameter]
  example: "HTTP request body"

TaintSink:
  properties: [type, function, parameter]
  example: "SQL query execution"

# Layer 2: Data Stores
Database:
  properties: [name, type, host, version, connection_string]
  example: "postgres_main"

Schema:
  properties: [name, database]
  example: "public"

Table:
  properties: [name, schema, columns, row_estimate]
  example: "users"

Column:
  properties: [name, table, type, nullable, default, pii, phi, pci, encrypted]
  example: "ssn VARCHAR(11) [PII]"

Index:
  properties: [name, table, columns, unique, type]
  example: "idx_users_email"

ForeignKey:
  properties: [name, from_table, from_column, to_table, to_column, on_delete]
  example: "fk_orders_user_id"

RedisKey:
  properties: [pattern, type, ttl, description]
  example: "session:{user_id}"

KafkaTopic:
  properties: [name, partitions, retention, schema]
  example: "orders.created"

S3Bucket:
  properties: [name, region, versioned, encrypted]
  example: "company-uploads"

# Layer 1: Libraries
Library:
  properties: [name, version, source, license]
  example: "fastapi 0.110.0"

LibraryClass:
  properties: [name, library, version, docstring]
  example: "FastAPI"

LibraryFunction:
  properties: [name, library, version, signature, docstring, deprecated_in, replacement]
  example: "create_engine"

APIEndpoint:
  properties: [service, method, path, request_schema, response_schema]
  example: "Stripe POST /v1/charges"
```

#### Complete Edge Types

```yaml
# Structural Edges
CONTAINS:
  from: [File, Module, Class]
  to: [Module, Class, Function, Method]
  properties: []

IMPORTS:
  from: File
  to: Module
  properties: [alias, line]

INHERITS:
  from: Class
  to: Class
  properties: []

IMPLEMENTS:
  from: Class
  to: Interface
  properties: []

CALLS:
  from: [Function, Method]
  to: [Function, Method, LibraryFunction]
  properties: [line, async, conditional]

USES:
  from: [Function, Method]
  to: [Variable, Class, LibraryClass]
  properties: [read, write]

RETURNS:
  from: [Function, Method]
  to: Type
  properties: []

DECORATED_BY:
  from: [Function, Method, Class]
  to: Decorator
  properties: []

# Data Flow Edges
READS_FROM:
  from: [Function, Method]
  to: [Table, Column, RedisKey, KafkaTopic]
  properties: [query, line]

WRITES_TO:
  from: [Function, Method]
  to: [Table, Column, RedisKey, KafkaTopic]
  properties: [operation, line]

PUBLISHES_TO:
  from: [Function, Method]
  to: [KafkaTopic, Queue]
  properties: [message_type]

CONSUMES_FROM:
  from: [Function, Method]
  to: [KafkaTopic, Queue]
  properties: [consumer_group]

DATA_FLOWS_TO:
  from: [Parameter, Variable, Column]
  to: [Parameter, Variable, Column]
  properties: [transform, line]

TAINT_PROPAGATES:
  from: TaintSource
  to: TaintSink
  properties: [path, sanitized]

# Semantic Edges
APPLIES_TO:
  from: Belief
  to: [Function, Class, File]
  properties: [confidence]

GOVERNS:
  from: Principle
  to: [Function, Class, Module]
  properties: []

IMPLEMENTED_BY:
  from: Pattern
  to: [Function, Class]
  properties: [confidence]

VIOLATES:
  from: [Function, Class]
  to: [Belief, Principle]
  properties: [severity, evidence]

# Library Edges
DEPENDS_ON:
  from: File
  to: Library
  properties: [version_constraint]

AVAILABLE_IN:
  from: [LibraryClass, LibraryFunction]
  to: Library
  properties: [since_version]

DEPRECATED_IN:
  from: [LibraryClass, LibraryFunction]
  to: Library
  properties: [version, replacement]

REPLACES:
  from: [LibraryClass, LibraryFunction]
  to: [LibraryClass, LibraryFunction]
  properties: [in_version, migration_guide]

# Schema Edges
HAS_TABLE:
  from: [Database, Schema]
  to: Table
  properties: []

HAS_COLUMN:
  from: Table
  to: Column
  properties: [position]

REFERENCES:
  from: Column
  to: Column
  properties: [on_delete, on_update]
```

### 4.3 Source Location Tracking

Every code node includes precise location information:

```python
@dataclass
class SourceLocation:
    """Precise source code location for navigation."""

    file: str           # Relative path from repo root
    line_start: int     # First line (1-indexed)
    line_end: int       # Last line (inclusive)
    column_start: int   # First column (0-indexed)
    column_end: int     # Last column (exclusive)
    git_commit: str     # Commit hash when indexed
    git_branch: str     # Branch when indexed
    last_modified: datetime  # File modification time

    def to_uri(self) -> str:
        """Generate VS Code compatible URI."""
        return f"{self.file}#L{self.line_start}-L{self.line_end}"

    def to_github_url(self, repo: str) -> str:
        """Generate GitHub URL."""
        return f"https://github.com/{repo}/blob/{self.git_commit}/{self.file}#L{self.line_start}-L{self.line_end}"
```

**Why This Matters**:
- Claude can output "See `authenticate()` at [auth/service.py:45-67](auth/service.py#L45-L67)"
- Clicking jumps directly to the code
- Git commit tracking enables "show me this at version X"

### 4.4 Data Store Integration

#### Database Schema Extraction

```python
async def extract_postgres_schema(connection_string: str) -> list[Node]:
    """Extract schema as graph nodes from PostgreSQL."""

    nodes = []

    # Extract tables
    tables = await conn.fetch("""
        SELECT table_schema, table_name,
               pg_stat_user_tables.n_live_tup as row_estimate
        FROM information_schema.tables
        LEFT JOIN pg_stat_user_tables USING (schemaname, relname)
        WHERE table_type = 'BASE TABLE'
    """)

    for table in tables:
        nodes.append(TableNode(
            name=table['table_name'],
            schema=table['table_schema'],
            row_estimate=table['row_estimate'],
        ))

    # Extract columns with PII/PHI detection
    columns = await conn.fetch("""
        SELECT table_name, column_name, data_type,
               is_nullable, column_default,
               col_description(
                   (table_schema || '.' || table_name)::regclass,
                   ordinal_position
               ) as comment
        FROM information_schema.columns
    """)

    for col in columns:
        nodes.append(ColumnNode(
            name=col['column_name'],
            table=col['table_name'],
            type=col['data_type'],
            nullable=col['is_nullable'] == 'YES',
            default=col['column_default'],
            # Detect sensitive data from name/comment
            pii=detect_pii(col['column_name'], col['comment']),
            phi=detect_phi(col['column_name'], col['comment']),
        ))

    return nodes

def detect_pii(column_name: str, comment: str | None) -> bool:
    """Detect if column likely contains PII."""
    pii_patterns = [
        'ssn', 'social_security', 'tax_id', 'tin',
        'email', 'phone', 'address', 'dob', 'birth',
        'passport', 'license', 'ip_address',
    ]
    text = f"{column_name} {comment or ''}".lower()
    return any(p in text for p in pii_patterns)

def detect_phi(column_name: str, comment: str | None) -> bool:
    """Detect if column likely contains PHI."""
    phi_patterns = [
        'diagnosis', 'icd', 'medication', 'prescription',
        'treatment', 'condition', 'allergy', 'lab_result',
        'vital', 'procedure', 'mrn', 'medical_record',
    ]
    text = f"{column_name} {comment or ''}".lower()
    return any(p in text for p in phi_patterns)
```

#### Code-to-Data Linking

```python
async def link_code_to_schema(
    code_graph: Graph,
    schema_graph: Graph,
) -> list[Edge]:
    """Link code nodes to schema nodes based on queries."""

    edges = []

    for func in code_graph.get_nodes(type='Function'):
        # Extract SQL queries from function
        queries = extract_sql_queries(func.source_code)

        for query in queries:
            # Parse query to find tables/columns
            parsed = sqlparse.parse(query)[0]
            tables = extract_tables(parsed)
            columns = extract_columns(parsed)

            # Determine read/write
            is_write = parsed.get_type() in ('INSERT', 'UPDATE', 'DELETE')

            for table in tables:
                table_node = schema_graph.find_node(type='Table', name=table)
                if table_node:
                    edges.append(Edge(
                        from_node=func.id,
                        to_node=table_node.id,
                        type='WRITES_TO' if is_write else 'READS_FROM',
                        properties={'query': query, 'line': query.line},
                    ))

            for column in columns:
                col_node = schema_graph.find_node(type='Column', name=column)
                if col_node and col_node.phi:
                    # Flag PHI access!
                    edges.append(Edge(
                        from_node=func.id,
                        to_node=col_node.id,
                        type='ACCESSES_PHI',
                        properties={'query': query, 'line': query.line},
                    ))

    return edges
```

### 4.5 Version-Aware Library Graphs

#### Version Edge Model

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     VERSION-AWARE LIBRARY GRAPH                                  │
│                                                                                  │
│   SQLAlchemy Evolution Example:                                                  │
│                                                                                  │
│   ┌─────────────────┐         ┌─────────────────┐                               │
│   │  Query.get()    │         │  Session.get()  │                               │
│   │                 │         │                 │                               │
│   │  AVAILABLE_IN:  │         │  AVAILABLE_IN:  │                               │
│   │  [1.3, 1.4]     │─REPLACES─▶  [2.0, 2.1]    │                               │
│   │                 │         │                 │                               │
│   │  DEPRECATED_IN: │         │                 │                               │
│   │  2.0            │         │                 │                               │
│   └─────────────────┘         └─────────────────┘                               │
│                                                                                  │
│   Pydantic v1 → v2 Migration:                                                    │
│                                                                                  │
│   ┌─────────────────┐         ┌─────────────────┐                               │
│   │  BaseSettings   │         │  BaseSettings   │                               │
│   │  (pydantic)     │─MOVED_TO─▶ (pydantic_     │                               │
│   │                 │  in v2   │  settings)     │                               │
│   │  @validator     │         │  @field_        │                               │
│   │  (v1 only)      │─REPLACED─▶ validator      │                               │
│   │                 │  by      │  (v2)          │                               │
│   └─────────────────┘         └─────────────────┘                               │
│                                                                                  │
│   Query: "What deprecated APIs am I using?"                                      │
│                                                                                  │
│   MATCH (f:Function)-[:CALLS]->(lib:LibraryFunction)                            │
│   WHERE lib.deprecated_in <= "2.0"                                               │
│   AND f.project = "my-project"                                                   │
│   RETURN f.file, f.line_start, lib.name, lib.replacement                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Flow Tracing

#### Request Flow Visualization

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW TRACE                                        │
│                                                                                  │
│   Request: POST /api/patients                                                    │
│   Data Classification: PHI                                                       │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                          │  │
│   │  [HTTP Request]                                                          │  │
│   │       │                                                                  │  │
│   │       ▼                                                                  │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │  │ api/routes.py:45  create_patient()                              │    │  │
│   │  │ @app.post("/api/patients")                                      │    │  │
│   │  │ async def create_patient(patient: PatientCreate):               │    │  │
│   │  │     # patient.diagnosis is PHI ⚠️                               │    │  │
│   │  └─────────────────────────────────┬───────────────────────────────┘    │  │
│   │                                    │                                     │  │
│   │                                    ▼                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │  │ services/patient.py:23  validate_patient()                      │    │  │
│   │  │ def validate_patient(data: PatientCreate) -> ValidatedPatient:  │    │  │
│   │  │     # PHI in memory, validated                                  │    │  │
│   │  └─────────────────────────────────┬───────────────────────────────┘    │  │
│   │                                    │                                     │  │
│   │                                    ▼                                     │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │  │ dal/patient_dao.py:67  insert_patient()                         │    │  │
│   │  │ INSERT INTO patients (name, dob, diagnosis, ...)                │    │  │
│   │  │                             ▲                                   │    │  │
│   │  │                             │                                   │    │  │
│   │  │                     PHI written to DB ⚠️                        │    │  │
│   │  └─────────────────────────────────┬───────────────────────────────┘    │  │
│   │                                    │                                     │  │
│   │       ┌────────────────────────────┼────────────────────────────┐       │  │
│   │       │                            │                            │       │  │
│   │       ▼                            ▼                            ▼       │  │
│   │  ┌──────────────┐  ┌───────────────────────────┐  ┌──────────────────┐ │  │
│   │  │ Audit Log    │  │ PostgreSQL                │  │ Response         │ │  │
│   │  │              │  │ patients.diagnosis [PHI]  │  │ PatientResponse  │ │  │
│   │  │ ✓ Logged     │  │ ✓ Encrypted at rest       │  │ ⚠️ PHI exposed?  │ │  │
│   │  └──────────────┘  └───────────────────────────┘  └──────────────────┘ │  │
│   │                                                                          │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   Security Findings:                                                             │
│   ⚠️  PHI in API response - verify client-side handling                         │
│   ✓  Audit logging present                                                       │
│   ✓  Database encryption enabled                                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 3D Visualization Concept

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         3D MESH VISUALIZATION                                    │
│                                                                                  │
│                           Z-axis (layers)                                        │
│                               ▲                                                  │
│                               │                                                  │
│                               │    ┌─────────────────────────┐                  │
│   Layer 3: Semantic ──────────┼───▶│  Beliefs   Principles   │                  │
│                               │    │     ◆          ◇        │                  │
│                               │    │      \        /         │                  │
│                               │    │       \      /          │                  │
│                               │    └────────\────/───────────┘                  │
│                               │              \  / LINKS                         │
│                               │    ┌──────────\/─────────────┐                  │
│   Layer 2: Code ──────────────┼───▶│  ●───────●───────●      │                  │
│                               │    │  │       │       │      │                  │
│                               │    │  ●───────●───────●      │                  │
│                               │    │  Functions & Classes    │                  │
│                               │    └──────────┬──────────────┘                  │
│                               │               │ READS/WRITES                    │
│                               │    ┌──────────┴──────────────┐                  │
│   Layer 1: Infrastructure ────┼───▶│  ▢       ▢       ▢      │                  │
│                               │    │  DB    Cache   Queue    │                  │
│                               │    └─────────────────────────┘                  │
│                               │                                                  │
│                               └──────────────────────────────▶ X-axis           │
│                              /                                                   │
│                             /                                                    │
│                            ▼ Y-axis                                             │
│                                                                                  │
│   Visual Encoding:                                                               │
│   ─────────────────                                                              │
│   Colors:                                                                        │
│     🔴 Red     = PHI data flow                                                  │
│     🟡 Yellow  = PII data flow                                                  │
│     🟢 Green   = Public data flow                                               │
│     🔵 Blue    = Control flow                                                   │
│                                                                                  │
│   Node Size:   = Importance/Conviction                                          │
│   Edge Width:  = Call frequency                                                 │
│   Animation:   = Live request tracing                                           │
│                                                                                  │
│   Interactions:                                                                  │
│     - Click node → Show details + connected nodes                               │
│     - Drag to rotate 3D view                                                    │
│     - Filter by layer/data type                                                 │
│     - Animate trace: "Show me order processing flow"                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Technical Deep Dive

### 5.1 Parsing Architecture

#### Tree-sitter Foundation

Tree-sitter is the de facto standard for incremental parsing:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TREE-SITTER PIPELINE                                    │
│                                                                                  │
│   Source Code                                                                    │
│       │                                                                          │
│       ▼                                                                          │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐           │
│   │  Tree-sitter    │     │    Language     │     │   Incremental   │           │
│   │    Parser       │────▶│   Grammar       │────▶│     AST         │           │
│   │                 │     │  (40+ langs)    │     │                 │           │
│   └─────────────────┘     └─────────────────┘     └────────┬────────┘           │
│                                                            │                     │
│   On file change:                                          │                     │
│   ─────────────────                                        ▼                     │
│   1. Tree-sitter reuses unchanged subtrees    ┌─────────────────────┐           │
│   2. Only re-parses modified sections         │   Graph Extractor   │           │
│   3. Typical update: <10ms                    │                     │           │
│                                               │  - Nodes from AST   │           │
│                                               │  - Edges from refs  │           │
│                                               └────────┬────────────┘           │
│                                                        │                         │
│                                                        ▼                         │
│                                               ┌─────────────────────┐           │
│                                               │   Graph Database    │           │
│                                               │   (Neo4j/Qdrant)    │           │
│                                               └─────────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Why Tree-sitter**:
- Used by: GitHub, Neovim, Helix, Zed, Cursor, Aider
- 40+ language grammars available
- Incremental parsing (only re-parse changed parts)
- Error recovery (produces AST even with syntax errors)
- Query language for pattern matching

#### Language-Specific Extractors

```python
class PythonExtractor(CodeExtractor):
    """Extract graph from Python source files."""

    languages = ["python", "py"]

    async def extract_file(
        self,
        path: Path,
        content: str,
    ) -> tuple[list[Node], list[Edge]]:
        """Extract nodes and edges from Python file."""

        tree = self.parser.parse(content.encode())
        nodes = []
        edges = []

        # Query for function definitions
        func_query = self.language.query("""
            (function_definition
                name: (identifier) @name
                parameters: (parameters) @params
                return_type: (type)? @return_type
                body: (block) @body
            ) @function
        """)

        for match in func_query.matches(tree.root_node):
            func_node = match['function']
            name = match['name'].text.decode()

            nodes.append(FunctionNode(
                id=f"{path}:{name}",
                name=name,
                file=str(path),
                line_start=func_node.start_point[0] + 1,
                line_end=func_node.end_point[0] + 1,
                signature=self._extract_signature(match),
                async_=self._is_async(func_node),
                docstring=self._extract_docstring(match['body']),
            ))

            # Extract calls within function
            call_edges = self._extract_calls(func_node, path, name)
            edges.extend(call_edges)

        return nodes, edges

    async def extract_framework_patterns(
        self,
        nodes: list[Node],
    ) -> tuple[list[Node], list[Edge]]:
        """Extract FastAPI/Django/Flask specific patterns."""

        additional_nodes = []
        additional_edges = []

        for node in nodes:
            if not isinstance(node, FunctionNode):
                continue

            # Detect FastAPI routes
            for decorator in node.decorators:
                if self._is_route_decorator(decorator):
                    route = self._parse_route(decorator)
                    additional_nodes.append(RouteNode(
                        method=route.method,
                        path=route.path,
                        handler=node.id,
                        file=node.file,
                        line=decorator.line,
                    ))
                    additional_edges.append(Edge(
                        from_node=route.id,
                        to_node=node.id,
                        type='HANDLES',
                    ))

        return additional_nodes, additional_edges
```

### 5.2 Graph Storage

#### Neo4j Schema

```cypher
// Node constraints
CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE;
CREATE CONSTRAINT function_id IF NOT EXISTS FOR (f:Function) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT class_id IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT table_id IF NOT EXISTS FOR (t:Table) REQUIRE t.id IS UNIQUE;

// Indexes for common queries
CREATE INDEX function_name IF NOT EXISTS FOR (f:Function) ON (f.name);
CREATE INDEX function_file IF NOT EXISTS FOR (f:Function) ON (f.file);
CREATE INDEX column_pii IF NOT EXISTS FOR (c:Column) ON (c.pii);
CREATE INDEX column_phi IF NOT EXISTS FOR (c:Column) ON (c.phi);

// Full-text search
CREATE FULLTEXT INDEX function_search IF NOT EXISTS
FOR (f:Function) ON EACH [f.name, f.docstring];
```

#### Hybrid Storage: Neo4j + Qdrant

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         HYBRID STORAGE ARCHITECTURE                              │
│                                                                                  │
│   ┌─────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│   │           NEO4J                 │  │            QDRANT                    │  │
│   │                                 │  │                                     │  │
│   │   Stores:                       │  │   Stores:                           │  │
│   │   - Node properties             │  │   - Embeddings of:                  │  │
│   │   - Edge relationships          │  │     - Function docstrings           │  │
│   │   - Graph structure             │  │     - Code content                  │  │
│   │                                 │  │     - Belief text                   │  │
│   │   Queries:                      │  │                                     │  │
│   │   - "What calls X?"             │  │   Queries:                          │  │
│   │   - "Path from A to B"          │  │   - "Functions similar to X"        │  │
│   │   - "All PHI columns"           │  │   - "Code that does Y"              │  │
│   │                                 │  │                                     │  │
│   └─────────────────┬───────────────┘  └───────────────────┬─────────────────┘  │
│                     │                                      │                     │
│                     └──────────────┬───────────────────────┘                     │
│                                    │                                             │
│                                    ▼                                             │
│                     ┌──────────────────────────────┐                             │
│                     │      UNIFIED QUERY LAYER     │                             │
│                     │                              │                             │
│                     │  NL: "Find functions that   │                             │
│                     │       handle payments"       │                             │
│                     │                              │                             │
│                     │  1. Qdrant: semantic search  │                             │
│                     │     → candidate functions    │                             │
│                     │                              │                             │
│                     │  2. Neo4j: structural filter │                             │
│                     │     → calls payment API      │                             │
│                     │     → writes to orders table │                             │
│                     │                              │                             │
│                     │  Result: Precise + Relevant  │                             │
│                     └──────────────────────────────┘                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Query Translation

#### Natural Language to Cypher

```python
class QueryTranslator:
    """Translate natural language queries to Cypher."""

    async def translate(self, query: str) -> str:
        """Translate NL query to Cypher.

        Uses LLM with examples and schema context.
        """

        prompt = f"""You are a Cypher query generator for a code knowledge graph.

Schema:
- (File) -[:CONTAINS]-> (Function|Class)
- (Function) -[:CALLS]-> (Function)
- (Function) -[:READS_FROM|WRITES_TO]-> (Table|Column)
- (Column) has properties: pii: boolean, phi: boolean
- (Library) -[:EXPORTS]-> (LibraryFunction)
- (LibraryFunction) has properties: deprecated_in: string

Examples:
Q: What functions call authenticate?
A: MATCH (f:Function)-[:CALLS]->(auth:Function {{name: "authenticate"}})
   RETURN f.file, f.name, f.line_start

Q: Where is PHI data accessed?
A: MATCH (f:Function)-[:READS_FROM|QUERIES]->(c:Column {{phi: true}})
   RETURN f.file, f.name, c.table, c.name

Q: What deprecated APIs am I using?
A: MATCH (f:Function)-[:CALLS]->(lib:LibraryFunction)
   WHERE lib.deprecated_in IS NOT NULL
   RETURN f.file, f.line_start, lib.name, lib.replacement

Query: {query}
Cypher:"""

        response = await self.llm.complete(prompt)
        return response.strip()
```

### 5.4 Incremental Updates

```python
class IncrementalIndexer:
    """Incrementally update graph on file changes."""

    async def on_file_changed(self, path: Path, content: str):
        """Handle file change event."""

        # 1. Parse changed file
        new_tree = self.parser.parse(content.encode())

        # 2. Get existing nodes for this file
        existing_nodes = await self.graph.query("""
            MATCH (n)
            WHERE n.file = $path
            RETURN n
        """, path=str(path))

        # 3. Extract new nodes from parsed AST
        new_nodes, new_edges = await self.extractor.extract_file(path, content)

        # 4. Diff and update
        to_delete = set(n.id for n in existing_nodes) - set(n.id for n in new_nodes)
        to_create = set(n.id for n in new_nodes) - set(n.id for n in existing_nodes)
        to_update = set(n.id for n in new_nodes) & set(n.id for n in existing_nodes)

        # 5. Apply changes in transaction
        async with self.graph.transaction() as tx:
            for node_id in to_delete:
                await tx.run("MATCH (n {id: $id}) DETACH DELETE n", id=node_id)

            for node in new_nodes:
                if node.id in to_create:
                    await tx.run("CREATE (n:$labels $props)",
                                labels=node.labels, props=node.to_dict())
                elif node.id in to_update:
                    await tx.run("MATCH (n {id: $id}) SET n = $props",
                                id=node.id, props=node.to_dict())

            for edge in new_edges:
                await tx.run("""
                    MATCH (a {id: $from_id}), (b {id: $to_id})
                    MERGE (a)-[r:$type]->(b)
                    SET r = $props
                """, from_id=edge.from_node, to_id=edge.to_node,
                     type=edge.type, props=edge.properties)

        # 6. Update dependent edges (calls to this file's functions)
        await self._update_cross_file_edges(path, new_nodes)
```

---

## 6. Complexity Analysis

### 6.1 What's Hard

| Challenge | Difficulty | Why It's Hard |
|-----------|------------|---------------|
| **Cross-file resolution** | High | Need to resolve imports, follow re-exports, handle dynamic imports |
| **Dynamic languages** | High | Python/JS: runtime metaprogramming, monkey patching, dynamic attribute access |
| **Framework magic** | High | Django ORM, Spring DI, React hooks have implicit behavior |
| **Database query parsing** | Medium | SQL in strings, ORMs, query builders, dynamic queries |
| **Version tracking** | Medium | Mapping version constraints to actual code, handling version ranges |
| **Scale** | Medium | Large codebases (1M+ LOC) need careful indexing strategies |
| **Incremental updates** | Medium | Maintaining consistency when files change, cascading updates |
| **Multi-repo graphs** | High | Different repos, different versions, circular dependencies |

### 6.2 Where Research Is Mature

| Area | Maturity | Evidence |
|------|----------|----------|
| **AST parsing** | Very High | Tree-sitter is production-ready, used everywhere |
| **Call graph extraction** | High | Well-understood problem, many tools exist |
| **Database schema extraction** | High | Standard tooling (SQLAlchemy inspect, pg_dump, etc.) |
| **Security taint analysis** | High | CodeQL, Semgrep, Joern prove it works |
| **Graph storage** | High | Neo4j, TigerGraph are production-grade |
| **LLM + graphs** | Medium | Recent research (2024-25) shows promise but still evolving |
| **3D visualization** | Medium | Libraries exist (Three.js, Cytoscape) but code-specific is custom |

### 6.3 Where Research Is Emerging

| Area | Maturity | State of the Art |
|------|----------|-----------------|
| **Semantic + structural fusion** | Low-Medium | CodexGraph, LLMxCPG are early attempts |
| **Cross-ecosystem graphs** | Low | No unified solution for multi-repo + libraries |
| **Version-aware graphs** | Low | SCIP has versioning but not migration paths |
| **Dynamic analysis integration** | Low | Runtime tracing combined with static graph |
| **LLM query translation** | Medium | Works but error-prone, needs validation |

### 6.4 Complexity by Language

| Language | Parsing | Resolution | Framework | Overall |
|----------|---------|------------|-----------|---------|
| Python | Easy | Medium | Hard (Django, FastAPI) | Medium-Hard |
| TypeScript | Easy | Easy (types help) | Hard (React, Next) | Medium |
| Java | Easy | Easy (explicit) | Hard (Spring) | Medium |
| Go | Easy | Easy | Easy (minimal magic) | Easy |
| JavaScript | Easy | Hard (dynamic) | Hard | Hard |
| Ruby | Medium | Hard | Very Hard (Rails magic) | Very Hard |
| C/C++ | Hard | Hard (macros, templates) | Medium | Hard |

---

## 7. Feasibility Assessment

### 7.1 What's Feasible Now (Phase 1)

**Achievable in 2-4 weeks**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: CORE GRAPH                                      │
│                                                                                  │
│   Parsing:                                                                       │
│   ✓ Tree-sitter for Python, TypeScript                                         │
│   ✓ Extract: Files, Functions, Classes                                         │
│   ✓ Extract: Calls, Imports, Contains                                          │
│                                                                                  │
│   Storage:                                                                       │
│   ✓ Neo4j for graph structure                                                   │
│   ✓ Basic Cypher queries                                                        │
│                                                                                  │
│   Query:                                                                         │
│   ✓ "What calls X?" → direct Cypher                                            │
│   ✓ "Find function by name" → index lookup                                     │
│   ✓ File:line references in results                                            │
│                                                                                  │
│   Limitations:                                                                   │
│   ✗ No cross-file resolution for dynamic imports                               │
│   ✗ No framework pattern detection                                              │
│   ✗ No NL query translation yet                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 What's Feasible Soon (Phase 2-3)

**Achievable in 1-2 months**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2-3: DATA + LIBRARIES                                 │
│                                                                                  │
│   Data Stores:                                                                   │
│   ✓ PostgreSQL schema extraction                                                │
│   ✓ PII/PHI column tagging (heuristic)                                         │
│   ✓ Code-to-table linking (SQLAlchemy, raw SQL)                                │
│   ~ Redis key pattern detection (partial)                                       │
│   ~ Kafka topic extraction (config-based)                                       │
│                                                                                  │
│   Libraries:                                                                     │
│   ✓ Pre-index top 10 Python libraries                                          │
│   ✓ Version metadata (deprecated_in, replacement)                              │
│   ~ Cross-version edges (migration paths)                                       │
│   ✗ Full ecosystem graph (too large)                                           │
│                                                                                  │
│   Frameworks:                                                                    │
│   ✓ FastAPI route detection                                                     │
│   ~ Django model/view extraction                                                │
│   ~ React component graph (partial)                                             │
│                                                                                  │
│   Query:                                                                         │
│   ✓ NL → Cypher translation (with LLM)                                         │
│   ✓ MCP tool: query_code_graph                                                  │
│   ✓ MCP tool: trace_data_flow (basic)                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 What's Hard (Phase 4+)

**Requires significant investment**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 4+: ADVANCED FEATURES                                   │
│                                                                                  │
│   Advanced Analysis:                                                             │
│   ~ Full taint analysis (source → sink)                                        │
│   ~ Security vulnerability detection                                             │
│   ~ Compliance reporting (HIPAA, PCI)                                           │
│                                                                                  │
│   Challenges:                                                                    │
│   - Requires CPG-style analysis (AST + CFG + PDG)                              │
│   - Dynamic language features break assumptions                                  │
│   - False positive management                                                    │
│                                                                                  │
│   Cross-Ecosystem:                                                               │
│   ~ Multi-repo dependency graphs                                                │
│   ~ API contract verification                                                    │
│   ~ Microservice communication mapping                                           │
│                                                                                  │
│   Challenges:                                                                    │
│   - No unified format across repos                                              │
│   - Version compatibility matrix is complex                                      │
│   - Dynamic service discovery                                                    │
│                                                                                  │
│   3D Visualization:                                                              │
│   ~ Interactive 3D mesh viewer                                                  │
│   ~ Animated flow traces                                                         │
│   ~ VR exploration (future)                                                      │
│                                                                                  │
│   Challenges:                                                                    │
│   - Large graph rendering performance                                            │
│   - Meaningful layouts at scale                                                  │
│   - Browser limitations                                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Level of Detail Assessment

Based on research, here's what level of detail is feasible:

| Detail Level | Feasibility | Notes |
|-------------|-------------|-------|
| **File-level** | ✓ Trivial | File system + git |
| **Function-level** | ✓ Easy | Tree-sitter queries |
| **Class-level** | ✓ Easy | Tree-sitter queries |
| **Call graph** | ✓ Moderate | Static analysis, some dynamic calls missed |
| **Import graph** | ✓ Moderate | Need to resolve paths |
| **Statement-level** | ~ Harder | Requires full AST traversal |
| **Expression-level** | ~ Hard | Very detailed, large graphs |
| **Data flow (intra-function)** | ~ Moderate | Well-studied problem |
| **Data flow (cross-function)** | ~ Hard | Needs interprocedural analysis |
| **Taint propagation** | ~ Hard | Requires CPG-style analysis |
| **Runtime behavior** | ✗ Very Hard | Needs dynamic analysis integration |

**Recommendation**: Start at function-level with call graphs, add statement-level selectively for security-critical paths.

---

## 8. Implementation Strategy

### 8.1 Phased Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION ROADMAP                                   │
│                                                                                  │
│   Week 1-2: Foundation                                                           │
│   ───────────────────                                                            │
│   □ Set up Neo4j instance                                                        │
│   □ Tree-sitter Python extractor                                                 │
│   □ Basic nodes: File, Function, Class                                          │
│   □ Basic edges: CONTAINS, CALLS, IMPORTS                                       │
│   □ File watcher for incremental updates                                        │
│                                                                                  │
│   Week 3-4: Core Queries                                                         │
│   ─────────────────────                                                          │
│   □ MCP tool: query_code_graph (Cypher)                                         │
│   □ MCP tool: find_usages                                                        │
│   □ MCP tool: get_callers / get_callees                                         │
│   □ Source location in all responses                                             │
│   □ Basic VS Code integration (jump to definition)                              │
│                                                                                  │
│   Week 5-6: Data Stores                                                          │
│   ─────────────────────                                                          │
│   □ PostgreSQL schema extractor                                                  │
│   □ PII/PHI column detection                                                     │
│   □ SQLAlchemy query detection                                                   │
│   □ Code-to-table edges                                                          │
│   □ MCP tool: trace_data_flow                                                    │
│                                                                                  │
│   Week 7-8: Libraries                                                            │
│   ─────────────────────                                                          │
│   □ Pre-index FastAPI, SQLAlchemy, Pydantic                                     │
│   □ Version metadata (deprecated, replacement)                                   │
│   □ Your code → library edges                                                    │
│   □ MCP tool: find_deprecated_usage                                              │
│                                                                                  │
│   Week 9-10: Framework Patterns                                                  │
│   ─────────────────────────────                                                  │
│   □ FastAPI route detection                                                      │
│   □ Dependency injection tracking                                                │
│   □ Route → handler → DAO → table traces                                        │
│                                                                                  │
│   Week 11-12: Semantic Integration                                               │
│   ───────────────────────────────                                                │
│   □ Link beliefs to code nodes                                                   │
│   □ Pattern → implementation matching                                            │
│   □ Violation detection                                                          │
│   □ NL → Cypher translation                                                      │
│                                                                                  │
│   Future: Advanced                                                               │
│   ─────────────────                                                              │
│   □ TypeScript extractor                                                         │
│   □ Full taint analysis                                                          │
│   □ 3D visualization                                                             │
│   □ Multi-repo support                                                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Technology Choices

| Component | Recommendation | Alternatives | Rationale |
|-----------|---------------|--------------|-----------|
| **Parsing** | Tree-sitter | ANTLR, libcst | Industry standard, incremental, multi-language |
| **Graph DB** | Neo4j | TigerGraph, ArangoDB | Mature, Cypher is readable, good tooling |
| **Embeddings** | Qdrant (existing) | Pinecone, Weaviate | Already using for beliefs |
| **Schema extraction** | SQLAlchemy inspect | pg_dump, prisma | Pythonic, works with connections |
| **Query translation** | Claude/Groq LLM | CodexGraph fine-tuned | Simpler, good enough to start |
| **Visualization** | Cytoscape.js | D3, Three.js | Good graph layouts, extensible |

### 8.3 API Design

```python
# MCP Tools for Code Knowledge Mesh

@mcp.tool
async def query_code_graph(
    query: str,
    query_type: Literal["natural", "cypher"] = "natural",
    limit: int = 20,
) -> list[CodeGraphResult]:
    """Query the code knowledge mesh.

    Args:
        query: Natural language question or Cypher query
        query_type: Whether to translate from NL or execute directly
        limit: Maximum results

    Returns:
        List of results with file:line references

    Examples:
        >>> await query_code_graph("What functions call authenticate?")
        >>> await query_code_graph("MATCH (f)-[:CALLS]->(g) RETURN f,g", query_type="cypher")
    """

@mcp.tool
async def find_usages(
    symbol: str,
    symbol_type: Literal["function", "class", "variable", "any"] = "any",
    scope: Literal["file", "project"] = "project",
) -> list[Usage]:
    """Find all usages of a symbol.

    Returns precise file:line locations for each usage.
    """

@mcp.tool
async def trace_data_flow(
    from_point: str,  # Function name or "route:/api/users"
    to_point: str,    # Table name or function name
    max_hops: int = 10,
    data_type: Literal["all", "pii", "phi"] = "all",
) -> DataFlowTrace:
    """Trace data flow between two points in the codebase.

    Returns the path with each hop's file:line.
    """

@mcp.tool
async def find_deprecated_usage(
    library: str | None = None,
) -> list[DeprecatedUsage]:
    """Find usage of deprecated library APIs.

    Returns usages with file:line and suggested replacements.
    """

@mcp.tool
async def get_phi_access_points() -> list[PHIAccessPoint]:
    """Find all code locations that access PHI data.

    Returns functions that read from PHI-tagged columns.
    """
```

---

## 9. Risk Analysis

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Dynamic language gaps** | High | Medium | Accept limitations, document what's not tracked |
| **Scale issues** | Medium | High | Incremental indexing, sampling for large repos |
| **False positives in NL queries** | High | Medium | Validate with user, show confidence scores |
| **Graph maintenance burden** | Medium | Medium | Aggressive incremental updates, background jobs |
| **Framework magic** | High | Medium | Framework-specific extractors, heuristics |

### 9.2 Resource Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Neo4j resource usage** | Medium | Medium | Tune queries, use indexes, pagination |
| **Indexing time** | Medium | Low | Background indexing, show partial results |
| **LLM costs for queries** | Medium | Low | Cache common translations, use smaller models |

### 9.3 Adoption Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Accuracy skepticism** | Medium | High | Show evidence, allow fallback to grep |
| **Learning curve** | Medium | Medium | NL queries, good defaults |
| **Integration friction** | Low | Medium | VS Code extension, MCP tools |

---

## Appendices

### A. Research Sources

#### Academic Papers

1. **CodexGraph** (NAACL 2025)
   - URL: https://arxiv.org/html/arXiv:2408.03910
   - Key contribution: LLM + graph database for code understanding

2. **RANGER** (2025)
   - URL: https://arxiv.org/html/2509.25257v1
   - Key contribution: Repository-level knowledge graphs

3. **GraphCoder** (ASE 2024)
   - URL: https://dl.acm.org/doi/10.1145/3691620.3695054
   - Key contribution: Code Context Graphs

4. **LLMxCPG** (USENIX Security 2025)
   - URL: https://arxiv.org/abs/2507.16585
   - Key contribution: CPG + LLM for vulnerability detection

5. **DeepDFA** (ICSE 2024)
   - URL: https://conf.researchr.org/details/icse-2024/icse-2024-research-track/63/
   - Key contribution: Dataflow-aware deep learning

#### Industry Tools

6. **Joern** - Code Property Graphs
   - URL: https://github.com/joernio/joern
   - Documentation: https://docs.joern.io/

7. **Sourcegraph SCIP**
   - URL: https://github.com/sourcegraph/scip
   - Blog: https://sourcegraph.com/blog/announcing-scip

8. **GitHub CodeQL**
   - URL: https://codeql.github.com/
   - Query examples: https://github.com/github/codeql

9. **Microsoft GraphRAG**
   - URL: https://github.com/microsoft/graphrag

10. **Neo4j Code Knowledge Graph**
    - URL: https://neo4j.com/blog/developer/codebase-knowledge-graph/

#### Auxiliary Research

11. **JetBrains Qodana 2025.2**
    - URL: https://blog.jetbrains.com/qodana/2025/08/qodana-2025-2-release/

12. **ATLAS System** - Large-scale KG
    - URL: https://arxiv.org/html/2510.20345v1

### B. Example Queries

#### Basic Queries

```cypher
// Find all functions in a file
MATCH (f:File {path: "src/api/routes.py"})-[:CONTAINS]->(func:Function)
RETURN func.name, func.line_start

// Find call chain
MATCH path = (start:Function {name: "main"})-[:CALLS*1..5]->(end:Function)
RETURN path

// Find all routes
MATCH (r:Route)-[:HANDLES]->(f:Function)
RETURN r.method, r.path, f.file, f.line_start
```

#### Security Queries

```cypher
// Find SQL injection risks
MATCH (source:Parameter)-[:DATA_FLOWS_TO*]->(sink:Function)-[:EXECUTES_SQL]->(query)
WHERE NOT exists((source)-[:DATA_FLOWS_TO*]->(:Function {name: "sanitize"})-[:DATA_FLOWS_TO*]->(sink))
RETURN source.function, sink.name, sink.file, sink.line_start

// Find PHI exposure in API responses
MATCH (route:Route)-[:HANDLES]->(handler:Function)
MATCH (handler)-[:CALLS*]->(dao:Function)-[:READS_FROM]->(col:Column {phi: true})
MATCH (handler)-[:RETURNS]->(response)
RETURN route.path, col.table, col.name, handler.file, handler.line_start

// Find unauthenticated routes
MATCH (route:Route)-[:HANDLES]->(handler:Function)
WHERE NOT exists((route)-[:HAS_MIDDLEWARE]->(:Middleware {name: "authenticate"}))
AND NOT route.path STARTS WITH "/public"
RETURN route.method, route.path, handler.file
```

#### Architecture Queries

```cypher
// Find circular dependencies
MATCH path = (a:Module)-[:IMPORTS*]->(a)
RETURN path

// Find god functions (too many calls)
MATCH (f:Function)-[:CALLS]->(other:Function)
WITH f, count(other) as call_count
WHERE call_count > 20
RETURN f.name, f.file, call_count
ORDER BY call_count DESC

// Find orphan functions (never called)
MATCH (f:Function)
WHERE NOT exists(()-[:CALLS]->(f))
AND NOT f.name STARTS WITH "_"
AND NOT f.name = "main"
RETURN f.name, f.file, f.line_start
```

### C. Glossary

| Term | Definition |
|------|------------|
| **AST** | Abstract Syntax Tree - tree representation of code structure |
| **CFG** | Control Flow Graph - graph of execution paths |
| **CPG** | Code Property Graph - unified AST + CFG + PDG |
| **PDG** | Program Dependence Graph - data and control dependencies |
| **Taint Analysis** | Tracking flow of untrusted data through code |
| **PHI** | Protected Health Information (HIPAA) |
| **PII** | Personally Identifiable Information |
| **SCIP** | Semantic Code Intelligence Protocol |
| **Tree-sitter** | Incremental parsing library |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-14 | Initial research and vision document |

---

**End of Document**
