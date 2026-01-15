# PLAN-REQ-033b: Code Knowledge Mesh Implementation

**Requirement:** REQ-033-code-knowledge-mesh.md
**Created:** 2026-01-15
**Status:** Draft
**Estimated Effort:** 10 weeks (50 working days)
**Complexity:** Very High

---

## Executive Summary

Implement a **Code Knowledge Mesh** - a multi-layer knowledge graph that understands code structure, data flows, and cross-service relationships. The system uses a **three-tier agentic extraction** approach that learns and adapts to new languages/frameworks automatically.

### Key Deliverables

| Deliverable | Description |
|-------------|-------------|
| **mesh-builder CLI** | TypeScript tool for extracting code structure |
| **JSON Schema System** | Extensible pattern definitions for languages/frameworks |
| **AI Tier Integration** | Groq-based disambiguation and discovery |
| **Project Registry** | Multi-repo management with auto-pull |
| **Neo4j Graph Storage** | Persistent mesh with Cypher queries |
| **MCP Tools** | Claude Code integration (build_mesh, query_mesh, etc.) |
| **Documentation Generator** | Always-current docs from graph queries |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       CODE KNOWLEDGE MESH SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    TYPESCRIPT LAYER (mesh-builder)                         │  │
│  │                                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Schema    │  │   Pattern   │  │    Tier     │  │   AI Client     │  │  │
│  │  │  Registry   │──│   Matcher   │──│   Router    │──│   (Groq)        │  │  │
│  │  │   (JSON)    │  │   (Regex)   │  │   1→2→3     │  │                 │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  │         │                                                     │          │  │
│  │         ▼                                                     ▼          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Extractors  │  │  Cross-     │  │   Schema    │  │  Mesh Exporter  │  │  │
│  │  │ File/Func/  │  │  Project    │  │  Generator  │  │    (JSON)       │  │  │
│  │  │ API/Queue   │  │  Linker     │  │ (Learning)  │  │                 │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────┬────────┘  │  │
│  │                                                               │          │  │
│  └───────────────────────────────────────────────────────────────┼──────────┘  │
│                                                                  │              │
│                                            mesh.json ────────────┘              │
│                                                                  │              │
│  ┌───────────────────────────────────────────────────────────────┼──────────┐  │
│  │                      PYTHON LAYER (draagon_forge)             │          │  │
│  │                                                               ▼          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Project   │  │    Mesh     │  │   Neo4j     │  │   MCP Tools     │  │  │
│  │  │  Registry   │  │  Importer   │──│   Graph     │──│  build_mesh     │  │  │
│  │  │  (Git Sync) │  │             │  │             │  │  query_mesh     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  register_proj  │  │  │
│  │         │                                │          │  generate_docs  │  │  │
│  │         │                                │          └─────────────────┘  │  │
│  │         ▼                                ▼                               │  │
│  │  ┌─────────────┐                 ┌─────────────────┐                    │  │
│  │  │   Webhook   │                 │  Doc Generator  │                    │  │
│  │  │   Handler   │                 │  (Graph Queries)│                    │  │
│  │  └─────────────┘                 └─────────────────┘                    │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core TypeScript Infrastructure (2 weeks / 10 days)

**Goal:** Build the foundation - schema registry, pattern matcher, basic extractors, and CLI skeleton.

#### 1.1 Project Setup (Day 1)

**Create mesh-builder package:**

```
src/mesh-builder/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── src/
│   └── index.ts
└── schemas/
    └── .gitkeep
```

**File:** `src/mesh-builder/package.json`

```json
{
  "name": "@draagon-forge/mesh-builder",
  "version": "0.1.0",
  "description": "Agentic code mesh extraction tool",
  "main": "dist/index.js",
  "bin": {
    "mesh-builder": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest",
    "lint": "eslint src/",
    "cli": "ts-node src/cli/index.ts"
  },
  "dependencies": {
    "commander": "^11.0.0",
    "glob": "^10.0.0",
    "neo4j-driver": "^5.0.0",
    "groq-sdk": "^0.3.0",
    "chalk": "^5.0.0",
    "ora": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  }
}
```

**File:** `src/mesh-builder/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Acceptance Criteria:**
- [ ] Package builds without errors
- [ ] CLI executable runs (`mesh-builder --help`)
- [ ] Test infrastructure works

---

#### 1.2 Core Types (Day 1-2)

**File:** `src/mesh-builder/src/types/index.ts`

```typescript
// ============================================================================
// MESH NODE TYPES
// ============================================================================

export interface SourceLocation {
  file: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
}

export interface ExtractionMetadata {
  tier: 1 | 2 | 3;
  schema?: string;
  confidence: number;
  extracted_at: string;
}

export interface MeshNode {
  id: string;
  type: MeshNodeType;
  name: string;
  properties: Record<string, unknown>;
  source: SourceLocation;
  project_id: string;
  extraction: ExtractionMetadata;
}

export type MeshNodeType =
  | 'File'
  | 'Module'
  | 'Class'
  | 'Interface'
  | 'Function'
  | 'Method'
  | 'Variable'
  | 'Import'
  | 'Decorator'
  | 'ApiEndpoint'
  | 'Queue'
  | 'Topic'
  | 'Database'
  | 'Table'
  | 'Column';

// ============================================================================
// MESH EDGE TYPES
// ============================================================================

export interface MeshEdge {
  id: string;
  type: MeshEdgeType;
  from_id: string;
  to_id: string;
  properties?: Record<string, unknown>;
  extraction: ExtractionMetadata;
}

export type MeshEdgeType =
  | 'CONTAINS'
  | 'CALLS'
  | 'IMPORTS'
  | 'INHERITS'
  | 'IMPLEMENTS'
  | 'USES'
  | 'RETURNS'
  | 'ACCEPTS'
  | 'DECORATES'
  | 'EXPOSES'
  | 'HANDLED_BY'
  | 'PUBLISHES_TO'
  | 'SUBSCRIBES_TO'
  | 'READS_FROM'
  | 'WRITES_TO'
  | 'QUERIES'
  | 'CALLS_SERVICE';

// ============================================================================
// EXTRACTION RESULT
// ============================================================================

export interface ExtractionResult {
  file: string;
  language: string;
  nodes: MeshNode[];
  edges: MeshEdge[];
  confidence: number;
  tier: 1 | 2 | 3;
  schemas_used: string[];
  unresolved_patterns: string[];
  errors: string[];
}

export interface ProjectExtractionResult {
  project_id: string;
  project_path: string;
  timestamp: string;
  statistics: {
    files_processed: number;
    files_skipped: number;
    tier1_count: number;
    tier2_count: number;
    tier3_count: number;
    total_nodes: number;
    total_edges: number;
    schemas_generated: number;
  };
  results: ExtractionResult[];
  cross_project_links?: CrossProjectLink[];
}

export interface CrossProjectLink {
  type: 'queue' | 'api' | 'database' | 'library';
  from_project: string;
  to_project: string;
  from_node_id: string;
  to_node_id: string;
  confidence: number;
  resolution_method: 'literal' | 'config' | 'ai';
}

// ============================================================================
// SCHEMA TYPES
// ============================================================================

export interface Schema {
  $schema: string;
  name: string;
  version: string;
  language: string;
  description?: string;
  detection: SchemaDetection;
  extractors: Record<string, SchemaExtractor>;
  ai_hints?: AIHints;
}

export interface SchemaDetection {
  imports?: string[];
  files?: string[];
  patterns?: string[];
  confidence_boost: number;
}

export interface SchemaExtractor {
  description?: string;
  patterns: ExtractorPattern[];
}

export interface ExtractorPattern {
  name?: string;
  regex: string;
  flags?: string;
  captures: Record<string, CaptureConfig>;
  context_lines?: number;
  node_template?: NodeTemplate;
  edge_template?: EdgeTemplate;
}

export interface CaptureConfig {
  group: number;
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'camelCase' | 'snakeCase';
  default?: string;
}

export interface NodeTemplate {
  type: MeshNodeType;
  name_from?: string;
  properties: Record<string, string>;
}

export interface EdgeTemplate {
  type: MeshEdgeType;
  from: string;
  to: string;
  properties?: Record<string, string>;
}

export interface AIHints {
  disambiguation?: string[];
  common_patterns?: string[];
  framework_context?: string;
}

// ============================================================================
// SOURCE FILE
// ============================================================================

export interface SourceFile {
  path: string;
  relativePath: string;
  content: string;
  language: string;
  size: number;
  lastModified: Date;
}

// ============================================================================
// PROJECT CONFIGURATION
// ============================================================================

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  gitUrl?: string;
  branch?: string;
  includePaths?: string[];
  excludePaths?: string[];
}
```

**Acceptance Criteria:**
- [ ] All types compile without errors
- [ ] Types exported from index
- [ ] JSDoc comments for public types

---

#### 1.3 Schema Registry (Day 2-3)

**File:** `src/mesh-builder/src/core/SchemaRegistry.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Schema, SourceFile } from '../types';

export interface SchemaInfo {
  name: string;
  version: string;
  language: string;
  path: string;
}

export class SchemaRegistry {
  private schemas: Map<string, Schema> = new Map();
  private schemasByLanguage: Map<string, Schema[]> = new Map();
  private loaded: boolean = false;

  constructor(private schemaDir: string) {}

