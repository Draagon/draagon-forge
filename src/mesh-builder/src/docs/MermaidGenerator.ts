/**
 * MermaidGenerator - Generate Mermaid diagrams from mesh data.
 *
 * Creates various diagram types:
 * - Class diagrams
 * - Sequence diagrams (for API flows)
 * - Flowcharts (for dependencies)
 * - ER diagrams (for database models)
 */

import { DocQueryBuilder, ClassDocData, DependencyDocData, FunctionDocData } from './DocQueryBuilder';
import { ProjectExtractionResult, MeshNode, MeshEdge } from '../types';

export type DiagramType = 'class' | 'flowchart' | 'sequence' | 'er';

export interface MermaidConfig {
  /** Diagram direction (TB, BT, LR, RL) */
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  /** Maximum nodes to include */
  maxNodes: number;
  /** Include node properties */
  includeProperties: boolean;
  /** Theme (default, dark, forest, neutral) */
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
}

const DEFAULT_CONFIG: MermaidConfig = {
  direction: 'TB',
  maxNodes: 30,
  includeProperties: true,
};

export class MermaidGenerator {
  private config: MermaidConfig;
  private queryBuilder: DocQueryBuilder;
  private result: ProjectExtractionResult;

  constructor(
    extractionResult: ProjectExtractionResult,
    config: Partial<MermaidConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queryBuilder = new DocQueryBuilder(extractionResult);
    this.result = extractionResult;
  }

  /**
   * Generate a class diagram.
   */
  generateClassDiagram(filter?: { filePattern?: string }): string {
    const classes = this.queryBuilder.getClasses(filter);
    const lines: string[] = [];

    lines.push('classDiagram');
    if (this.config.direction !== 'TB') {
      lines.push(`    direction ${this.config.direction}`);
    }

    // Limit classes
    const limitedClasses = classes.slice(0, this.config.maxNodes);

    // Generate class definitions
    for (const cls of limitedClasses) {
      lines.push(this.formatClassForDiagram(cls));
    }

    // Generate relationships
    const relationships = this.generateClassRelationships(limitedClasses);
    lines.push(...relationships);

    return lines.join('\n');
  }

  /**
   * Format a class for Mermaid class diagram.
   */
  private formatClassForDiagram(cls: ClassDocData): string {
    const lines: string[] = [];
    const id = this.sanitizeId(cls.name);

    lines.push(`    class ${id} {`);

    // Properties
    if (this.config.includeProperties) {
      for (const prop of cls.properties.slice(0, 10)) {
        lines.push(`        +${this.sanitizeId(prop)}`);
      }
    }

    // Methods
    for (const method of cls.methods.slice(0, 10)) {
      lines.push(`        +${this.sanitizeId(method)}()`);
    }

    lines.push('    }');

    return lines.join('\n');
  }

  /**
   * Generate class relationships.
   */
  private generateClassRelationships(classes: ClassDocData[]): string[] {
    const lines: string[] = [];
    const classNames = new Set(classes.map((c) => c.name));

    for (const cls of classes) {
      const id = this.sanitizeId(cls.name);

      // Inheritance
      for (const base of cls.bases) {
        if (classNames.has(base)) {
          const baseId = this.sanitizeId(base);
          lines.push(`    ${baseId} <|-- ${id}`);
        }
      }
    }

    return lines;
  }

