/**
 * CrossProjectMatcher - Match references across projects.
 *
 * Uses multiple strategies:
 * 1. Literal matching (exact string match)
 * 2. Config resolution (resolve env vars then match)
 * 3. Pattern matching (URL patterns, queue name patterns)
 * 4. AI-assisted matching (for ambiguous cases)
 */

import { ExternalReference, ReferenceType } from './ReferenceCollector';
import { ConfigResolver, ResolvedConfig } from './ConfigResolver';

export interface MatchCandidate {
  /** Producer reference */
  producer: ExternalReference;
  /** Consumer reference */
  consumer: ExternalReference;
  /** Match confidence */
  confidence: number;
  /** How the match was determined */
  method: 'literal' | 'config' | 'pattern' | 'ai';
  /** Resolved identifiers if different from original */
  resolvedProducer?: string;
  resolvedConsumer?: string;
}

export interface MatcherConfig {
  /** Minimum confidence to consider a match */
  minConfidence: number;
  /** Enable pattern-based matching */
  enablePatternMatching: boolean;
  /** Enable AI-assisted matching */
  enableAIMatching: boolean;
}

const DEFAULT_CONFIG: MatcherConfig = {
  minConfidence: 0.5,
  enablePatternMatching: true,
  enableAIMatching: false, // Disabled by default due to cost
};

export class CrossProjectMatcher {
  private config: MatcherConfig;
  private configResolvers: Map<string, ConfigResolver> = new Map();

  constructor(config: Partial<MatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a config resolver for a project.
   */
  registerConfigResolver(projectId: string, resolver: ConfigResolver): void {
    this.configResolvers.set(projectId, resolver);
  }

  /**
   * Find matches between references from different projects.
   */
  async findMatches(references: ExternalReference[]): Promise<MatchCandidate[]> {
    const matches: MatchCandidate[] = [];

    // Group references by type
    const byType = this.groupByType(references);

    // Find matches for each type
    for (const [type, refs] of byType) {
      const typeMatches = await this.findTypeMatches(type, refs);
      matches.push(...typeMatches);
    }

    // Filter by confidence
    return matches.filter((m) => m.confidence >= this.config.minConfidence);
  }

  /**
   * Group references by type.
   */
  private groupByType(
    references: ExternalReference[]
  ): Map<ReferenceType, ExternalReference[]> {
    const grouped = new Map<ReferenceType, ExternalReference[]>();

    for (const ref of references) {
      const existing = grouped.get(ref.type) || [];
      existing.push(ref);
      grouped.set(ref.type, existing);
    }

    return grouped;
  }

  /**
   * Find matches within a reference type.
   */
  private async findTypeMatches(
    type: ReferenceType,
    refs: ExternalReference[]
  ): Promise<MatchCandidate[]> {
    const matches: MatchCandidate[] = [];

    // Separate producers and consumers
    const producers = refs.filter(
      (r) => r.direction === 'produce' || r.direction === 'both'
    );
    const consumers = refs.filter(
      (r) => r.direction === 'consume' || r.direction === 'both'
    );

    // Try to match each producer with consumers
    for (const producer of producers) {
      for (const consumer of consumers) {
        // Skip same project matches
        if (producer.projectId === consumer.projectId) continue;

        const match = await this.tryMatch(producer, consumer);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Try to match two references.
   */
  private async tryMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): Promise<MatchCandidate | null> {
    // 1. Try literal matching
    const literalMatch = this.tryLiteralMatch(producer, consumer);
    if (literalMatch) return literalMatch;

    // 2. Try config resolution
    const configMatch = await this.tryConfigMatch(producer, consumer);
    if (configMatch) return configMatch;

    // 3. Try pattern matching
    if (this.config.enablePatternMatching) {
      const patternMatch = this.tryPatternMatch(producer, consumer);
      if (patternMatch) return patternMatch;
    }

    return null;
  }

  /**
   * Try literal string matching.
   */
  private tryLiteralMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): MatchCandidate | null {
    // Exact match
    if (producer.identifier === consumer.identifier) {
      return {
        producer,
        consumer,
        confidence: 0.95,
        method: 'literal',
      };
    }

    // Case-insensitive match
    if (producer.identifier.toLowerCase() === consumer.identifier.toLowerCase()) {
      return {
        producer,
        consumer,
        confidence: 0.85,
        method: 'literal',
      };
    }

    return null;
  }

  /**
   * Try matching after resolving config variables.
   */
  private async tryConfigMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): Promise<MatchCandidate | null> {
    const producerResolver = this.configResolvers.get(producer.projectId);
    const consumerResolver = this.configResolvers.get(consumer.projectId);

    let resolvedProducer = producer.identifier;
    let resolvedConsumer = consumer.identifier;

    // Resolve producer
    if (producerResolver && this.hasVariableRef(producer.identifier)) {
      const resolved = await producerResolver.resolve(producer.identifier);
      if (resolved) {
        resolvedProducer = resolved.value;
      }
    }

    // Resolve consumer
    if (consumerResolver && this.hasVariableRef(consumer.identifier)) {
      const resolved = await consumerResolver.resolve(consumer.identifier);
      if (resolved) {
        resolvedConsumer = resolved.value;
      }
    }

    // Compare resolved values
    if (resolvedProducer === resolvedConsumer) {
      return {
        producer,
        consumer,
        confidence: 0.85,
        method: 'config',
        resolvedProducer,
        resolvedConsumer,
      };
    }

    // Case-insensitive resolved match
    if (resolvedProducer.toLowerCase() === resolvedConsumer.toLowerCase()) {
      return {
        producer,
        consumer,
        confidence: 0.75,
        method: 'config',
        resolvedProducer,
        resolvedConsumer,
      };
    }

    return null;
  }

  /**
   * Try pattern-based matching.
   */
  private tryPatternMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): MatchCandidate | null {
    switch (producer.type) {
      case 'queue':
      case 'topic':
        return this.tryQueuePatternMatch(producer, consumer);
      case 'api':
        return this.tryApiPatternMatch(producer, consumer);
      case 'database':
        return this.tryDatabasePatternMatch(producer, consumer);
      default:
        return null;
    }
  }

