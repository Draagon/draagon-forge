/**
 * Tier2Enhancer - AI-assisted disambiguation for ambiguous extractions.
 *
 * Used when Tier 1 (schema-based) extraction produces results with
 * low confidence or ambiguous patterns that need clarification.
 */

import {
  AIClient,
  AIResponse,
  DisambiguationResult,
} from './AIClient';
import {
  MeshNode,
  MeshEdge,
  SourceFile,
  ExtractionMetadata,
  MeshNodeType,
} from '../types';
import { PatternMatcherResult } from '../core/PatternMatcher';
import { v4 as uuidv4 } from 'uuid';

export interface Tier2Context {
  file: SourceFile;
  tier1Result: PatternMatcherResult;
  framework?: string;
  projectId: string;
}

export interface Tier2Result {
  enhancedNodes: MeshNode[];
  enhancedEdges: MeshEdge[];
  confidence: number;
  tokensUsed: number;
  aiCalls: number;
  enhancements: Enhancement[];
}

export interface Enhancement {
  originalNodeId: string;
  question: string;
  resolution: string;
  confidence: number;
}

export interface Tier2EnhancerConfig {
  /** Minimum confidence threshold - nodes below this are candidates for enhancement */
  confidenceThreshold: number;
  /** Maximum nodes to enhance per file (cost control) */
  maxEnhancementsPerFile: number;
  /** Whether to enhance node properties */
  enhanceProperties: boolean;
  /** Whether to discover missing relationships */
  discoverRelationships: boolean;
}

const DEFAULT_CONFIG: Tier2EnhancerConfig = {
  confidenceThreshold: 0.6,
  maxEnhancementsPerFile: 10,
  enhanceProperties: true,
  discoverRelationships: true,
};

export class Tier2Enhancer {
  private config: Tier2EnhancerConfig;