  /**
   * Generate a flowchart showing dependencies.
   */
  generateFlowchart(filter?: { filePattern?: string; nodeType?: string }): string {
    const deps = this.queryBuilder.getDependencies(filter);
    const lines: string[] = [];

    lines.push(`flowchart ${this.config.direction}`);

    // Collect unique nodes
    const nodes = new Set<string>();
    const limitedDeps = deps.slice(0, this.config.maxNodes * 2);

    for (const dep of limitedDeps) {
      nodes.add(dep.source);
      nodes.add(dep.target);
    }

    // Generate node definitions
    for (const node of Array.from(nodes).slice(0, this.config.maxNodes)) {
      const id = this.sanitizeId(node);
      lines.push(`    ${id}[${node}]`);
    }

    // Generate edges
    const edgeSet = new Set<string>();
    for (const dep of limitedDeps) {
      const sourceId = this.sanitizeId(dep.source);
      const targetId = this.sanitizeId(dep.target);
      const edgeKey = `${sourceId}-${targetId}`;

      if (!edgeSet.has(edgeKey) && nodes.has(dep.source) && nodes.has(dep.target)) {
        const arrow = this.getArrowForType(dep.type);
        lines.push(`    ${sourceId} ${arrow} ${targetId}`);
        edgeSet.add(edgeKey);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get arrow style for relationship type.
   */
  private getArrowForType(type: string): string {
    const arrows: Record<string, string> = {
      CALLS: '-->',
      CONTAINS: '--o',
      IMPORTS: '-.->',
      INHERITS: '--|>',
      IMPLEMENTS: '..|>',
      USES: '-->',
      DEPENDS_ON: '-->',
      PUBLISHES_TO: '-->|pub|',
      SUBSCRIBES_TO: '-->|sub|',
      READS_FROM: '-->|read|',
      WRITES_TO: '-->|write|',
    };
    return arrows[type] || '-->';
  }

  /**
   * Generate a sequence diagram for API flows.
   */
  generateSequenceDiagram(apiPath?: string): string {
    const endpoints = this.queryBuilder.getApiEndpoints();
    const lines: string[] = [];

    lines.push('sequenceDiagram');

    // Filter by path if specified
    const filtered = apiPath
      ? endpoints.filter((e) => e.path.includes(apiPath))
      : endpoints.slice(0, 5);

    // Generate participants
    lines.push('    participant Client');
    lines.push('    participant API');

    const services = new Set<string>();
    for (const endpoint of filtered) {
      // Extract service from handler
      const parts = endpoint.handler.split('.');
      if (parts.length > 1 && parts[0]) {
        services.add(parts[0]);
      }
    }

    for (const service of Array.from(services).slice(0, 5)) {
      lines.push(`    participant ${this.sanitizeId(service)}`);
    }

    // Generate interactions
    for (const endpoint of filtered) {
      const method = endpoint.method;
      const path = endpoint.path;

      lines.push(`    Client->>API: ${method} ${path}`);

      // If handler has a service prefix, show the call
      const parts = endpoint.handler.split('.');
      if (parts.length > 1 && parts[0] && services.has(parts[0])) {
        const service = this.sanitizeId(parts[0]);
        lines.push(`    API->>+${service}: ${endpoint.handler}()`);
        lines.push(`    ${service}-->>-API: response`);
      }

      lines.push(`    API-->>Client: ${endpoint.responses[0]?.status || 200}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate an ER diagram for database models.
   */
  generateERDiagram(filter?: { filePattern?: string }): string {
    const allNodes = this.getAllNodes();
    const models = allNodes.filter(
      (n) => n.type === 'Model' || n.type === 'Table'
    );
    const lines: string[] = [];

    lines.push('erDiagram');

    // Limit models
    const limitedModels = filter?.filePattern
      ? models.filter((m) => m.source.file.includes(filter.filePattern!))
      : models.slice(0, this.config.maxNodes);

    // Generate entities
    for (const model of limitedModels) {
      lines.push(this.formatModelForER(model));
    }

    // Generate relationships (based on foreign keys and references)
    const relationships = this.generateModelRelationships(limitedModels);
    lines.push(...relationships);

    return lines.join('\n');
  }

  /**
   * Format a model for ER diagram.
   */
  private formatModelForER(model: MeshNode): string {
    const lines: string[] = [];
    const id = this.sanitizeId(model.name);

    lines.push(`    ${id} {`);

    // Extract fields from properties
    const fields = model.properties['fields'];
    if (Array.isArray(fields)) {
      for (const field of fields.slice(0, 15)) {
        if (typeof field === 'string') {
          lines.push(`        string ${this.sanitizeId(field)}`);
        } else if (typeof field === 'object' && field !== null) {
          const f = field as Record<string, unknown>;
          const fieldName = this.sanitizeId(String(f['name'] || 'field'));
          const fieldType = String(f['type'] || 'string').toLowerCase();
          lines.push(`        ${fieldType} ${fieldName}`);
        }
      }
    }

    lines.push('    }');

    return lines.join('\n');
  }

  /**
   * Generate model relationships for ER diagram.
   */
  private generateModelRelationships(models: MeshNode[]): string[] {
    const lines: string[] = [];
    const modelNames = new Set(models.map((m) => m.name));
    const edges = this.getAllEdges();

    for (const edge of edges) {
      if (edge.type !== 'READS_FROM' && edge.type !== 'WRITES_TO' && edge.type !== 'QUERIES') {
        continue;
      }

      const fromNode = models.find((m) => m.id === edge.from_id);
      const toNode = models.find((m) => m.id === edge.to_id);

      if (fromNode && toNode && modelNames.has(fromNode.name) && modelNames.has(toNode.name)) {
        const fromId = this.sanitizeId(fromNode.name);
        const toId = this.sanitizeId(toNode.name);
        lines.push(`    ${fromId} ||--o{ ${toId} : references`);
      }
    }

    return lines;
  }

  /**
   * Generate a diagram wrapper with theme.
   */
  wrapWithTheme(diagram: string): string {
    if (!this.config.theme || this.config.theme === 'default') {
      return diagram;
    }

    return `%%{init: {'theme': '${this.config.theme}'}}%%\n${diagram}`;
  }

  /**
   * Generate a call graph showing function calls.
   */
  generateCallGraph(filter?: { filePattern?: string; rootFunction?: string }): string {
    const functions = this.queryBuilder.getFunctions(filter);
    const lines: string[] = [];

    lines.push(`flowchart ${this.config.direction}`);

    // Build call relationships
    const functionMap = new Map<string, FunctionDocData>();
    for (const fn of functions) {
      functionMap.set(fn.name, fn);
    }

    // Collect all nodes and edges
    const nodes = new Set<string>();
    const edges: Array<{ from: string; to: string }> = [];

    // If root function specified, only include that subgraph
    if (filter?.rootFunction) {
      const visited = new Set<string>();
      const queue = [filter.rootFunction];

      while (queue.length > 0 && nodes.size < this.config.maxNodes) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const fn = functionMap.get(current);
        if (!fn) continue;

        nodes.add(current);

        // Add callees
        for (const callee of fn.callees) {
          if (functionMap.has(callee)) {
            edges.push({ from: current, to: callee });
            if (!visited.has(callee)) {
              queue.push(callee);
            }
          }
        }

        // Add callers
        for (const caller of fn.callers) {
          if (functionMap.has(caller)) {
            edges.push({ from: caller, to: current });
            if (!visited.has(caller)) {
              queue.push(caller);
            }
          }
        }
      }
    } else {
      // Include all functions with call relationships
      for (const fn of functions.slice(0, this.config.maxNodes)) {
        if (fn.callers.length > 0 || fn.callees.length > 0) {
          nodes.add(fn.name);
          for (const callee of fn.callees) {
            if (functionMap.has(callee)) {
              nodes.add(callee);
              edges.push({ from: fn.name, to: callee });
            }
          }
        }
      }
    }

    // Generate node definitions with styling
    for (const nodeName of nodes) {
      const fn = functionMap.get(nodeName);
      const id = this.sanitizeId(nodeName);
      if (fn) {
        // Show function signature
        const params = fn.parameters.slice(0, 3).join(', ');
        const truncatedParams = params.length > 20 ? params.substring(0, 17) + '...' : params;
        lines.push(`    ${id}["${nodeName}(${truncatedParams})"]`);
      } else {
        lines.push(`    ${id}[${nodeName}]`);
      }
    }

    // Generate edges
    const edgeSet = new Set<string>();
    for (const edge of edges) {
      const fromId = this.sanitizeId(edge.from);
      const toId = this.sanitizeId(edge.to);
      const edgeKey = `${fromId}-${toId}`;

      if (!edgeSet.has(edgeKey) && nodes.has(edge.from) && nodes.has(edge.to)) {
        lines.push(`    ${fromId} --> ${toId}`);
        edgeSet.add(edgeKey);
      }
    }

    // Style entry points (functions with no callers)
    const entryPoints: string[] = [];
    for (const nodeName of nodes) {
      const fn = functionMap.get(nodeName);
      if (fn && fn.callers.length === 0 && fn.callees.length > 0) {
        entryPoints.push(this.sanitizeId(nodeName));
      }
    }
    if (entryPoints.length > 0) {
      lines.push(`    style ${entryPoints.join(',')} fill:#90EE90`);
    }

    return lines.join('\n');
  }

  /**
   * Generate a module/file dependency graph.
   */
  generateModuleDependencies(filter?: { filePattern?: string }): string {
    const deps = this.queryBuilder.getDependencies(filter);
    const lines: string[] = [];

    lines.push(`flowchart ${this.config.direction}`);

    // Filter to only IMPORTS relationships and group by file
    const importDeps = deps.filter(d => d.type === 'IMPORTS');
    const allNodes = this.getAllNodes();

    // Build file-level dependencies
    const fileImports = new Map<string, Set<string>>();

    for (const node of allNodes) {
      if (node.type === 'Import') {
        const sourceFile = this.getShortFileName(node.source.file);
        const importedModule = node.properties['module'] as string || node.name;

        if (!fileImports.has(sourceFile)) {
          fileImports.set(sourceFile, new Set());
        }
        fileImports.get(sourceFile)!.add(importedModule);
      }
    }

    // Generate subgraphs by directory
    const filesByDir = new Map<string, string[]>();
    for (const [file] of fileImports) {
      const parts = file.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(file);
    }

    // Generate nodes and subgraphs
    let dirIndex = 0;
    const limitedDirs = Array.from(filesByDir.entries()).slice(0, 10);

    for (const [dir, files] of limitedDirs) {
      const dirId = this.sanitizeId(dir);
      lines.push(`    subgraph ${dirId}["${dir}"]`);
      for (const file of files.slice(0, 5)) {
        const fileId = this.sanitizeId(file);
        lines.push(`        ${fileId}["${this.getShortFileName(file)}"]`);
      }
      lines.push('    end');
      dirIndex++;
    }

    // Generate import edges
    const edgeSet = new Set<string>();
    for (const [sourceFile, imports] of Array.from(fileImports).slice(0, this.config.maxNodes)) {
      const sourceId = this.sanitizeId(sourceFile);
      for (const imported of Array.from(imports).slice(0, 5)) {
        // Check if imported module is in our file list
        const targetFile = Array.from(fileImports.keys()).find(f => f.includes(imported));
        if (targetFile) {
          const targetId = this.sanitizeId(targetFile);
          const edgeKey = `${sourceId}-${targetId}`;
          if (!edgeSet.has(edgeKey) && sourceId !== targetId) {
            lines.push(`    ${sourceId} -.-> ${targetId}`);
            edgeSet.add(edgeKey);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get short file name from path.
   */
  private getShortFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }

  /**
   * Generate all diagram types.
   */
  generateAll(): Record<DiagramType | 'callGraph' | 'moduleDeps', string> {
    return {
      class: this.generateClassDiagram(),
      flowchart: this.generateFlowchart(),
      sequence: this.generateSequenceDiagram(),
      er: this.generateERDiagram(),
      callGraph: this.generateCallGraph(),
      moduleDeps: this.generateModuleDependencies(),
    };
  }

  /**
   * Sanitize identifier for Mermaid.
   */
  private sanitizeId(id: string): string {
    return id
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '')
      .substring(0, 30) || 'node';
  }

  /**
   * Get all nodes from extraction result.
   */
  private getAllNodes(): MeshNode[] {
    return this.result.results.flatMap((r) => r.nodes);
  }

  /**
   * Get all edges from extraction result.
   */
  private getAllEdges(): MeshEdge[] {
    return this.result.results.flatMap((r) => r.edges);
  }
}