  /**
   * Load all schemas from the schema directory
   */
  async loadSchemas(): Promise<void> {
    if (this.loaded) return;

    const pattern = path.join(this.schemaDir, '**/*.json');
    const files = await glob(pattern);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const schema: Schema = JSON.parse(content);

        // Validate schema has required fields
        if (!schema.name || !schema.language) {
          console.warn(`Invalid schema at ${file}: missing name or language`);
          continue;
        }

        // Store by name
        this.schemas.set(schema.name, schema);

        // Index by language
        const langSchemas = this.schemasByLanguage.get(schema.language) || [];
        langSchemas.push(schema);
        this.schemasByLanguage.set(schema.language, langSchemas);

        console.log(`Loaded schema: ${schema.name} (${schema.language})`);
      } catch (error) {
        console.error(`Failed to load schema ${file}:`, error);
      }
    }

    this.loaded = true;
    console.log(`Loaded ${this.schemas.size} schemas`);
  }

  /**
   * Find schemas that match a given source file
   */
  async findMatchingSchemas(file: SourceFile): Promise<Schema[]> {
    await this.loadSchemas();

    const matches: Array<{ schema: Schema; score: number }> = [];

    // Get schemas for this language
    const langSchemas = this.schemasByLanguage.get(file.language) || [];

    for (const schema of langSchemas) {
      let score = 0;

      // Check import patterns
      if (schema.detection.imports) {
        for (const importPattern of schema.detection.imports) {
          if (file.content.includes(importPattern)) {
            score += schema.detection.confidence_boost;
          }
        }
      }

      // Check file patterns
      if (schema.detection.files) {
        for (const filePattern of schema.detection.files) {
          const regex = new RegExp(
            filePattern.replace(/\*/g, '.*').replace(/\?/g, '.')
          );
          if (regex.test(file.relativePath)) {
            score += schema.detection.confidence_boost * 0.5;
          }
        }
      }

      // Check content patterns
      if (schema.detection.patterns) {
        for (const pattern of schema.detection.patterns) {
          const regex = new RegExp(pattern);
          if (regex.test(file.content)) {
            score += schema.detection.confidence_boost * 0.3;
          }
        }
      }

      if (score > 0) {
        matches.push({ schema, score });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches.map((m) => m.schema);
  }

  /**
   * Get a schema by name
   */
  getSchema(name: string): Schema | undefined {
    return this.schemas.get(name);
  }

  /**
   * Add a new schema (for self-learning)
   */
  async addSchema(schema: Schema, persist: boolean = true): Promise<void> {
    this.schemas.set(schema.name, schema);

    // Index by language
    const langSchemas = this.schemasByLanguage.get(schema.language) || [];
    langSchemas.push(schema);
    this.schemasByLanguage.set(schema.language, langSchemas);

    // Persist to disk if requested
    if (persist) {
      const filePath = path.join(
        this.schemaDir,
        'custom',
        `${schema.name}.json`
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
      console.log(`Persisted schema: ${filePath}`);
    }
  }

  /**
   * List all available schemas
   */
  listSchemas(): SchemaInfo[] {
    return Array.from(this.schemas.values()).map((schema) => ({
      name: schema.name,
      version: schema.version,
      language: schema.language,
      path: '', // Could track this if needed
    }));
  }

  /**
   * Get schemas for a specific language
   */
  getSchemasForLanguage(language: string): Schema[] {
    return this.schemasByLanguage.get(language) || [];
  }
}
```

**Testing:**
```typescript
// src/mesh-builder/src/core/__tests__/SchemaRegistry.test.ts

describe('SchemaRegistry', () => {
  test('loads schemas from directory', async () => {
    const registry = new SchemaRegistry('./test-schemas');
    await registry.loadSchemas();
    expect(registry.listSchemas().length).toBeGreaterThan(0);
  });

  test('finds matching schemas for Python file', async () => {
    const registry = new SchemaRegistry('./schemas');
    await registry.loadSchemas();

    const file: SourceFile = {
      path: '/project/app/main.py',
      relativePath: 'app/main.py',
      content: 'from fastapi import FastAPI\napp = FastAPI()',
      language: 'python',
      size: 100,
      lastModified: new Date(),
    };

    const matches = await registry.findMatchingSchemas(file);
    expect(matches.some((s) => s.name === 'fastapi')).toBe(true);
  });
});
```

**Acceptance Criteria:**
- [ ] Loads JSON schemas from nested directories
- [ ] Indexes schemas by language
- [ ] Finds matching schemas based on imports, files, patterns
- [ ] Supports adding new schemas (self-learning)
- [ ] Persists custom schemas to disk

---

#### 1.4 Pattern Matcher (Day 3-4)

**File:** `src/mesh-builder/src/core/PatternMatcher.ts`

```typescript
import {
  Schema,
  SourceFile,
  MeshNode,
  MeshEdge,
  ExtractorPattern,
  SourceLocation,
  ExtractionMetadata,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface MatchResult {
  pattern: string;
  extractor: string;
  location: SourceLocation;
  captures: Record<string, string>;
  confidence: number;
  node?: MeshNode;
  edges: MeshEdge[];
}

interface FileContext {
  currentFunction?: string;
  currentClass?: string;
  imports: Map<string, string>;
}

export class PatternMatcher {
  constructor(private projectId: string) {}

  /**
   * Apply all patterns from a schema to a source file
   */
  match(
    file: SourceFile,
    schema: Schema
  ): { nodes: MeshNode[]; edges: MeshEdge[]; confidence: number } {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];
    let totalConfidence = 0;
    let patternCount = 0;

    // Build file context (track current class, function, imports)
    const context = this.buildFileContext(file);

    // Apply each extractor's patterns
    for (const [extractorName, extractor] of Object.entries(schema.extractors)) {
      for (const pattern of extractor.patterns) {
        const results = this.applyPattern(
          file,
          pattern,
          extractorName,
          schema.name,
          context
        );

        for (const result of results) {
          if (result.node) {
            nodes.push(result.node);
          }
          edges.push(...result.edges);
          totalConfidence += result.confidence;
          patternCount++;
        }
      }
    }

    // Create file node
    const fileNode = this.createFileNode(file, schema.name);
    nodes.unshift(fileNode);

    // Create CONTAINS edges from file to top-level nodes
    for (const node of nodes) {
      if (node.type !== 'File' && !edges.some((e) => e.to_id === node.id && e.type === 'CONTAINS')) {
        edges.push({
          id: uuidv4(),
          type: 'CONTAINS',
          from_id: fileNode.id,
          to_id: node.id,
          extraction: {
            tier: 1,
            schema: schema.name,
            confidence: 1.0,
            extracted_at: new Date().toISOString(),
          },
        });
      }
    }

    const avgConfidence = patternCount > 0 ? totalConfidence / patternCount : 0;

    return {
      nodes,
      edges,
      confidence: Math.min(avgConfidence + schema.detection.confidence_boost, 1.0),
    };
  }

  /**
   * Apply a single pattern to file content
   */
  private applyPattern(
    file: SourceFile,
    pattern: ExtractorPattern,
    extractorName: string,
    schemaName: string,
    context: FileContext
  ): MatchResult[] {
    const results: MatchResult[] = [];
    const flags = pattern.flags || 'gm';
    const regex = new RegExp(pattern.regex, flags);

    const lines = file.content.split('\n');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(file.content)) !== null) {
      // Calculate line number
      const beforeMatch = file.content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Extract captures
      const captures: Record<string, string> = {};
      for (const [captureName, config] of Object.entries(pattern.captures)) {
        let value = match[config.group] || config.default || '';

        // Apply transforms
        if (config.transform) {
          value = this.applyTransform(value, config.transform);
        }

        captures[captureName] = value;
      }

      // Build source location
      const location: SourceLocation = {
        file: file.relativePath,
        line_start: lineNumber,
        line_end: lineNumber + (pattern.context_lines || 0),
      };

      // Create node if template provided
      let node: MeshNode | undefined;
      if (pattern.node_template) {
        node = this.createNodeFromTemplate(
          pattern.node_template,
          captures,
          location,
          schemaName
        );
      }

      // Create edges if template provided
      const edges: MeshEdge[] = [];
      if (pattern.edge_template) {
        const edge = this.createEdgeFromTemplate(
          pattern.edge_template,
          captures,
          node?.id || '',
          context,
          schemaName
        );
        if (edge) {
          edges.push(edge);
        }
      }

      results.push({
        pattern: pattern.name || pattern.regex,
        extractor: extractorName,
        location,
        captures,
        confidence: 0.9, // High confidence for schema matches
        node,
        edges,
      });
    }

    return results;
  }

  /**
   * Create a node from a template
   */
  private createNodeFromTemplate(
    template: NodeTemplate,
    captures: Record<string, string>,
    location: SourceLocation,
    schemaName: string
  ): MeshNode {
    const properties: Record<string, unknown> = {};

    for (const [key, valueTemplate] of Object.entries(template.properties)) {
      properties[key] = this.substituteTemplate(valueTemplate, captures);
    }

    const name = template.name_from
      ? captures[template.name_from] || 'unknown'
      : (properties['name'] as string) || 'unknown';

    return {
      id: uuidv4(),
      type: template.type,
      name,
      properties,
      source: location,
      project_id: this.projectId,
      extraction: {
        tier: 1,
        schema: schemaName,
        confidence: 0.9,
        extracted_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Create an edge from a template
   */
  private createEdgeFromTemplate(
    template: EdgeTemplate,
    captures: Record<string, string>,
    nodeId: string,
    context: FileContext,
    schemaName: string
  ): MeshEdge | null {
    const fromId = this.resolveEdgeEndpoint(template.from, nodeId, captures, context);
    const toId = this.resolveEdgeEndpoint(template.to, nodeId, captures, context);

    if (!fromId || !toId) {
      return null;
    }

    const properties: Record<string, unknown> = {};
    if (template.properties) {
      for (const [key, valueTemplate] of Object.entries(template.properties)) {
        properties[key] = this.substituteTemplate(valueTemplate, captures);
      }
    }

    return {
      id: uuidv4(),
      type: template.type,
      from_id: fromId,
      to_id: toId,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
      extraction: {
        tier: 1,
        schema: schemaName,
        confidence: 0.9,
        extracted_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Resolve edge endpoint (could be node reference, capture, or context)
   */
  private resolveEdgeEndpoint(
    endpoint: string,
    nodeId: string,
    captures: Record<string, string>,
    context: FileContext
  ): string | null {
    if (endpoint === '${node}' || endpoint === '${this}') {
      return nodeId;
    }
    if (endpoint === '${current_function}') {
      return context.currentFunction || null;
    }
    if (endpoint === '${current_class}') {
      return context.currentClass || null;
    }
    if (endpoint.startsWith('${') && endpoint.endsWith('}')) {
      const captureName = endpoint.slice(2, -1);
      return captures[captureName] || null;
    }
    return endpoint;
  }

  /**
   * Substitute template variables with capture values
   */
  private substituteTemplate(
    template: string,
    captures: Record<string, string>
  ): string {
    return template.replace(/\$\{(\w+)\}/g, (_, name) => captures[name] || '');
  }

  /**
   * Apply a transform to a captured value
   */
  private applyTransform(
    value: string,
    transform: 'uppercase' | 'lowercase' | 'trim' | 'camelCase' | 'snakeCase'
  ): string {
    switch (transform) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'camelCase':
        return value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      case 'snakeCase':
        return value.replace(/([A-Z])/g, '_$1').toLowerCase();
      default:
        return value;
    }
  }

  /**
   * Build context for the file (imports, current scope, etc.)
   */
  private buildFileContext(file: SourceFile): FileContext {
    const imports = new Map<string, string>();

    // Extract Python imports
    if (file.language === 'python') {
      const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
      let match;
      while ((match = importRegex.exec(file.content)) !== null) {
        const module = match[1] || match[2].split(',')[0].trim();
        const names = match[2].split(',').map((n) => n.trim().split(' as ')[0]);
        for (const name of names) {
          imports.set(name, module);
        }
      }
    }

    // Extract TypeScript/JavaScript imports
    if (file.language === 'typescript' || file.language === 'javascript') {
      const importRegex = /import\s+(?:{\s*([^}]+)\s*}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(file.content)) !== null) {
        const module = match[3];
        const names = (match[1] || match[2]).split(',').map((n) => n.trim().split(' as ')[0]);
        for (const name of names) {
          imports.set(name, module);
        }
      }
    }

    return {
      imports,
    };
  }

  /**
   * Create a file node
   */
  private createFileNode(file: SourceFile, schemaName: string): MeshNode {
    return {
      id: uuidv4(),
      type: 'File',
      name: file.relativePath,
      properties: {
        path: file.relativePath,
        language: file.language,
        size: file.size,
        last_modified: file.lastModified.toISOString(),
      },
      source: {
        file: file.relativePath,
        line_start: 1,
        line_end: file.content.split('\n').length,
      },
      project_id: this.projectId,
      extraction: {
        tier: 1,
        schema: schemaName,
        confidence: 1.0,
        extracted_at: new Date().toISOString(),
      },
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Applies regex patterns to file content
- [ ] Extracts captures and applies transforms
- [ ] Creates nodes from templates
- [ ] Creates edges from templates
- [ ] Calculates confidence scores
- [ ] Tracks file context (imports, current scope)

---

#### 1.5 Language Detector (Day 4-5)

**File:** `src/mesh-builder/src/core/LanguageDetector.ts`

```typescript
import * as path from 'path';
import { SourceFile } from '../types';

export interface LanguageDetection {
  language: string;
  confidence: number;
  evidence: string[];
}

const EXTENSION_MAP: Record<string, string> = {
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sql': 'sql',
  '.tf': 'terraform',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.md': 'markdown',
  '.dockerfile': 'dockerfile',
};

const SHEBANG_MAP: Record<string, string> = {
  python: 'python',
  python3: 'python',
  node: 'javascript',
  ruby: 'ruby',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
};

const CONTENT_PATTERNS: Array<{ pattern: RegExp; language: string; weight: number }> = [
  // Python
  { pattern: /^def \w+\(/m, language: 'python', weight: 0.3 },
  { pattern: /^class \w+.*:/m, language: 'python', weight: 0.3 },
  { pattern: /^from \w+ import/m, language: 'python', weight: 0.4 },
  { pattern: /if __name__ == ['"]__main__['"]:/m, language: 'python', weight: 0.5 },

  // TypeScript
  { pattern: /^interface \w+/m, language: 'typescript', weight: 0.4 },
  { pattern: /: \w+\[\]/, language: 'typescript', weight: 0.3 },
  { pattern: /^type \w+ =/m, language: 'typescript', weight: 0.4 },
  { pattern: /<\w+>/, language: 'typescript', weight: 0.2 },

  // JavaScript
  { pattern: /^const \w+ = require\(/m, language: 'javascript', weight: 0.3 },
  { pattern: /module\.exports/m, language: 'javascript', weight: 0.4 },
  { pattern: /^export (default |const |function )/m, language: 'javascript', weight: 0.3 },

  // Java
  { pattern: /^public class \w+/m, language: 'java', weight: 0.5 },
  { pattern: /^package \w+\.\w+;/m, language: 'java', weight: 0.5 },
  { pattern: /@Override/m, language: 'java', weight: 0.3 },

  // Go
  { pattern: /^package \w+$/m, language: 'go', weight: 0.4 },
  { pattern: /^func \w+\(/m, language: 'go', weight: 0.3 },
  { pattern: /^import \(\n/m, language: 'go', weight: 0.4 },

  // Rust
  { pattern: /^fn \w+\(/m, language: 'rust', weight: 0.3 },
  { pattern: /^use \w+::/m, language: 'rust', weight: 0.4 },
  { pattern: /^impl \w+/m, language: 'rust', weight: 0.4 },

  // C#
  { pattern: /^namespace \w+/m, language: 'csharp', weight: 0.4 },
  { pattern: /^\[.*\]$/m, language: 'csharp', weight: 0.2 },
  { pattern: /^using \w+\.\w+;/m, language: 'csharp', weight: 0.3 },
];

export class LanguageDetector {
  /**
   * Detect the language of a source file
   */
  detect(filePath: string, content: string): LanguageDetection {
    const evidence: string[] = [];
    const scores: Record<string, number> = {};

    // 1. Check file extension (highest confidence)
    const ext = path.extname(filePath).toLowerCase();
    if (ext in EXTENSION_MAP) {
      const lang = EXTENSION_MAP[ext];
      scores[lang] = (scores[lang] || 0) + 0.6;
      evidence.push(`extension: ${ext}`);
    }

    // 2. Check for special filenames
    const basename = path.basename(filePath).toLowerCase();
    if (basename === 'dockerfile') {
      scores['dockerfile'] = (scores['dockerfile'] || 0) + 0.8;
      evidence.push('filename: Dockerfile');
    }
    if (basename === 'makefile') {
      scores['makefile'] = (scores['makefile'] || 0) + 0.8;
      evidence.push('filename: Makefile');
    }

    // 3. Check shebang
    const shebangMatch = content.match(/^#!.*[\/ ](\w+)/);
    if (shebangMatch) {
      const interpreter = shebangMatch[1].toLowerCase();
      if (interpreter in SHEBANG_MAP) {
        const lang = SHEBANG_MAP[interpreter];
        scores[lang] = (scores[lang] || 0) + 0.4;
        evidence.push(`shebang: ${interpreter}`);
      }
    }

    // 4. Check content patterns
    for (const { pattern, language, weight } of CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        scores[language] = (scores[language] || 0) + weight;
        evidence.push(`pattern: ${pattern.source.slice(0, 30)}...`);
      }
    }

    // Find the language with highest score
    let bestLanguage = 'unknown';
    let bestScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = lang;
      }
    }

    // Normalize confidence to 0-1
    const confidence = Math.min(bestScore, 1.0);

    return {
      language: bestLanguage,
      confidence,
      evidence,
    };
  }

  /**
   * Detect language for a SourceFile
   */
  detectSourceFile(file: SourceFile): LanguageDetection {
    return this.detect(file.path, file.content);
  }
}
```

**Acceptance Criteria:**
- [ ] Detects language from file extension
- [ ] Detects language from shebang
- [ ] Detects language from content patterns
- [ ] Returns confidence score
- [ ] Returns evidence for detection

---

#### 1.6 Basic Extractors (Day 5-7)

**File:** `src/mesh-builder/src/extractors/FileExtractor.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { SourceFile, ProjectConfig } from '../types';
import { LanguageDetector } from '../core/LanguageDetector';

export interface FileExtractionOptions {
  includePaths?: string[];
  excludePaths?: string[];
  maxFileSize?: number; // bytes
  extensions?: string[];
}

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/.DS_Store',
];

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

export class FileExtractor {
  private languageDetector = new LanguageDetector();

  /**
   * Extract all source files from a project
   */
  async extractFiles(
    projectPath: string,
    options: FileExtractionOptions = {}
  ): Promise<SourceFile[]> {
    const {
      includePaths = ['**/*'],
      excludePaths = DEFAULT_EXCLUDE,
      maxFileSize = DEFAULT_MAX_FILE_SIZE,
      extensions,
    } = options;

    const files: SourceFile[] = [];

    for (const includePattern of includePaths) {
      const pattern = path.join(projectPath, includePattern);
      const matches = await glob(pattern, {
        ignore: excludePaths.map((p) => path.join(projectPath, p)),
        nodir: true,
      });

      for (const filePath of matches) {
        try {
          // Check extension filter
          if (extensions && extensions.length > 0) {
            const ext = path.extname(filePath);
            if (!extensions.includes(ext)) {
              continue;
            }
          }

          // Check file size
          const stats = await fs.stat(filePath);
          if (stats.size > maxFileSize) {
            console.warn(`Skipping large file: ${filePath} (${stats.size} bytes)`);
            continue;
          }

          // Skip binary files
          if (await this.isBinaryFile(filePath)) {
            continue;
          }

          // Read file content
          const content = await fs.readFile(filePath, 'utf-8');
          const relativePath = path.relative(projectPath, filePath);

          // Detect language
          const detection = this.languageDetector.detect(filePath, content);

          // Skip unknown languages
          if (detection.language === 'unknown') {
            continue;
          }

          files.push({
            path: filePath,
            relativePath,
            content,
            language: detection.language,
            size: stats.size,
            lastModified: stats.mtime,
          });
        } catch (error) {
          console.error(`Failed to extract file ${filePath}:`, error);
        }
      }
    }

    console.log(`Extracted ${files.length} source files from ${projectPath}`);
    return files;
  }

  /**
   * Check if a file is binary
   */
  private async isBinaryFile(filePath: string): Promise<boolean> {
    const buffer = Buffer.alloc(512);
    const fd = await fs.open(filePath, 'r');

    try {
      await fd.read(buffer, 0, 512, 0);

      // Check for null bytes (common in binary files)
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      return false;
    } finally {
      await fd.close();
    }
  }
}
```

**File:** `src/mesh-builder/src/extractors/FunctionExtractor.ts`

```typescript
import { SourceFile, MeshNode, MeshEdge, SourceLocation } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface FunctionInfo {
  name: string;
  location: SourceLocation;
  signature?: string;
  async: boolean;
  docstring?: string;
  decorators: string[];
}

export class FunctionExtractor {
  constructor(private projectId: string) {}

  /**
   * Extract functions from a source file (language-agnostic fallback)
   */
  extract(file: SourceFile): { nodes: MeshNode[]; edges: MeshEdge[] } {
    switch (file.language) {
      case 'python':
        return this.extractPython(file);
      case 'typescript':
      case 'javascript':
        return this.extractTypeScript(file);
      case 'java':
        return this.extractJava(file);
      default:
        return { nodes: [], edges: [] };
    }
  }

  private extractPython(file: SourceFile): { nodes: MeshNode[]; edges: MeshEdge[] } {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];

    // Match Python function definitions
    const functionRegex = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;
    const lines = file.content.split('\n');

    let match;
    while ((match = functionRegex.exec(file.content)) !== null) {
      const indent = match[1].length;
      const name = match[2];
      const params = match[3];
      const returnType = match[4]?.trim();
      const isAsync = match[0].includes('async def');

      // Calculate line number
      const lineNumber = file.content.substring(0, match.index).split('\n').length;

      // Find function end (next line with same or less indentation)
      let endLine = lineNumber;
      for (let i = lineNumber; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() && !line.startsWith(' '.repeat(indent + 1)) && i > lineNumber) {
          endLine = i;
          break;
        }
        endLine = i + 1;
      }

      // Extract docstring
      let docstring: string | undefined;
      const nextLine = lines[lineNumber]?.trim();
      if (nextLine?.startsWith('"""') || nextLine?.startsWith("'''")) {
        const docMatch = file.content.substring(match.index).match(
          /(?:def[^:]+:\s*)(["']{3})([\s\S]*?)\1/
        );
        if (docMatch) {
          docstring = docMatch[2].trim();
        }
      }

      const node: MeshNode = {
        id: uuidv4(),
        type: 'Function',
        name,
        properties: {
          signature: `${name}(${params})${returnType ? ` -> ${returnType}` : ''}`,
          async: isAsync,
          parameters: params,
          return_type: returnType,
          docstring,
        },
        source: {
          file: file.relativePath,
          line_start: lineNumber,
          line_end: endLine,
        },
        project_id: this.projectId,
        extraction: {
          tier: 1,
          confidence: 0.9,
          extracted_at: new Date().toISOString(),
        },
      };

      nodes.push(node);
    }

    return { nodes, edges };
  }

  private extractTypeScript(file: SourceFile): { nodes: MeshNode[]; edges: MeshEdge[] } {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];

    // Match TypeScript/JavaScript function definitions
    const patterns = [
      // Arrow functions: const name = async (...) => ...
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/gm,
      // Function declarations: function name(...) or async function name(...)
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/gm,
      // Method definitions: name(...) { or async name(...) {
      /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm,
    ];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(file.content)) !== null) {
        const name = match[1] || match[2];
        const isAsync = match[0].includes('async');
        const lineNumber = file.content.substring(0, match.index).split('\n').length;

        // Skip if already extracted (avoid duplicates from overlapping patterns)
        if (nodes.some((n) => n.name === name && n.source.line_start === lineNumber)) {
          continue;
        }

        const node: MeshNode = {
          id: uuidv4(),
          type: 'Function',
          name,
          properties: {
            async: isAsync,
          },
          source: {
            file: file.relativePath,
            line_start: lineNumber,
            line_end: lineNumber, // Would need proper parsing for accurate end
          },
          project_id: this.projectId,
          extraction: {
            tier: 1,
            confidence: 0.8,
            extracted_at: new Date().toISOString(),
          },
        };

        nodes.push(node);
      }
    }

    return { nodes, edges };
  }

  private extractJava(file: SourceFile): { nodes: MeshNode[]; edges: MeshEdge[] } {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];

    // Match Java method definitions
    const methodRegex =
      /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?(\w+)\s+(\w+)\s*\([^)]*\)/gm;

    let match;
    while ((match = methodRegex.exec(file.content)) !== null) {
      const returnType = match[1];
      const name = match[2];
      const lineNumber = file.content.substring(0, match.index).split('\n').length;

      // Skip constructors (name matches class name) - would need class context
      if (returnType === name) {
        continue;
      }

      const node: MeshNode = {
        id: uuidv4(),
        type: 'Method',
        name,
        properties: {
          return_type: returnType,
        },
        source: {
          file: file.relativePath,
          line_start: lineNumber,
          line_end: lineNumber,
        },
        project_id: this.projectId,
        extraction: {
          tier: 1,
          confidence: 0.8,
          extracted_at: new Date().toISOString(),
        },
      };

      nodes.push(node);
    }

    return { nodes, edges };
  }
}
```

**Acceptance Criteria:**
- [ ] FileExtractor finds all source files
- [ ] Respects include/exclude patterns
- [ ] Skips binary and large files
- [ ] FunctionExtractor works for Python, TypeScript, Java
- [ ] Returns accurate line numbers

---

#### 1.7 Extraction Pipeline (Day 7-8)

**File:** `src/mesh-builder/src/core/ExtractionPipeline.ts`

```typescript
import {
  SourceFile,
  Schema,
  ExtractionResult,
  ProjectExtractionResult,
  MeshNode,
  MeshEdge,
  ProjectConfig,
} from '../types';
import { SchemaRegistry } from './SchemaRegistry';
import { PatternMatcher } from './PatternMatcher';
import { LanguageDetector } from './LanguageDetector';
import { FileExtractor, FileExtractionOptions } from '../extractors/FileExtractor';
import { FunctionExtractor } from '../extractors/FunctionExtractor';

export interface PipelineOptions {
  enableAI?: boolean;
  aiModel?: string;
  tier2Threshold?: number; // Confidence below this triggers Tier 2
  tier3Threshold?: number; // Confidence below this triggers Tier 3
  verbose?: boolean;
}

const DEFAULT_OPTIONS: PipelineOptions = {
  enableAI: false,
  aiModel: 'llama-3.1-70b-versatile',
  tier2Threshold: 0.8,
  tier3Threshold: 0.7,
  verbose: false,
};

export class ExtractionPipeline {
  private schemaRegistry: SchemaRegistry;
  private languageDetector: LanguageDetector;
  private fileExtractor: FileExtractor;

  constructor(schemaDir: string) {
    this.schemaRegistry = new SchemaRegistry(schemaDir);
    this.languageDetector = new LanguageDetector();
    this.fileExtractor = new FileExtractor();
  }

  /**
   * Extract a single file
   */
  async extractFile(
    file: SourceFile,
    projectId: string,
    options: PipelineOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Ensure schemas are loaded
    await this.schemaRegistry.loadSchemas();

    const result: ExtractionResult = {
      file: file.relativePath,
      language: file.language,
      nodes: [],
      edges: [],
      confidence: 0,
      tier: 1,
      schemas_used: [],
      unresolved_patterns: [],
      errors: [],
    };

    try {
      // TIER 1: Schema-based extraction
      const tier1Result = await this.tier1Extract(file, projectId);
      result.nodes.push(...tier1Result.nodes);
      result.edges.push(...tier1Result.edges);
      result.confidence = tier1Result.confidence;
      result.schemas_used = tier1Result.schemasUsed;
      result.tier = 1;

      if (opts.verbose) {
        console.log(
          `[Tier 1] ${file.relativePath}: ${tier1Result.nodes.length} nodes, confidence=${tier1Result.confidence.toFixed(2)}`
        );
      }

      // Check if we need Tier 2
      if (opts.enableAI && result.confidence < opts.tier2Threshold!) {
        if (opts.verbose) {
          console.log(`[Tier 2] Escalating ${file.relativePath} (confidence < ${opts.tier2Threshold})`);
        }

        const tier2Result = await this.tier2Extract(file, projectId, tier1Result, opts);
        result.nodes.push(...tier2Result.nodes);
        result.edges.push(...tier2Result.edges);
        result.confidence = Math.max(result.confidence, tier2Result.confidence);
        result.tier = 2;

        // Check if we need Tier 3
        if (result.confidence < opts.tier3Threshold!) {
          if (opts.verbose) {
            console.log(`[Tier 3] Escalating ${file.relativePath} (confidence < ${opts.tier3Threshold})`);
          }

          const tier3Result = await this.tier3Extract(file, projectId, opts);
          result.nodes.push(...tier3Result.nodes);
          result.edges.push(...tier3Result.edges);
          result.confidence = Math.max(result.confidence, tier3Result.confidence);
          result.tier = 3;
        }
      }

      // Deduplicate nodes by ID
      result.nodes = this.deduplicateNodes(result.nodes);

    } catch (error) {
      result.errors.push(`Extraction failed: ${error}`);
      console.error(`Failed to extract ${file.relativePath}:`, error);
    }

    return result;
  }

  /**
   * Extract an entire project
   */
  async extractProject(
    config: ProjectConfig,
    fileOptions: FileExtractionOptions = {},
    pipelineOptions: PipelineOptions = {}
  ): Promise<ProjectExtractionResult> {
    const startTime = Date.now();

    // Extract all files
    const files = await this.fileExtractor.extractFiles(config.path, {
      ...fileOptions,
      includePaths: config.includePaths,
      excludePaths: config.excludePaths,
    });

    const results: ExtractionResult[] = [];
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let totalNodes = 0;
    let totalEdges = 0;

    // Process each file
    for (const file of files) {
      const result = await this.extractFile(file, config.id, pipelineOptions);
      results.push(result);

      // Track statistics
      switch (result.tier) {
        case 1:
          tier1Count++;
          break;
        case 2:
          tier2Count++;
          break;
        case 3:
          tier3Count++;
          break;
      }
      totalNodes += result.nodes.length;
      totalEdges += result.edges.length;
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `Extracted ${config.name}: ${files.length} files, ${totalNodes} nodes, ${totalEdges} edges in ${elapsed}ms`
    );

    return {
      project_id: config.id,
      project_path: config.path,
      timestamp: new Date().toISOString(),
      statistics: {
        files_processed: files.length,
        files_skipped: 0, // Could track this
        tier1_count: tier1Count,
        tier2_count: tier2Count,
        tier3_count: tier3Count,
        total_nodes: totalNodes,
        total_edges: totalEdges,
        schemas_generated: 0, // Track Tier 3 schema generation
      },
      results,
    };
  }

  /**
   * Tier 1: Schema-based extraction (fast, free)
   */
  private async tier1Extract(
    file: SourceFile,
    projectId: string
  ): Promise<{
    nodes: MeshNode[];
    edges: MeshEdge[];
    confidence: number;
    schemasUsed: string[];
  }> {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];
    const schemasUsed: string[] = [];
    let maxConfidence = 0;

    // Find matching schemas
    const schemas = await this.schemaRegistry.findMatchingSchemas(file);

    if (schemas.length === 0) {
      // Fall back to basic function extraction
      const functionExtractor = new FunctionExtractor(projectId);
      const basicResult = functionExtractor.extract(file);
      return {
        nodes: basicResult.nodes,
        edges: basicResult.edges,
        confidence: 0.5, // Lower confidence for fallback
        schemasUsed: [],
      };
    }

    // Apply each matching schema
    for (const schema of schemas) {
      const matcher = new PatternMatcher(projectId);
      const matchResult = matcher.match(file, schema);

      nodes.push(...matchResult.nodes);
      edges.push(...matchResult.edges);
      schemasUsed.push(schema.name);

      if (matchResult.confidence > maxConfidence) {
        maxConfidence = matchResult.confidence;
      }
    }

    return {
      nodes,
      edges,
      confidence: maxConfidence,
      schemasUsed,
    };
  }

  /**
   * Tier 2: AI-assisted enhancement (medium speed, low cost)
   * Placeholder - will be implemented in Phase 3
   */
  private async tier2Extract(
    file: SourceFile,
    projectId: string,
    tier1Result: { nodes: MeshNode[]; edges: MeshEdge[]; schemasUsed: string[] },
    options: PipelineOptions
  ): Promise<{ nodes: MeshNode[]; edges: MeshEdge[]; confidence: number }> {
    // TODO: Implement AI-assisted enhancement in Phase 3
    console.log(`[Tier 2] Not yet implemented - returning empty result`);
    return { nodes: [], edges: [], confidence: 0 };
  }

  /**
   * Tier 3: AI discovery (slow, higher cost)
   * Placeholder - will be implemented in Phase 3
   */
  private async tier3Extract(
    file: SourceFile,
    projectId: string,
    options: PipelineOptions
  ): Promise<{ nodes: MeshNode[]; edges: MeshEdge[]; confidence: number }> {
    // TODO: Implement AI discovery in Phase 3
    console.log(`[Tier 3] Not yet implemented - returning empty result`);
    return { nodes: [], edges: [], confidence: 0 };
  }

  /**
   * Deduplicate nodes by ID
   */
  private deduplicateNodes(nodes: MeshNode[]): MeshNode[] {
    const seen = new Set<string>();
    return nodes.filter((node) => {
      if (seen.has(node.id)) {
        return false;
      }
      seen.add(node.id);
      return true;
    });
  }
}
```

**Acceptance Criteria:**
- [ ] Pipeline orchestrates full extraction
- [ ] Tier routing based on confidence thresholds
- [ ] Statistics tracking (files, nodes, edges, tiers)
- [ ] Proper error handling and logging

---

#### 1.8 CLI Interface (Day 8-9)

**File:** `src/mesh-builder/src/cli/index.ts`

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { ExtractionPipeline } from '../core/ExtractionPipeline';
import { MeshExporter } from '../output/MeshExporter';
import { ProjectConfig } from '../types';

const program = new Command();

program
  .name('mesh-builder')
  .description('Agentic code mesh extraction tool')
  .version('0.1.0');

// Extract command
program
  .command('extract <projectPath>')
  .description('Extract code knowledge mesh from a project')
  .option('-o, --output <file>', 'Output file path', 'mesh.json')
  .option('-s, --schemas <dir>', 'Schema directory', './schemas')
  .option('--enable-ai', 'Enable AI tiers (requires GROQ_API_KEY)')
  .option('--ai-model <model>', 'AI model to use', 'llama-3.1-70b-versatile')
  .option('--include <patterns...>', 'Include path patterns')
  .option('--exclude <patterns...>', 'Exclude path patterns')
  .option('-v, --verbose', 'Verbose output')
  .action(async (projectPath: string, options) => {
    const spinner = ora('Initializing extraction pipeline...').start();

    try {
      const absolutePath = path.resolve(projectPath);
      const schemaDir = path.resolve(options.schemas);

      // Verify project exists
      await fs.access(absolutePath);

      // Create project config
      const config: ProjectConfig = {
        id: path.basename(absolutePath),
        name: path.basename(absolutePath),
        path: absolutePath,
        includePaths: options.include,
        excludePaths: options.exclude,
      };

      // Initialize pipeline
      const pipeline = new ExtractionPipeline(schemaDir);

      spinner.text = 'Extracting code structure...';

      // Run extraction
      const result = await pipeline.extractProject(config, {}, {
        enableAI: options.enableAi,
        aiModel: options.aiModel,
        verbose: options.verbose,
      });

      spinner.text = 'Writing output...';

      // Export to file
      const exporter = new MeshExporter();
      await exporter.export(result, options.output);

      spinner.succeed(chalk.green('Extraction complete!'));

      // Print summary
      console.log('');
      console.log(chalk.bold('Summary:'));
      console.log(`  Files processed: ${result.statistics.files_processed}`);
      console.log(`  Total nodes: ${result.statistics.total_nodes}`);
      console.log(`  Total edges: ${result.statistics.total_edges}`);
      console.log(`  Tier 1: ${result.statistics.tier1_count} files`);
      console.log(`  Tier 2: ${result.statistics.tier2_count} files`);
      console.log(`  Tier 3: ${result.statistics.tier3_count} files`);
      console.log('');
      console.log(chalk.dim(`Output: ${options.output}`));

    } catch (error) {
      spinner.fail(chalk.red(`Extraction failed: ${error}`));
      process.exit(1);
    }
  });

// Schema command
program
  .command('schema <action>')
  .description('Manage extraction schemas')
  .argument('<action>', 'Action: list, validate, generate')
  .option('-d, --dir <dir>', 'Schema directory', './schemas')
  .action(async (action: string, options) => {
    const schemaDir = path.resolve(options.dir);

    switch (action) {
      case 'list':
        // List all schemas
        const pipeline = new ExtractionPipeline(schemaDir);
        // Would need to expose schema listing
        console.log('Schema listing not yet implemented');
        break;

      case 'validate':
        // Validate schemas
        console.log('Schema validation not yet implemented');
        break;

      case 'generate':
        // Generate schema from AI discovery
        console.log('Schema generation not yet implemented');
        break;

      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }
  });

// Link command (for cross-project)
program
  .command('link <projects...>')
  .description('Link multiple projects to find cross-service relationships')
  .option('-o, --output <file>', 'Output file path', 'unified-mesh.json')
  .action(async (projects: string[], options) => {
    console.log('Cross-project linking not yet implemented');
    console.log('Projects:', projects);
  });

program.parse();
```

**File:** `src/mesh-builder/src/output/MeshExporter.ts`

```typescript
import * as fs from 'fs/promises';
import { ProjectExtractionResult, MeshNode, MeshEdge } from '../types';

export interface MeshOutput {
  version: '1.0.0';
  timestamp: string;
  project: string;
  statistics: ProjectExtractionResult['statistics'];
  nodes: MeshNode[];
  edges: MeshEdge[];
}

export class MeshExporter {
  /**
   * Export extraction result to JSON file
   */
  async export(result: ProjectExtractionResult, outputPath: string): Promise<void> {
    // Collect all nodes and edges from results
    const allNodes: MeshNode[] = [];
    const allEdges: MeshEdge[] = [];

    for (const fileResult of result.results) {
      allNodes.push(...fileResult.nodes);
      allEdges.push(...fileResult.edges);
    }

    const output: MeshOutput = {
      version: '1.0.0',
      timestamp: result.timestamp,
      project: result.project_id,
      statistics: result.statistics,
      nodes: allNodes,
      edges: allEdges,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  }

  /**
   * Export to stdout (for piping)
   */
  exportToStdout(result: ProjectExtractionResult): void {
    const allNodes: MeshNode[] = [];
    const allEdges: MeshEdge[] = [];

    for (const fileResult of result.results) {
      allNodes.push(...fileResult.nodes);
      allEdges.push(...fileResult.edges);
    }

    const output: MeshOutput = {
      version: '1.0.0',
      timestamp: result.timestamp,
      project: result.project_id,
      statistics: result.statistics,
      nodes: allNodes,
      edges: allEdges,
    };

    console.log(JSON.stringify(output));
  }
}
```

**Acceptance Criteria:**
- [ ] CLI runs with `mesh-builder extract <path>`
- [ ] Progress spinner shows status
- [ ] Output written to JSON file
- [ ] Summary statistics printed
- [ ] Error handling with helpful messages

---

#### 1.9 Initial Schemas (Day 9-10)

**File:** `src/mesh-builder/schemas/languages/python.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "python",
  "version": "1.0.0",
  "language": "python",
  "description": "Core Python language patterns",

  "detection": {
    "imports": [],
    "files": ["*.py"],
    "confidence_boost": 0.2
  },

  "extractors": {
    "classes": {
      "description": "Python class definitions",
      "patterns": [
        {
          "name": "class_definition",
          "regex": "^class\\s+(\\w+)(?:\\(([^)]+)\\))?\\s*:",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "bases": { "group": 2, "default": "" }
          },
          "node_template": {
            "type": "Class",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "bases": "${bases}"
            }
          }
        }
      ]
    },

    "functions": {
      "description": "Python function definitions",
      "patterns": [
        {
          "name": "function_definition",
          "regex": "^(\\s*)(?:async\\s+)?def\\s+(\\w+)\\s*\\(([^)]*)\\)(?:\\s*->\\s*([^:]+))?\\s*:",
          "flags": "gm",
          "captures": {
            "indent": { "group": 1 },
            "name": { "group": 2 },
            "params": { "group": 3 },
            "return_type": { "group": 4, "default": "" }
          },
          "node_template": {
            "type": "Function",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "parameters": "${params}",
              "return_type": "${return_type}",
              "async": false
            }
          }
        },
        {
          "name": "async_function",
          "regex": "^(\\s*)async\\s+def\\s+(\\w+)\\s*\\(([^)]*)\\)(?:\\s*->\\s*([^:]+))?\\s*:",
          "flags": "gm",
          "captures": {
            "indent": { "group": 1 },
            "name": { "group": 2 },
            "params": { "group": 3 },
            "return_type": { "group": 4, "default": "" }
          },
          "node_template": {
            "type": "Function",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "parameters": "${params}",
              "return_type": "${return_type}",
              "async": true
            }
          }
        }
      ]
    },

    "imports": {
      "description": "Python import statements",
      "patterns": [
        {
          "name": "import_from",
          "regex": "^from\\s+(\\S+)\\s+import\\s+(.+)$",
          "flags": "gm",
          "captures": {
            "module": { "group": 1 },
            "names": { "group": 2 }
          },
          "node_template": {
            "type": "Import",
            "name_from": "module",
            "properties": {
              "module": "${module}",
              "names": "${names}"
            }
          }
        },
        {
          "name": "import_module",
          "regex": "^import\\s+(.+)$",
          "flags": "gm",
          "captures": {
            "module": { "group": 1 }
          },
          "node_template": {
            "type": "Import",
            "name_from": "module",
            "properties": {
              "module": "${module}"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "Python uses indentation for scope",
      "Decorators start with @ and are applied to the next function/class"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/languages/typescript.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "typescript",
  "version": "1.0.0",
  "language": "typescript",
  "description": "Core TypeScript language patterns",

  "detection": {
    "imports": [],
    "files": ["*.ts", "*.tsx"],
    "confidence_boost": 0.2
  },

  "extractors": {
    "classes": {
      "description": "TypeScript class definitions",
      "patterns": [
        {
          "name": "class_definition",
          "regex": "(?:export\\s+)?(?:abstract\\s+)?class\\s+(\\w+)(?:\\s+extends\\s+(\\w+))?(?:\\s+implements\\s+([\\w,\\s]+))?\\s*\\{",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "extends": { "group": 2, "default": "" },
            "implements": { "group": 3, "default": "" }
          },
          "node_template": {
            "type": "Class",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "extends": "${extends}",
              "implements": "${implements}"
            }
          }
        }
      ]
    },

    "interfaces": {
      "description": "TypeScript interface definitions",
      "patterns": [
        {
          "name": "interface_definition",
          "regex": "(?:export\\s+)?interface\\s+(\\w+)(?:\\s+extends\\s+([\\w,\\s]+))?\\s*\\{",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "extends": { "group": 2, "default": "" }
          },
          "node_template": {
            "type": "Interface",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "extends": "${extends}"
            }
          }
        }
      ]
    },

    "functions": {
      "description": "TypeScript function definitions",
      "patterns": [
        {
          "name": "function_declaration",
          "regex": "(?:export\\s+)?(?:async\\s+)?function\\s+(\\w+)\\s*(?:<[^>]+>)?\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^{]+))?\\s*\\{",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "params": { "group": 2 },
            "return_type": { "group": 3, "default": "" }
          },
          "node_template": {
            "type": "Function",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "parameters": "${params}",
              "return_type": "${return_type}"
            }
          }
        },
        {
          "name": "arrow_function",
          "regex": "(?:export\\s+)?(?:const|let)\\s+(\\w+)\\s*(?::\\s*[^=]+)?\\s*=\\s*(?:async\\s+)?\\(([^)]*)\\)(?:\\s*:\\s*([^=]+))?\\s*=>",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "params": { "group": 2 },
            "return_type": { "group": 3, "default": "" }
          },
          "node_template": {
            "type": "Function",
            "name_from": "name",
            "properties": {
              "name": "${name}",
              "parameters": "${params}",
              "return_type": "${return_type}"
            }
          }
        }
      ]
    },

    "imports": {
      "description": "TypeScript import statements",
      "patterns": [
        {
          "name": "import_named",
          "regex": "import\\s+\\{\\s*([^}]+)\\s*\\}\\s+from\\s+['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "names": { "group": 1 },
            "module": { "group": 2 }
          },
          "node_template": {
            "type": "Import",
            "name_from": "module",
            "properties": {
              "module": "${module}",
              "names": "${names}"
            }
          }
        },
        {
          "name": "import_default",
          "regex": "import\\s+(\\w+)\\s+from\\s+['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "module": { "group": 2 }
          },
          "node_template": {
            "type": "Import",
            "name_from": "module",
            "properties": {
              "module": "${module}",
              "default": "${name}"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "TypeScript uses braces for scope",
      "Decorators start with @ and are typically from NestJS or similar frameworks"
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] Python schema extracts classes, functions, imports
- [ ] TypeScript schema extracts classes, interfaces, functions, imports
- [ ] Schemas follow documented format
- [ ] Confidence boost values are reasonable

---

#### Phase 1 Testing (Day 10)

**Test Files:**

```typescript
// src/mesh-builder/src/__tests__/integration.test.ts

import * as path from 'path';
import { ExtractionPipeline } from '../core/ExtractionPipeline';
import { ProjectConfig } from '../types';

describe('Extraction Pipeline Integration', () => {
  const testProjectPath = path.join(__dirname, 'fixtures', 'sample-project');
  const schemaDir = path.join(__dirname, '..', '..', 'schemas');

  test('extracts Python project', async () => {
    const pipeline = new ExtractionPipeline(schemaDir);
    const config: ProjectConfig = {
      id: 'test-python',
      name: 'Test Python Project',
      path: path.join(testProjectPath, 'python'),
    };

    const result = await pipeline.extractProject(config);

    expect(result.statistics.files_processed).toBeGreaterThan(0);
    expect(result.statistics.total_nodes).toBeGreaterThan(0);
  });

  test('extracts TypeScript project', async () => {
    const pipeline = new ExtractionPipeline(schemaDir);
    const config: ProjectConfig = {
      id: 'test-typescript',
      name: 'Test TypeScript Project',
      path: path.join(testProjectPath, 'typescript'),
    };

    const result = await pipeline.extractProject(config);

    expect(result.statistics.files_processed).toBeGreaterThan(0);
    expect(result.statistics.total_nodes).toBeGreaterThan(0);
  });
});
```

**Phase 1 Acceptance Criteria Summary:**

- [ ] mesh-builder package builds and runs
- [ ] Schema registry loads JSON schemas
- [ ] Pattern matcher applies regex and creates nodes/edges
- [ ] Language detector identifies Python, TypeScript, Java
- [ ] File extractor finds source files, skips binary
- [ ] Function extractor works for Python, TypeScript, Java
- [ ] Extraction pipeline orchestrates tiers
- [ ] CLI provides extract, schema, link commands
- [ ] JSON output matches specified format
- [ ] Initial schemas for Python and TypeScript

---

### Phase 2: Framework Schemas (1 week / 5 days)

**Goal:** Build comprehensive schemas for popular frameworks.

#### Day 1-2: Python Frameworks

**File:** `src/mesh-builder/schemas/frameworks/python/fastapi.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "fastapi",
  "version": "1.0.0",
  "language": "python",
  "description": "FastAPI web framework patterns",

  "detection": {
    "imports": ["fastapi", "from fastapi import"],
    "files": ["*.py"],
    "confidence_boost": 0.3
  },

  "extractors": {
    "routes": {
      "description": "FastAPI route handlers",
      "patterns": [
        {
          "name": "route_decorator",
          "regex": "@(?:app|router)\\.(get|post|put|delete|patch|options|head)\\s*\\([\"']([^\"']+)[\"'](?:,\\s*response_model\\s*=\\s*(\\w+))?[^)]*\\)\\s*(?:async\\s+)?def\\s+(\\w+)",
          "flags": "gmi",
          "captures": {
            "method": { "group": 1 },
            "path": { "group": 2 },
            "response_model": { "group": 3, "default": "" },
            "name": { "group": 4 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "name_from": "name",
            "properties": {
              "method": "${method}",
              "path": "${path}",
              "response_model": "${response_model}",
              "framework": "fastapi"
            }
          }
        }
      ]
    },

    "dependencies": {
      "description": "FastAPI dependency injection",
      "patterns": [
        {
          "name": "depends",
          "regex": "(\\w+)\\s*:\\s*\\w+\\s*=\\s*Depends\\(([\\w.]+)\\)",
          "flags": "gm",
          "captures": {
            "param_name": { "group": 1 },
            "dependency": { "group": 2 }
          },
          "node_template": {
            "type": "Dependency",
            "name_from": "param_name",
            "properties": {
              "provider": "${dependency}",
              "framework": "fastapi"
            }
          }
        }
      ]
    },

    "pydantic_models": {
      "description": "Pydantic models for request/response",
      "patterns": [
        {
          "name": "pydantic_model",
          "regex": "class\\s+(\\w+)\\s*\\(\\s*(?:pydantic\\.)?BaseModel\\s*\\)\\s*:",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "DataModel",
            "name_from": "name",
            "properties": {
              "framework": "pydantic"
            }
          }
        }
      ]
    }
  },

  "edge_rules": [
    {
      "from_type": "ApiEndpoint",
      "to_type": "DataModel",
      "condition": "from.properties.response_model == to.name",
      "edge_type": "RETURNS"
    }
  ],

  "ai_hints": {
    "disambiguation": [
      "FastAPI uses decorator syntax @app.method('/path')",
      "Depends() is used for dependency injection",
      "Response models are Pydantic classes"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/frameworks/python/django.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "django",
  "version": "1.0.0",
  "language": "python",
  "description": "Django web framework patterns",

  "detection": {
    "imports": ["django", "from django"],
    "files": ["*.py", "settings.py", "urls.py", "views.py", "models.py"],
    "confidence_boost": 0.3
  },

  "extractors": {
    "models": {
      "description": "Django ORM models",
      "patterns": [
        {
          "name": "model_class",
          "regex": "class\\s+(\\w+)\\s*\\(\\s*(?:models\\.)?Model\\s*\\)\\s*:",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "DatabaseTable",
            "name_from": "name",
            "properties": {
              "framework": "django",
              "orm": "django-orm"
            }
          }
        }
      ]
    },

    "views": {
      "description": "Django views (function and class-based)",
      "patterns": [
        {
          "name": "function_view",
          "regex": "def\\s+(\\w+)\\s*\\(\\s*request(?:,|\\))",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "name_from": "name",
            "properties": {
              "view_type": "function",
              "framework": "django"
            }
          }
        },
        {
          "name": "class_view",
          "regex": "class\\s+(\\w+)\\s*\\(\\s*(?:View|ListView|DetailView|CreateView|UpdateView|DeleteView|TemplateView|FormView|APIView|ViewSet|GenericAPIView)\\s*\\)",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "name_from": "name",
            "properties": {
              "view_type": "class",
              "framework": "django"
            }
          }
        }
      ]
    },

    "urls": {
      "description": "Django URL patterns",
      "patterns": [
        {
          "name": "url_path",
          "regex": "path\\s*\\(\\s*['\"]([^'\"]+)['\"]\\s*,\\s*([\\w.]+)",
          "flags": "gm",
          "captures": {
            "path": { "group": 1 },
            "view": { "group": 2 }
          },
          "node_template": {
            "type": "Route",
            "name_from": "path",
            "properties": {
              "path": "${path}",
              "view": "${view}",
              "framework": "django"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "Django uses class Meta for model options",
      "urls.py contains urlpatterns list",
      "views.py contains view functions/classes"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/data-stores/sqlalchemy.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "sqlalchemy",
  "version": "1.0.0",
  "language": "python",
  "description": "SQLAlchemy ORM patterns",

  "detection": {
    "imports": ["sqlalchemy", "from sqlalchemy"],
    "files": ["*.py", "models.py", "schema.py"],
    "confidence_boost": 0.3
  },

  "extractors": {
    "models": {
      "description": "SQLAlchemy model definitions",
      "patterns": [
        {
          "name": "declarative_model",
          "regex": "class\\s+(\\w+)\\s*\\(\\s*(?:Base|DeclarativeBase)\\s*\\)\\s*:\\s*__tablename__\\s*=\\s*['\"]([^'\"]+)['\"]",
          "flags": "gms",
          "captures": {
            "name": { "group": 1 },
            "table_name": { "group": 2 }
          },
          "node_template": {
            "type": "DatabaseTable",
            "name_from": "name",
            "properties": {
              "table_name": "${table_name}",
              "orm": "sqlalchemy"
            }
          }
        }
      ]
    },

    "columns": {
      "description": "SQLAlchemy column definitions",
      "patterns": [
        {
          "name": "column",
          "regex": "(\\w+)\\s*=\\s*(?:mapped_)?[Cc]olumn\\s*\\(\\s*(?:sqlalchemy\\.)?(\\w+)",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "type": { "group": 2 }
          },
          "node_template": {
            "type": "DatabaseColumn",
            "name_from": "name",
            "properties": {
              "column_type": "${type}",
              "orm": "sqlalchemy"
            }
          }
        }
      ]
    },

    "relationships": {
      "description": "SQLAlchemy relationship definitions",
      "patterns": [
        {
          "name": "relationship",
          "regex": "(\\w+)\\s*=\\s*relationship\\s*\\(\\s*['\"]?(\\w+)['\"]?",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "target": { "group": 2 }
          },
          "node_template": {
            "type": "Relationship",
            "name_from": "name",
            "properties": {
              "target_model": "${target}",
              "orm": "sqlalchemy"
            }
          }
        }
      ]
    }
  },

  "edge_rules": [
    {
      "from_type": "DatabaseColumn",
      "to_type": "DatabaseTable",
      "condition": "context.same_class",
      "edge_type": "BELONGS_TO"
    },
    {
      "from_type": "Relationship",
      "to_type": "DatabaseTable",
      "condition": "edge.target_model == to.name",
      "edge_type": "REFERENCES"
    }
  ],

  "ai_hints": {
    "disambiguation": [
      "SQLAlchemy 2.0 uses Mapped[] type hints",
      "relationship() connects models",
      "__tablename__ defines actual table name"
    ]
  }
}
```

#### Day 3-4: TypeScript Frameworks

**File:** `src/mesh-builder/schemas/frameworks/typescript/nestjs.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "nestjs",
  "version": "1.0.0",
  "language": "typescript",
  "description": "NestJS framework patterns",

  "detection": {
    "imports": ["@nestjs/common", "@nestjs/core"],
    "files": ["*.ts", "*.controller.ts", "*.service.ts", "*.module.ts"],
    "confidence_boost": 0.4
  },

  "extractors": {
    "controllers": {
      "description": "NestJS controllers",
      "patterns": [
        {
          "name": "controller_class",
          "regex": "@Controller\\s*\\(\\s*['\"]?([^'\"\\)]*)['\"]?\\s*\\)\\s*(?:export\\s+)?class\\s+(\\w+)",
          "flags": "gm",
          "captures": {
            "path": { "group": 1, "default": "" },
            "name": { "group": 2 }
          },
          "node_template": {
            "type": "Controller",
            "name_from": "name",
            "properties": {
              "base_path": "${path}",
              "framework": "nestjs"
            }
          }
        }
      ]
    },

    "routes": {
      "description": "NestJS route handlers",
      "patterns": [
        {
          "name": "http_method",
          "regex": "@(Get|Post|Put|Delete|Patch|Options|Head)\\s*\\(\\s*['\"]?([^'\"\\)]*)['\"]?\\s*\\)\\s*(?:async\\s+)?(\\w+)",
          "flags": "gm",
          "captures": {
            "method": { "group": 1 },
            "path": { "group": 2, "default": "" },
            "name": { "group": 3 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "name_from": "name",
            "properties": {
              "method": "${method}",
              "path": "${path}",
              "framework": "nestjs"
            }
          }
        }
      ]
    },

    "services": {
      "description": "NestJS injectable services",
      "patterns": [
        {
          "name": "injectable",
          "regex": "@Injectable\\s*\\(\\s*\\)\\s*(?:export\\s+)?class\\s+(\\w+)",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "Service",
            "name_from": "name",
            "properties": {
              "framework": "nestjs"
            }
          }
        }
      ]
    },

    "modules": {
      "description": "NestJS modules",
      "patterns": [
        {
          "name": "module",
          "regex": "@Module\\s*\\(\\s*\\{[^}]*controllers\\s*:\\s*\\[([^\\]]+)\\][^}]*providers\\s*:\\s*\\[([^\\]]+)\\][^}]*\\}\\s*\\)\\s*(?:export\\s+)?class\\s+(\\w+)",
          "flags": "gms",
          "captures": {
            "controllers": { "group": 1 },
            "providers": { "group": 2 },
            "name": { "group": 3 }
          },
          "node_template": {
            "type": "Module",
            "name_from": "name",
            "properties": {
              "controllers": "${controllers}",
              "providers": "${providers}",
              "framework": "nestjs"
            }
          }
        }
      ]
    }
  },

  "edge_rules": [
    {
      "from_type": "ApiEndpoint",
      "to_type": "Controller",
      "condition": "context.same_class",
      "edge_type": "BELONGS_TO"
    },
    {
      "from_type": "Controller",
      "to_type": "Module",
      "condition": "to.properties.controllers.includes(from.name)",
      "edge_type": "REGISTERED_IN"
    }
  ],

  "ai_hints": {
    "disambiguation": [
      "NestJS uses decorators for metadata",
      "@Injectable marks a class for dependency injection",
      "Modules wire together controllers and services"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/frameworks/typescript/express.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "express",
  "version": "1.0.0",
  "language": "typescript",
  "description": "Express.js framework patterns",

  "detection": {
    "imports": ["express", "from 'express'", "require('express')"],
    "files": ["*.ts", "*.js", "routes/*.ts", "routes/*.js"],
    "confidence_boost": 0.3
  },

  "extractors": {
    "routes": {
      "description": "Express route definitions",
      "patterns": [
        {
          "name": "app_route",
          "regex": "(?:app|router)\\.(get|post|put|delete|patch|options|head|all)\\s*\\(\\s*['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "method": { "group": 1 },
            "path": { "group": 2 }
          },
          "node_template": {
            "type": "ApiEndpoint",
            "name_from": "path",
            "properties": {
              "method": "${method}",
              "path": "${path}",
              "framework": "express"
            }
          }
        },
        {
          "name": "router_use",
          "regex": "(?:app|router)\\.use\\s*\\(\\s*['\"]([^'\"]+)['\"]\\s*,\\s*(\\w+)",
          "flags": "gm",
          "captures": {
            "path": { "group": 1 },
            "handler": { "group": 2 }
          },
          "node_template": {
            "type": "RouteMount",
            "name_from": "path",
            "properties": {
              "mount_path": "${path}",
              "handler": "${handler}",
              "framework": "express"
            }
          }
        }
      ]
    },

    "middleware": {
      "description": "Express middleware",
      "patterns": [
        {
          "name": "middleware_use",
          "regex": "app\\.use\\s*\\(\\s*(\\w+)\\s*(?:\\(|\\))",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 }
          },
          "node_template": {
            "type": "Middleware",
            "name_from": "name",
            "properties": {
              "framework": "express"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "Express uses app.METHOD(path, handler) pattern",
      "router.use mounts sub-routers",
      "Middleware is applied with app.use(middleware)"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/frameworks/typescript/prisma.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "prisma",
  "version": "1.0.0",
  "language": "prisma",
  "description": "Prisma ORM patterns",

  "detection": {
    "imports": ["@prisma/client"],
    "files": ["schema.prisma", "*.prisma"],
    "confidence_boost": 0.5
  },

  "extractors": {
    "models": {
      "description": "Prisma model definitions",
      "patterns": [
        {
          "name": "model",
          "regex": "model\\s+(\\w+)\\s*\\{([^}]+)\\}",
          "flags": "gms",
          "captures": {
            "name": { "group": 1 },
            "body": { "group": 2 }
          },
          "node_template": {
            "type": "DatabaseTable",
            "name_from": "name",
            "properties": {
              "orm": "prisma"
            }
          }
        }
      ]
    },

    "fields": {
      "description": "Prisma model fields",
      "patterns": [
        {
          "name": "field",
          "regex": "^\\s*(\\w+)\\s+(\\w+)(\\?)?\\s*(?:@([\\w.]+))?",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "type": { "group": 2 },
            "optional": { "group": 3, "default": "" },
            "attribute": { "group": 4, "default": "" }
          },
          "node_template": {
            "type": "DatabaseColumn",
            "name_from": "name",
            "properties": {
              "column_type": "${type}",
              "optional": "${optional}",
              "attribute": "${attribute}",
              "orm": "prisma"
            }
          }
        }
      ]
    },

    "relations": {
      "description": "Prisma relations",
      "patterns": [
        {
          "name": "relation",
          "regex": "(\\w+)\\s+(\\w+)(\\[\\])?\\s+@relation",
          "flags": "gm",
          "captures": {
            "name": { "group": 1 },
            "target": { "group": 2 },
            "array": { "group": 3, "default": "" }
          },
          "node_template": {
            "type": "Relationship",
            "name_from": "name",
            "properties": {
              "target_model": "${target}",
              "is_array": "${array}",
              "orm": "prisma"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "Prisma schema files define models and relations",
      "@relation decorator specifies foreign key relationships",
      "[] suffix indicates one-to-many relationship"
    ]
  }
}
```

#### Day 5: Messaging Schemas

**File:** `src/mesh-builder/schemas/messaging/sqs.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "aws-sqs",
  "version": "1.0.0",
  "language": "*",
  "description": "AWS SQS messaging patterns",

  "detection": {
    "imports": ["boto3", "@aws-sdk/client-sqs", "aws-sdk"],
    "files": ["*.py", "*.ts", "*.js"],
    "confidence_boost": 0.2
  },

  "extractors": {
    "producers": {
      "description": "SQS message producers",
      "patterns": [
        {
          "name": "boto3_send",
          "regex": "\\.send_message\\s*\\([^)]*QueueUrl\\s*=\\s*([^,\\)]+)",
          "flags": "gm",
          "captures": {
            "queue_url": { "group": 1 }
          },
          "node_template": {
            "type": "QueueProducer",
            "name_from": "queue_url",
            "properties": {
              "queue_url": "${queue_url}",
              "service": "sqs"
            }
          }
        },
        {
          "name": "sdk_v3_send",
          "regex": "SendMessageCommand\\s*\\(\\s*\\{[^}]*QueueUrl\\s*:\\s*([^,}]+)",
          "flags": "gms",
          "captures": {
            "queue_url": { "group": 1 }
          },
          "node_template": {
            "type": "QueueProducer",
            "name_from": "queue_url",
            "properties": {
              "queue_url": "${queue_url}",
              "service": "sqs"
            }
          }
        }
      ]
    },

    "consumers": {
      "description": "SQS message consumers",
      "patterns": [
        {
          "name": "boto3_receive",
          "regex": "\\.receive_message\\s*\\([^)]*QueueUrl\\s*=\\s*([^,\\)]+)",
          "flags": "gm",
          "captures": {
            "queue_url": { "group": 1 }
          },
          "node_template": {
            "type": "QueueConsumer",
            "name_from": "queue_url",
            "properties": {
              "queue_url": "${queue_url}",
              "service": "sqs"
            }
          }
        },
        {
          "name": "sdk_v3_receive",
          "regex": "ReceiveMessageCommand\\s*\\(\\s*\\{[^}]*QueueUrl\\s*:\\s*([^,}]+)",
          "flags": "gms",
          "captures": {
            "queue_url": { "group": 1 }
          },
          "node_template": {
            "type": "QueueConsumer",
            "name_from": "queue_url",
            "properties": {
              "queue_url": "${queue_url}",
              "service": "sqs"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "boto3 uses .send_message() and .receive_message()",
      "AWS SDK v3 uses SendMessageCommand and ReceiveMessageCommand",
      "QueueUrl often comes from environment variables"
    ],
    "env_resolution": [
      "process.env.SQS_QUEUE_URL",
      "os.environ['SQS_QUEUE_URL']",
      "os.getenv('SQS_QUEUE_URL')"
    ]
  }
}
```

**File:** `src/mesh-builder/schemas/messaging/kafka.json`

```json
{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "kafka",
  "version": "1.0.0",
  "language": "*",
  "description": "Apache Kafka messaging patterns",

  "detection": {
    "imports": ["kafka-python", "kafkajs", "confluent-kafka"],
    "files": ["*.py", "*.ts", "*.js"],
    "confidence_boost": 0.2
  },

  "extractors": {
    "producers": {
      "description": "Kafka producers",
      "patterns": [
        {
          "name": "kafkajs_producer",
          "regex": "producer\\.send\\s*\\(\\s*\\{[^}]*topic\\s*:\\s*['\"]([^'\"]+)['\"]",
          "flags": "gms",
          "captures": {
            "topic": { "group": 1 }
          },
          "node_template": {
            "type": "QueueProducer",
            "name_from": "topic",
            "properties": {
              "topic": "${topic}",
              "service": "kafka"
            }
          }
        },
        {
          "name": "python_producer",
          "regex": "producer\\.produce\\s*\\(\\s*['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "topic": { "group": 1 }
          },
          "node_template": {
            "type": "QueueProducer",
            "name_from": "topic",
            "properties": {
              "topic": "${topic}",
              "service": "kafka"
            }
          }
        }
      ]
    },

    "consumers": {
      "description": "Kafka consumers",
      "patterns": [
        {
          "name": "kafkajs_consumer",
          "regex": "consumer\\.subscribe\\s*\\(\\s*\\{[^}]*(?:topic|topics)\\s*:\\s*['\"]?([^'\"\\},]+)['\"]?",
          "flags": "gms",
          "captures": {
            "topic": { "group": 1 }
          },
          "node_template": {
            "type": "QueueConsumer",
            "name_from": "topic",
            "properties": {
              "topic": "${topic}",
              "service": "kafka"
            }
          }
        },
        {
          "name": "python_consumer",
          "regex": "consumer\\.subscribe\\s*\\(\\s*\\[\\s*['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "topic": { "group": 1 }
          },
          "node_template": {
            "type": "QueueConsumer",
            "name_from": "topic",
            "properties": {
              "topic": "${topic}",
              "service": "kafka"
            }
          }
        }
      ]
    },

    "consumer_groups": {
      "description": "Kafka consumer groups",
      "patterns": [
        {
          "name": "group_id",
          "regex": "(?:groupId|group_id|group\\.id)\\s*[=:]\\s*['\"]([^'\"]+)['\"]",
          "flags": "gm",
          "captures": {
            "group_id": { "group": 1 }
          },
          "node_template": {
            "type": "ConsumerGroup",
            "name_from": "group_id",
            "properties": {
              "group_id": "${group_id}",
              "service": "kafka"
            }
          }
        }
      ]
    }
  },

  "ai_hints": {
    "disambiguation": [
      "Kafka uses topics instead of queues",
      "Consumer groups enable parallel processing",
      "KafkaJS is the main Node.js client"
    ]
  }
}
```

**Acceptance Criteria for Phase 2:**
- [ ] FastAPI routes, dependencies, and Pydantic models extracted
- [ ] Django models, views, and URL patterns extracted
- [ ] SQLAlchemy models, columns, and relationships extracted
- [ ] NestJS controllers, routes, services, and modules extracted
- [ ] Express routes and middleware extracted
- [ ] Prisma models and relations extracted
- [ ] SQS producers/consumers detected in Python and TypeScript
- [ ] Kafka topics and consumer groups detected

---

### Phase 3: AI Tiers (2 weeks / 10 days)

**Goal:** Implement Tier 2 (AI-assisted) and Tier 3 (AI-discovery) with self-learning.

#### Day 1-2: AI Client

**File:** `src/mesh-builder/src/ai/AIClient.ts`

```typescript
import Groq from 'groq-sdk';

export interface AIClientConfig {
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class AIClient {
  private client: Groq;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: AIClientConfig) {
    this.client = new Groq({
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
    });
    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.3;
  }

  async complete(prompt: string): Promise<AIResponse> {
    const completion = await this.client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens || 0,
        completion_tokens: completion.usage?.completion_tokens || 0,
      },
    };
  }
}
```

#### Day 3-4: Tier 2 Enhancer

**File:** `src/mesh-builder/src/ai/Tier2Enhancer.ts`

```typescript
import { AIClient, AIResponse } from './AIClient';
import { SourceFile, MeshNode, MeshEdge, Schema, ExtractionResult } from '../types';

const TIER2_PROMPT_TEMPLATE = `You are a code structure analyzer. Analyze the following code and enhance the extracted data.

## Context
Language: {{language}}
Framework hints: {{framework_hints}}

## Partially Extracted Data
{{partial_extraction}}

## Schema Hints
{{schema_hints}}

## Source Code
\`\`\`{{language}}
{{code_snippet}}
\`\`\`

## Task
1. Verify the correctness of the partial extraction
2. Fill in any missing information (e.g., return types, parameters)
3. Identify additional nodes/edges that the pattern matching missed
4. Infer business context from naming conventions

## Output Format (XML)
<extraction>
  <nodes>
    <node>
      <type>Function|Class|ApiEndpoint|etc</type>
      <name>identifier</name>
      <properties>
        <property key="key">value</property>
      </properties>
      <confidence>0.0-1.0</confidence>
    </node>
  </nodes>
  <edges>
    <edge>
      <from>source_name</from>
      <to>target_name</to>
      <type>CALLS|IMPORTS|RETURNS|etc</type>
    </edge>
  </edges>
  <corrections>
    <correction>
      <original_id>id_to_correct</original_id>
      <field>field_name</field>
      <old_value>old</old_value>
      <new_value>corrected</new_value>
    </correction>
  </corrections>
</extraction>`;

export interface EnhancementResult {
  enhancedNodes: MeshNode[];
  enhancedEdges: MeshEdge[];
  corrections: Array<{
    nodeId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  confidence: number;
  usage: AIResponse['usage'];
}

export class Tier2Enhancer {
  private client: AIClient;

  constructor(apiKey?: string) {
    this.client = new AIClient({
      apiKey,
      model: 'llama-3.1-8b-instant', // Fast, cheap model for enhancement
      maxTokens: 2048,
      temperature: 0.2,
    });
  }

  async enhance(
    file: SourceFile,
    partialResult: ExtractionResult,
    matchingSchemas: Schema[]
  ): Promise<EnhancementResult> {
    // Build prompt from template
    const prompt = this.buildPrompt(file, partialResult, matchingSchemas);

    // Get AI response
    const response = await this.client.complete(prompt);

    // Parse XML response
    const parsed = this.parseResponse(response.content, file, partialResult);

    return {
      ...parsed,
      usage: response.usage,
    };
  }

  private buildPrompt(
    file: SourceFile,
    partialResult: ExtractionResult,
    schemas: Schema[]
  ): string {
    // Truncate code if too long (keep first 500 lines)
    const codeSnippet = file.content.split('\n').slice(0, 500).join('\n');

    // Format partial extraction
    const partialExtraction = JSON.stringify(
      {
        nodes: partialResult.nodes.map((n) => ({
          type: n.type,
          name: n.name,
          properties: n.properties,
        })),
        edges: partialResult.edges.map((e) => ({
          type: e.type,
          from: e.from_id,
          to: e.to_id,
        })),
      },
      null,
      2
    );

    // Extract schema hints
    const schemaHints = schemas
      .map((s) => `- ${s.name}: ${s.description || 'No description'}`)
      .join('\n');

    // Framework hints from schemas
    const frameworkHints = schemas
      .filter((s) => s.ai_hints?.disambiguation)
      .flatMap((s) => s.ai_hints!.disambiguation!)
      .join('\n');

    return TIER2_PROMPT_TEMPLATE
      .replace('{{language}}', file.language)
      .replace('{{framework_hints}}', frameworkHints || 'None detected')
      .replace('{{partial_extraction}}', partialExtraction)
      .replace('{{schema_hints}}', schemaHints || 'None')
      .replace('{{code_snippet}}', codeSnippet);
  }

  private parseResponse(
    content: string,
    file: SourceFile,
    partialResult: ExtractionResult
  ): Omit<EnhancementResult, 'usage'> {
    try {
      // Extract XML content
      const extractionMatch = content.match(/<extraction>([\s\S]*?)<\/extraction>/);
      if (!extractionMatch) {
        return {
          enhancedNodes: partialResult.nodes,
          enhancedEdges: partialResult.edges,
          corrections: [],
          confidence: partialResult.confidence,
        };
      }

      const xml = extractionMatch[1];
      const enhancedNodes: MeshNode[] = [];
      const enhancedEdges: MeshEdge[] = [];
      const corrections: EnhancementResult['corrections'] = [];

      // Parse nodes
      const nodeMatches = xml.matchAll(
        /<node>\s*<type>([^<]+)<\/type>\s*<name>([^<]+)<\/name>\s*<properties>([\s\S]*?)<\/properties>\s*<confidence>([^<]+)<\/confidence>\s*<\/node>/g
      );

      for (const match of nodeMatches) {
        const [, type, name, propsXml, confidence] = match;
        const properties: Record<string, unknown> = {};

        // Parse properties
        const propMatches = propsXml.matchAll(
          /<property key="([^"]+)">([^<]*)<\/property>/g
        );
        for (const propMatch of propMatches) {
          properties[propMatch[1]] = propMatch[2];
        }

        enhancedNodes.push({
          id: `${file.relativePath}:${name}`,
          type,
          name,
          properties,
          source: {
            file: file.relativePath,
            line_start: 0, // Would need line info from AI
            line_end: 0,
          },
          project_id: '', // Set by caller
          extraction: {
            tier: 2,
            confidence: parseFloat(confidence) || 0.7,
            extracted_at: new Date().toISOString(),
          },
        });
      }

      // Parse corrections
      const correctionMatches = xml.matchAll(
        /<correction>\s*<original_id>([^<]+)<\/original_id>\s*<field>([^<]+)<\/field>\s*<old_value>([^<]*)<\/old_value>\s*<new_value>([^<]+)<\/new_value>\s*<\/correction>/g
      );

      for (const match of correctionMatches) {
        corrections.push({
          nodeId: match[1],
          field: match[2],
          oldValue: match[3],
          newValue: match[4],
        });
      }

      // Merge with partial results (add new, don't duplicate)
      const existingNames = new Set(partialResult.nodes.map((n) => n.name));
      const newNodes = enhancedNodes.filter((n) => !existingNames.has(n.name));

      return {
        enhancedNodes: [...partialResult.nodes, ...newNodes],
        enhancedEdges: [...partialResult.edges, ...enhancedEdges],
        corrections,
        confidence: 0.85, // Tier 2 typically improves confidence
      };
    } catch (error) {
      console.error('Failed to parse Tier 2 response:', error);
      return {
        enhancedNodes: partialResult.nodes,
        enhancedEdges: partialResult.edges,
        corrections: [],
        confidence: partialResult.confidence,
      };
    }
  }
}
```

#### Day 5-7: Tier 3 Discoverer

**File:** `src/mesh-builder/src/ai/Tier3Discoverer.ts`

```typescript
import { AIClient, AIResponse } from './AIClient';
import { SourceFile, MeshNode, MeshEdge } from '../types';

const TIER3_DISCOVERY_PROMPT = `You are an expert code analyzer. Analyze this code file and extract ALL structural elements.

## Source File
Path: {{file_path}}
Language: {{language}}

## Code
\`\`\`{{language}}
{{code}}
\`\`\`

## Task
Analyze this code and identify:
1. **Functions/Methods**: All function definitions with their signatures
2. **Classes/Types**: All class or type definitions
3. **API Endpoints**: Any HTTP route handlers or API definitions
4. **Data Models**: Database models, schemas, or DTOs
5. **Dependencies**: Imports, requires, or dependency injections
6. **Queue/Message Handlers**: Any message queue producers or consumers
7. **External Service Calls**: HTTP clients, database queries, API calls

For each element, provide:
- Type classification
- Name/identifier
- Key properties (signature, decorators, annotations)
- Relationships to other elements

## Output Format (XML)
<discovery>
  <framework_detected>
    <name>framework_name</name>
    <confidence>0.0-1.0</confidence>
    <evidence>why you think this</evidence>
  </framework_detected>

  <nodes>
    <node>
      <type>Function|Class|ApiEndpoint|DataModel|Import|QueueProducer|QueueConsumer|ServiceCall</type>
      <name>identifier</name>
      <line_start>number</line_start>
      <line_end>number</line_end>
      <properties>
        <property key="key">value</property>
      </properties>
      <confidence>0.0-1.0</confidence>
      <reasoning>why this was identified</reasoning>
    </node>
  </nodes>

  <edges>
    <edge>
      <from>source_name</from>
      <to>target_name</to>
      <type>CALLS|IMPORTS|RETURNS|PRODUCES|CONSUMES|QUERIES</type>
      <confidence>0.0-1.0</confidence>
    </edge>
  </edges>

  <suggested_patterns>
    <pattern>
      <description>A pattern you noticed that could be reused</description>
      <regex>suggested regex pattern</regex>
      <node_type>what type of node it extracts</node_type>
    </pattern>
  </suggested_patterns>
</discovery>`;

export interface DiscoveryResult {
  nodes: MeshNode[];
  edges: MeshEdge[];
  frameworkDetected?: {
    name: string;
    confidence: number;
    evidence: string;
  };
  suggestedPatterns: Array<{
    description: string;
    regex: string;
    nodeType: string;
  }>;
  confidence: number;
  usage: AIResponse['usage'];
}

export class Tier3Discoverer {
  private client: AIClient;

  constructor(apiKey?: string) {
    this.client = new AIClient({
      apiKey,
      model: 'llama-3.1-70b-versatile', // Larger model for complex reasoning
      maxTokens: 8192,
      temperature: 0.3,
    });
  }

  async discover(file: SourceFile, projectId: string): Promise<DiscoveryResult> {
    // Build discovery prompt
    const prompt = this.buildPrompt(file);

    // Get AI response
    const response = await this.client.complete(prompt);

    // Parse response
    const parsed = this.parseResponse(response.content, file, projectId);

    return {
      ...parsed,
      usage: response.usage,
    };
  }

  private buildPrompt(file: SourceFile): string {
    // Truncate very long files
    const maxLines = 800;
    const lines = file.content.split('\n');
    const truncated = lines.length > maxLines;
    const code = lines.slice(0, maxLines).join('\n');

    let prompt = TIER3_DISCOVERY_PROMPT
      .replace('{{file_path}}', file.relativePath)
      .replace(/\{\{language\}\}/g, file.language)
      .replace('{{code}}', code);

    if (truncated) {
      prompt += `\n\nNOTE: File was truncated from ${lines.length} to ${maxLines} lines.`;
    }

    return prompt;
  }

  private parseResponse(
    content: string,
    file: SourceFile,
    projectId: string
  ): Omit<DiscoveryResult, 'usage'> {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];
    const suggestedPatterns: DiscoveryResult['suggestedPatterns'] = [];
    let frameworkDetected: DiscoveryResult['frameworkDetected'];

    try {
      // Extract discovery block
      const discoveryMatch = content.match(/<discovery>([\s\S]*?)<\/discovery>/);
      if (!discoveryMatch) {
        console.warn('No discovery block found in Tier 3 response');
        return { nodes, edges, suggestedPatterns, confidence: 0.3 };
      }

      const xml = discoveryMatch[1];

      // Parse framework detection
      const frameworkMatch = xml.match(
        /<framework_detected>\s*<name>([^<]+)<\/name>\s*<confidence>([^<]+)<\/confidence>\s*<evidence>([^<]*)<\/evidence>\s*<\/framework_detected>/
      );
      if (frameworkMatch) {
        frameworkDetected = {
          name: frameworkMatch[1].trim(),
          confidence: parseFloat(frameworkMatch[2]),
          evidence: frameworkMatch[3].trim(),
        };
      }

      // Parse nodes
      const nodeMatches = xml.matchAll(
        /<node>\s*<type>([^<]+)<\/type>\s*<name>([^<]+)<\/name>\s*<line_start>([^<]+)<\/line_start>\s*<line_end>([^<]+)<\/line_end>\s*<properties>([\s\S]*?)<\/properties>\s*<confidence>([^<]+)<\/confidence>[\s\S]*?<\/node>/g
      );

      for (const match of nodeMatches) {
        const [, type, name, lineStart, lineEnd, propsXml, confidence] = match;
        const properties: Record<string, unknown> = {};

        // Parse properties
        const propMatches = propsXml.matchAll(
          /<property key="([^"]+)">([^<]*)<\/property>/g
        );
        for (const propMatch of propMatches) {
          properties[propMatch[1]] = propMatch[2];
        }

        nodes.push({
          id: `${file.relativePath}:${name}:${lineStart}`,
          type: type.trim(),
          name: name.trim(),
          properties,
          source: {
            file: file.relativePath,
            line_start: parseInt(lineStart, 10) || 0,
            line_end: parseInt(lineEnd, 10) || 0,
          },
          project_id: projectId,
          extraction: {
            tier: 3,
            confidence: parseFloat(confidence) || 0.6,
            extracted_at: new Date().toISOString(),
            ai_discovered: true,
          },
        });
      }

      // Parse edges
      const edgeMatches = xml.matchAll(
        /<edge>\s*<from>([^<]+)<\/from>\s*<to>([^<]+)<\/to>\s*<type>([^<]+)<\/type>\s*<confidence>([^<]+)<\/confidence>\s*<\/edge>/g
      );

      for (const match of edgeMatches) {
        const [, from, to, type, confidence] = match;
        edges.push({
          id: `${from}-${type}-${to}`,
          from_id: from.trim(),
          to_id: to.trim(),
          type: type.trim(),
          properties: {},
          extraction: {
            tier: 3,
            confidence: parseFloat(confidence) || 0.5,
            extracted_at: new Date().toISOString(),
          },
        });
      }

      // Parse suggested patterns
      const patternMatches = xml.matchAll(
        /<pattern>\s*<description>([^<]+)<\/description>\s*<regex>([^<]+)<\/regex>\s*<node_type>([^<]+)<\/node_type>\s*<\/pattern>/g
      );

      for (const match of patternMatches) {
        suggestedPatterns.push({
          description: match[1].trim(),
          regex: match[2].trim(),
          nodeType: match[3].trim(),
        });
      }

      // Calculate overall confidence
      const avgConfidence =
        nodes.length > 0
          ? nodes.reduce((sum, n) => sum + n.extraction.confidence, 0) / nodes.length
          : 0.5;

      return {
        nodes,
        edges,
        frameworkDetected,
        suggestedPatterns,
        confidence: avgConfidence,
      };
    } catch (error) {
      console.error('Failed to parse Tier 3 response:', error);
      return { nodes, edges, suggestedPatterns, confidence: 0.3 };
    }
  }
}
```

#### Day 8-10: Schema Generator (Self-Learning)

**File:** `src/mesh-builder/src/ai/SchemaGenerator.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIClient, AIResponse } from './AIClient';
import { DiscoveryResult } from './Tier3Discoverer';
import { Schema, SourceFile } from '../types';