  /**
   * Pattern matching for queues/topics.
   */
  private tryQueuePatternMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): MatchCandidate | null {
    // Extract queue name from various formats
    const producerName = this.extractQueueName(producer.identifier);
    const consumerName = this.extractQueueName(consumer.identifier);

    if (producerName === consumerName) {
      return {
        producer,
        consumer,
        confidence: 0.7,
        method: 'pattern',
        resolvedProducer: producerName,
        resolvedConsumer: consumerName,
      };
    }

    return null;
  }

  /**
   * Extract queue name from various formats (ARN, URL, etc.).
   */
  private extractQueueName(identifier: string): string {
    // AWS SQS ARN: arn:aws:sqs:region:account:queue-name
    if (identifier.startsWith('arn:aws:sqs:')) {
      const parts = identifier.split(':');
      return parts[parts.length - 1] ?? identifier;
    }

    // AWS SQS URL: https://sqs.region.amazonaws.com/account/queue-name
    if (identifier.includes('sqs.') && identifier.includes('amazonaws.com')) {
      const parts = identifier.split('/');
      return parts[parts.length - 1] ?? identifier;
    }

    // Kafka topic: may have prefix
    if (identifier.includes('.')) {
      const parts = identifier.split('.');
      return parts[parts.length - 1] ?? identifier;
    }

    return identifier;
  }

  /**
   * Pattern matching for APIs.
   */
  private tryApiPatternMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): MatchCandidate | null {
    // Extract path components
    const producerPath = this.extractApiPath(producer.identifier);
    const consumerPath = this.extractApiPath(consumer.identifier);

    if (producerPath === consumerPath) {
      return {
        producer,
        consumer,
        confidence: 0.7,
        method: 'pattern',
        resolvedProducer: producerPath,
        resolvedConsumer: consumerPath,
      };
    }

    // Check if paths match with different methods
    const producerPathOnly = producerPath.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/, '');
    const consumerPathOnly = consumerPath.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/, '');

    if (producerPathOnly === consumerPathOnly) {
      return {
        producer,
        consumer,
        confidence: 0.6,
        method: 'pattern',
        resolvedProducer: producerPathOnly,
        resolvedConsumer: consumerPathOnly,
      };
    }

    return null;
  }

  /**
   * Extract API path from various formats.
   */
  private extractApiPath(identifier: string): string {
    // Full URL: https://api.example.com/v1/users
    try {
      const url = new URL(identifier);
      return url.pathname;
    } catch {
      // Not a full URL
    }

    // Method + path: GET /api/users
    if (/^(GET|POST|PUT|DELETE|PATCH)\s+/.test(identifier)) {
      return identifier;
    }

    // Just path
    return identifier;
  }

  /**
   * Pattern matching for databases.
   */
  private tryDatabasePatternMatch(
    producer: ExternalReference,
    consumer: ExternalReference
  ): MatchCandidate | null {
    // Extract table name from various formats
    const producerTable = this.extractTableName(producer.identifier);
    const consumerTable = this.extractTableName(consumer.identifier);

    if (producerTable === consumerTable) {
      return {
        producer,
        consumer,
        confidence: 0.7,
        method: 'pattern',
        resolvedProducer: producerTable,
        resolvedConsumer: consumerTable,
      };
    }

    return null;
  }

  /**
   * Extract table name from various formats.
   */
  private extractTableName(identifier: string): string {
    // Schema.table format
    if (identifier.includes('.')) {
      const parts = identifier.split('.');
      return parts[parts.length - 1] ?? identifier;
    }

    return identifier;
  }

  /**
   * Check if identifier contains variable reference.
   */
  private hasVariableRef(identifier: string): boolean {
    return identifier.includes('${') || identifier.includes('$');
  }
}
