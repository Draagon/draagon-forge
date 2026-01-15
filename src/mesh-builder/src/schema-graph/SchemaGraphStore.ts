/**
 * SchemaGraphStore - Store and evolve extraction schemas in Neo4j.
 *
 * Schemas live in the knowledge graph and evolve based on:
 * - Verification feedback (corrections, rejections)
 * - Framework detection (new patterns discovered)
 * - LLM improvements (Claude/Groq rewrites)
 *
 * Key concepts:
 * - Schema nodes contain metadata and detection rules
 * - Pattern nodes contain regex and templates
 * - TrustScore nodes track pattern reliability
 * - EVOLVED_FROM edges track version history
 */

import { v4 as uuidv4 } from 'uuid';

// Types for graph-stored schemas
export interface GraphSchema {
  id: string;
  name: string;
  version: string;
  language: string;
  framework?: string;
  description: string;

  // Detection rules
  detection: {
    dependencies: string[];
    files: string[];
    content_patterns: string[];
  };

  // Trust metrics
  trust: {
    level: 'low' | 'medium' | 'high' | 'trusted';
    accuracy: number;
    extractions_total: number;
    last_evolved: string;
  };

  // Evolution
  parent_version?: string;
  created_at: string;
  created_by: 'bootstrap' | 'evolution' | 'human' | 'import';
}

export interface GraphPattern {
  id: string;
  schema_id: string;
  name: string;
  description: string;

  // The actual pattern
  regex: string;
  flags: string;
  captures: Record<string, CaptureConfig>;

  // Node/edge templates
  node_template?: NodeTemplate;
  edge_template?: EdgeTemplate;

  // AI prompts for this pattern
  verification_prompt?: string;
  discovery_prompt?: string;

  // Trust for this specific pattern
  trust: {
    accuracy: number;
    extractions: number;
    corrections: number;
    rejections: number;
  };

  // Evolution
  version: number;
  evolved_from?: string;
  evolved_by?: 'groq' | 'claude-sonnet' | 'claude-opus' | 'human';
  evolution_reason?: string;
}

interface CaptureConfig {
  group: number;
  default?: string;
  transform?: 'uppercase' | 'lowercase' | 'trim';
}

interface NodeTemplate {
  type: string;
  name_from: string;
  properties: Record<string, string>;
}

interface EdgeTemplate {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, string>;
}

export interface SchemaGraphConfig {
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
}

/**
 * Interface for Neo4j driver (to avoid tight coupling)
 */
interface Neo4jSession {
  run(query: string, params?: Record<string, unknown>): Promise<{
    records: Array<{
      get(key: string): unknown;
      toObject(): Record<string, unknown>;
    }>;
  }>;
  close(): Promise<void>;
}

interface Neo4jDriver {
  session(): Neo4jSession;
  close(): Promise<void>;
}

export class SchemaGraphStore {
  private driver: Neo4jDriver | null = null;
  private config: SchemaGraphConfig;

  constructor(config: SchemaGraphConfig) {
    this.config = config;
  }

  /**
   * Connect to Neo4j.
   */
  async connect(): Promise<void> {
    // Dynamic import to avoid bundling neo4j-driver if not used
    const neo4j = await import('neo4j-driver');
    this.driver = neo4j.default.driver(
      this.config.neo4jUri,
      neo4j.default.auth.basic(this.config.neo4jUser, this.config.neo4jPassword)
    );
  }