const SCHEMA_GENERATION_PROMPT = `You are a schema generator for a code extraction system. Based on the AI-discovered patterns, generate a JSON schema that can extract similar patterns in the future using regex.

## Discovery Results
Framework: {{framework_name}}
Confidence: {{framework_confidence}}

## Discovered Nodes
{{discovered_nodes}}

## Suggested Patterns from Discovery
{{suggested_patterns}}

## Sample Code
\`\`\`{{language}}
{{sample_code}}
\`\`\`

## Task
Generate a JSON schema following this exact format:

{
  "$schema": "https://draagon-forge.dev/schema/extractor/v1.json",
  "name": "schema_name",
  "version": "1.0.0",
  "language": "language",
  "description": "Description of what this schema extracts",
  "detection": {
    "imports": ["list", "of", "imports", "that", "indicate", "this", "framework"],
    "files": ["*.py", "patterns"],
    "confidence_boost": 0.3
  },
  "extractors": {
    "extractor_name": {
      "description": "What this extracts",
      "patterns": [
        {
          "name": "pattern_name",
          "regex": "escaped regex pattern",
          "flags": "gm",
          "captures": {
            "capture_name": { "group": 1 }
          },
          "node_template": {
            "type": "NodeType",
            "name_from": "capture_name",
            "properties": {
              "key": "\${capture_name}"
            }
          }
        }
      ]
    }
  },
  "ai_hints": {
    "disambiguation": ["hints for AI when patterns are ambiguous"]
  }
}

IMPORTANT:
- The regex patterns MUST be valid JavaScript regex
- Escape backslashes properly (use \\\\ for a single backslash)
- Test patterns against the sample code mentally
- Include multiple patterns if needed for variations
- Only include high-confidence patterns (>0.7)

Output ONLY the JSON schema, no other text.`;

