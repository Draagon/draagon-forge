# REQ-034: Extraction Context Provider

**Priority:** P0
**Effort:** Medium (5 days)
**Dependencies:** REQ-033b (Code Knowledge Mesh), draagon-ai FR-015 (Unified Knowledge Ingestion)
**Blocks:** REQ-035 (Document-First Processing)
**Layer:** L3 (draagon-forge) - mesh-builder enhancement

---

## Overview

The Code Knowledge Mesh extraction pipeline currently operates in isolation - when Tier 3 AI discovery runs, it sees only the file content with no project context, semantic memory, or external knowledge. This severely limits extraction quality for unknown frameworks.

This requirement adds an `ExtractionContextProvider` that gathers context from multiple sources before AI extraction:

1. **Static Analysis** - Parse imports, package.json, detect frameworks (local, fast)
2. **Related Files** - Resolve imports to get type signatures (local, fast)
3. **Semantic Memory** - Query draagon-ai for beliefs, patterns, principles (local, fast)
4. **External Knowledge** - Query Context7, web search when needed (remote, cached)

### The Problem

Current Tier 3 discovery prompt:
```
File: src/api/users.controller.ts
Language: typescript

Source code:
[file content]
```

The AI has NO context about:
- What framework this is (NestJS? Express? Custom?)
- What `@Controller`, `@Get`, `@Post` decorators mean
- What types are imported from other files
- What project principles apply
- Any learned patterns from previous extractions

### The Solution

Enhanced discovery with full context:
```
File: src/api/users.controller.ts
Language: typescript

DETECTED FRAMEWORKS:
- NestJS (confidence: 0.95)

PROJECT KNOWLEDGE:
- "Use NestJS decorators for API endpoints" (conviction: 0.9)
- "@Controller creates route prefix" (conviction: 0.85)
- "Controllers should delegate to services" (conviction: 0.8)

RELATED FILES:
- user.service.ts: class UserService { findOne(id): Promise<User> }
- dto/create-user.dto.ts: interface CreateUserDto { name, email }

Source code:
[file content]
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTRACTION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FileExtractor.extractFile(sourceFile)                                  │
│       │                                                                  │
│       ├── routeTier() → decides Tier 1, 2, or 3                         │
│       │                                                                  │
│       │   IF TIER 3:                                                    │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   ┌─────────────────────────────────────────────────────────┐   │
│       │   │  ExtractionContextProvider.gatherContext(file)          │   │
│       │   │                                                          │   │
│       │   │  1. StaticAnalyzer (10ms)                               │   │
│       │   │     └─ imports, dependencies, framework detection        │   │
│       │   │                                                          │   │
│       │   │  2. RelatedFileResolver (100ms)                         │   │
│       │   │     └─ type signatures from imported files               │   │
│       │   │                                                          │   │
│       │   │  3. SemanticMemoryClient (50ms)                         │   │
│       │   │     └─ beliefs, patterns from draagon-ai                 │   │
│       │   │                                                          │   │
│       │   │  4. ExternalKnowledgeClient (1-3s, cached)              │   │
│       │   │     └─ Context7, web search (only if needed)             │   │
│       │   │                                                          │   │
│       │   └─────────────────────────────────────────────────────────┘   │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   EnrichedTier3Context                                          │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   Tier3Discoverer.discover(enrichedContext)                     │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   AIClient.discover() ← Enhanced prompt with context            │
│       │                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Requirements

### REQ-034.1: Static Analyzer

**Requirement:** Fast, local analysis of file and project structure.

```typescript
interface StaticAnalysisResult {
  imports: ImportInfo[];
  dependencies: DependencyInfo[];
  frameworks: FrameworkDetection[];
  projectType: 'monorepo' | 'library' | 'application' | 'unknown';
}

interface ImportInfo {
  module: string;        // '@nestjs/common'
  symbols: string[];     // ['Controller', 'Get', 'Post']
  isRelative: boolean;   // false
  isFramework: boolean;  // true
  frameworkHint?: string; // 'nestjs'
}