  /**
   * Close connection.
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  /**
   * Initialize schema graph constraints and indexes.
   */
  async initialize(): Promise<void> {
    const session = this.getSession();
    try {
      // Create constraints
      await session.run(`
        CREATE CONSTRAINT schema_id IF NOT EXISTS
        FOR (s:Schema) REQUIRE s.id IS UNIQUE
      `);
      await session.run(`
        CREATE CONSTRAINT pattern_id IF NOT EXISTS
        FOR (p:Pattern) REQUIRE p.id IS UNIQUE
      `);

      // Create indexes for common queries
      await session.run(`
        CREATE INDEX schema_name IF NOT EXISTS
        FOR (s:Schema) ON (s.name, s.version)
      `);
      await session.run(`
        CREATE INDEX schema_framework IF NOT EXISTS
        FOR (s:Schema) ON (s.framework)
      `);
      await session.run(`
        CREATE INDEX pattern_schema IF NOT EXISTS
        FOR (p:Pattern) ON (p.schema_id)
      `);
    } finally {
      await session.close();
    }
  }

  /**
   * Find schemas that apply to detected frameworks.
   */
  async findSchemasForFrameworks(frameworks: string[]): Promise<GraphSchema[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `
        MATCH (s:Schema)
        WHERE s.framework IN $frameworks
           OR s.language IN $frameworks
        RETURN s
        ORDER BY s.trust_level DESC, s.accuracy DESC
        `,
        { frameworks }
      );

      return result.records.map((r) => this.recordToSchema(r.get('s')));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all patterns for a schema.
   */
  async getPatternsForSchema(schemaId: string): Promise<GraphPattern[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `
        MATCH (s:Schema {id: $schemaId})-[:CONTAINS]->(p:Pattern)
        RETURN p
        ORDER BY p.name
        `,
        { schemaId }
      );

