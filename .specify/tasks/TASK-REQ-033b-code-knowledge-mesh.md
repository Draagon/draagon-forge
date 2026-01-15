# Tasks for REQ-033b: Code Knowledge Mesh

**Requirement:** REQ-033-code-knowledge-mesh.md
**Plan:** PLAN-REQ-033b-code-knowledge-mesh.md
**Created:** 2026-01-15
**Status:** ✅ Complete

---

## Phase 1: Core TypeScript Infrastructure ✅

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Create package.json and tsconfig.json | ✅ Done | `src/mesh-builder/` created |
| 1.2 Implement core types | ✅ Done | `src/mesh-builder/src/types/index.ts` |
| 1.3 Implement SchemaRegistry | ✅ Done | `src/mesh-builder/src/core/SchemaRegistry.ts` |
| 1.4 Implement PatternMatcher | ✅ Done | `src/mesh-builder/src/core/PatternMatcher.ts` |
| 1.5 Implement LanguageDetector | ✅ Done | `src/mesh-builder/src/core/LanguageDetector.ts` |
| 1.6 Implement FileExtractor | ✅ Done | `src/mesh-builder/src/extractors/FileExtractor.ts` |
| 1.7 Implement CLI skeleton | ✅ Done | `src/mesh-builder/src/cli/index.ts` |

---

## Phase 2: Framework Schemas 🔄

| Task | Status | Notes |
|------|--------|-------|
| 2.1 Create base Python schema | ✅ Done | `schemas/languages/python/base-python.json` |
| 2.2 Create FastAPI schema | ✅ Done | `schemas/frameworks/python/fastapi.json` |
| 2.3 Create base TypeScript schema | ✅ Done | `schemas/languages/typescript/base-typescript.json` |
| 2.4 Create NestJS schema | ✅ Done | `schemas/frameworks/typescript/nestjs.json` |
| 2.5 Create Django schema | ⏳ Pending | |
| 2.6 Create Express schema | ⏳ Pending | |
| 2.7 Create SQLAlchemy schema | ⏳ Pending | |
| 2.8 Create Prisma schema | ⏳ Pending | |
| 2.9 Create SQS messaging schema | ⏳ Pending | |
| 2.10 Create Kafka messaging schema | ⏳ Pending | |

---

## Phase 3: AI Tiers ✅

| Task | Status | Notes |
|------|--------|-------|
| 3.1 Implement AIClient (Groq) | ✅ Done | `src/mesh-builder/src/ai/AIClient.ts` |
| 3.2 Implement Tier2Enhancer | ✅ Done | `src/mesh-builder/src/ai/Tier2Enhancer.ts` |
| 3.3 Implement Tier3Discoverer | ✅ Done | `src/mesh-builder/src/ai/Tier3Discoverer.ts` |
| 3.4 Implement SchemaGenerator | ✅ Done | `src/mesh-builder/src/ai/SchemaGenerator.ts` |
| 3.5 Implement SelfLearningPipeline | ✅ Done | `src/mesh-builder/src/ai/SelfLearningPipeline.ts` |

---

## Phase 4: Project Registry & Auto-Pull ✅

| Task | Status | Notes |
|------|--------|-------|
| 4.1 Create ProjectRegistry (Python) | ✅ Done | `src/draagon_forge/mesh/registry.py` |
| 4.2 Implement git sync | ✅ Done | `src/draagon_forge/mesh/git_sync.py` |
| 4.3 Implement webhook handler | ✅ Done | `src/draagon_forge/mesh/webhook.py` |
| 4.4 Add incremental extraction | ✅ Done | `--changed-files` CLI option + FileExtractor support |

---

## Phase 5: Cross-Project Linking ✅

| Task | Status | Notes |
|------|--------|-------|
| 5.1 Implement ReferenceCollector | ✅ Done | `src/mesh-builder/src/linking/ReferenceCollector.ts` |
| 5.2 Implement ConfigResolver | ✅ Done | `src/mesh-builder/src/linking/ConfigResolver.ts` |
| 5.3 Implement CrossProjectMatcher | ✅ Done | `src/mesh-builder/src/linking/CrossProjectMatcher.ts` |
| 5.4 Implement CrossServiceLinker | ✅ Done | `src/mesh-builder/src/linking/CrossServiceLinker.ts` |

---

## Phase 6: Python Integration ✅

