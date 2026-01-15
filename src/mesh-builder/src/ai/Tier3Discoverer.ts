/**
 * Tier3Discoverer - Full AI-driven code discovery for unknown frameworks.
 *
 * Used when:
 * - No schemas match the file
 * - Tier 1 produces very low confidence results
 * - Unknown framework patterns are detected
 *
 * This is the most expensive tier but enables self-learning.
 */

import { v4 as uuidv4 } from 'uuid';
import { AIClient, AIResponse, DiscoveryResult } from './AIClient';
import {
  MeshNode,
  MeshEdge,
  SourceFile,
  ExtractionMetadata,
  MeshNodeType,
  MeshEdgeType,
  FileExtractionResult,
} from '../types';

export interface Tier3Context {
  file: SourceFile;
  projectId: string;
  /** Known imports in the file for context */
  imports?: string[];
}

export interface Tier3Result {
  result: FileExtractionResult;
  frameworkDetected?: {
    name: string;
    confidence: number;
  };
  schemaSuggestions: SchemaSuggestion[];
  tokensUsed: number;
  aiCalls: number;
}

export interface SchemaSuggestion {
  pattern: string;
  example: string;
  nodeType: string;
  count: number;
}

export interface Tier3DiscovererConfig {
  /** Maximum file size to process with AI (cost control) */
  maxFileSize: number;
  /** Maximum tokens for discovery prompt */
  maxPromptTokens: number;
  /** Minimum confidence to accept AI discoveries */
  minConfidence: number;
  /** Whether to aggregate schema suggestions */
  aggregateSuggestions: boolean;
}

const DEFAULT_CONFIG: Tier3DiscovererConfig = {
  maxFileSize: 50000, // ~50KB
  maxPromptTokens: 8000,
  minConfidence: 0.5,
  aggregateSuggestions: true,
};

// Valid node types for validation
const VALID_NODE_TYPES = new Set<MeshNodeType>([
  'File', 'Module', 'Class', 'Interface', 'Function', 'Method',
  'Variable', 'Import', 'Decorator', 'ApiEndpoint', 'ApiParameter',
  'ApiResponse', 'Queue', 'Topic', 'Consumer', 'Producer',
  'Database', 'Table', 'Column', 'Model', 'ExternalService', 'ConfigValue',
]);

const VALID_EDGE_TYPES = new Set<MeshEdgeType>([
  'CONTAINS', 'IMPORTS', 'EXPORTS', 'INHERITS', 'IMPLEMENTS',
  'CALLS', 'USES', 'RETURNS', 'ACCEPTS', 'DECORATES', 'DECORATED_BY',
  'EXPOSES', 'HANDLED_BY', 'PUBLISHES_TO', 'SUBSCRIBES_TO',
  'READS_FROM', 'WRITES_TO', 'QUERIES', 'CALLS_SERVICE', 'DEPENDS_ON',
]);

export class Tier3Discoverer {
  private config: Tier3DiscovererConfig;
  private suggestionCache: Map<string, SchemaSuggestion> = new Map();

  constructor(
    private aiClient: AIClient,
    config: Partial<Tier3DiscovererConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Discover code structure using AI when no schemas match.
   */
  async discover(context: Tier3Context): Promise<Tier3Result> {
    // Skip files that are too large
    if (context.file.size > this.config.maxFileSize) {
      return this.createEmptyResult(context, 'File too large for AI discovery');
    }

    // Prepare content (may need truncation)
    const content = this.prepareContent(context.file);

    // Call AI for discovery
    const aiResult = await this.aiClient.discover({
      file: context.file.relativePath,
      language: context.file.language,
      content,
    });

    // Convert AI result to mesh nodes/edges
    const nodes = this.convertToNodes(aiResult.data, context);
    const edges = this.convertToEdges(aiResult.data, nodes, context);

    // Process schema suggestions
    const schemaSuggestions = this.processSuggestions(aiResult.data);

    // Calculate confidence
    const avgConfidence =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + n.extraction.confidence, 0) / nodes.length
        : 0;

    return {
      result: {
        file: context.file.relativePath,
        language: context.file.language,
        nodes,
        edges,
        confidence: avgConfidence,
        tier: 3,
        schemas_used: [],
        unresolved_patterns: [],
        errors: [],
      },
      frameworkDetected: aiResult.data.frameworkDetected,
      schemaSuggestions,
      tokensUsed: aiResult.tokensUsed,
      aiCalls: 1,
    };
  }