interface FrameworkDetection {
  name: string;
  confidence: number;
  evidence: string[];    // ["import from @nestjs/common", "uses @Controller decorator"]
}
```

**Acceptance Criteria:**
- [ ] Parse TypeScript/JavaScript imports (ES6, CommonJS, dynamic)
- [ ] Parse Python imports (import, from...import)
- [ ] Detect frameworks from import patterns
- [ ] Read package.json/pyproject.toml for dependencies
- [ ] Complete in < 50ms for typical files

### REQ-034.2: Related File Resolver

**Requirement:** Resolve imports to extract type signatures.

```typescript
interface RelatedFileContext {
  importPath: string;     // './user.service'
  resolvedPath: string;   // 'src/api/user.service.ts'
  exports: ExportInfo[];
  parseError?: string;    // If file couldn't be parsed
}

interface ExportInfo {
  name: string;           // 'UserService'
  kind: 'class' | 'function' | 'interface' | 'type' | 'const' | 'enum';
  signature?: string;     // 'findOne(id: string): Promise<User>'
  isDefault: boolean;
}
```

**Acceptance Criteria:**
- [ ] Resolve relative imports (./foo, ../bar)
- [ ] Resolve path aliases from tsconfig/jsconfig
- [ ] Extract class method signatures
- [ ] Extract function signatures
- [ ] Extract interface/type definitions
- [ ] Handle circular imports gracefully
- [ ] Complete in < 200ms for typical dependency chains

### REQ-034.3: Semantic Memory Client

**Requirement:** Query draagon-ai's unified memory for relevant beliefs and patterns.

```typescript
interface SemanticMemoryClient {
  /**
   * Query beliefs about a framework or topic.
   */
  queryBeliefs(
    query: string,
    options?: {
      domain?: string;
      minConviction?: number;
      limit?: number;
    }
  ): Promise<BeliefResult[]>;

  /**
   * Query known extraction patterns.
   */
  queryPatterns(
    framework: string,
    language: string
  ): Promise<PatternResult[]>;

  /**
   * Store learned knowledge from extraction.
   */
  storeExtractedKnowledge(
    knowledge: ExtractedKnowledge
  ): Promise<void>;
}

interface BeliefResult {
  content: string;
  conviction: number;
  source: 'claude_md' | 'user_input' | 'learned' | 'external';
  domain?: string;
}
```

**Integration Points:**
- Connects to draagon-ai's `LayeredMemoryProvider`
- Queries return beliefs from ALL sources (documents, chat, learned)
- Stores extraction learnings back into memory

**Acceptance Criteria:**
- [ ] Connect to draagon-ai memory provider
- [ ] Query beliefs by framework/domain
- [ ] Query patterns by framework/language
- [ ] Store learned patterns after extraction
- [ ] Handle connection failures gracefully
- [ ] Complete queries in < 100ms

### REQ-034.4: External Knowledge Client

**Requirement:** Query external sources when semantic memory is insufficient.

```typescript
interface ExternalKnowledgeClient {
  /**
   * Query Context7 for library documentation.
   */
  queryContext7(
    library: string,
    version?: string,
    topic?: string
  ): Promise<Context7Result | null>;

  /**
   * Search web for framework information.
   */
  searchWeb(
    query: string,
    options?: {
      domainFilter?: string[];
      maxResults?: number;
    }
  ): Promise<WebSearchResult[]>;

  /**
   * Query package registry for metadata.
   */
  queryPackageRegistry(
    packageName: string,
    registry: 'npm' | 'pypi' | 'cargo'
  ): Promise<PackageInfo | null>;
}
```

**Caching Strategy:**
- Project-level in-memory cache (duration of extraction)
- Results ingested into semantic memory (persistent)
- External queries only when semantic memory query returns < 3 results

**Acceptance Criteria:**
- [ ] Context7 integration for library docs
- [ ] Web search fallback (SearXNG or similar)
- [ ] Package registry queries (npm, pypi)
- [ ] In-memory caching per project
- [ ] Store results in semantic memory
- [ ] Rate limiting for external APIs

### REQ-034.5: Extraction Context Provider

**Requirement:** Orchestrate all context gathering.

```typescript
interface ExtractionContextProvider {
  /**
   * Gather all context for a file extraction.
   */
  gatherContext(
    file: SourceFile,
    projectConfig: ProjectConfig,
    options?: ContextGatheringOptions
  ): Promise<EnrichedTier3Context>;
}