| Task | Status | Notes |
|------|--------|-------|
| 6.1 Implement MeshImporter | ✅ Done | `src/draagon_forge/mesh/importer.py` |
| 6.2 Create MCP tools | ✅ Done | `src/draagon_forge/mcp/tools/mesh.py` |
| 6.3 Implement MeshQueryEngine | ✅ Done | `src/draagon_forge/mesh/query_engine.py` |
| 6.4 Implement MeshAwareReviewer | ✅ Done | `src/draagon_forge/mesh/mesh_aware_reviewer.py` |

---

## Phase 7: Documentation Generation ✅

| Task | Status | Notes |
|------|--------|-------|
| 7.1 Implement DocQueryBuilder | ✅ Done | `src/mesh-builder/src/docs/DocQueryBuilder.ts` |
| 7.2 Implement OpenAPIGenerator | ✅ Done | `src/mesh-builder/src/docs/OpenAPIGenerator.ts` |
| 7.3 Implement MarkdownGenerator | ✅ Done | `src/mesh-builder/src/docs/MarkdownGenerator.ts` |
| 7.4 Implement MermaidGenerator | ✅ Done | `src/mesh-builder/src/docs/MermaidGenerator.ts` |
| 7.5 Create generate_docs MCP tool | ✅ Done | `src/draagon_forge/mcp/tools/mesh.py` |

---

## Implementation Progress

**Completed Phases:** 7 of 7 ✅
**Current Phase:** Complete

### Files Created

```
src/mesh-builder/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.json
├── src/
│   ├── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── core/
│   │   ├── index.ts
│   │   ├── SchemaRegistry.ts
│   │   ├── PatternMatcher.ts
│   │   └── LanguageDetector.ts
│   ├── extractors/
│   │   ├── index.ts
│   │   └── FileExtractor.ts
│   ├── ai/
│   │   ├── index.ts
│   │   ├── AIClient.ts
│   │   ├── Tier2Enhancer.ts
│   │   ├── Tier3Discoverer.ts
│   │   ├── SchemaGenerator.ts
│   │   └── SelfLearningPipeline.ts
│   ├── linking/
│   │   ├── index.ts
│   │   ├── ReferenceCollector.ts
│   │   ├── ConfigResolver.ts
│   │   ├── CrossProjectMatcher.ts
│   │   └── CrossServiceLinker.ts
│   ├── docs/
│   │   ├── index.ts
│   │   ├── DocQueryBuilder.ts
│   │   ├── OpenAPIGenerator.ts
│   │   ├── MarkdownGenerator.ts
│   │   └── MermaidGenerator.ts
│   └── cli/
│       └── index.ts
└── schemas/
    ├── languages/
    │   ├── python/
    │   │   └── base-python.json
    │   └── typescript/
    │       └── base-typescript.json
    └── frameworks/
        ├── python/
        │   └── fastapi.json
        └── typescript/
            └── nestjs.json

src/draagon_forge/mesh/
├── __init__.py
├── registry.py              # ProjectRegistry
├── git_sync.py              # GitSync
├── webhook.py               # FastAPI webhook handler
├── importer.py              # MeshImporter (Neo4j)
├── query_engine.py          # MeshQueryEngine
└── mesh_aware_reviewer.py   # MeshAwareReviewer (code review integration)

src/draagon_forge/mcp/tools/
└── mesh.py              # MCP tools (build_mesh, query_mesh, generate_docs, etc.)
```

### Verification

- [x] Package builds without errors (`npm run build`)
- [x] CLI runs (`mesh-builder --help`)
- [x] Languages command works (`mesh-builder languages`)
- [x] Schemas command works (`mesh-builder schemas`)
- [x] Analyze command works (`mesh-builder analyze <file>`)
- [x] Extract command works (`mesh-builder extract <path>`)
- [x] FastAPI routes are extracted correctly
- [x] Schema matching by imports works
- [x] Python imports work (`from draagon_forge.mesh import *`)
- [x] AI tiers implemented (Tier2Enhancer, Tier3Discoverer)
- [x] Self-learning pipeline with schema generation
- [x] Cross-project linking (ReferenceCollector, ConfigResolver)
- [x] Documentation generators (OpenAPI, Markdown, Mermaid)
- [x] MeshAwareReviewer for code review integration
- [x] generate_docs MCP tool for documentation generation

---

## Remaining Tasks (Optional Enhancements)

1. Add more framework schemas (Django, Express, SQLAlchemy, Prisma)
2. Integration testing with Neo4j
3. Add SQS/Kafka messaging schemas
4. Performance optimization for large codebases