  /**
   * Prepare file content for AI prompt (truncate if needed).
   */
  private prepareContent(file: SourceFile): string {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = this.config.maxPromptTokens * 4;

    if (file.content.length <= maxChars) {
      return file.content;
    }

    // Truncate but try to keep complete functions/classes
    const lines = file.content.split('\n');
    let result = '';
    let charCount = 0;

    for (const line of lines) {
      if (charCount + line.length > maxChars) {
        result += '\n... (truncated)';
        break;
      }
      result += line + '\n';
      charCount += line.length + 1;
    }

    return result;
  }

  /**
   * Convert AI discovery nodes to MeshNodes.
   */
  private convertToNodes(
    discovery: DiscoveryResult,
    context: Tier3Context
  ): MeshNode[] {
    const nodes: MeshNode[] = [];

    // Always create a file node
    nodes.push({
      id: uuidv4(),
      type: 'File',
      name: context.file.relativePath,
      properties: {
        language: context.file.language,
        size: context.file.size,
        framework: discovery.frameworkDetected?.name,
      },
      source: {
        file: context.file.relativePath,
        line_start: 1,
        line_end: context.file.content.split('\n').length,
      },
      project_id: context.projectId,
      extraction: this.createExtractionMetadata(1.0),
    });

    // Convert discovered nodes
    for (const aiNode of discovery.nodes) {
      // Validate node type
      const nodeType = this.validateNodeType(aiNode.type);
      if (!nodeType) continue;

      // Filter low confidence
      if (aiNode.confidence < this.config.minConfidence) continue;

      nodes.push({
        id: uuidv4(),
        type: nodeType,
        name: aiNode.name,
        properties: aiNode.properties,
        source: {
          file: context.file.relativePath,
          line_start: aiNode.lineStart,
          line_end: aiNode.lineEnd,
        },
        project_id: context.projectId,
        extraction: this.createExtractionMetadata(aiNode.confidence),
      });
    }

    return nodes;
  }

  /**
   * Convert AI discovery edges to MeshEdges.
   */
  private convertToEdges(
    discovery: DiscoveryResult,
    nodes: MeshNode[],
    context: Tier3Context
  ): MeshEdge[] {
    const edges: MeshEdge[] = [];
    const nodesByName = new Map(nodes.map((n) => [n.name, n.id]));
    const fileNodeId = nodes.find((n) => n.type === 'File')?.id;

    // Add CONTAINS edges from file to top-level entities
    if (fileNodeId) {
      for (const node of nodes) {
        if (node.type !== 'File') {
          edges.push({
            id: uuidv4(),
            type: 'CONTAINS',
            from_id: fileNodeId,
            to_id: node.id,
            extraction: this.createExtractionMetadata(0.9),
          });
        }
      }
    }

    // Convert discovered edges
    for (const aiEdge of discovery.edges) {
      // Validate edge type
      const edgeType = this.validateEdgeType(aiEdge.type);
      if (!edgeType) continue;

      // Filter low confidence
      if (aiEdge.confidence < this.config.minConfidence) continue;

      // Resolve node IDs
      const fromId = nodesByName.get(aiEdge.fromName);
      const toId = nodesByName.get(aiEdge.toName);

      if (fromId && toId) {
        edges.push({
          id: uuidv4(),
          type: edgeType,
          from_id: fromId,
          to_id: toId,
          extraction: this.createExtractionMetadata(aiEdge.confidence),
        });
      }
    }

    return edges;
  }