  constructor(
    private aiClient: AIClient,
    config: Partial<Tier2EnhancerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enhance Tier 1 extraction results using AI disambiguation.
   */
  async enhance(context: Tier2Context): Promise<Tier2Result> {
    const enhancedNodes: MeshNode[] = [...context.tier1Result.nodes];
    const enhancedEdges: MeshEdge[] = [...context.tier1Result.edges];
    const enhancements: Enhancement[] = [];
    let totalTokensUsed = 0;
    let aiCalls = 0;

    // Find nodes that need enhancement
    const candidateNodes = this.findEnhancementCandidates(
      context.tier1Result.nodes
    );

    // Enhance each candidate (up to limit)
    const nodesToEnhance = candidateNodes.slice(
      0,
      this.config.maxEnhancementsPerFile
    );

    for (const node of nodesToEnhance) {
      const question = this.generateQuestion(node, context);
      if (!question) continue;

      try {
        const result = await this.disambiguateNode(node, question, context);
        totalTokensUsed += result.tokensUsed;
        aiCalls++;

        // Apply enhancement to node
        const nodeIndex = enhancedNodes.findIndex((n) => n.id === node.id);
        if (nodeIndex !== -1 && result.data.confidence > node.extraction.confidence) {
          const enhancedNode = this.applyEnhancement(
            enhancedNodes[nodeIndex]!,
            result.data
          );
          enhancedNodes[nodeIndex] = enhancedNode;

          enhancements.push({
            originalNodeId: node.id,
            question: question.question,
            resolution: result.data.resolvedValue,
            confidence: result.data.confidence,
          });
        }
      } catch (error) {
        // Log but continue with other nodes
        console.error(`Failed to enhance node ${node.id}:`, error);
      }
    }

    // Optionally discover missing relationships
    if (this.config.discoverRelationships && aiCalls < this.config.maxEnhancementsPerFile) {
      const discoveredEdges = await this.discoverMissingRelationships(
        enhancedNodes,
        context
      );
      enhancedEdges.push(...discoveredEdges.edges);
      totalTokensUsed += discoveredEdges.tokensUsed;
      aiCalls += discoveredEdges.aiCalls;
    }

    // Calculate overall confidence
    const avgConfidence =
      enhancedNodes.length > 0
        ? enhancedNodes.reduce((sum, n) => sum + n.extraction.confidence, 0) /
          enhancedNodes.length
        : 0;

    return {
      enhancedNodes,
      enhancedEdges,
      confidence: avgConfidence,
      tokensUsed: totalTokensUsed,
      aiCalls,
      enhancements,
    };
  }

  /**
   * Find nodes that are candidates for AI enhancement.
   */
  private findEnhancementCandidates(nodes: MeshNode[]): MeshNode[] {
    return nodes.filter((node) => {
      // Skip file nodes
      if (node.type === 'File') return false;

      // Low confidence is primary candidate
      if (node.extraction.confidence < this.config.confidenceThreshold) {
        return true;
      }

      // Missing key properties
      if (this.hasMissingProperties(node)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Check if a node has missing properties that could be enhanced.
   */
  private hasMissingProperties(node: MeshNode): boolean {
    const requiredProperties: Partial<Record<MeshNodeType, string[]>> = {
      ApiEndpoint: ['method', 'path'],
      Function: ['parameters', 'return_type'],
      Class: ['bases'],
      Model: ['fields'],
    };

    const required = requiredProperties[node.type];
    if (!required) return false;

    return required.some(
      (prop) =>
        !node.properties[prop] ||
        node.properties[prop] === '' ||
        node.properties[prop] === 'unknown'
    );
  }

  /**
   * Generate a disambiguation question for a node.
   */
  private generateQuestion(
    node: MeshNode,
    context: Tier2Context
  ): { question: string; options: string[] } | null {
    const codeSnippet = this.extractCodeSnippet(
      context.file,
      node.source.line_start,
      node.source.line_end + 5
    );

    switch (node.type) {
      case 'ApiEndpoint':
        if (!node.properties['method'] || node.properties['method'] === '') {
          return {
            question: `What HTTP method does this endpoint handle?`,
            options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
          };
        }
        if (!node.properties['path'] || node.properties['path'] === '') {
          return {
            question: `What is the URL path for this endpoint?`,
            options: ['/', '/api', '/api/v1', 'custom'],
          };
        }
        break;

      case 'Function':
        if (!node.properties['return_type'] || node.properties['return_type'] === '') {
          return {
            question: `What is the return type of this function "${node.name}"?`,
            options: ['void', 'string', 'number', 'object', 'Promise', 'custom'],
          };
        }
        break;

      case 'Class':
        if (node.extraction.confidence < 0.5) {
          return {
            question: `What is the purpose of this class "${node.name}"?`,
            options: ['Service', 'Controller', 'Model', 'Utility', 'Repository'],
          };
        }
        break;

      case 'Variable':
        return {
          question: `Is this variable "${node.name}" a constant, configuration, or regular variable?`,
          options: ['constant', 'configuration', 'regular', 'environment'],
        };
    }

    return null;
  }

  /**
   * Call AI to disambiguate a node.
   */
  private async disambiguateNode(
    node: MeshNode,
    question: { question: string; options: string[] },
    context: Tier2Context
  ): Promise<AIResponse<DisambiguationResult>> {
    const codeSnippet = this.extractCodeSnippet(
      context.file,
      Math.max(1, node.source.line_start - 3),
      node.source.line_end + 5
    );

    return this.aiClient.disambiguate({
      file: context.file.relativePath,
      language: context.file.language,
      framework: context.framework,
      codeSnippet,
      question: question.question,
      options: question.options,
    });
  }

  /**
   * Apply an enhancement to a node.
   */
  private applyEnhancement(
    node: MeshNode,
    enhancement: DisambiguationResult
  ): MeshNode {
    const newProperties = { ...node.properties };

    // Merge enhanced properties
    for (const [key, value] of Object.entries(enhancement.properties)) {
      if (value && value !== '' && value !== 'unknown') {
        newProperties[key] = value;
      }
    }

    // Update node type if suggested and valid
    const newType = enhancement.nodeType as MeshNodeType || node.type;

    return {
      ...node,
      type: newType,
      properties: newProperties,
      extraction: {
        ...node.extraction,
        tier: 2,
        confidence: Math.max(node.extraction.confidence, enhancement.confidence),
        extracted_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Discover relationships that weren't found by Tier 1.
   */
  private async discoverMissingRelationships(
    nodes: MeshNode[],
    context: Tier2Context
  ): Promise<{ edges: MeshEdge[]; tokensUsed: number; aiCalls: number }> {
    const edges: MeshEdge[] = [];
    let tokensUsed = 0;
    let aiCalls = 0;

    // Find function calls that might not have been linked
    const functions = nodes.filter(
      (n) => n.type === 'Function' || n.type === 'Method'
    );
    const classes = nodes.filter((n) => n.type === 'Class');

    // Link methods to their classes based on indentation/context
    for (const method of functions.filter((f) => f.type === 'Method')) {
      const containingClass = this.findContainingClass(method, classes);
      if (containingClass) {
        const edgeExists = context.tier1Result.edges.some(
          (e) =>
            e.type === 'CONTAINS' &&
            e.from_id === containingClass.id &&
            e.to_id === method.id
        );

        if (!edgeExists) {
          edges.push({
            id: uuidv4(),
            type: 'CONTAINS',
            from_id: containingClass.id,
            to_id: method.id,
            extraction: this.createExtractionMetadata(0.7),
          });
        }
      }
    }

    return { edges, tokensUsed, aiCalls };
  }

  /**
   * Find the class that contains a method based on location.
   */
  private findContainingClass(
    method: MeshNode,
    classes: MeshNode[]
  ): MeshNode | undefined {
    // Find class where method's line is within class's range
    return classes.find(
      (cls) =>
        cls.source.file === method.source.file &&
        cls.source.line_start < method.source.line_start &&
        (cls.source.line_end > method.source.line_end ||
          cls.source.line_end === method.source.line_start)
    );
  }

  /**
   * Extract code snippet from file.
   */
  private extractCodeSnippet(
    file: SourceFile,
    startLine: number,
    endLine: number
  ): string {
    const lines = file.content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  /**
   * Create extraction metadata for Tier 2.
   */
  private createExtractionMetadata(confidence: number): ExtractionMetadata {
    return {
      tier: 2,
      confidence,
      extracted_at: new Date().toISOString(),
    };
  }
}