export interface GeneratedSchema {
  schema: Schema;
  validationResult: {
    valid: boolean;
    matchCount: number;
    errors: string[];
  };
  usage: AIResponse['usage'];
}

export class SchemaGenerator {
  private client: AIClient;
  private customSchemaDir: string;

  constructor(customSchemaDir: string, apiKey?: string) {
    this.customSchemaDir = customSchemaDir;
    this.client = new AIClient({
      apiKey,
      model: 'llama-3.1-70b-versatile',
      maxTokens: 4096,
      temperature: 0.2,
    });
  }

  async generateSchema(
    discovery: DiscoveryResult,
    sampleFile: SourceFile
  ): Promise<GeneratedSchema | null> {
    // Skip if no framework detected or low confidence
    if (!discovery.frameworkDetected || discovery.frameworkDetected.confidence < 0.6) {
      console.log('Skipping schema generation: no framework detected with sufficient confidence');
      return null;
    }

    // Build prompt
    const prompt = this.buildPrompt(discovery, sampleFile);

    // Get AI response
    const response = await this.client.complete(prompt);

    // Parse and validate schema
    const schema = this.parseSchema(response.content, discovery.frameworkDetected.name);
    if (!schema) {
      return null;
    }

    // Validate against sample file
    const validationResult = this.validateSchema(schema, sampleFile);

    return {
      schema,
      validationResult,
      usage: response.usage,
    };
  }