interface ContextGatheringOptions {
  /** Skip external queries (faster, less context) */
  skipExternal?: boolean;
  /** Maximum time for context gathering */
  timeoutMs?: number;
  /** Minimum beliefs needed before querying external */
  minBeliefs?: number;
}

interface EnrichedTier3Context extends Tier3Context {
  file: SourceFile;
  projectId: string;
  imports?: string[];

  // NEW: Static analysis
  staticAnalysis: StaticAnalysisResult;

  // NEW: Related files
  relatedFiles: RelatedFileContext[];

  // NEW: Semantic memory
  beliefs: BeliefResult[];
  patterns: PatternResult[];

  // NEW: External knowledge (if queried)
  externalKnowledge?: ExternalKnowledgeResult[];

  // NEW: Context gathering metadata
  contextMetadata: {
    gatheringTimeMs: number;
    sourcesQueried: string[];
    cacheHits: number;
  };
}
```

**Decision Flow:**
1. ALWAYS: Static analysis (free)
2. ALWAYS: Related file resolution (local)
3. ALWAYS: Semantic memory query (local)
4. IF NEEDED: External queries (when beliefs < minBeliefs)

**Acceptance Criteria:**
- [ ] Orchestrate all context sources
- [ ] Respect timeout limits
- [ ] Track context gathering metrics
- [ ] Configurable external query threshold
- [ ] Total context gathering < 500ms typical, < 3s with external

### REQ-034.6: Enhanced AI Prompts

**Requirement:** Update AIClient.discover() to use enriched context.

**System Prompt Enhancement:**
```
You are a code analysis expert specializing in {detected_frameworks}.

PROJECT KNOWLEDGE:
{beliefs with conviction > 0.6}

FRAMEWORK PATTERNS:
{known patterns for this framework}

{external_documentation if available}
```

**User Prompt Enhancement:**
```
File: {file_path}
Language: {language}

DETECTED FRAMEWORKS:
{frameworks with confidence}

RELATED FILES:
{type signatures from imports}

Source code:
{file_content}
```

**Acceptance Criteria:**
- [ ] System prompt includes beliefs and patterns
- [ ] User prompt includes frameworks and related files
- [ ] Context appropriately truncated for token limits
- [ ] Prompt structure tested with Groq LLM

### REQ-034.7: Knowledge Feedback Loop

**Requirement:** Store extraction learnings back into semantic memory.

After successful Tier 3 extraction:
1. If framework detected with high confidence → store as belief
2. If schema suggestions generated → store as patterns
3. If new patterns discovered → feed to schema evolution

```typescript
interface ExtractedKnowledge {
  type: 'framework_pattern' | 'code_pattern' | 'naming_convention';
  content: string;
  confidence: number;
  framework?: string;
  language: string;
  example: string;
}
```

**Acceptance Criteria:**
- [ ] High-confidence discoveries stored as beliefs
- [ ] Schema suggestions stored as patterns
- [ ] Knowledge tagged with framework/language
- [ ] Conviction set based on extraction confidence

---

## Module Structure

```
src/mesh-builder/src/context/
├── index.ts                      # Exports
├── ExtractionContextProvider.ts  # Main orchestrator
├── StaticAnalyzer.ts             # Import/dependency analysis
├── RelatedFileResolver.ts        # Type signature extraction
├── SemanticMemoryClient.ts       # draagon-ai integration
├── ExternalKnowledgeClient.ts    # Context7, web, registry
├── ContextCache.ts               # Caching layer
└── types.ts                      # Interface definitions
```

---

## Testing

### Unit Tests

```typescript
describe('StaticAnalyzer', () => {
  test('detects NestJS from imports', async () => {
    const result = await analyzer.analyze(nestjsFile);
    expect(result.frameworks).toContainEqual({
      name: 'nestjs',
      confidence: expect.greaterThan(0.8),
    });
  });

  test('parses TypeScript imports', async () => {
    const result = await analyzer.analyze(tsFile);
    expect(result.imports).toContainEqual({
      module: '@nestjs/common',
      symbols: ['Controller', 'Get'],
      isFramework: true,
    });
  });
});

