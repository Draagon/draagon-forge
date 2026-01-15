/**
 * CrossServiceLinker - Create edges linking nodes across projects.
 *
 * Takes matched references and creates proper CrossProjectLink objects
 * that can be stored in the mesh graph.
 */

import { v4 as uuidv4 } from 'uuid';
import { CrossProjectLink, MeshEdge, ExtractionMetadata } from '../types';
import { MatchCandidate } from './CrossProjectMatcher';
import { ExternalReference, ReferenceType } from './ReferenceCollector';

export interface LinkingResult {
  /** Cross-project links created */
  links: CrossProjectLink[];
  /** Cross-project edges (for graph storage) */
  edges: MeshEdge[];
  /** Statistics */
  stats: LinkingStats;
}

export interface LinkingStats {
  totalMatches: number;
  linksCreated: number;
  edgesCreated: number;
  byType: Record<string, number>;
}

export interface LinkerConfig {
  /** Minimum confidence to create a link */
  minConfidence: number;
  /** Create bidirectional edges */
  bidirectional: boolean;
}

const DEFAULT_CONFIG: LinkerConfig = {
  minConfidence: 0.5,
  bidirectional: true,
};

export class CrossServiceLinker {
  private config: LinkerConfig;

  constructor(config: Partial<LinkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create links from matched references.
   */
  createLinks(matches: MatchCandidate[]): LinkingResult {
    const links: CrossProjectLink[] = [];
    const edges: MeshEdge[] = [];
    const byType: Record<string, number> = {};

    for (const match of matches) {
      // Skip low confidence matches
      if (match.confidence < this.config.minConfidence) continue;

      // Create cross-project link
      const link = this.createLink(match);
      links.push(link);

      // Create edge
      const edge = this.createEdge(match);
      edges.push(edge);

      // Track by type
      const typeKey = match.producer.type;
      byType[typeKey] = (byType[typeKey] || 0) + 1;

      // Create reverse edge if bidirectional
      if (this.config.bidirectional) {
        const reverseEdge = this.createReverseEdge(match);
        edges.push(reverseEdge);
      }
    }

    return {
      links,
      edges,
      stats: {
        totalMatches: matches.length,
        linksCreated: links.length,
        edgesCreated: edges.length,
        byType,
      },
    };
  }

  /**
   * Create a cross-project link from a match.
   */
  private createLink(match: MatchCandidate): CrossProjectLink {
    const linkType = this.mapReferenceTypeToLinkType(match.producer.type);

    return {
      type: linkType,
      from_project: match.producer.projectId,
      to_project: match.consumer.projectId,
      from_node_id: match.producer.sourceNodeId,
      to_node_id: match.consumer.sourceNodeId,
      confidence: match.confidence,
      resolution_method: this.mapMatchMethodToResolution(match.method),
    };
  }

  /**
   * Create an edge from a match.
   */
  private createEdge(match: MatchCandidate): MeshEdge {
    const edgeType = this.getEdgeType(match.producer.type, match.producer.direction);

    return {
      id: uuidv4(),
      type: edgeType,
      from_id: match.producer.sourceNodeId,
      to_id: match.consumer.sourceNodeId,
      properties: {
        cross_project: true,
        from_project: match.producer.projectId,
        to_project: match.consumer.projectId,
        identifier: match.resolvedProducer || match.producer.identifier,
        match_method: match.method,
      },
      extraction: this.createExtractionMetadata(match.confidence, match.method),
    };
  }

  /**
   * Create a reverse edge for bidirectional linking.
   */
  private createReverseEdge(match: MatchCandidate): MeshEdge {
    const edgeType = this.getReverseEdgeType(match.producer.type);

    return {
      id: uuidv4(),
      type: edgeType,
      from_id: match.consumer.sourceNodeId,
      to_id: match.producer.sourceNodeId,
      properties: {
        cross_project: true,
        from_project: match.consumer.projectId,
        to_project: match.producer.projectId,
        identifier: match.resolvedConsumer || match.consumer.identifier,
        match_method: match.method,
        reverse: true,
      },
      extraction: this.createExtractionMetadata(match.confidence, match.method),
    };
  }

  /**
   * Map reference type to link type.
   */
  private mapReferenceTypeToLinkType(
    refType: ReferenceType
  ): CrossProjectLink['type'] {
    switch (refType) {
      case 'queue':
      case 'topic':
        return 'queue';
      case 'api':
      case 'service':
        return 'api';
      case 'database':
        return 'database';
      default:
        return 'api'; // Default to API
    }
  }

  /**
   * Map match method to resolution method.
   */
  private mapMatchMethodToResolution(
    method: MatchCandidate['method']
  ): CrossProjectLink['resolution_method'] {
    switch (method) {
      case 'literal':
        return 'literal';
      case 'config':
        return 'config';
      case 'pattern':
      case 'ai':
        return 'ai';
      default:
        return 'literal';
    }
  }

  /**
   * Get appropriate edge type for a reference.
   */
  private getEdgeType(
    refType: ReferenceType,
    direction: ExternalReference['direction']
  ): MeshEdge['type'] {
    switch (refType) {
      case 'queue':
      case 'topic':
        return direction === 'produce' ? 'PUBLISHES_TO' : 'SUBSCRIBES_TO';
      case 'api':
      case 'service':
        return 'CALLS_SERVICE';
      case 'database':
        return direction === 'produce' ? 'WRITES_TO' : 'READS_FROM';
      default:
        return 'DEPENDS_ON';
    }
  }

  /**
   * Get reverse edge type.
   */
  private getReverseEdgeType(refType: ReferenceType): MeshEdge['type'] {
    switch (refType) {
      case 'queue':
      case 'topic':
        return 'SUBSCRIBES_TO';
      case 'api':
      case 'service':
        return 'HANDLED_BY';
      case 'database':
        return 'READS_FROM';
      default:
        return 'DEPENDS_ON';
    }
  }

  /**
   * Create extraction metadata for cross-project links.
   */
  private createExtractionMetadata(
    confidence: number,
    method: string
  ): ExtractionMetadata {
    // Cross-project links are considered Tier 2 (AI-assisted) or Tier 1 (literal)
    const tier = method === 'literal' ? 1 : 2;

    return {
      tier: tier as 1 | 2 | 3,
      confidence,
      extracted_at: new Date().toISOString(),
    };
  }
}