  async saveSchema(schema: Schema): Promise<string> {
    const filename = `${schema.name}.json`;
    const filepath = path.join(this.customSchemaDir, 'learned', filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });

    // Save schema
    await fs.writeFile(filepath, JSON.stringify(schema, null, 2));

    console.log(`Saved learned schema to ${filepath}`);
    return filepath;
  }

  private buildPrompt(discovery: DiscoveryResult, sampleFile: SourceFile): string {
    // Format discovered nodes
    const discoveredNodes = discovery.nodes
      .filter((n) => n.extraction.confidence > 0.6)
      .map((n) => `- ${n.type}: ${n.name} (confidence: ${n.extraction.confidence})`)
      .join('\n');

    // Format suggested patterns
    const suggestedPatterns = discovery.suggestedPatterns
      .map((p) => `- ${p.nodeType}: ${p.description}\n  Regex: ${p.regex}`)
      .join('\n');

    // Truncate sample code
    const sampleCode = sampleFile.content.split('\n').slice(0, 200).join('\n');

    return SCHEMA_GENERATION_PROMPT
      .replace('{{framework_name}}', discovery.frameworkDetected?.name || 'unknown')
      .replace(
        '{{framework_confidence}}',
        String(discovery.frameworkDetected?.confidence || 0)
      )
      .replace('{{discovered_nodes}}', discoveredNodes || 'None')
      .replace('{{suggested_patterns}}', suggestedPatterns || 'None')
      .replace(/\{\{language\}\}/g, sampleFile.language)
      .replace('{{sample_code}}', sampleCode);
  }

  private parseSchema(content: string, frameworkName: string): Schema | null {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in schema generation response');
        return null;
      }

      const schema = JSON.parse(jsonMatch[0]) as Schema;

      // Validate required fields
      if (!schema.name || !schema.language || !schema.extractors) {
        console.error('Schema missing required fields');
        return null;
      }

      // Add metadata
      schema.name = schema.name || frameworkName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      schema.version = schema.version || '1.0.0';
      schema.$schema = schema.$schema || 'https://draagon-forge.dev/schema/extractor/v1.json';

      return schema;
    } catch (error) {
      console.error('Failed to parse generated schema:', error);
      return null;
    }
  }

  private validateSchema(
    schema: Schema,
    sampleFile: SourceFile
  ): GeneratedSchema['validationResult'] {
    const errors: string[] = [];
    let matchCount = 0;

    // Test each extractor pattern against the sample file
    for (const [extractorName, extractor] of Object.entries(schema.extractors || {})) {
      for (const pattern of extractor.patterns || []) {
        try {
          const regex = new RegExp(pattern.regex, pattern.flags || 'gm');
          const matches = [...sampleFile.content.matchAll(regex)];
          matchCount += matches.length;

          if (matches.length === 0) {
            errors.push(`Pattern ${extractorName}/${pattern.name} has no matches`);
          }
        } catch (error) {
          errors.push(
            `Invalid regex in ${extractorName}/${pattern.name}: ${(error as Error).message}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0 && matchCount > 0,
      matchCount,
      errors,
    };
  }
}
```

**File:** `src/mesh-builder/src/ai/SelfLearningPipeline.ts`

```typescript
import { Tier3Discoverer, DiscoveryResult } from './Tier3Discoverer';
import { SchemaGenerator, GeneratedSchema } from './SchemaGenerator';
import { SchemaRegistry } from '../core/SchemaRegistry';
import { SourceFile } from '../types';

export interface LearningResult {
  file: string;
  discovery: DiscoveryResult;
  generatedSchema?: GeneratedSchema;
  schemaSaved: boolean;
  totalCost: {
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  };
}

export class SelfLearningPipeline {
  private discoverer: Tier3Discoverer;
  private generator: SchemaGenerator;
  private registry: SchemaRegistry;

  // Pricing per 1M tokens (Groq as of 2024)
  private readonly PRICING = {
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
  };

  constructor(schemaDir: string, apiKey?: string) {
    this.discoverer = new Tier3Discoverer(apiKey);
    this.generator = new SchemaGenerator(`${schemaDir}/custom`, apiKey);
    this.registry = new SchemaRegistry(schemaDir);
  }

  async learnFromFile(
    file: SourceFile,
    projectId: string,
    options: { saveSchema?: boolean } = {}
  ): Promise<LearningResult> {
    const result: LearningResult = {
      file: file.relativePath,
      discovery: {
        nodes: [],
        edges: [],
        suggestedPatterns: [],
        confidence: 0,
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      },
      schemaSaved: false,
      totalCost: {
        promptTokens: 0,
        completionTokens: 0,
        estimatedCostUsd: 0,
      },
    };

    // Step 1: Discover patterns with Tier 3
    console.log(`[Learning] Discovering patterns in ${file.relativePath}...`);
    result.discovery = await this.discoverer.discover(file, projectId);

    result.totalCost.promptTokens += result.discovery.usage.prompt_tokens;
    result.totalCost.completionTokens += result.discovery.usage.completion_tokens;

    console.log(
      `[Learning] Found ${result.discovery.nodes.length} nodes, ` +
        `${result.discovery.suggestedPatterns.length} suggested patterns`
    );

    // Step 2: Generate schema if framework detected
    if (
      result.discovery.frameworkDetected &&
      result.discovery.frameworkDetected.confidence >= 0.6
    ) {
      console.log(
        `[Learning] Generating schema for ${result.discovery.frameworkDetected.name}...`
      );

      const generated = await this.generator.generateSchema(result.discovery, file);
      if (generated) {
        result.generatedSchema = generated;
        result.totalCost.promptTokens += generated.usage.prompt_tokens;
        result.totalCost.completionTokens += generated.usage.completion_tokens;

        // Step 3: Save schema if valid and requested
        if (generated.validationResult.valid && options.saveSchema) {
          await this.generator.saveSchema(generated.schema);
          await this.registry.addSchema(generated.schema, true);
          result.schemaSaved = true;
          console.log(`[Learning] Schema saved: ${generated.schema.name}`);
        } else if (!generated.validationResult.valid) {
          console.log(
            `[Learning] Schema validation failed: ${generated.validationResult.errors.join(', ')}`
          );
        }
      }
    }

    // Calculate estimated cost
    result.totalCost.estimatedCostUsd = this.estimateCost(
      result.totalCost.promptTokens,
      result.totalCost.completionTokens
    );

    return result;
  }

  private estimateCost(promptTokens: number, completionTokens: number): number {
    // Use Tier 3 model pricing (most expensive case)
    const pricing = this.PRICING['llama-3.1-70b-versatile'];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }
}
```

**Acceptance Criteria for Phase 3:**
- [ ] AIClient connects to Groq API successfully
- [ ] Tier2Enhancer improves low-confidence extractions
- [ ] Tier3Discoverer extracts from unknown frameworks
- [ ] SchemaGenerator creates valid JSON schemas
- [ ] SelfLearningPipeline orchestrates full learning cycle
- [ ] Generated schemas validate against sample files
- [ ] Schemas are persisted to `schemas/custom/learned/` directory
- [ ] Cost tracking reports token usage and estimated USD cost
- [ ] XML parsing handles malformed AI responses gracefully

---

### Phase 4: Project Registry & Auto-Pull (1 week / 5 days)

**Goal:** Multi-repo management with automatic sync.

#### Day 1-2: Project Registry

**File:** `src/draagon_forge/projects/registry.py`

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import json
import os

@dataclass
class ProjectConfig:
    id: str
    name: str
    git_url: str
    branch: str = "main"
    local_path: Optional[str] = None
    include_paths: list[str] = None
    exclude_paths: list[str] = None
    auto_pull_enabled: bool = True
    poll_interval_minutes: int = 5

@dataclass
class Project:
    id: str
    config: ProjectConfig
    status: str  # 'active', 'syncing', 'error'
    last_sync: Optional[datetime] = None
    last_commit: Optional[str] = None
    file_count: int = 0
    node_count: int = 0
    error_message: Optional[str] = None

class ProjectRegistry:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.projects_file = os.path.join(data_dir, "projects.json")
        self.projects: dict[str, Project] = {}
        self._load()

    def _load(self):
        if os.path.exists(self.projects_file):
            with open(self.projects_file) as f:
                data = json.load(f)
                for p in data.get("projects", []):
                    config = ProjectConfig(**p["config"])
                    project = Project(
                        id=p["id"],
                        config=config,
                        status=p.get("status", "active"),
                        last_sync=datetime.fromisoformat(p["last_sync"]) if p.get("last_sync") else None,
                        last_commit=p.get("last_commit"),
                        file_count=p.get("file_count", 0),
                        node_count=p.get("node_count", 0),
                    )
                    self.projects[project.id] = project

    def _save(self):
        data = {
            "projects": [
                {
                    "id": p.id,
                    "config": p.config.__dict__,
                    "status": p.status,
                    "last_sync": p.last_sync.isoformat() if p.last_sync else None,
                    "last_commit": p.last_commit,
                    "file_count": p.file_count,
                    "node_count": p.node_count,
                }
                for p in self.projects.values()
            ]
        }
        os.makedirs(os.path.dirname(self.projects_file), exist_ok=True)
        with open(self.projects_file, "w") as f:
            json.dump(data, f, indent=2)

    async def register_project(self, config: ProjectConfig) -> Project:
        project = Project(
            id=config.id,
            config=config,
            status="active",
        )
        self.projects[config.id] = project
        self._save()
        return project

    def list_projects(self) -> list[Project]:
        return list(self.projects.values())

    def get_project(self, project_id: str) -> Optional[Project]:
        return self.projects.get(project_id)

    async def remove_project(self, project_id: str):
        if project_id in self.projects:
            del self.projects[project_id]
            self._save()
```

#### Day 3-4: Git Sync Manager

**File:** `src/draagon_forge/projects/sync.py`

```python
import subprocess
import asyncio
from pathlib import Path
from dataclasses import dataclass
from .registry import Project, ProjectRegistry

@dataclass
class SyncResult:
    project_id: str
    success: bool
    previous_commit: str
    new_commit: str
    changed_files: list[str]
    extraction_triggered: bool
    error: str | None = None

class SyncManager:
    def __init__(self, registry: ProjectRegistry, clone_dir: str):
        self.registry = registry
        self.clone_dir = clone_dir

    async def sync_project(self, project_id: str) -> SyncResult:
        project = self.registry.get_project(project_id)
        if not project:
            return SyncResult(
                project_id=project_id,
                success=False,
                previous_commit="",
                new_commit="",
                changed_files=[],
                extraction_triggered=False,
                error=f"Project {project_id} not found",
            )

        try:
            local_path = self._get_local_path(project)

            # Clone if not exists
            if not local_path.exists():
                await self._clone(project, local_path)
                return SyncResult(
                    project_id=project_id,
                    success=True,
                    previous_commit="",
                    new_commit=await self._get_head_commit(local_path),
                    changed_files=[],  # All files are new
                    extraction_triggered=True,
                )

            # Get current commit
            previous_commit = await self._get_head_commit(local_path)

            # Pull latest
            await self._pull(local_path, project.config.branch)

            # Get new commit
            new_commit = await self._get_head_commit(local_path)

            # Get changed files
            changed_files = []
            if previous_commit != new_commit:
                changed_files = await self._get_changed_files(
                    local_path, previous_commit, new_commit
                )

            return SyncResult(
                project_id=project_id,
                success=True,
                previous_commit=previous_commit,
                new_commit=new_commit,
                changed_files=changed_files,
                extraction_triggered=len(changed_files) > 0,
            )

        except Exception as e:
            return SyncResult(
                project_id=project_id,
                success=False,
                previous_commit="",
                new_commit="",
                changed_files=[],
                extraction_triggered=False,
                error=str(e),
            )

    async def sync_all(self) -> list[SyncResult]:
        results = []
        for project in self.registry.list_projects():
            result = await self.sync_project(project.id)
            results.append(result)
        return results

    def _get_local_path(self, project: Project) -> Path:
        if project.config.local_path:
            return Path(project.config.local_path)
        return Path(self.clone_dir) / project.id

    async def _clone(self, project: Project, local_path: Path):
        cmd = [
            "git", "clone",
            "--branch", project.config.branch,
            "--depth", "1",
            project.config.git_url,
            str(local_path),
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.wait()
        if process.returncode != 0:
            stderr = await process.stderr.read()
            raise Exception(f"Clone failed: {stderr.decode()}")

    async def _pull(self, local_path: Path, branch: str):
        cmd = ["git", "-C", str(local_path), "pull", "origin", branch]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.wait()

    async def _get_head_commit(self, local_path: Path) -> str:
        cmd = ["git", "-C", str(local_path), "rev-parse", "HEAD"]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        return stdout.decode().strip()

    async def _get_changed_files(
        self, local_path: Path, from_commit: str, to_commit: str
    ) -> list[str]:
        cmd = [
            "git", "-C", str(local_path),
            "diff", "--name-only", from_commit, to_commit,
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        return [f for f in stdout.decode().strip().split("\n") if f]
```

#### Day 5: Webhook Handler

**File:** `src/draagon_forge/projects/webhook.py`

```python
import hmac
import hashlib
from fastapi import Request, HTTPException

class WebhookHandler:
    def __init__(self, sync_manager: SyncManager, registry: ProjectRegistry):
        self.sync_manager = sync_manager
        self.registry = registry

    async def handle_github_webhook(
        self, request: Request, signature: str
    ) -> dict:
        body = await request.body()
        payload = await request.json()

        # Find matching project
        repo_url = payload.get("repository", {}).get("clone_url")
        project = self._find_project_by_url(repo_url)

        if not project:
            raise HTTPException(404, "Project not found for repository")

        # Verify signature
        if project.config.webhook_secret:
            expected = hmac.new(
                project.config.webhook_secret.encode(),
                body,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(f"sha256={expected}", signature):
                raise HTTPException(403, "Invalid signature")

        # Trigger sync
        result = await self.sync_manager.sync_project(project.id)

        return {
            "status": "ok" if result.success else "error",
            "project_id": project.id,
            "changed_files": len(result.changed_files),
        }

    def _find_project_by_url(self, url: str) -> Project | None:
        for project in self.registry.list_projects():
            if project.config.git_url == url:
                return project
        return None
```

---

### Phase 5: Cross-Project Linking (2 weeks / 10 days)

**Goal:** Detect and link relationships across repositories.

#### Day 1-3: Reference Collector

**File:** `src/mesh-builder/src/linking/ReferenceCollector.ts`

```typescript
import { MeshNode, MeshEdge, ProjectExtractionResult } from '../types';

export type ReferenceType =
  | 'queue'
  | 'api_call'
  | 'database'
  | 'env_var'
  | 'shared_library';

export interface ExternalReference {
  id: string;
  type: ReferenceType;
  projectId: string;
  sourceNode: MeshNode;

  // The raw reference value (might be env var, literal, or config key)
  rawValue: string;

  // Resolved value (after env/config resolution)
  resolvedValue?: string;

  // Additional context
  context: {
    service?: string;          // SQS, Kafka, HTTP, PostgreSQL, etc.
    operation?: string;        // publish, subscribe, get, post, query, etc.
    configPath?: string;       // Where the value was resolved from
  };

  confidence: number;
}

export interface CollectionResult {
  references: ExternalReference[];
  unresolvedEnvVars: string[];
}

export class ReferenceCollector {
  /**
   * Collect all external references from extraction results
   */
  collectFromProject(extraction: ProjectExtractionResult): CollectionResult {
    const references: ExternalReference[] = [];
    const unresolvedEnvVars = new Set<string>();

    for (const fileResult of extraction.results) {
      for (const node of fileResult.nodes) {
        // Collect queue references
        if (node.type === 'QueueProducer' || node.type === 'QueueConsumer') {
          const ref = this.collectQueueReference(node, extraction.project_id);
          references.push(ref);

          // Track unresolved env vars
          if (ref.rawValue.includes('process.env.') || ref.rawValue.includes('os.environ')) {
            unresolvedEnvVars.add(this.extractEnvVarName(ref.rawValue));
          }
        }

        // Collect API client calls
        if (node.type === 'ServiceCall' || node.type === 'HttpClient') {
          const ref = this.collectApiReference(node, extraction.project_id);
          references.push(ref);
        }

        // Collect database references
        if (node.type === 'DatabaseConnection' || node.type === 'DatabaseTable') {
          const ref = this.collectDatabaseReference(node, extraction.project_id);
          references.push(ref);
        }
      }
    }

    return {
      references,
      unresolvedEnvVars: [...unresolvedEnvVars],
    };
  }

  private collectQueueReference(
    node: MeshNode,
    projectId: string
  ): ExternalReference {
    const service = (node.properties.service as string) || 'unknown';
    const isProducer = node.type === 'QueueProducer';

    return {
      id: `ref:${node.id}`,
      type: 'queue',
      projectId,
      sourceNode: node,
      rawValue: (node.properties.queue_url as string) ||
                (node.properties.topic as string) ||
                node.name,
      context: {
        service,
        operation: isProducer ? 'publish' : 'subscribe',
      },
      confidence: node.extraction.confidence,
    };
  }

  private collectApiReference(
    node: MeshNode,
    projectId: string
  ): ExternalReference {
    return {
      id: `ref:${node.id}`,
      type: 'api_call',
      projectId,
      sourceNode: node,
      rawValue: (node.properties.url as string) ||
                (node.properties.endpoint as string) ||
                node.name,
      context: {
        service: 'http',
        operation: (node.properties.method as string)?.toLowerCase() || 'get',
      },
      confidence: node.extraction.confidence,
    };
  }

  private collectDatabaseReference(
    node: MeshNode,
    projectId: string
  ): ExternalReference {
    return {
      id: `ref:${node.id}`,
      type: 'database',
      projectId,
      sourceNode: node,
      rawValue: (node.properties.connection_string as string) ||
                (node.properties.database as string) ||
                (node.properties.table_name as string) ||
                node.name,
      context: {
        service: (node.properties.orm as string) || 'sql',
        operation: 'query',
      },
      confidence: node.extraction.confidence,
    };
  }

  private extractEnvVarName(rawValue: string): string {
    // Extract env var name from process.env.VAR or os.environ['VAR']
    const processEnvMatch = rawValue.match(/process\.env\.(\w+)/);
    if (processEnvMatch) return processEnvMatch[1];

    const osEnvironMatch = rawValue.match(/os\.environ\[['"](\w+)['"]\]/);
    if (osEnvironMatch) return osEnvironMatch[1];

    const osGetenvMatch = rawValue.match(/os\.getenv\(['"](\\w+)['"]\)/);
    if (osGetenvMatch) return osGetenvMatch[1];

    return rawValue;
  }
}
```

#### Day 4-6: Config Resolution

**File:** `src/mesh-builder/src/linking/ConfigResolver.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';
import { ExternalReference } from './ReferenceCollector';

export interface ResolvedConfig {
  key: string;
  value: string;
  source: string;  // Which file it came from
  type: 'env' | 'docker-compose' | 'terraform' | 'kubernetes' | 'hardcoded';
}

export class ConfigResolver {
  private configCache: Map<string, ResolvedConfig[]> = new Map();

  /**
   * Load all configuration sources for a project
   */
  async loadProjectConfigs(projectPath: string): Promise<void> {
    const configs: ResolvedConfig[] = [];

    // Load .env files
    const envConfigs = await this.loadEnvFiles(projectPath);
    configs.push(...envConfigs);

    // Load docker-compose.yml
    const dockerConfigs = await this.loadDockerCompose(projectPath);
    configs.push(...dockerConfigs);

    // Load terraform files
    const terraformConfigs = await this.loadTerraform(projectPath);
    configs.push(...terraformConfigs);

    // Load kubernetes manifests
    const k8sConfigs = await this.loadKubernetes(projectPath);
    configs.push(...k8sConfigs);

    this.configCache.set(projectPath, configs);
  }

  /**
   * Resolve a reference value using loaded configs
   */
  resolveReference(
    reference: ExternalReference,
    projectPath: string
  ): ExternalReference {
    const configs = this.configCache.get(projectPath) || [];

    // Try to find env var match
    const envVarName = this.extractEnvVarName(reference.rawValue);
    if (envVarName) {
      const config = configs.find((c) => c.key === envVarName);
      if (config) {
        return {
          ...reference,
          resolvedValue: config.value,
          context: {
            ...reference.context,
            configPath: config.source,
          },
          confidence: Math.min(reference.confidence + 0.1, 1.0),
        };
      }
    }

    return reference;
  }

  private async loadEnvFiles(projectPath: string): Promise<ResolvedConfig[]> {
    const configs: ResolvedConfig[] = [];
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];

    for (const envFile of envFiles) {
      const envPath = path.join(projectPath, envFile);
      try {
        const content = await fs.readFile(envPath, 'utf-8');
        const parsed = dotenv.parse(content);

        for (const [key, value] of Object.entries(parsed)) {
          configs.push({
            key,
            value,
            source: envPath,
            type: 'env',
          });
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    return configs;
  }

  private async loadDockerCompose(projectPath: string): Promise<ResolvedConfig[]> {
    const configs: ResolvedConfig[] = [];
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml'];

    for (const composeFile of composeFiles) {
      const composePath = path.join(projectPath, composeFile);
      try {
        const content = await fs.readFile(composePath, 'utf-8');
        const parsed = yaml.parse(content);

        // Extract environment variables from services
        for (const [serviceName, service] of Object.entries(parsed.services || {})) {
          const svc = service as Record<string, unknown>;
          const environment = (svc.environment as Record<string, string>) || {};

          for (const [key, value] of Object.entries(environment)) {
            if (typeof value === 'string' && !value.startsWith('${')) {
              configs.push({
                key,
                value,
                source: `${composePath}:services.${serviceName}`,
                type: 'docker-compose',
              });
            }
          }
        }
      } catch {
        // File doesn't exist or invalid, skip
      }
    }

    return configs;
  }

  private async loadTerraform(projectPath: string): Promise<ResolvedConfig[]> {
    const configs: ResolvedConfig[] = [];

    try {
      // Look for terraform files
      const tfFiles = await this.findFiles(projectPath, '*.tf');

      for (const tfFile of tfFiles) {
        const content = await fs.readFile(tfFile, 'utf-8');

        // Extract variable defaults and locals
        // Simple regex extraction (full HCL parsing would be better)
        const variableMatches = content.matchAll(
          /variable\s+"(\w+)"\s*\{[^}]*default\s*=\s*"([^"]+)"/g
        );
        for (const match of variableMatches) {
          configs.push({
            key: match[1],
            value: match[2],
            source: tfFile,
            type: 'terraform',
          });
        }

        // Extract locals
        const localsMatch = content.match(/locals\s*\{([^}]+)\}/s);
        if (localsMatch) {
          const localMatches = localsMatch[1].matchAll(/(\w+)\s*=\s*"([^"]+)"/g);
          for (const match of localMatches) {
            configs.push({
              key: match[1],
              value: match[2],
              source: tfFile,
              type: 'terraform',
            });
          }
        }
      }
    } catch {
      // No terraform files or error reading
    }

    return configs;
  }

  private async loadKubernetes(projectPath: string): Promise<ResolvedConfig[]> {
    const configs: ResolvedConfig[] = [];

    try {
      // Look for k8s manifests
      const k8sPatterns = ['k8s/**/*.yaml', 'k8s/**/*.yml', 'kubernetes/**/*.yaml'];

      for (const pattern of k8sPatterns) {
        const files = await this.findFiles(projectPath, pattern);

        for (const file of files) {
          const content = await fs.readFile(file, 'utf-8');
          const docs = yaml.parseAllDocuments(content);

          for (const doc of docs) {
            const obj = doc.toJS();
            if (obj?.kind === 'ConfigMap' && obj?.data) {
              for (const [key, value] of Object.entries(obj.data)) {
                configs.push({
                  key,
                  value: value as string,
                  source: `${file}:${obj.metadata?.name || 'unnamed'}`,
                  type: 'kubernetes',
                });
              }
            }

            // Extract from env in Deployment
            if (obj?.kind === 'Deployment' && obj?.spec?.template?.spec?.containers) {
              for (const container of obj.spec.template.spec.containers) {
                for (const envVar of container.env || []) {
                  if (envVar.value) {
                    configs.push({
                      key: envVar.name,
                      value: envVar.value,
                      source: `${file}:${obj.metadata?.name || 'unnamed'}`,
                      type: 'kubernetes',
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // No k8s files or error reading
    }

    return configs;
  }

  private extractEnvVarName(rawValue: string): string | null {
    const patterns = [
      /process\.env\.(\w+)/,
      /os\.environ\[['"](\w+)['"]\]/,
      /os\.getenv\(['"](\w+)['"]\)/,
      /\$\{(\w+)\}/,
      /\$(\w+)/,
    ];

    for (const pattern of patterns) {
      const match = rawValue.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  private async findFiles(dir: string, pattern: string): Promise<string[]> {
    const { glob } = await import('glob');
    return glob(pattern, { cwd: dir, absolute: true });
  }
}
```

#### Day 7-8: AI-Assisted Matching

**File:** `src/mesh-builder/src/linking/CrossProjectMatcher.ts`

```typescript
import { AIClient } from '../ai/AIClient';
import { ExternalReference } from './ReferenceCollector';

export interface CrossProjectLink {
  id: string;
  sourceRef: ExternalReference;
  targetRef: ExternalReference;
  linkType: 'PUBLISHES_TO' | 'SUBSCRIBES_TO' | 'CALLS_SERVICE' | 'SHARES_DATABASE';
  confidence: number;
  matchReason: string;
}

export interface MatchingResult {
  links: CrossProjectLink[];
  unmatchedRefs: ExternalReference[];
  aiAssisted: boolean;
}

const MATCHING_PROMPT = `You are a microservice architecture analyzer. Given the following external references from different projects, identify which ones connect to each other.

## References from Project: {{project_a}}
{{refs_a}}

## References from Project: {{project_b}}
{{refs_b}}

## Task
Identify pairs of references that represent connections between services:
- A QueueProducer in one project connecting to a QueueConsumer in another
- An API endpoint in one project being called by an HTTP client in another
- Shared database tables across projects

For each match, explain why you believe they connect.

## Output Format (XML)
<matches>
  <match>
    <source_id>reference_id_from_project_a</source_id>
    <target_id>reference_id_from_project_b</target_id>
    <link_type>PUBLISHES_TO|SUBSCRIBES_TO|CALLS_SERVICE|SHARES_DATABASE</link_type>
    <confidence>0.0-1.0</confidence>
    <reason>Why these connect</reason>
  </match>
</matches>

If no matches found, return empty <matches></matches>.`;

export class CrossProjectMatcher {
  private aiClient: AIClient;

  constructor(apiKey?: string) {
    this.aiClient = new AIClient({
      apiKey,
      model: 'llama-3.1-70b-versatile',
      maxTokens: 4096,
      temperature: 0.2,
    });
  }

  /**
   * Match references across two projects
   */
  async matchProjects(
    projectA: { id: string; refs: ExternalReference[] },
    projectB: { id: string; refs: ExternalReference[] }
  ): Promise<MatchingResult> {
    const links: CrossProjectLink[] = [];
    const matchedIds = new Set<string>();

    // Step 1: Static matching (exact value matches)
    const staticLinks = this.staticMatch(projectA.refs, projectB.refs);
    links.push(...staticLinks);

    for (const link of staticLinks) {
      matchedIds.add(link.sourceRef.id);
      matchedIds.add(link.targetRef.id);
    }

    // Step 2: AI-assisted matching for remaining references
    const unmatchedA = projectA.refs.filter((r) => !matchedIds.has(r.id));
    const unmatchedB = projectB.refs.filter((r) => !matchedIds.has(r.id));

    if (unmatchedA.length > 0 && unmatchedB.length > 0) {
      const aiLinks = await this.aiMatch(
        { id: projectA.id, refs: unmatchedA },
        { id: projectB.id, refs: unmatchedB }
      );
      links.push(...aiLinks);

      for (const link of aiLinks) {
        matchedIds.add(link.sourceRef.id);
        matchedIds.add(link.targetRef.id);
      }
    }

    // Collect truly unmatched references
    const allRefs = [...projectA.refs, ...projectB.refs];
    const unmatchedRefs = allRefs.filter((r) => !matchedIds.has(r.id));

    return {
      links,
      unmatchedRefs,
      aiAssisted: links.some((l) => l.matchReason.startsWith('[AI]')),
    };
  }

  /**
   * Static matching based on resolved values
   */
  private staticMatch(
    refsA: ExternalReference[],
    refsB: ExternalReference[]
  ): CrossProjectLink[] {
    const links: CrossProjectLink[] = [];

    for (const refA of refsA) {
      const valueA = refA.resolvedValue || refA.rawValue;

      for (const refB of refsB) {
        const valueB = refB.resolvedValue || refB.rawValue;

        // Queue matching: producer -> consumer
        if (refA.type === 'queue' && refB.type === 'queue') {
          if (this.valuesMatch(valueA, valueB)) {
            const isProducerA = refA.context.operation === 'publish';
            const isProducerB = refB.context.operation === 'publish';

            if (isProducerA !== isProducerB) {
              links.push({
                id: `link:${refA.id}:${refB.id}`,
                sourceRef: isProducerA ? refA : refB,
                targetRef: isProducerA ? refB : refA,
                linkType: 'PUBLISHES_TO',
                confidence: 0.95,
                matchReason: `Queue name match: ${valueA}`,
              });
            }
          }
        }

        // API matching: endpoint -> client
        if (refA.type === 'api_call' && refB.type === 'api_call') {
          // One should be a server endpoint, one a client call
          // This is harder to detect statically, defer to AI
        }

        // Database matching: shared tables
        if (refA.type === 'database' && refB.type === 'database') {
          if (this.valuesMatch(valueA, valueB)) {
            links.push({
              id: `link:${refA.id}:${refB.id}`,
              sourceRef: refA,
              targetRef: refB,
              linkType: 'SHARES_DATABASE',
              confidence: 0.9,
              matchReason: `Database/table name match: ${valueA}`,
            });
          }
        }
      }
    }

    return links;
  }

  /**
   * AI-assisted matching for ambiguous references
   */
  private async aiMatch(
    projectA: { id: string; refs: ExternalReference[] },
    projectB: { id: string; refs: ExternalReference[] }
  ): Promise<CrossProjectLink[]> {
    // Build prompt
    const prompt = this.buildPrompt(projectA, projectB);

    // Get AI response
    const response = await this.aiClient.complete(prompt);

    // Parse response
    return this.parseResponse(response.content, projectA.refs, projectB.refs);
  }

  private buildPrompt(
    projectA: { id: string; refs: ExternalReference[] },
    projectB: { id: string; refs: ExternalReference[] }
  ): string {
    const formatRefs = (refs: ExternalReference[]): string =>
      refs
        .map(
          (r) =>
            `- ID: ${r.id}\n  Type: ${r.type}\n  Value: ${r.resolvedValue || r.rawValue}\n  Service: ${r.context.service}\n  Operation: ${r.context.operation}`
        )
        .join('\n\n');

    return MATCHING_PROMPT
      .replace('{{project_a}}', projectA.id)
      .replace('{{refs_a}}', formatRefs(projectA.refs))
      .replace('{{project_b}}', projectB.id)
      .replace('{{refs_b}}', formatRefs(projectB.refs));
  }

  private parseResponse(
    content: string,
    refsA: ExternalReference[],
    refsB: ExternalReference[]
  ): CrossProjectLink[] {
    const links: CrossProjectLink[] = [];

    try {
      const matchesMatch = content.match(/<matches>([\s\S]*?)<\/matches>/);
      if (!matchesMatch) return links;

      const xml = matchesMatch[1];
      const matchMatches = xml.matchAll(
        /<match>\s*<source_id>([^<]+)<\/source_id>\s*<target_id>([^<]+)<\/target_id>\s*<link_type>([^<]+)<\/link_type>\s*<confidence>([^<]+)<\/confidence>\s*<reason>([^<]*)<\/reason>\s*<\/match>/g
      );

      const allRefs = [...refsA, ...refsB];
      const refMap = new Map(allRefs.map((r) => [r.id, r]));

      for (const match of matchMatches) {
        const [, sourceId, targetId, linkType, confidence, reason] = match;

        const sourceRef = refMap.get(sourceId.trim());
        const targetRef = refMap.get(targetId.trim());

        if (sourceRef && targetRef) {
          links.push({
            id: `link:${sourceId}:${targetId}`,
            sourceRef,
            targetRef,
            linkType: linkType.trim() as CrossProjectLink['linkType'],
            confidence: parseFloat(confidence) || 0.5,
            matchReason: `[AI] ${reason.trim()}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to parse AI matching response:', error);
    }

    return links;
  }

  private valuesMatch(a: string, b: string): boolean {
    // Normalize and compare values
    const normalize = (v: string): string =>
      v.toLowerCase().replace(/[-_]/g, '').replace(/^https?:\/\//, '');

    return normalize(a) === normalize(b);
  }
}
```

#### Day 9-10: Cross-Service Edge Creator

**File:** `src/mesh-builder/src/linking/CrossServiceLinker.ts`

```typescript
import { MeshEdge } from '../types';
import { ReferenceCollector, ExternalReference } from './ReferenceCollector';
import { ConfigResolver } from './ConfigResolver';
import { CrossProjectMatcher, CrossProjectLink, MatchingResult } from './CrossProjectMatcher';

export interface LinkedProject {
  id: string;
  path: string;
  references: ExternalReference[];
}

export interface LinkingResult {
  crossProjectEdges: MeshEdge[];
  summary: {
    totalLinks: number;
    queueLinks: number;
    apiLinks: number;
    databaseLinks: number;
    aiAssistedLinks: number;
    unresolvedReferences: number;
  };
}

export class CrossServiceLinker {
  private collector: ReferenceCollector;
  private resolver: ConfigResolver;
  private matcher: CrossProjectMatcher;

  constructor(apiKey?: string) {
    this.collector = new ReferenceCollector();
    this.resolver = new ConfigResolver();
    this.matcher = new CrossProjectMatcher(apiKey);
  }

  /**
   * Link multiple projects together
   */
  async linkProjects(projects: LinkedProject[]): Promise<LinkingResult> {
    const allEdges: MeshEdge[] = [];
    let totalAiAssisted = 0;
    let totalUnresolved = 0;

    // Load configs for all projects
    for (const project of projects) {
      await this.resolver.loadProjectConfigs(project.path);

      // Resolve all references
      project.references = project.references.map((ref) =>
        this.resolver.resolveReference(ref, project.path)
      );
    }

    // Match each pair of projects
    for (let i = 0; i < projects.length; i++) {
      for (let j = i + 1; j < projects.length; j++) {
        const projectA = projects[i];
        const projectB = projects[j];

        const result = await this.matcher.matchProjects(
          { id: projectA.id, refs: projectA.references },
          { id: projectB.id, refs: projectB.references }
        );

        // Convert links to edges
        for (const link of result.links) {
          const edge = this.linkToEdge(link);
          allEdges.push(edge);
        }

        if (result.aiAssisted) {
          totalAiAssisted += result.links.filter(
            (l) => l.matchReason.startsWith('[AI]')
          ).length;
        }

        totalUnresolved += result.unmatchedRefs.length;
      }
    }

    // Calculate summary
    const queueLinks = allEdges.filter(
      (e) => e.type === 'PUBLISHES_TO' || e.type === 'SUBSCRIBES_TO'
    ).length;
    const apiLinks = allEdges.filter((e) => e.type === 'CALLS_SERVICE').length;
    const databaseLinks = allEdges.filter((e) => e.type === 'SHARES_DATABASE').length;

    return {
      crossProjectEdges: allEdges,
      summary: {
        totalLinks: allEdges.length,
        queueLinks,
        apiLinks,
        databaseLinks,
        aiAssistedLinks: totalAiAssisted,
        unresolvedReferences: totalUnresolved,
      },
    };
  }

  private linkToEdge(link: CrossProjectLink): MeshEdge {
    return {
      id: link.id,
      from_id: link.sourceRef.sourceNode.id,
      to_id: link.targetRef.sourceNode.id,
      type: link.linkType,
      properties: {
        source_project: link.sourceRef.projectId,
        target_project: link.targetRef.projectId,
        source_value: link.sourceRef.resolvedValue || link.sourceRef.rawValue,
        target_value: link.targetRef.resolvedValue || link.targetRef.rawValue,
        match_reason: link.matchReason,
        cross_project: true,
      },
      extraction: {
        tier: link.matchReason.startsWith('[AI]') ? 3 : 1,
        confidence: link.confidence,
        extracted_at: new Date().toISOString(),
      },
    };
  }
}
```

**Acceptance Criteria for Phase 5:**
- [ ] ReferenceCollector extracts queue, API, and database references
- [ ] ConfigResolver loads .env, docker-compose, terraform, and k8s configs
- [ ] Environment variables are resolved to actual values
- [ ] CrossProjectMatcher finds exact matches statically
- [ ] AI matching resolves ambiguous references
- [ ] CrossServiceLinker produces PUBLISHES_TO, CALLS_SERVICE, SHARES_DATABASE edges
- [ ] Cross-project edges include source/target project metadata
- [ ] Summary statistics include AI-assisted and unresolved counts

---

### Phase 6: Python Integration (1 week / 5 days)

**Goal:** Neo4j storage and MCP tools.

#### Day 1-2: Mesh Importer

**File:** `src/draagon_forge/mesh/importer.py`

```python
from neo4j import AsyncGraphDatabase
from typing import Any

class MeshImporter:
    def __init__(self, neo4j_uri: str, neo4j_user: str, neo4j_password: str):
        self.driver = AsyncGraphDatabase.driver(
            neo4j_uri, auth=(neo4j_user, neo4j_password)
        )

    async def import_mesh(
        self, mesh_json: dict, project_id: str
    ) -> dict:
        async with self.driver.session() as session:
            # Clear existing nodes for project
            await session.run(
                "MATCH (n {project_id: $project_id}) DETACH DELETE n",
                project_id=project_id,
            )

            # Import nodes
            nodes_created = 0
            for node in mesh_json.get("nodes", []):
                await session.run(
                    """
                    CREATE (n:MeshNode {
                        id: $id,
                        type: $type,
                        name: $name,
                        project_id: $project_id
                    })
                    SET n += $properties
                    """,
                    id=node["id"],
                    type=node["type"],
                    name=node["name"],
                    project_id=project_id,
                    properties=node.get("properties", {}),
                )
                nodes_created += 1

            # Import edges
            edges_created = 0
            for edge in mesh_json.get("edges", []):
                await session.run(
                    """
                    MATCH (from:MeshNode {id: $from_id})
                    MATCH (to:MeshNode {id: $to_id})
                    CREATE (from)-[r:MESH_EDGE {type: $type}]->(to)
                    SET r += $properties
                    """,
                    from_id=edge["from_id"],
                    to_id=edge["to_id"],
                    type=edge["type"],
                    properties=edge.get("properties", {}),
                )
                edges_created += 1

            return {
                "nodes_created": nodes_created,
                "edges_created": edges_created,
            }

    async def close(self):
        await self.driver.close()
```

#### Day 3-4: MCP Tools

**File:** `src/draagon_forge/mcp/tools/mesh.py`

```python
import asyncio
import json
import subprocess
from pathlib import Path
from typing import Literal
from fastmcp import FastMCP
from ..mesh.importer import MeshImporter
from ..mesh.query import MeshQueryEngine
from ..projects.registry import ProjectRegistry, ProjectConfig
from ..projects.sync import SyncManager

mcp = FastMCP("mesh")

# Initialize shared components
_registry: ProjectRegistry | None = None
_sync_manager: SyncManager | None = None
_importer: MeshImporter | None = None
_query_engine: MeshQueryEngine | None = None


def _get_registry() -> ProjectRegistry:
    global _registry
    if _registry is None:
        from ..config import get_data_dir
        _registry = ProjectRegistry(get_data_dir())
    return _registry


def _get_importer() -> MeshImporter:
    global _importer
    if _importer is None:
        from ..config import get_neo4j_config
        config = get_neo4j_config()
        _importer = MeshImporter(config["uri"], config["user"], config["password"])
    return _importer


def _get_query_engine() -> MeshQueryEngine:
    global _query_engine
    if _query_engine is None:
        from ..config import get_neo4j_config
        config = get_neo4j_config()
        _query_engine = MeshQueryEngine(config["uri"], config["user"], config["password"])
    return _query_engine


@mcp.tool
async def build_mesh(
    project_path: str | None = None,
    incremental: bool = True,
    enable_ai: bool = True,
) -> dict:
    """Build or update the code knowledge mesh for a project.

    Args:
        project_path: Path to the project (defaults to current workspace)
        incremental: Only process changed files since last build
        enable_ai: Enable AI-assisted extraction (Tier 2/3)

    Returns:
        Build statistics including nodes/edges created
    """
    if project_path is None:
        project_path = str(Path.cwd())

    # Build CLI arguments
    args = [
        "npx", "mesh-builder", "extract", project_path,
        "--output", "/tmp/mesh-output.json",
    ]

    if enable_ai:
        args.append("--enable-ai")

    if incremental:
        args.append("--incremental")

    # Run TypeScript mesh-builder
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        return {
            "success": False,
            "error": stderr.decode(),
        }

    # Load the mesh output
    with open("/tmp/mesh-output.json") as f:
        mesh_data = json.load(f)

    # Import to Neo4j
    importer = _get_importer()
    project_id = Path(project_path).name
    result = await importer.import_mesh(mesh_data, project_id)

    return {
        "success": True,
        "project_id": project_id,
        "nodes_created": result["nodes_created"],
        "edges_created": result["edges_created"],
        "statistics": mesh_data.get("statistics", {}),
    }


@mcp.tool
async def register_project(
    git_url: str,
    name: str,
    branch: str = "main",
    auto_pull: bool = True,
    include_paths: list[str] | None = None,
    exclude_paths: list[str] | None = None,
) -> dict:
    """Register a git repository for automatic mesh extraction.

    Args:
        git_url: Git clone URL (HTTPS or SSH)
        name: Friendly name for the project
        branch: Branch to track (default: main)
        auto_pull: Enable automatic sync on changes
        include_paths: Optional glob patterns to include
        exclude_paths: Optional glob patterns to exclude

    Returns:
        Project registration details
    """
    registry = _get_registry()

    config = ProjectConfig(
        id=name.lower().replace(" ", "-"),
        name=name,
        git_url=git_url,
        branch=branch,
        auto_pull_enabled=auto_pull,
        include_paths=include_paths,
        exclude_paths=exclude_paths,
    )

    project = await registry.register_project(config)

    # Trigger initial sync
    from ..config import get_clone_dir
    sync_manager = SyncManager(registry, get_clone_dir())
    sync_result = await sync_manager.sync_project(project.id)

    return {
        "success": True,
        "project_id": project.id,
        "name": project.config.name,
        "git_url": project.config.git_url,
        "branch": project.config.branch,
        "synced": sync_result.success,
        "local_path": sync_result.new_commit if sync_result.success else None,
    }


@mcp.tool
async def query_mesh(
    query: str,
    query_type: Literal["natural", "cypher"] = "natural",
    project_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Query the code knowledge mesh.

    Args:
        query: Natural language query or Cypher query
        query_type: Type of query ('natural' or 'cypher')
        project_id: Optional filter by project
        limit: Maximum results to return

    Returns:
        List of matching nodes/relationships
    """
    engine = _get_query_engine()

    if query_type == "cypher":
        return await engine.execute_cypher(query, limit=limit)
    else:
        return await engine.natural_query(query, project_id=project_id, limit=limit)


@mcp.tool
async def trace_data_flow(
    from_point: str,
    to_point: str,
    include_cross_service: bool = True,
    max_depth: int = 10,
) -> list[dict]:
    """Trace data flow between two points in the codebase.

    Args:
        from_point: Starting point (function name, API endpoint, etc.)
        to_point: Ending point
        include_cross_service: Include cross-project relationships
        max_depth: Maximum path length

    Returns:
        List of paths showing data flow
    """
    engine = _get_query_engine()

    cypher = """
    MATCH path = shortestPath(
        (from:MeshNode)-[*..{max_depth}]->(to:MeshNode)
    )
    WHERE from.name CONTAINS $from_point OR from.id CONTAINS $from_point
      AND to.name CONTAINS $to_point OR to.id CONTAINS $to_point
    RETURN path
    LIMIT 10
    """.replace("{max_depth}", str(max_depth))

    if not include_cross_service:
        cypher = cypher.replace(
            "RETURN path",
            "AND ALL(r IN relationships(path) WHERE NOT r.cross_project = true) RETURN path"
        )

    return await engine.execute_cypher(cypher, from_point=from_point, to_point=to_point)


@mcp.tool
async def find_cross_service_links(
    project_id: str | None = None,
    link_type: str | None = None,
) -> list[dict]:
    """Find cross-service relationships in the mesh.

    Args:
        project_id: Optional filter by source project
        link_type: Optional filter by type (PUBLISHES_TO, CALLS_SERVICE, etc.)

    Returns:
        List of cross-service links with metadata
    """
    engine = _get_query_engine()

    cypher = """
    MATCH (from:MeshNode)-[r:MESH_EDGE]->(to:MeshNode)
    WHERE r.cross_project = true
    """

    if project_id:
        cypher += f" AND from.project_id = '{project_id}'"

    if link_type:
        cypher += f" AND r.type = '{link_type}'"

    cypher += """
    RETURN {
        from_project: from.project_id,
        from_node: from.name,
        from_type: from.type,
        to_project: to.project_id,
        to_node: to.name,
        to_type: to.type,
        link_type: r.type,
        confidence: r.confidence,
        match_reason: r.match_reason
    } as link
    ORDER BY r.confidence DESC
    """

    return await engine.execute_cypher(cypher)


@mcp.tool
async def list_projects() -> list[dict]:
    """List all registered projects.

    Returns:
        List of project configurations and status
    """
    registry = _get_registry()
    projects = registry.list_projects()

    return [
        {
            "id": p.id,
            "name": p.config.name,
            "git_url": p.config.git_url,
            "branch": p.config.branch,
            "status": p.status,
            "last_sync": p.last_sync.isoformat() if p.last_sync else None,
            "node_count": p.node_count,
            "auto_pull_enabled": p.config.auto_pull_enabled,
        }
        for p in projects
    ]
```

**File:** `src/draagon_forge/mesh/query.py`

```python
from neo4j import AsyncGraphDatabase
from typing import Any
import os


class MeshQueryEngine:
    """Query engine for the code knowledge mesh."""

    def __init__(self, neo4j_uri: str, neo4j_user: str, neo4j_password: str):
        self.driver = AsyncGraphDatabase.driver(
            neo4j_uri, auth=(neo4j_user, neo4j_password)
        )

    async def execute_cypher(
        self,
        query: str,
        limit: int = 50,
        **params
    ) -> list[dict]:
        """Execute a Cypher query and return results."""
        async with self.driver.session() as session:
            result = await session.run(query, **params, limit=limit)
            records = await result.data()
            return records

    async def natural_query(
        self,
        query: str,
        project_id: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Convert natural language query to Cypher and execute."""
        # Map common natural language patterns to Cypher
        query_lower = query.lower()

        if "api" in query_lower or "endpoint" in query_lower:
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.type = 'ApiEndpoint'
            """
        elif "function" in query_lower or "method" in query_lower:
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.type IN ['Function', 'Method']
            """
        elif "class" in query_lower:
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.type = 'Class'
            """
        elif "import" in query_lower or "depend" in query_lower:
            cypher = """
            MATCH (n:MeshNode)-[r:MESH_EDGE]->(m:MeshNode)
            WHERE r.type = 'IMPORTS'
            """
        elif "queue" in query_lower or "message" in query_lower:
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.type IN ['QueueProducer', 'QueueConsumer']
            """
        elif "database" in query_lower or "table" in query_lower or "model" in query_lower:
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.type IN ['DatabaseTable', 'DataModel']
            """
        else:
            # Full-text search fallback
            cypher = """
            MATCH (n:MeshNode)
            WHERE n.name CONTAINS $search_term
               OR n.type CONTAINS $search_term
            """
            return await self.execute_cypher(
                cypher + " RETURN n LIMIT $limit",
                search_term=query,
                limit=limit,
            )

        # Add project filter if specified
        if project_id:
            cypher += f" AND n.project_id = '{project_id}'"

        cypher += " RETURN n LIMIT $limit"

        return await self.execute_cypher(cypher, limit=limit)

    async def get_project_overview(self, project_id: str) -> dict:
        """Get overview statistics for a project."""
        cypher = """
        MATCH (n:MeshNode {project_id: $project_id})
        WITH n.type as type, count(*) as count
        RETURN collect({type: type, count: count}) as type_counts
        """
        result = await self.execute_cypher(cypher, project_id=project_id)
        return result[0] if result else {"type_counts": []}

    async def close(self):
        await self.driver.close()
```

#### Day 5: Code Review Integration

**File:** `src/draagon_forge/agents/code_review/mesh_integration.py`

```python
from typing import Any
from ..mesh.query import MeshQueryEngine


class MeshAwareReviewer:
    """Integrates code mesh knowledge into code review."""

    def __init__(self, query_engine: MeshQueryEngine):
        self.query_engine = query_engine

    async def analyze_change_impact(
        self,
        changed_files: list[str],
        project_id: str,
    ) -> dict[str, Any]:
        """Analyze the impact of file changes using the mesh."""
        impact = {
            "affected_endpoints": [],
            "affected_consumers": [],
            "affected_tests": [],
            "breaking_changes": [],
        }

        for file in changed_files:
            # Find nodes in the changed file
            cypher = """
            MATCH (n:MeshNode {project_id: $project_id})
            WHERE n.source.file = $file_path
            OPTIONAL MATCH (n)-[:MESH_EDGE*1..3]->(downstream)
            RETURN n, collect(DISTINCT downstream) as downstream_nodes
            """
            results = await self.query_engine.execute_cypher(
                cypher,
                project_id=project_id,
                file_path=file,
            )

            for result in results:
                node = result.get("n")
                downstream = result.get("downstream_nodes", [])

                # Check for API endpoints that might break clients
                if node and node.get("type") == "ApiEndpoint":
                    impact["affected_endpoints"].append({
                        "endpoint": node.get("name"),
                        "path": node.get("properties", {}).get("path"),
                        "downstream_count": len(downstream),
                    })

                # Check for queue changes that affect consumers
                if node and node.get("type") == "QueueProducer":
                    consumers = [
                        d for d in downstream
                        if d.get("type") == "QueueConsumer"
                    ]
                    if consumers:
                        impact["affected_consumers"].extend([
                            {
                                "queue": node.get("name"),
                                "consumer_project": c.get("project_id"),
                                "consumer": c.get("name"),
                            }
                            for c in consumers
                        ])

        return impact

    async def find_related_code(
        self,
        node_name: str,
        project_id: str,
        depth: int = 2,
    ) -> list[dict]:
        """Find code related to a specific node for context."""
        cypher = f"""
        MATCH (n:MeshNode {{project_id: $project_id}})
        WHERE n.name = $node_name
        OPTIONAL MATCH (n)-[:MESH_EDGE*1..{depth}]-(related)
        RETURN n, collect(DISTINCT related) as related_nodes
        """
        return await self.query_engine.execute_cypher(
            cypher,
            project_id=project_id,
            node_name=node_name,
        )
```

**Acceptance Criteria for Phase 6:**
- [ ] MeshImporter creates Neo4j nodes with proper labels and properties
- [ ] build_mesh tool runs TypeScript CLI and imports results
- [ ] register_project tool clones repos and triggers initial extraction
- [ ] query_mesh supports both natural language and Cypher queries
- [ ] trace_data_flow finds paths between code points
- [ ] find_cross_service_links returns queue and API connections
- [ ] MeshAwareReviewer integrates with code review agent
- [ ] All MCP tools are callable from Claude Code

---

### Phase 7: Documentation Generation (1 week / 5 days)

**Goal:** Generate always-current documentation from graph queries.

#### Day 1-2: Graph Queries for Docs

**File:** `src/draagon_forge/docs/queries.py`

```python
from typing import Literal
from ..mesh.query import MeshQueryEngine


class DocQueryBuilder:
    """Build Cypher queries for documentation generation."""

    def __init__(self, query_engine: MeshQueryEngine):
        self.query_engine = query_engine

    async def get_api_endpoints(
        self,
        project_id: str,
        include_internal: bool = False,
    ) -> list[dict]:
        """Get all API endpoints for documentation."""
        cypher = """
        MATCH (n:MeshNode {project_id: $project_id})
        WHERE n.type = 'ApiEndpoint'
        OPTIONAL MATCH (n)-[:RETURNS]->(response:MeshNode)
        OPTIONAL MATCH (n)-[:ACCEPTS]->(request:MeshNode)
        RETURN {
            name: n.name,
            method: n.properties.method,
            path: n.properties.path,
            framework: n.properties.framework,
            response_model: response.name,
            request_model: request.name,
            file: n.source.file,
            line: n.source.line_start
        } as endpoint
        ORDER BY n.properties.path
        """
        return await self.query_engine.execute_cypher(cypher, project_id=project_id)

    async def get_data_models(self, project_id: str) -> list[dict]:
        """Get all data models (Pydantic, Django, SQLAlchemy, etc.)."""
        cypher = """
        MATCH (n:MeshNode {project_id: $project_id})
        WHERE n.type IN ['DataModel', 'DatabaseTable', 'Class']
          AND (n.properties.framework IN ['pydantic', 'django', 'sqlalchemy', 'prisma']
               OR n.properties.orm IS NOT NULL)
        OPTIONAL MATCH (n)-[:HAS_FIELD]->(field:MeshNode)
        OPTIONAL MATCH (n)-[:REFERENCES]->(related:MeshNode)
        RETURN {
            name: n.name,
            type: n.type,
            framework: COALESCE(n.properties.framework, n.properties.orm),
            fields: collect(DISTINCT field.name),
            relationships: collect(DISTINCT related.name),
            file: n.source.file
        } as model
        ORDER BY n.name
        """
        return await self.query_engine.execute_cypher(cypher, project_id=project_id)

    async def get_service_architecture(
        self,
        project_ids: list[str] | None = None,
    ) -> list[dict]:
        """Get service-level architecture overview."""
        cypher = """
        MATCH (from:MeshNode)-[r:MESH_EDGE]->(to:MeshNode)
        WHERE r.cross_project = true
        """

        if project_ids:
            cypher += f" AND from.project_id IN {project_ids}"

        cypher += """
        WITH from.project_id as source_project,
             to.project_id as target_project,
             r.type as link_type,
             count(*) as link_count
        RETURN {
            source: source_project,
            target: target_project,
            link_type: link_type,
            count: link_count
        } as service_link
        ORDER BY link_count DESC
        """
        return await self.query_engine.execute_cypher(cypher)

    async def get_dependency_tree(
        self,
        project_id: str,
        root_file: str | None = None,
    ) -> list[dict]:
        """Get import/dependency tree."""
        cypher = """
        MATCH (from:MeshNode {project_id: $project_id})-[r:MESH_EDGE]->(to:MeshNode)
        WHERE r.type = 'IMPORTS'
        """

        if root_file:
            cypher += " AND from.source.file = $root_file"

        cypher += """
        RETURN {
            from_file: from.source.file,
            from_name: from.name,
            imports: to.name,
            import_module: to.properties.module
        } as dep
        """
        return await self.query_engine.execute_cypher(
            cypher,
            project_id=project_id,
            root_file=root_file,
        )

    async def get_queue_topology(
        self,
        project_ids: list[str] | None = None,
    ) -> list[dict]:
        """Get message queue topology."""
        cypher = """
        MATCH (producer:MeshNode {type: 'QueueProducer'})
        OPTIONAL MATCH (producer)-[r:PUBLISHES_TO]->(consumer:MeshNode {type: 'QueueConsumer'})
        """

        if project_ids:
            cypher += f" WHERE producer.project_id IN {project_ids}"

        cypher += """
        RETURN {
            queue_name: producer.name,
            service: producer.properties.service,
            producer_project: producer.project_id,
            producer_file: producer.source.file,
            consumer_project: consumer.project_id,
            consumer_file: consumer.source.file
        } as queue_link
        """
        return await self.query_engine.execute_cypher(cypher)
```

#### Day 3-4: Output Formats

**File:** `src/draagon_forge/docs/generators.py`

```python
from typing import Literal
import json
from .queries import DocQueryBuilder


class OpenAPIGenerator:
    """Generate OpenAPI spec from mesh data."""

    def __init__(self, query_builder: DocQueryBuilder):
        self.query_builder = query_builder

    async def generate(
        self,
        project_id: str,
        title: str = "API Documentation",
        version: str = "1.0.0",
    ) -> dict:
        """Generate OpenAPI 3.0 spec."""
        endpoints = await self.query_builder.get_api_endpoints(project_id)
        models = await self.query_builder.get_data_models(project_id)

        spec = {
            "openapi": "3.0.0",
            "info": {
                "title": title,
                "version": version,
            },
            "paths": {},
            "components": {
                "schemas": {},
            },
        }

        # Add endpoints
        for ep in endpoints:
            path = ep.get("path", f"/{ep.get('name', 'unknown')}")
            method = (ep.get("method") or "get").lower()

            if path not in spec["paths"]:
                spec["paths"][path] = {}

            spec["paths"][path][method] = {
                "operationId": ep.get("name"),
                "summary": f"{method.upper()} {path}",
                "responses": {
                    "200": {
                        "description": "Successful response",
                    },
                },
            }

            # Add response model reference if available
            if ep.get("response_model"):
                spec["paths"][path][method]["responses"]["200"]["content"] = {
                    "application/json": {
                        "schema": {"$ref": f"#/components/schemas/{ep['response_model']}"},
                    },
                }

        # Add models as schemas (simplified)
        for model in models:
            spec["components"]["schemas"][model.get("name")] = {
                "type": "object",
                "properties": {
                    field: {"type": "string"}  # Would need type inference
                    for field in (model.get("fields") or [])
                },
            }

        return spec


class MarkdownGenerator:
    """Generate Markdown documentation from mesh data."""

    def __init__(self, query_builder: DocQueryBuilder):
        self.query_builder = query_builder

    async def generate_api_docs(self, project_id: str) -> str:
        """Generate API documentation in Markdown."""
        endpoints = await self.query_builder.get_api_endpoints(project_id)

        lines = [
            "# API Documentation",
            "",
            f"Generated from code knowledge mesh for project: `{project_id}`",
            "",
            "## Endpoints",
            "",
        ]

        # Group endpoints by path prefix
        current_prefix = None
        for ep in endpoints:
            path = ep.get("path", "")
            prefix = path.split("/")[1] if "/" in path else ""

            if prefix != current_prefix:
                current_prefix = prefix
                lines.append(f"### /{prefix}")
                lines.append("")

            method = (ep.get("method") or "GET").upper()
            lines.append(f"#### `{method} {path}`")
            lines.append("")
            lines.append(f"**Handler:** `{ep.get('name')}`")
            lines.append(f"**File:** `{ep.get('file')}:{ep.get('line')}`")

            if ep.get("response_model"):
                lines.append(f"**Returns:** `{ep.get('response_model')}`")

            lines.append("")

        return "\n".join(lines)

    async def generate_architecture_docs(
        self,
        project_ids: list[str] | None = None,
    ) -> str:
        """Generate architecture overview in Markdown."""
        architecture = await self.query_builder.get_service_architecture(project_ids)
        queues = await self.query_builder.get_queue_topology(project_ids)

        lines = [
            "# Architecture Overview",
            "",
            "## Service Dependencies",
            "",
        ]

        # Service links
        if architecture:
            lines.append("| Source | Target | Type | Count |")
            lines.append("|--------|--------|------|-------|")
            for link in architecture:
                lines.append(
                    f"| {link.get('source')} | {link.get('target')} | "
                    f"{link.get('link_type')} | {link.get('count')} |"
                )
            lines.append("")

        # Queue topology
        if queues:
            lines.append("## Message Queue Topology")
            lines.append("")
            lines.append("| Queue | Producer | Consumer |")
            lines.append("|-------|----------|----------|")
            for q in queues:
                lines.append(
                    f"| {q.get('queue_name')} | {q.get('producer_project')} | "
                    f"{q.get('consumer_project') or 'N/A'} |"
                )
            lines.append("")

        return "\n".join(lines)


class MermaidGenerator:
    """Generate Mermaid diagrams from mesh data."""

    def __init__(self, query_builder: DocQueryBuilder):
        self.query_builder = query_builder

    async def generate_service_diagram(
        self,
        project_ids: list[str] | None = None,
    ) -> str:
        """Generate service dependency diagram."""
        architecture = await self.query_builder.get_service_architecture(project_ids)

        lines = [
            "```mermaid",
            "graph LR",
        ]

        seen_nodes = set()
        for link in architecture:
            source = link.get("source", "").replace("-", "_")
            target = link.get("target", "").replace("-", "_")
            link_type = link.get("link_type", "")

            # Add node definitions
            if source not in seen_nodes:
                lines.append(f"    {source}[{link.get('source')}]")
                seen_nodes.add(source)
            if target not in seen_nodes:
                lines.append(f"    {target}[{link.get('target')}]")
                seen_nodes.add(target)

            # Add edge with label
            if "QUEUE" in link_type or "PUBLISH" in link_type:
                lines.append(f"    {source} -->|queue| {target}")
            elif "CALLS" in link_type or "API" in link_type:
                lines.append(f"    {source} -->|http| {target}")
            elif "DATABASE" in link_type:
                lines.append(f"    {source} <-->|db| {target}")
            else:
                lines.append(f"    {source} --> {target}")

        lines.append("```")
        return "\n".join(lines)

    async def generate_data_flow_diagram(
        self,
        project_id: str,
        entry_point: str | None = None,
    ) -> str:
        """Generate data flow diagram."""
        deps = await self.query_builder.get_dependency_tree(project_id, entry_point)

        lines = [
            "```mermaid",
            "graph TD",
        ]

        seen = set()
        for dep in deps[:50]:  # Limit to avoid huge diagrams
            from_name = dep.get("from_name", "").replace("-", "_")
            imports = dep.get("imports", "").replace("-", "_")

            key = f"{from_name}->{imports}"
            if key not in seen:
                lines.append(f"    {from_name} --> {imports}")
                seen.add(key)

        lines.append("```")
        return "\n".join(lines)
```

#### Day 5: MCP Tool

**File:** `src/draagon_forge/mcp/tools/docs.py`

```python
from typing import Literal
from fastmcp import FastMCP
from ..mesh.query import MeshQueryEngine
from ..docs.queries import DocQueryBuilder
from ..docs.generators import OpenAPIGenerator, MarkdownGenerator, MermaidGenerator

mcp = FastMCP("docs")


def _get_query_builder() -> DocQueryBuilder:
    from ..config import get_neo4j_config
    config = get_neo4j_config()
    engine = MeshQueryEngine(config["uri"], config["user"], config["password"])
    return DocQueryBuilder(engine)


@mcp.tool
async def generate_docs(
    project_id: str | None = None,
    doc_type: Literal["api", "architecture", "data-flow", "models"] = "api",
    format: Literal["markdown", "openapi", "mermaid"] = "markdown",
) -> str:
    """Generate documentation from the code knowledge mesh.

    Args:
        project_id: Project to document (required for api/models/data-flow)
        doc_type: Type of documentation to generate
        format: Output format

    Returns:
        Generated documentation string
    """
    query_builder = _get_query_builder()

    if doc_type == "api":
        if not project_id:
            return "Error: project_id required for API documentation"

        if format == "openapi":
            generator = OpenAPIGenerator(query_builder)
            spec = await generator.generate(project_id)
            import json
            return json.dumps(spec, indent=2)
        else:
            generator = MarkdownGenerator(query_builder)
            return await generator.generate_api_docs(project_id)

    elif doc_type == "architecture":
        if format == "mermaid":
            generator = MermaidGenerator(query_builder)
            return await generator.generate_service_diagram(
                [project_id] if project_id else None
            )
        else:
            generator = MarkdownGenerator(query_builder)
            return await generator.generate_architecture_docs(
                [project_id] if project_id else None
            )

    elif doc_type == "data-flow":
        if not project_id:
            return "Error: project_id required for data flow documentation"

        generator = MermaidGenerator(query_builder)
        return await generator.generate_data_flow_diagram(project_id)

    elif doc_type == "models":
        if not project_id:
            return "Error: project_id required for models documentation"

        models = await query_builder.get_data_models(project_id)
        lines = [
            "# Data Models",
            "",
            f"Project: `{project_id}`",
            "",
        ]

        for model in models:
            lines.append(f"## {model.get('name')}")
            lines.append(f"**Framework:** {model.get('framework')}")
            lines.append(f"**File:** {model.get('file')}")
            if model.get("fields"):
                lines.append(f"**Fields:** {', '.join(model.get('fields'))}")
            if model.get("relationships"):
                lines.append(f"**Related:** {', '.join(model.get('relationships'))}")
            lines.append("")

        return "\n".join(lines)

    return f"Error: Unknown doc_type: {doc_type}"


@mcp.tool
async def get_project_summary(project_id: str) -> str:
    """Get a summary of a project from the mesh.

    Args:
        project_id: Project ID to summarize

    Returns:
        Markdown summary of project structure
    """
    query_builder = _get_query_builder()

    # Get node counts by type
    cypher = """
    MATCH (n:MeshNode {project_id: $project_id})
    RETURN n.type as type, count(*) as count
    ORDER BY count DESC
    """
    type_counts = await query_builder.query_engine.execute_cypher(
        cypher, project_id=project_id
    )

    # Get file count
    file_cypher = """
    MATCH (n:MeshNode {project_id: $project_id})
    RETURN count(DISTINCT n.source.file) as file_count
    """
    file_result = await query_builder.query_engine.execute_cypher(
        file_cypher, project_id=project_id
    )

    lines = [
        f"# Project Summary: {project_id}",
        "",
        f"**Files analyzed:** {file_result[0].get('file_count', 0) if file_result else 0}",
        "",
        "## Node Types",
        "",
        "| Type | Count |",
        "|------|-------|",
    ]

    for tc in type_counts:
        lines.append(f"| {tc.get('type')} | {tc.get('count')} |")

    return "\n".join(lines)
```

**Acceptance Criteria for Phase 7:**
- [ ] DocQueryBuilder retrieves API endpoints, models, and dependencies
- [ ] OpenAPIGenerator produces valid OpenAPI 3.0 spec
- [ ] MarkdownGenerator creates readable API documentation
- [ ] MermaidGenerator creates valid Mermaid diagram syntax
- [ ] generate_docs MCP tool supports all doc_type options
- [ ] get_project_summary provides quick overview
- [ ] Documentation always reflects current mesh state
- [ ] Cross-project architecture diagrams work

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Schema complexity explosion | Medium | Medium | Start with core patterns, iterate |
| AI costs higher than estimated | Low | Medium | Optimize tier routing, cache results |
| Cross-project linking accuracy | High | High | Start with simple cases, add AI fallback |
| Performance at scale (100K files) | Medium | High | Implement caching, incremental updates |
| Neo4j query performance | Low | Medium | Proper indexing, query optimization |

---

## Dependencies

### External
- Node.js 18+ (TypeScript mesh-builder)
- Python 3.11+ (Python layer)
- Neo4j 5.x (graph storage)
- Groq API (AI tiers)

### Internal
- REQ-001: MCP Context Server (MCP integration)
- REQ-028: Multi-Model Cost Optimization (model routing)

---

## Success Criteria

| Milestone | Criteria |
|-----------|----------|
| **Phase 1 Complete** | CLI extracts Python/TypeScript projects, outputs JSON |
| **Phase 2 Complete** | FastAPI, Django, NestJS, Express schemas working |
| **Phase 3 Complete** | AI tiers route correctly, schemas generated |
| **Phase 4 Complete** | Projects register and auto-sync |
| **Phase 5 Complete** | Cross-project queue/API links detected |
| **Phase 6 Complete** | MCP tools callable from Claude Code |
| **Phase 7 Complete** | API docs generated from mesh |

---

## Acceptance Checklist

- [ ] **Phase 1:** Core infrastructure
  - [ ] mesh-builder CLI runs
  - [ ] Schema registry loads JSON
  - [ ] Pattern matcher extracts nodes/edges
  - [ ] Python/TypeScript detection works
  - [ ] JSON output format correct

- [ ] **Phase 2:** Framework schemas
  - [ ] FastAPI routes extracted
  - [ ] NestJS controllers extracted
  - [ ] SQLAlchemy models extracted
  - [ ] SQS/Kafka patterns detected

- [ ] **Phase 3:** AI tiers
  - [ ] Tier 2 enhances ambiguous extractions
  - [ ] Tier 3 discovers unknown frameworks
  - [ ] Schemas generated from discoveries
  - [ ] Cost within estimates

- [ ] **Phase 4:** Project registry
  - [ ] Projects register via CLI/MCP
  - [ ] Git clone/pull works
  - [ ] Webhooks trigger sync
  - [ ] Incremental extraction works

- [ ] **Phase 5:** Cross-project linking
  - [ ] Queue references collected
  - [ ] Config resolution works
  - [ ] AI matching for unresolved refs
  - [ ] Cross-service edges created

- [ ] **Phase 6:** Python integration
  - [ ] Mesh imports to Neo4j
  - [ ] MCP tools callable
  - [ ] Code review uses mesh

- [ ] **Phase 7:** Documentation
  - [ ] API docs generate correctly
  - [ ] Mermaid diagrams valid
  - [ ] generate_docs MCP tool works

---

**Plan Status:** Ready for Review
**Created:** 2026-01-15
**Estimated Completion:** 10 weeks from start
