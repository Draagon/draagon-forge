/**
 * PatternMatcher - Applies schema patterns to source files.
 *
 * This is the core Tier 1 extraction engine that:
 * - Applies regex patterns from schemas
 * - Creates nodes and edges from matches
 * - Tracks file context (current class, function, imports)
 * - Maintains confidence scores
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Schema,
  SourceFile,
  MeshNode,
  MeshEdge,
  ExtractorPattern,
  SourceLocation,
  ExtractionMetadata,
  CaptureConfig,
  NodeTemplate,
  EdgeTemplate,
  MeshNodeType,
  MeshEdgeType,
} from '../types';

export interface MatchResult {
  patternName: string;
  extractorName: string;
  location: SourceLocation;
  captures: Record<string, string>;
  confidence: number;
  node?: MeshNode;
  edges: MeshEdge[];
}

export interface PatternMatcherResult {
  nodes: MeshNode[];
  edges: MeshEdge[];
  confidence: number;
  matchCount: number;
  unresolvedPatterns: string[];
}

interface FileContext {
  fileNodeId: string;
  currentClass?: { id: string; name: string };
  currentFunction?: { id: string; name: string };
  imports: Map<string, string>;
  nodesByName: Map<string, string>; // name -> id
  importEdges: MeshEdge[]; // Track import edges to add to results
}

export class PatternMatcher {
  constructor(private projectId: string) {}

  /**
   * Apply all patterns from a schema to a source file.
   */
  match(file: SourceFile, schema: Schema): PatternMatcherResult {
    const nodes: MeshNode[] = [];
    const edges: MeshEdge[] = [];
    const unresolvedPatterns: string[] = [];
    let totalConfidence = 0;
    let matchCount = 0;

    // Create file node first
    const fileNode = this.createFileNode(file, schema.name);
    nodes.push(fileNode);

    // Build initial context
    const context: FileContext = {
      fileNodeId: fileNode.id,
      imports: new Map(),
      nodesByName: new Map([[file.relativePath, fileNode.id]]),
      importEdges: [],
    };

    // First pass: extract imports to build context
    this.extractImports(file, schema, context);

    // Apply each extractor's patterns
    for (const [extractorName, extractor] of Object.entries(schema.extractors)) {
      for (const pattern of extractor.patterns) {
        try {
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
              context.nodesByName.set(result.node.name, result.node.id);

              // Update context for class/function tracking
              this.updateContext(result.node, context);
            }
            edges.push(...result.edges);
            totalConfidence += result.confidence;
            matchCount++;
          }
        } catch (error) {
          unresolvedPatterns.push(
            `${extractorName}:${pattern.name || 'unnamed'}`
          );
        }
      }
    }

    // Add import edges collected during import extraction
    edges.push(...context.importEdges);

    // Extract function calls to create CALLS edges
    const callEdges = this.extractFunctionCalls(file, nodes, context, schema.name);
    edges.push(...callEdges);

    // Extract inheritance relationships to create INHERITS edges
    const inheritEdges = this.extractInheritance(file, nodes, context, schema.name);
    edges.push(...inheritEdges);

    // Create CONTAINS edges from file to top-level nodes
    for (const node of nodes) {
      if (
        node.type !== 'File' &&
        !edges.some((e) => e.to_id === node.id && e.type === 'CONTAINS')
      ) {
        edges.push(this.createContainsEdge(fileNode.id, node.id, schema.name));
      }
    }

    const avgConfidence =
      matchCount > 0 ? totalConfidence / matchCount : schema.detection.confidence_boost;

    return {
      nodes,
      edges,
      confidence: Math.min(avgConfidence + schema.detection.confidence_boost, 1.0),
      matchCount,
      unresolvedPatterns,
    };
  }

  /**
   * Apply a single pattern to file content.
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

    let match: RegExpExecArray | null;

    while ((match = regex.exec(file.content)) !== null) {
      // Prevent infinite loops with zero-width matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      const result = this.processMatch(
        match,
        file,
        pattern,
        extractorName,
        schemaName,
        context
      );

      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Process a regex match and create nodes/edges.
   */
  private processMatch(
    match: RegExpExecArray,
    file: SourceFile,
    pattern: ExtractorPattern,
    extractorName: string,
    schemaName: string,
    context: FileContext
  ): MatchResult | null {
    // Calculate line number
    const beforeMatch = file.content.substring(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;

    // Extract captures
    const captures: Record<string, string> = {};
    for (const [captureName, config] of Object.entries(pattern.captures)) {
      let value = match[config.group] || config.default || '';
      value = this.applyTransform(value, config.transform);
      captures[captureName] = value;
    }

    // Calculate proper end line for scope-based elements
    let lineEnd: number;
    const nodeType = pattern.node_template?.type;

    if (
      (nodeType === 'Class' || nodeType === 'Function' || nodeType === 'Method') &&
      (file.language === 'python')
    ) {
      // For Python, calculate scope based on indentation
      lineEnd = this.calculatePythonScopeEnd(file.content, lineNumber, captures['indent']);
    } else if (
      (nodeType === 'Class' || nodeType === 'Function' || nodeType === 'Method') &&
      (file.language === 'typescript' || file.language === 'javascript')
    ) {
      // For TS/JS, calculate scope based on brace matching
      lineEnd = this.calculateBraceScopeEnd(file.content, lineNumber);
    } else {
      // Default: use context_lines
      lineEnd = lineNumber + (pattern.context_lines || 0);
    }

    // Build source location
    const location: SourceLocation = {
      file: file.relativePath,
      line_start: lineNumber,
      line_end: lineEnd,
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
    if (pattern.edge_template && node) {
      const edge = this.createEdgeFromTemplate(
        pattern.edge_template,
        captures,
        node.id,
        context,
        schemaName
      );
      if (edge) {
        edges.push(edge);
      }
    }

    // Calculate confidence based on capture completeness
    const captureCount = Object.keys(captures).length;
    const nonEmptyCaptures = Object.values(captures).filter((v) => v).length;
    const confidence = captureCount > 0 ? nonEmptyCaptures / captureCount : 0.5;

    return {
      patternName: pattern.name || 'unnamed',
      extractorName,
      location,
      captures,
      confidence,
      node,
      edges,
    };
  }

  /**
   * Create a file node.
   */
  private createFileNode(file: SourceFile, schemaName: string): MeshNode {
    return {
      id: uuidv4(),
      type: 'File',
      name: file.relativePath,
      properties: {
        language: file.language,
        size: file.size,
        path: file.path,
      },
      source: {
        file: file.relativePath,
        line_start: 1,
        line_end: file.content.split('\n').length,
      },
      project_id: this.projectId,
      extraction: this.createExtractionMetadata(1, schemaName, 1.0),
    };
  }

  /**
   * Create a node from a template.
   */
  private createNodeFromTemplate(
    template: NodeTemplate,
    captures: Record<string, string>,
    location: SourceLocation,
    schemaName: string
  ): MeshNode {
    const name = template.name_from
      ? captures[template.name_from] || 'unknown'
      : 'unknown';

    const properties: Record<string, unknown> = {};
    for (const [key, captureRef] of Object.entries(template.properties)) {
      // Check if it's a capture reference or a literal
      properties[key] = captures[captureRef] ?? captureRef;
    }

    return {
      id: uuidv4(),
      type: template.type,
      name,
      properties,
      source: location,
      project_id: this.projectId,
      extraction: this.createExtractionMetadata(1, schemaName, 0.8),
    };
  }

  /**
   * Create an edge from a template.
   */
  private createEdgeFromTemplate(
    template: EdgeTemplate,
    captures: Record<string, string>,
    currentNodeId: string,
    context: FileContext,
    schemaName: string
  ): MeshEdge | null {
    // Resolve 'from' node
    let fromId: string;
    if (template.from === 'current_node') {
      fromId = currentNodeId;
    } else if (template.from === 'current_file') {
      fromId = context.fileNodeId;
    } else if (template.from === 'current_class' && context.currentClass) {
      fromId = context.currentClass.id;
    } else if (template.from === 'current_function' && context.currentFunction) {
      fromId = context.currentFunction.id;
    } else {
      // Look up by capture name
      const fromName = captures[template.from];
      if (!fromName) {
        return null; // Can't resolve source name
      }
      const resolvedId = context.nodesByName.get(fromName);
      if (!resolvedId) {
        return null; // Can't resolve target
      }
      fromId = resolvedId;
    }

    // Resolve 'to' node
    let toId: string;
    if (template.to === 'current_node') {
      toId = currentNodeId;
    } else if (template.to === 'current_file') {
      toId = context.fileNodeId;
    } else {
      const toName = captures[template.to];
      if (!toName) {
        return null; // Can't resolve target name
      }
      const resolvedId = context.nodesByName.get(toName);
      if (!resolvedId) {
        // Create a placeholder node if target doesn't exist
        toId = uuidv4();
        context.nodesByName.set(toName, toId);
      } else {
        toId = resolvedId;
      }
    }

    const properties: Record<string, unknown> = {};
    if (template.properties) {
      for (const [key, captureRef] of Object.entries(template.properties)) {
        properties[key] = captures[captureRef] ?? captureRef;
      }
    }

    return {
      id: uuidv4(),
      type: template.type,
      from_id: fromId,
      to_id: toId,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
      extraction: this.createExtractionMetadata(1, schemaName, 0.7),
    };
  }

  /**
   * Create a CONTAINS edge.
   */
  private createContainsEdge(
    fromId: string,
    toId: string,
    schemaName: string
  ): MeshEdge {
    return {
      id: uuidv4(),
      type: 'CONTAINS',
      from_id: fromId,
      to_id: toId,
      extraction: this.createExtractionMetadata(1, schemaName, 1.0),
    };
  }

  /**
   * Create extraction metadata.
   */
  private createExtractionMetadata(
    tier: 1 | 2 | 3,
    schema: string,
    confidence: number
  ): ExtractionMetadata {
    return {
      tier,
      schema,
      confidence,
      extracted_at: new Date().toISOString(),
    };
  }

  /**
   * Apply a transform to a captured value.
   */
  private applyTransform(
    value: string,
    transform?: CaptureConfig['transform']
  ): string {
    if (!transform) return value;

    switch (transform) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'camelCase':
        return value
          .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) =>
            c ? c.toUpperCase() : ''
          )
          .replace(/^./, (c) => c.toLowerCase());
      case 'snakeCase':
        return value
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '');
      default:
        return value;
    }
  }

  /**
   * Extract class inheritance relationships to create INHERITS edges.
   */
  private extractInheritance(
    file: SourceFile,
    nodes: MeshNode[],
    context: FileContext,
    schemaName: string
  ): MeshEdge[] {
    const edges: MeshEdge[] = [];

    // Patterns for class inheritance
    // Python: class Foo(Bar, Baz):
    // TypeScript: class Foo extends Bar implements Baz, Qux
    const pythonClassRegex = /^class\s+([A-Z][a-zA-Z0-9_]*)\s*\(([^)]+)\)\s*:/gm;
    const tsClassRegex =
      /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Z][a-zA-Z0-9_]*)\s*(?:extends\s+([A-Z][a-zA-Z0-9_.<>]*))?\s*(?:implements\s+([^{]+))?\s*\{/gm;

    if (file.language === 'python') {
      let match;
      while ((match = pythonClassRegex.exec(file.content)) !== null) {
        const className = match[1];
        const parentsList = match[2] || '';

        // Find the class node
        const classNode = nodes.find(
          (n) => n.type === 'Class' && n.name === className
        );

        if (!classNode || !parentsList) continue;

        // Parse parent classes
        const parents = parentsList.split(',').map((p) => p.trim()).filter(Boolean);

        for (const parent of parents) {
          // Skip common base classes that aren't real inheritance
          const skipParents = new Set([
            'object', 'type', 'ABC', 'Protocol', 'Generic', 'TypedDict',
            'NamedTuple', 'Enum', 'IntEnum', 'StrEnum', 'Flag', 'IntFlag',
          ]);

          // Extract base class name (remove Generic[T] type params)
          const baseName = parent.replace(/\[.*\]/, '').trim();

          if (skipParents.has(baseName)) continue;

          // Try to find the parent class in this file
          const parentNode = nodes.find(
            (n) => n.type === 'Class' && n.name === baseName
          );

          // Check if it's from an import
          const importedFrom = context.imports.get(baseName);

          edges.push({
            id: uuidv4(),
            type: 'INHERITS',
            from_id: classNode.id,
            to_id: parentNode?.id || baseName,
            properties: {
              parent_name: baseName,
              is_resolved: !!parentNode,
              imported_from: importedFrom || undefined,
            },
            extraction: this.createExtractionMetadata(1, schemaName, parentNode ? 0.95 : 0.7),
          });
        }
      }
    } else if (file.language === 'typescript' || file.language === 'javascript') {
      let match;
      while ((match = tsClassRegex.exec(file.content)) !== null) {
        const className = match[1];
        const extendsClass = match[2];
        const implementsList = match[3];

        // Find the class node
        const classNode = nodes.find(
          (n) => n.type === 'Class' && n.name === className
        );

        if (!classNode) continue;

        // Handle extends
        if (extendsClass) {
          const baseName = extendsClass.replace(/<.*>/, '').trim();
          const parentNode = nodes.find(
            (n) => n.type === 'Class' && n.name === baseName
          );
          const importedFrom = context.imports.get(baseName);

          edges.push({
            id: uuidv4(),
            type: 'INHERITS',
            from_id: classNode.id,
            to_id: parentNode?.id || baseName,
            properties: {
              parent_name: baseName,
              inheritance_type: 'extends',
              is_resolved: !!parentNode,
              imported_from: importedFrom || undefined,
            },
            extraction: this.createExtractionMetadata(1, schemaName, parentNode ? 0.95 : 0.7),
          });
        }

        // Handle implements
        if (implementsList) {
          const interfaces = implementsList.split(',').map((i) => i.trim()).filter(Boolean);

          for (const iface of interfaces) {
            const baseName = iface.replace(/<.*>/, '').trim();
            const ifaceNode = nodes.find(
              (n) => (n.type === 'Class' || n.type === 'Interface') && n.name === baseName
            );
            const importedFrom = context.imports.get(baseName);

            edges.push({
              id: uuidv4(),
              type: 'IMPLEMENTS',
              from_id: classNode.id,
              to_id: ifaceNode?.id || baseName,
              properties: {
                interface_name: baseName,
                is_resolved: !!ifaceNode,
                imported_from: importedFrom || undefined,
              },
              extraction: this.createExtractionMetadata(1, schemaName, ifaceNode ? 0.95 : 0.7),
            });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Extract function calls to create CALLS edges.
   * This identifies function/method calls within the code.
   */
  private extractFunctionCalls(
    file: SourceFile,
    nodes: MeshNode[],
    context: FileContext,
    schemaName: string
  ): MeshEdge[] {
    const edges: MeshEdge[] = [];
    const lines = file.content.split('\n');

    // Build a map of function/method nodes by their scope (line ranges)
    const functionNodes = nodes.filter(
      (n) => n.type === 'Function' || n.type === 'Method'
    );

    // Simple call detection regex patterns
    // Python: function_name(, self.method(, Class.method(, await func(
    // TypeScript: function_name(, this.method(, object.method(, await func(
    const callPatterns =
      file.language === 'python'
        ? [
            /(?:await\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, // Regular function call
            /(?:await\s+)?self\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, // self.method()
            /(?:await\s+)?([A-Z][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, // Class.method()
          ]
        : [
            /(?:await\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // Regular function call
            /(?:await\s+)?this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // this.method()
            /(?:await\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // object.method()
          ];

    // For each function node, look for calls within its scope
    for (const funcNode of functionNodes) {
      const startLine = funcNode.source.line_start;
      const endLine = funcNode.source.line_end;

      // Get content within this function's scope
      const scopeContent = lines.slice(startLine - 1, endLine).join('\n');

      // Find all function calls in this scope
      const calledFunctions = new Set<string>();

      for (const pattern of callPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        let match;
        while ((match = pattern.exec(scopeContent)) !== null) {
          // Get the function name (last capture group)
          const funcName = match[match.length - 1] || match[1];

          // Skip common keywords and built-ins
          const skipNames = new Set([
            'if', 'for', 'while', 'with', 'return', 'print', 'len', 'str',
            'int', 'float', 'list', 'dict', 'set', 'tuple', 'range', 'enumerate',
            'zip', 'map', 'filter', 'sorted', 'reversed', 'type', 'isinstance',
            'hasattr', 'getattr', 'setattr', 'super', 'open', 'Exception',
            // TypeScript
            'console', 'require', 'export', 'import', 'new', 'typeof', 'delete',
            'Array', 'Object', 'String', 'Number', 'Boolean', 'Promise',
            'Math', 'JSON', 'Date', 'Error', 'RegExp', 'Map', 'Set',
          ]);

          if (funcName && !skipNames.has(funcName) && funcName !== funcNode.name) {
            calledFunctions.add(funcName);
          }
        }
      }

      // Create CALLS edges
      for (const calledName of calledFunctions) {
        // Try to resolve to a known function in this file
        const targetNode = nodes.find(
          (n) =>
            (n.type === 'Function' || n.type === 'Method') &&
            n.name === calledName
        );

        edges.push({
          id: uuidv4(),
          type: 'CALLS',
          from_id: funcNode.id,
          to_id: targetNode?.id || calledName, // Use node ID if found, else name for cross-file linking
          properties: {
            target_name: calledName,
            is_resolved: !!targetNode,
          },
          extraction: this.createExtractionMetadata(1, schemaName, targetNode ? 0.9 : 0.6),
        });
      }
    }

    return edges;
  }

  /**
   * Extract imports to build context and create IMPORTS edges.
   */
  private extractImports(
    file: SourceFile,
    schema: Schema,
    context: FileContext
  ): void {
    // Simple import extraction for context building
    // Python: from x import y, import x
    // TypeScript: import { x } from 'y', import x from 'y'

    const pythonImportRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
    const tsImportRegex =
      /^import\s+(?:{([^}]+)}|(\S+))\s+from\s+['"]([^'"]+)['"];?$/gm;

    if (file.language === 'python') {
      let match;
      while ((match = pythonImportRegex.exec(file.content)) !== null) {
        const module = match[1] || '';
        const imports = match[2] || '';

        // Calculate line number of this import
        const beforeMatch = file.content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        for (const imp of imports.split(',')) {
          const parts = imp.trim().split(/\s+as\s+/);
          const name = parts[0] ?? '';
          const alias = parts[1] ?? name;
          if (name) {
            const fullModule = module ? `${module}.${name}` : name;
            context.imports.set(alias, fullModule);

            // Create IMPORTS edge from file to module
            context.importEdges.push({
              id: uuidv4(),
              type: 'IMPORTS',
              from_id: context.fileNodeId,
              to_id: fullModule, // Use module path as target ID for cross-file linking
              properties: {
                import_name: name,
                alias: alias !== name ? alias : undefined,
                module: module || name,
                line: lineNumber,
              },
              extraction: this.createExtractionMetadata(1, schema.name, 0.9),
            });
          }
        }
      }
    } else if (file.language === 'typescript' || file.language === 'javascript') {
      let match;
      while ((match = tsImportRegex.exec(file.content)) !== null) {
        const namedImports = match[1] || '';
        const defaultImport = match[2] || '';
        const from = match[3] || '';

        // Calculate line number of this import
        const beforeMatch = file.content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        if (defaultImport) {
          context.imports.set(defaultImport, from);

          // Create IMPORTS edge
          context.importEdges.push({
            id: uuidv4(),
            type: 'IMPORTS',
            from_id: context.fileNodeId,
            to_id: from,
            properties: {
              import_name: defaultImport,
              import_type: 'default',
              module: from,
              line: lineNumber,
            },
            extraction: this.createExtractionMetadata(1, schema.name, 0.9),
          });
        }
        for (const imp of namedImports.split(',')) {
          const parts = imp.trim().split(/\s+as\s+/);
          const name = parts[0] ?? '';
          const alias = parts[1] ?? name;
          if (name) {
            context.imports.set(alias, from);

            // Create IMPORTS edge
            context.importEdges.push({
              id: uuidv4(),
              type: 'IMPORTS',
              from_id: context.fileNodeId,
              to_id: from,
              properties: {
                import_name: name,
                alias: alias !== name ? alias : undefined,
                import_type: 'named',
                module: from,
                line: lineNumber,
              },
              extraction: this.createExtractionMetadata(1, schema.name, 0.9),
            });
          }
        }
      }
    }
  }

  /**
   * Update context based on newly created node.
   */
  private updateContext(node: MeshNode, context: FileContext): void {
    if (node.type === 'Class') {
      context.currentClass = { id: node.id, name: node.name };
      context.currentFunction = undefined;
    } else if (node.type === 'Function' || node.type === 'Method') {
      context.currentFunction = { id: node.id, name: node.name };
    }
  }

  /**
   * Calculate the end line of a Python scope based on indentation.
   * Python uses indentation to define scope, so we find where the
   * indentation returns to the same level as (or less than) the definition.
   */
  private calculatePythonScopeEnd(
    content: string,
    startLine: number,
    definitionIndent?: string
  ): number {
    const lines = content.split('\n');

    // Get the indentation of the definition line (def/class line)
    const defLine = lines[startLine - 1] || '';
    const defIndentMatch = defLine.match(/^(\s*)/);
    const defIndent = definitionIndent || (defIndentMatch?.[1] ?? '');
    const defIndentLen = defIndent.length;

    // Find where the scope ends
    // The body of a Python function/class is indented MORE than the definition
    // We need to find the first non-empty line that has indentation <= defIndentLen
    let lastContentLine = startLine;
    let foundBody = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // Skip empty lines and comment-only lines
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // Get current line's indentation
      const indentMatch = line.match(/^(\s*)/);
      const currentIndent = indentMatch?.[1]?.length ?? 0;

      // First non-empty line after definition should be indented more (the body)
      if (!foundBody) {
        if (currentIndent > defIndentLen) {
          foundBody = true;
          lastContentLine = i + 1;
        } else {
          // No body found (maybe single-line or abstract)
          return startLine + 1;
        }
      } else {
        // We're in the body - check if we've left the scope
        if (currentIndent <= defIndentLen) {
          // We've found a line at or before the definition indentation
          // The scope ended on the previous content line
          break;
        }
        lastContentLine = i + 1;
      }
    }

    return Math.max(lastContentLine, startLine + 1);
  }

  /**
   * Calculate the end line of a TypeScript/JavaScript scope based on brace matching.
   * Counts opening and closing braces to find where the block ends.
   */
  private calculateBraceScopeEnd(content: string, startLine: number): number {
    const lines = content.split('\n');

    // Find the line with the opening brace
    let braceCount = 0;
    let foundOpeningBrace = false;
    let startSearchLine = startLine - 1;

    // Look for the opening brace (might be on same line or next few lines)
    for (let i = startSearchLine; i < Math.min(startSearchLine + 5, lines.length); i++) {
      const line = lines[i] ?? '';
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpeningBrace = true;
        } else if (char === '}') {
          braceCount--;
        }
      }
      if (foundOpeningBrace && braceCount === 0) {
        // Single-line function or class
        return i + 1;
      }
      if (foundOpeningBrace) {
        startSearchLine = i + 1;
        break;
      }
    }

    if (!foundOpeningBrace) {
      // Arrow function without braces or other edge case
      return startLine + 1;
    }

    // Continue counting braces until we balance
    for (let i = startSearchLine; i < lines.length; i++) {
      const line = lines[i] ?? '';

      // Skip string literals (simplified - doesn't handle all edge cases)
      let inString = false;
      let stringChar = '';

      for (let j = 0; j < line.length; j++) {
        const char = line[j] ?? '';
        const prevChar = j > 0 ? (line[j - 1] ?? '') : '';

        // Track string state (simplified)
        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
        }

        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              return i + 1; // Return 1-based line number
            }
          }
        }
      }
    }

    // If we couldn't find the closing brace, return end of file
    return lines.length;
  }
}