      return result.records.map((r) => this.recordToPattern(r.get('p')));
    } finally {
      await session.close();
    }
  }

  /**
   * Create a new schema (for bootstrap or import).
   */
  async createSchema(schema: Omit<GraphSchema, 'id'>): Promise<GraphSchema> {
    const session = this.getSession();
    const id = uuidv4();

    try {
      await session.run(
        `
        CREATE (s:Schema {
          id: $id,
          name: $name,
          version: $version,
          language: $language,
          framework: $framework,
          description: $description,
          detection_dependencies: $detection_deps,
          detection_files: $detection_files,
          detection_patterns: $detection_patterns,
          trust_level: $trust_level,
          trust_accuracy: $trust_accuracy,
          trust_extractions: $trust_extractions,
          trust_last_evolved: $trust_last_evolved,
          parent_version: $parent_version,
          created_at: $created_at,
          created_by: $created_by
        })
        RETURN s
        `,
        {
          id,
          name: schema.name,
          version: schema.version,
          language: schema.language,
          framework: schema.framework || null,
          description: schema.description,
          detection_deps: schema.detection.dependencies,
          detection_files: schema.detection.files,
          detection_patterns: schema.detection.content_patterns,
          trust_level: schema.trust.level,
          trust_accuracy: schema.trust.accuracy,
          trust_extractions: schema.trust.extractions_total,
          trust_last_evolved: schema.trust.last_evolved,
          parent_version: schema.parent_version || null,
          created_at: schema.created_at,
          created_by: schema.created_by,
        }
      );

      return { ...schema, id };
    } finally {
      await session.close();
    }
  }

  /**
   * Create a new pattern for a schema.
   */
  async createPattern(pattern: Omit<GraphPattern, 'id'>): Promise<GraphPattern> {
    const session = this.getSession();
    const id = uuidv4();

    try {
      await session.run(
        `
        MATCH (s:Schema {id: $schema_id})
        CREATE (p:Pattern {
          id: $id,
          schema_id: $schema_id,
          name: $name,
          description: $description,
          regex: $regex,
          flags: $flags,
          captures: $captures,
          node_template: $node_template,
          edge_template: $edge_template,
          verification_prompt: $verification_prompt,
          discovery_prompt: $discovery_prompt,
          trust_accuracy: $trust_accuracy,
          trust_extractions: $trust_extractions,
          trust_corrections: $trust_corrections,
          trust_rejections: $trust_rejections,
          version: $version,
          evolved_from: $evolved_from,
          evolved_by: $evolved_by,
          evolution_reason: $evolution_reason
        })
        CREATE (s)-[:CONTAINS]->(p)
        RETURN p
        `,
        {
          id,
          schema_id: pattern.schema_id,
          name: pattern.name,
          description: pattern.description,
          regex: pattern.regex,
          flags: pattern.flags,
          captures: JSON.stringify(pattern.captures),
          node_template: pattern.node_template ? JSON.stringify(pattern.node_template) : null,
          edge_template: pattern.edge_template ? JSON.stringify(pattern.edge_template) : null,
          verification_prompt: pattern.verification_prompt || null,
          discovery_prompt: pattern.discovery_prompt || null,
          trust_accuracy: pattern.trust.accuracy,
          trust_extractions: pattern.trust.extractions,
          trust_corrections: pattern.trust.corrections,
          trust_rejections: pattern.trust.rejections,
          version: pattern.version,
          evolved_from: pattern.evolved_from || null,
          evolved_by: pattern.evolved_by || null,
          evolution_reason: pattern.evolution_reason || null,
        }
      );

      return { ...pattern, id };
    } finally {
      await session.close();
    }
  }

  /**
   * Record verification result and update trust scores.
   */
  async recordVerification(
    patternId: string,
    result: 'verified' | 'corrected' | 'rejected'
  ): Promise<void> {
    const session = this.getSession();
    try {
      // Update pattern trust scores
      const updateField =
        result === 'verified'
          ? 'trust_extractions'
          : result === 'corrected'
            ? 'trust_corrections'
            : 'trust_rejections';

      await session.run(
        `
        MATCH (p:Pattern {id: $patternId})
        SET p.trust_extractions = p.trust_extractions + 1,
            p.${updateField} = p.${updateField} + 1,
            p.trust_accuracy = toFloat(p.trust_extractions - p.trust_corrections - p.trust_rejections) / p.trust_extractions
        RETURN p
        `,
        { patternId }
      );

      // Also update parent schema's aggregate trust
      await session.run(
        `
        MATCH (s:Schema)-[:CONTAINS]->(p:Pattern {id: $patternId})
        WITH s, avg(p.trust_accuracy) as avg_accuracy, sum(p.trust_extractions) as total_extractions
        SET s.trust_accuracy = avg_accuracy,
            s.trust_extractions = total_extractions,
            s.trust_level = CASE
              WHEN avg_accuracy >= 0.95 AND total_extractions >= 100 THEN 'trusted'
              WHEN avg_accuracy >= 0.90 AND total_extractions >= 50 THEN 'high'
              WHEN avg_accuracy >= 0.80 AND total_extractions >= 20 THEN 'medium'
              ELSE 'low'
            END
        `,
        { patternId }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Evolve a pattern (create new version linked to old).
   */
  async evolvePattern(
    oldPatternId: string,
    updates: Partial<GraphPattern>,
    evolvedBy: GraphPattern['evolved_by'],
    reason: string
  ): Promise<GraphPattern> {
    const session = this.getSession();
    try {
      // Get old pattern
      const oldResult = await session.run(
        `MATCH (p:Pattern {id: $id}) RETURN p`,
        { id: oldPatternId }
      );
      const oldPattern = this.recordToPattern(oldResult.records[0]?.get('p'));

      // Create new pattern version
      const newPattern: Omit<GraphPattern, 'id'> = {
        ...oldPattern,
        ...updates,
        version: oldPattern.version + 1,
        evolved_from: oldPatternId,
        evolved_by: evolvedBy,
        evolution_reason: reason,
        trust: {
          accuracy: 0,
          extractions: 0,
          corrections: 0,
          rejections: 0,
        },
      };

      const created = await this.createPattern(newPattern);

      // Create EVOLVED_FROM edge
      await session.run(
        `
        MATCH (old:Pattern {id: $oldId}), (new:Pattern {id: $newId})
        CREATE (new)-[:EVOLVED_FROM]->(old)
        `,
        { oldId: oldPatternId, newId: created.id }
      );

      return created;
    } finally {
      await session.close();
    }
  }

  /**
   * Get patterns that need evolution (high correction/rejection rate).
   */
  async getPatternsNeedingEvolution(
    correctionThreshold = 0.1,
    rejectionThreshold = 0.05,
    minSamples = 20
  ): Promise<GraphPattern[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `
        MATCH (p:Pattern)
        WHERE p.trust_extractions >= $minSamples
          AND (
            toFloat(p.trust_corrections) / p.trust_extractions > $correctionThreshold
            OR toFloat(p.trust_rejections) / p.trust_extractions > $rejectionThreshold
          )
        RETURN p
        ORDER BY p.trust_accuracy ASC
        `,
        { correctionThreshold, rejectionThreshold, minSamples }
      );

      return result.records.map((r) => this.recordToPattern(r.get('p')));
    } finally {
      await session.close();
    }
  }

  /**
   * Export all schemas to YAML-friendly format.
   */
  async exportSchemas(): Promise<Array<{ schema: GraphSchema; patterns: GraphPattern[] }>> {
    const session = this.getSession();
    try {
      const schemasResult = await session.run(`MATCH (s:Schema) RETURN s`);
      const schemas = schemasResult.records.map((r) => this.recordToSchema(r.get('s')));

      const results = [];
      for (const schema of schemas) {
        const patterns = await this.getPatternsForSchema(schema.id);
        results.push({ schema, patterns });
      }

      return results;
    } finally {
      await session.close();
    }
  }

  /**
   * Check if any schemas exist (for bootstrap detection).
   */
  async hasSchemas(): Promise<boolean> {
    const session = this.getSession();
    try {
      const result = await session.run(`MATCH (s:Schema) RETURN count(s) as count`);
      const count = result.records[0]?.get('count') as number;
      return count > 0;
    } finally {
      await session.close();
    }
  }

  // Helper methods

  private getSession(): Neo4jSession {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }
    return this.driver.session();
  }

  private recordToSchema(record: unknown): GraphSchema {
    const r = record as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      version: r.version as string,
      language: r.language as string,
      framework: r.framework as string | undefined,
      description: r.description as string,
      detection: {
        dependencies: (r.detection_dependencies as string[]) || [],
        files: (r.detection_files as string[]) || [],
        content_patterns: (r.detection_patterns as string[]) || [],
      },
      trust: {
        level: r.trust_level as GraphSchema['trust']['level'],
        accuracy: r.trust_accuracy as number,
        extractions_total: r.trust_extractions as number,
        last_evolved: r.trust_last_evolved as string,
      },
      parent_version: r.parent_version as string | undefined,
      created_at: r.created_at as string,
      created_by: r.created_by as GraphSchema['created_by'],
    };
  }

  private recordToPattern(record: unknown): GraphPattern {
    const r = record as Record<string, unknown>;
    return {
      id: r.id as string,
      schema_id: r.schema_id as string,
      name: r.name as string,
      description: r.description as string,
      regex: r.regex as string,
      flags: r.flags as string,
      captures: JSON.parse((r.captures as string) || '{}'),
      node_template: r.node_template ? JSON.parse(r.node_template as string) : undefined,
      edge_template: r.edge_template ? JSON.parse(r.edge_template as string) : undefined,
      verification_prompt: r.verification_prompt as string | undefined,
      discovery_prompt: r.discovery_prompt as string | undefined,
      trust: {
        accuracy: r.trust_accuracy as number,
        extractions: r.trust_extractions as number,
        corrections: r.trust_corrections as number,
        rejections: r.trust_rejections as number,
      },
      version: r.version as number,
      evolved_from: r.evolved_from as string | undefined,
      evolved_by: r.evolved_by as GraphPattern['evolved_by'],
      evolution_reason: r.evolution_reason as string | undefined,
    };
  }
}