describe('SemanticMemoryClient', () => {
  test('queries beliefs from draagon-ai', async () => {
    const beliefs = await client.queryBeliefs('nestjs patterns');
    expect(beliefs.length).toBeGreaterThan(0);
    expect(beliefs[0].conviction).toBeGreaterThan(0);
  });
});

describe('ExtractionContextProvider', () => {
  test('gathers context from all sources', async () => {
    const context = await provider.gatherContext(file, config);

    expect(context.staticAnalysis).toBeDefined();
    expect(context.relatedFiles).toBeDefined();
    expect(context.beliefs).toBeDefined();
    expect(context.contextMetadata.gatheringTimeMs).toBeLessThan(500);
  });

  test('falls back to external when beliefs insufficient', async () => {
    const context = await provider.gatherContext(unknownFrameworkFile, config);

    expect(context.externalKnowledge).toBeDefined();
    expect(context.contextMetadata.sourcesQueried).toContain('context7');
  });
});
```

### Integration Tests

```typescript
describe('Full Extraction with Context', () => {
  test('NestJS controller extraction uses context', async () => {
    // Seed semantic memory with NestJS beliefs
    await seedBeliefs([
      { content: '@Controller creates route prefix', conviction: 0.9 },
    ]);

    // Extract file
    const result = await extractor.extractFile(nestjsController);

    // Should correctly identify endpoints
    expect(result.nodes).toContainEqual(
      expect.objectContaining({
        type: 'ApiEndpoint',
        name: expect.stringContaining('/users'),
      })
    );
  });
});
```

---

## Performance Requirements

| Operation | Target | Max |
|-----------|--------|-----|
| Static analysis | 10ms | 50ms |
| Related file resolution | 100ms | 200ms |
| Semantic memory query | 50ms | 100ms |
| External query (cached) | 0ms | 10ms |
| External query (uncached) | 1s | 3s |
| Total context gathering | 200ms | 500ms (no external) |

---

## Configuration

```typescript
interface ContextProviderConfig {
  /** Skip external queries entirely */
  disableExternal: boolean;

  /** Minimum beliefs before querying external */
  minBeliefsThreshold: number;  // default: 3

  /** Timeout for context gathering */
  timeoutMs: number;  // default: 3000

  /** Maximum related files to resolve */
  maxRelatedFiles: number;  // default: 10

  /** Cache TTL for external results */
  externalCacheTtlMs: number;  // default: 3600000 (1 hour)

  /** draagon-ai memory endpoint */
  memoryEndpoint?: string;

  /** Context7 API key */
  context7ApiKey?: string;
}
```

---

## Dependencies

- **draagon-ai**: `LayeredMemoryProvider` for semantic memory
- **httpx**: HTTP client for external APIs
- **typescript**: For parsing TypeScript files
- **@babel/parser**: For parsing JavaScript files

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| External API latency | Slow extraction | Aggressive caching, timeouts |
| Semantic memory unavailable | No context | Graceful degradation, continue without |
| Token limit exceeded | Prompt too large | Context prioritization, truncation |
| Circular imports | Infinite loop | Visited set, max depth limit |

---

## Success Metrics

1. **Extraction Quality**: Tier 3 extraction accuracy improves by 20%+
2. **External Query Rate**: < 10% of extractions require external queries (after warmup)
3. **Context Gathering Time**: 95th percentile < 500ms
4. **Cache Hit Rate**: > 80% for framework knowledge after first project extraction

---

## References

- [REQ-033b: Code Knowledge Mesh](./REQ-033-code-knowledge-mesh.md)
- [draagon-ai FR-015: Unified Knowledge Ingestion](../../draagon-ai/.specify/requirements/FR-015-unified-knowledge-ingestion-pipeline.md)
- [draagon-ai FR-022: Conditional Belief Architecture](../../draagon-ai/.specify/requirements/FR-022-conditional-belief-architecture.md)

---

**Document Status:** Draft
**Created:** 2026-01-15
**Last Updated:** 2026-01-15
