/**
 * ReferenceCollector - Collect external references from extracted mesh data.
 *
 * Finds references to:
 * - Message queues (SQS, RabbitMQ, Kafka topics)
 * - External APIs (HTTP endpoints)
 * - Databases (connection strings, table names)
 * - Configuration values (environment variables)
 *
 * These references are used to link nodes across projects.
 */

import { MeshNode, MeshEdge, ProjectExtractionResult } from '../types';

export type ReferenceType = 'queue' | 'topic' | 'api' | 'database' | 'config' | 'service';

export interface ExternalReference {
  /** Type of reference */
  type: ReferenceType;
  /** Identifier (queue name, API path, etc.) */
  identifier: string;
  /** Whether this is a producer/caller or consumer/handler */
  direction: 'produce' | 'consume' | 'both';
  /** Source node that has this reference */
  sourceNodeId: string;
  /** Source file */
  sourceFile: string;
  /** Project ID */
  projectId: string;
  /** Additional context */
  context: Record<string, string>;
  /** Confidence score */
  confidence: number;
}

export interface CollectorConfig {
  /** Collect queue references */
  collectQueues: boolean;
  /** Collect API references */
  collectApis: boolean;
  /** Collect database references */
  collectDatabases: boolean;
  /** Collect config references */
  collectConfigs: boolean;
}

const DEFAULT_CONFIG: CollectorConfig = {
  collectQueues: true,
  collectApis: true,
  collectDatabases: true,
  collectConfigs: true,
};

export class ReferenceCollector {
  private config: CollectorConfig;

  constructor(config: Partial<CollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Collect all external references from project extraction results.
   */
  collect(result: ProjectExtractionResult): ExternalReference[] {
    const references: ExternalReference[] = [];

    for (const fileResult of result.results) {
      for (const node of fileResult.nodes) {
        const nodeRefs = this.collectFromNode(node, result.project_id, fileResult.file);
        references.push(...nodeRefs);
      }
    }

    return references;
  }

  /**
   * Collect references from a single node.
   */
  private collectFromNode(
    node: MeshNode,
    projectId: string,
    sourceFile: string
  ): ExternalReference[] {
    const refs: ExternalReference[] = [];

    // Queue/Topic nodes
    if (this.config.collectQueues && (node.type === 'Queue' || node.type === 'Topic')) {
      refs.push({
        type: node.type === 'Queue' ? 'queue' : 'topic',
        identifier: node.name,
        direction: 'both', // Will be refined by edge analysis
        sourceNodeId: node.id,
        sourceFile,
        projectId,
        context: {
          ...this.extractStringProps(node.properties),
        },
        confidence: node.extraction.confidence,
      });
    }

    // Consumer/Producer nodes
    if (this.config.collectQueues && (node.type === 'Consumer' || node.type === 'Producer')) {
      const queueName = node.properties['queue'] as string ||
                        node.properties['topic'] as string ||
                        node.name;
      refs.push({
        type: 'queue',
        identifier: queueName,
        direction: node.type === 'Consumer' ? 'consume' : 'produce',
        sourceNodeId: node.id,
        sourceFile,
        projectId,
        context: {
          handler: node.name,
          ...this.extractStringProps(node.properties),
        },
        confidence: node.extraction.confidence,
      });
    }

    // API endpoints
    if (this.config.collectApis && node.type === 'ApiEndpoint') {
      const method = (node.properties['method'] as string) || 'GET';
      const path = (node.properties['path'] as string) || node.name;
      refs.push({
        type: 'api',
        identifier: `${method} ${path}`,
        direction: 'consume', // Endpoints consume requests
        sourceNodeId: node.id,
        sourceFile,
        projectId,
        context: {
          method,
          path,
          handler: node.name,
          ...this.extractStringProps(node.properties),
        },
        confidence: node.extraction.confidence,
      });
    }

    // External service calls
    if (this.config.collectApis && node.type === 'ExternalService') {
      refs.push({
        type: 'service',
        identifier: node.name,
        direction: 'produce', // Calling external services
        sourceNodeId: node.id,
        sourceFile,
        projectId,
        context: {
          url: node.properties['url'] as string,
          ...this.extractStringProps(node.properties),
        },
        confidence: node.extraction.confidence,
      });
    }

    // Database/Table/Model nodes
    if (this.config.collectDatabases) {
      if (node.type === 'Database' || node.type === 'Table' || node.type === 'Model') {
        const dbType = node.type === 'Database' ? 'database' : 'database';
        refs.push({
          type: dbType,
          identifier: node.name,
          direction: 'both',
          sourceNodeId: node.id,
          sourceFile,
          projectId,
          context: {
            tableName: node.properties['table_name'] as string || node.name,
            ...this.extractStringProps(node.properties),
          },
          confidence: node.extraction.confidence,
        });
      }
    }

    // Config values
    if (this.config.collectConfigs && node.type === 'ConfigValue') {
      refs.push({
        type: 'config',
        identifier: node.name,
        direction: 'consume',
        sourceNodeId: node.id,
        sourceFile,
        projectId,
        context: {
          defaultValue: node.properties['default'] as string,
          ...this.extractStringProps(node.properties),
        },
        confidence: node.extraction.confidence,
      });
    }

    return refs;
  }

  /**
   * Extract string properties from node.
   */
  private extractStringProps(props: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Collect references from node properties that look like external identifiers.
   * This catches references that aren't explicit nodes but appear in properties.
   */
  collectFromProperties(
    node: MeshNode,
    projectId: string,
    sourceFile: string
  ): ExternalReference[] {
    const refs: ExternalReference[] = [];

    // Look for queue/topic patterns in properties
    const queuePatterns = ['queue_name', 'queue_url', 'topic_name', 'topic_arn', 'sqs_queue', 'kafka_topic'];
    for (const pattern of queuePatterns) {
      const value = node.properties[pattern];
      if (typeof value === 'string' && value.length > 0) {
        refs.push({
          type: pattern.includes('topic') ? 'topic' : 'queue',
          identifier: value,
          direction: 'both',
          sourceNodeId: node.id,
          sourceFile,
          projectId,
          context: { source: pattern },
          confidence: 0.6, // Lower confidence for property extraction
        });
      }
    }

    // Look for API URL patterns
    const apiPatterns = ['api_url', 'base_url', 'endpoint', 'service_url'];
    for (const pattern of apiPatterns) {
      const value = node.properties[pattern];
      if (typeof value === 'string' && value.length > 0) {
        refs.push({
          type: 'api',
          identifier: value,
          direction: 'produce',
          sourceNodeId: node.id,
          sourceFile,
          projectId,
          context: { source: pattern },
          confidence: 0.6,
        });
      }
    }

    // Look for database patterns
    const dbPatterns = ['table_name', 'database_name', 'db_name', 'schema'];
    for (const pattern of dbPatterns) {
      const value = node.properties[pattern];
      if (typeof value === 'string' && value.length > 0) {
        refs.push({
          type: 'database',
          identifier: value,
          direction: 'both',
          sourceNodeId: node.id,
          sourceFile,
          projectId,
          context: { source: pattern },
          confidence: 0.6,
        });
      }
    }

    return refs;
  }
}