  /**
   * Process and aggregate schema suggestions.
   */
  private processSuggestions(discovery: DiscoveryResult): SchemaSuggestion[] {
    const suggestions: SchemaSuggestion[] = [];

    for (const sugg of discovery.schemaSuggestions) {
      if (!sugg.pattern || !sugg.nodeType) continue;

      const key = `${sugg.pattern}:${sugg.nodeType}`;

      if (this.config.aggregateSuggestions) {
        const existing = this.suggestionCache.get(key);
        if (existing) {
          existing.count++;
          continue;
        }
      }

      const suggestion: SchemaSuggestion = {
        pattern: sugg.pattern,
        example: sugg.example,
        nodeType: sugg.nodeType,
        count: 1,
      };

      if (this.config.aggregateSuggestions) {
        this.suggestionCache.set(key, suggestion);
      }

      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * Validate and normalize node type.
   */
  private validateNodeType(type: string): MeshNodeType | null {
    // Direct match
    if (VALID_NODE_TYPES.has(type as MeshNodeType)) {
      return type as MeshNodeType;
    }

    // Common mappings
    const mappings: Record<string, MeshNodeType> = {
      'function': 'Function',
      'method': 'Method',
      'class': 'Class',
      'interface': 'Interface',
      'type': 'Interface',
      'module': 'Module',
      'import': 'Import',
      'decorator': 'Decorator',
      'endpoint': 'ApiEndpoint',
      'route': 'ApiEndpoint',
      'api': 'ApiEndpoint',
      'model': 'Model',
      'entity': 'Model',
      'schema': 'Model',
      'table': 'Table',
      'column': 'Column',
      'field': 'Variable',
      'variable': 'Variable',
      'constant': 'Variable',
      'config': 'ConfigValue',
      'queue': 'Queue',
      'topic': 'Topic',
      'consumer': 'Consumer',
      'producer': 'Producer',
      'service': 'ExternalService',
    };

    const normalized = type.toLowerCase();
    return mappings[normalized] || null;
  }

  /**
   * Validate and normalize edge type.
   */
  private validateEdgeType(type: string): MeshEdgeType | null {
    // Direct match
    if (VALID_EDGE_TYPES.has(type as MeshEdgeType)) {
      return type as MeshEdgeType;
    }

    // Common mappings
    const mappings: Record<string, MeshEdgeType> = {
      'contains': 'CONTAINS',
      'imports': 'IMPORTS',
      'exports': 'EXPORTS',
      'extends': 'INHERITS',
      'inherits': 'INHERITS',
      'implements': 'IMPLEMENTS',
      'calls': 'CALLS',
      'uses': 'USES',
      'returns': 'RETURNS',
      'accepts': 'ACCEPTS',
      'decorates': 'DECORATES',
      'handles': 'HANDLED_BY',
      'exposes': 'EXPOSES',
      'publishes': 'PUBLISHES_TO',
      'subscribes': 'SUBSCRIBES_TO',
      'reads': 'READS_FROM',
      'writes': 'WRITES_TO',
      'queries': 'QUERIES',
      'depends': 'DEPENDS_ON',
      'depends_on': 'DEPENDS_ON',
    };

    const normalized = type.toLowerCase().replace(/_/g, '');
    return mappings[normalized] || null;
  }

  /**
   * Create extraction metadata for Tier 3.
   */
  private createExtractionMetadata(confidence: number): ExtractionMetadata {
    return {
      tier: 3,
      confidence,
      extracted_at: new Date().toISOString(),
    };
  }

  /**
   * Create empty result (for skipped files).
   */
  private createEmptyResult(context: Tier3Context, reason: string): Tier3Result {
    return {
      result: {
        file: context.file.relativePath,
        language: context.file.language,
        nodes: [],
        edges: [],
        confidence: 0,
        tier: 3,
        schemas_used: [],
        unresolved_patterns: [],
        errors: [reason],
      },
      schemaSuggestions: [],
      tokensUsed: 0,
      aiCalls: 0,
    };
  }

  /**
   * Get aggregated schema suggestions (for self-learning).
   */
  getAggregatedSuggestions(): SchemaSuggestion[] {
    return Array.from(this.suggestionCache.values()).sort(
      (a, b) => b.count - a.count
    );
  }

  /**
   * Clear suggestion cache.
   */
  clearSuggestionCache(): void {
    this.suggestionCache.clear();
  }
}
