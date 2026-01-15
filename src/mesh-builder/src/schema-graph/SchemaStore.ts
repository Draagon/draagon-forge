/**
 * SchemaStore - Optimized Neo4j storage for extraction schemas.
 *
 * Storage model optimized for:
 * 1. Fast schema detection (which schemas apply to this project?)
 * 2. Fast pattern loading (get all patterns for extraction)
 * 3. Fast trust updates (record verification results)
 * 4. Efficient evolution (find weak patterns, store corrections)
 *
 * Key design decisions:
 * - Pattern nodes are self-contained (regex, templates, trust all inline)
 * - Prompts are separate nodes (loaded on-demand for verification)
 * - Corrections stored separately (for evolution learning)
 * - Trust scores inline for atomic updates
 */

import { Driver, Session, auth } from 'neo4j-driver';

// ============================================================================
// Types
// ============================================================================

export interface Schema {
  id: string;
  name: string;
  type: 'language' | 'framework' | 'database' | 'infra';
  extends?: string;
  version: string;

  // Detection arrays
  detect_dependencies: string[];
  detect_files: string[];
  detect_signatures: string[];

  // Aggregate trust
  trust_level: 'low' | 'medium' | 'high' | 'trusted';
  trust_accuracy: number;
  trust_extractions: number;
  trust_sample_rate: number;
}

export interface Pattern {
  id: string;
  schema_id: string;
  name: string;
  version: number;

  // Extraction config (all self-contained)
  regex: string;
  flags: string;
  captures: CaptureConfig;
  node_template: NodeTemplate | null;
  edge_templates: EdgeTemplate[];
  scope_method: 'python_indentation' | 'braces' | 'none';

  // Trust for this pattern
  trust_accuracy: number;
  trust_extractions: number;
  trust_corrections: number;
  trust_rejections: number;

  is_active: boolean;
}

export interface CaptureConfig {
  [name: string]: {
    group: number;
    transform?: 'uppercase' | 'lowercase' | 'trim';
    optional?: boolean;
    default?: string;
  };
}

export interface NodeTemplate {
  type: string;
  name_from: string;
  properties: Record<string, string>;
}

export interface EdgeTemplate {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, string>;
}

export interface Prompt {
  id: string;
  pattern_id: string;
  type: 'verification' | 'discovery' | 'evolution';
  template: string;
  variables: string[];
}

export interface Correction {
  id: string;
  pattern_id: string;
  original_line_start: number;
  original_line_end: number;
  corrected_line_start: number;
  corrected_line_end: number;
  source_snippet: string;
  reasoning: string;
  created_at: string;
}

export interface StoreConfig {
  uri: string;
  user: string;
  password: string;
}

// ============================================================================
// SchemaStore Implementation
// ============================================================================

export class SchemaStore {
  private driver: Driver | null = null;
  private config: StoreConfig;

  constructor(config: StoreConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  async connect(): Promise<void> {
    const neo4j = await import('neo4j-driver');
    this.driver = neo4j.default.driver(
      this.config.uri,
      neo4j.default.auth.basic(this.config.user, this.config.password)
    );
    // Verify connection
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  private session(): Session {
    if (!this.driver) throw new Error('Not connected');
    return this.driver.session();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const session = this.session();
    try {
      // Constraints
      await session.run(`
        CREATE CONSTRAINT schema_id IF NOT EXISTS
        FOR (s:Schema) REQUIRE s.id IS UNIQUE
      `);
      await session.run(`
        CREATE CONSTRAINT pattern_id IF NOT EXISTS
        FOR (p:Pattern) REQUIRE p.id IS UNIQUE
      `);
      await session.run(`
        CREATE CONSTRAINT prompt_id IF NOT EXISTS
        FOR (pr:Prompt) REQUIRE pr.id IS UNIQUE
      `);

      // Indexes for fast queries
      await session.run(`
        CREATE INDEX schema_type IF NOT EXISTS
        FOR (s:Schema) ON (s.type)
      `);
      await session.run(`
        CREATE INDEX pattern_schema IF NOT EXISTS
        FOR (p:Pattern) ON (p.schema_id)
      `);
      await session.run(`
        CREATE INDEX pattern_active IF NOT EXISTS
        FOR (p:Pattern) ON (p.is_active)
      `);
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Schema Detection - Find which schemas apply to a project
  // --------------------------------------------------------------------------

  async findSchemasForProject(dependencies: string[]): Promise<Schema[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        MATCH (s:Schema)
        WHERE ANY(dep IN $dependencies WHERE dep IN s.detect_dependencies)
        RETURN s
        ORDER BY s.trust_accuracy DESC
        `,
        { dependencies }
      );
      return result.records.map((r) => this.toSchema(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Pattern Loading - Get all patterns for extraction
  // --------------------------------------------------------------------------

  async loadPatternsForSchema(schemaId: string): Promise<Pattern[]> {
    const session = this.session();
    try {
      // Get patterns from this schema AND all parent schemas (inheritance)
      const result = await session.run(
        `
        MATCH path = (s:Schema {id: $schemaId})-[:EXTENDS*0..5]->(parent:Schema)
        WITH collect(DISTINCT parent) + collect(DISTINCT s) AS schemas
        UNWIND schemas AS schema
        MATCH (schema)-[:CONTAINS]->(p:Pattern {is_active: true})
        RETURN p
        ORDER BY p.schema_id, p.name
        `,
        { schemaId }
      );
      return result.records.map((r) => this.toPattern(r.get('p').properties));
    } finally {
      await session.close();
    }
  }

  async loadAllActivePatterns(): Promise<Pattern[]> {
    const session = this.session();
    try {
      const result = await session.run(`
        MATCH (p:Pattern {is_active: true})
        RETURN p
        ORDER BY p.schema_id, p.name
      `);
      return result.records.map((r) => this.toPattern(r.get('p').properties));
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Trust Updates - Record verification results
  // --------------------------------------------------------------------------

  async recordVerification(
    patternId: string,
    result: 'verified' | 'corrected' | 'rejected'
  ): Promise<void> {
    const session = this.session();
    try {
      // Atomic update of pattern trust
      await session.run(
        `
        MATCH (p:Pattern {id: $patternId})
        SET p.trust_extractions = p.trust_extractions + 1,
            p.trust_corrections = p.trust_corrections + CASE WHEN $result = 'corrected' THEN 1 ELSE 0 END,
            p.trust_rejections = p.trust_rejections + CASE WHEN $result = 'rejected' THEN 1 ELSE 0 END,
            p.trust_accuracy = CASE
              WHEN p.trust_extractions + 1 > 0
              THEN toFloat((p.trust_extractions + 1) - (p.trust_corrections + CASE WHEN $result = 'corrected' THEN 1 ELSE 0 END) - (p.trust_rejections + CASE WHEN $result = 'rejected' THEN 1 ELSE 0 END)) / (p.trust_extractions + 1)
              ELSE 0.0
            END
        `,
        { patternId, result }
      );

      // Update parent schema's aggregate trust
      await session.run(
        `
        MATCH (p:Pattern {id: $patternId})
        MATCH (s:Schema {id: p.schema_id})-[:CONTAINS]->(patterns:Pattern {is_active: true})
        WITH s, avg(patterns.trust_accuracy) AS avg_acc, sum(patterns.trust_extractions) AS total
        SET s.trust_accuracy = avg_acc,
            s.trust_extractions = toInteger(total),
            s.trust_level = CASE
              WHEN avg_acc >= 0.95 AND total >= 100 THEN 'trusted'
              WHEN avg_acc >= 0.90 AND total >= 50 THEN 'high'
              WHEN avg_acc >= 0.80 AND total >= 20 THEN 'medium'
              ELSE 'low'
            END,
            s.trust_sample_rate = CASE
              WHEN avg_acc >= 0.95 AND total >= 100 THEN 0.05
              WHEN avg_acc >= 0.90 AND total >= 50 THEN 0.20
              WHEN avg_acc >= 0.80 AND total >= 20 THEN 0.50
              ELSE 1.0
            END
        `,
        { patternId }
      );
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Corrections - Store for evolution learning
  // --------------------------------------------------------------------------

  async storeCorrection(correction: Omit<Correction, 'id' | 'created_at'>): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `
        CREATE (c:Correction {
          id: randomUUID(),
          pattern_id: $pattern_id,
          original_line_start: $original_line_start,
          original_line_end: $original_line_end,
          corrected_line_start: $corrected_line_start,
          corrected_line_end: $corrected_line_end,
          source_snippet: $source_snippet,
          reasoning: $reasoning,
          created_at: datetime()
        })
        WITH c
        MATCH (p:Pattern {id: $pattern_id})
        CREATE (p)-[:HAD_CORRECTION]->(c)
        `,
        correction
      );
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Evolution - Find patterns needing improvement
  // --------------------------------------------------------------------------

  async findPatternsNeedingEvolution(
    correctionThreshold = 0.10,
    rejectionThreshold = 0.05,
    minSamples = 20
  ): Promise<Array<{ pattern: Pattern; corrections: Correction[] }>> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Pattern {is_active: true})
        WHERE p.trust_extractions >= $minSamples
          AND (toFloat(p.trust_corrections) / p.trust_extractions > $correctionThreshold
               OR toFloat(p.trust_rejections) / p.trust_extractions > $rejectionThreshold)
        OPTIONAL MATCH (p)-[:HAD_CORRECTION]->(c:Correction)
        WITH p, collect(c) AS corrections
        RETURN p, corrections
        ORDER BY p.trust_accuracy ASC
        LIMIT 10
        `,
        { correctionThreshold, rejectionThreshold, minSamples }
      );

      return result.records.map((r) => ({
        pattern: this.toPattern(r.get('p').properties),
        corrections: r.get('corrections').map((c: any) =>
          c ? this.toCorrection(c.properties) : null
        ).filter(Boolean),
      }));
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Pattern Evolution - Create new version
  // --------------------------------------------------------------------------

  async evolvePattern(
    oldPatternId: string,
    newRegex: string,
    reason: string
  ): Promise<Pattern> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        // Get old pattern
        MATCH (old:Pattern {id: $oldPatternId})

        // Create new version
        CREATE (new:Pattern {
          id: old.schema_id + '::' + old.name + '::v' + toString(old.version + 1),
          schema_id: old.schema_id,
          name: old.name,
          version: old.version + 1,
          regex: $newRegex,
          flags: old.flags,
          captures: old.captures,
          node_template: old.node_template,
          edge_templates: old.edge_templates,
          scope_method: old.scope_method,
          trust_accuracy: 0.0,
          trust_extractions: 0,
          trust_corrections: 0,
          trust_rejections: 0,
          is_active: true,
          created_at: datetime(),
          evolution_reason: $reason
        })

        // Deactivate old version
        SET old.is_active = false

        // Create evolution edge
        CREATE (new)-[:EVOLVED_FROM]->(old)

        // Link to schema
        WITH new, old
        MATCH (s:Schema {id: old.schema_id})
        CREATE (s)-[:CONTAINS]->(new)

        RETURN new
        `,
        { oldPatternId, newRegex, reason }
      );

      const record = result.records[0];
      if (!record) throw new Error(`Failed to evolve pattern ${oldPatternId}`);
      return this.toPattern(record.get('new').properties);
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Prompts - Load on demand
  // --------------------------------------------------------------------------

  async getPrompt(patternId: string, type: Prompt['type']): Promise<string | null> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Pattern {id: $patternId})-[:HAS_PROMPT]->(pr:Prompt {type: $type})
        RETURN pr.template AS template
        `,
        { patternId, type }
      );
      return result.records[0]?.get('template') || null;
    } finally {
      await session.close();
    }
  }

  async setPrompt(patternId: string, type: Prompt['type'], template: string): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `
        MATCH (p:Pattern {id: $patternId})
        MERGE (p)-[:HAS_PROMPT]->(pr:Prompt {pattern_id: $patternId, type: $type})
        SET pr.id = $patternId + '::' + $type,
            pr.template = $template,
            pr.updated_at = datetime()
        `,
        { patternId, type, template }
      );
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Schema & Pattern Creation
  // --------------------------------------------------------------------------

  async createSchema(schema: Omit<Schema, 'trust_level' | 'trust_accuracy' | 'trust_extractions' | 'trust_sample_rate'>): Promise<Schema> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        CREATE (s:Schema {
          id: $id,
          name: $name,
          type: $type,
          extends: $extends,
          version: $version,
          detect_dependencies: $detect_dependencies,
          detect_files: $detect_files,
          detect_signatures: $detect_signatures,
          trust_level: 'low',
          trust_accuracy: 0.0,
          trust_extractions: 0,
          trust_sample_rate: 1.0,
          created_at: datetime()
        })
        RETURN s
        `,
        schema
      );

      // Create EXTENDS relationship if parent specified
      if (schema.extends) {
        await session.run(
          `
          MATCH (child:Schema {id: $childId}), (parent:Schema {id: $parentId})
          CREATE (child)-[:EXTENDS]->(parent)
          `,
          { childId: schema.id, parentId: schema.extends }
        );
      }

      const record = result.records[0];
      if (!record) throw new Error(`Failed to create schema ${schema.id}`);
      return this.toSchema(record.get('s').properties);
    } finally {
      await session.close();
    }
  }

  async createPattern(pattern: Omit<Pattern, 'trust_accuracy' | 'trust_extractions' | 'trust_corrections' | 'trust_rejections'>): Promise<Pattern> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        MATCH (s:Schema {id: $schema_id})
        CREATE (p:Pattern {
          id: $id,
          schema_id: $schema_id,
          name: $name,
          version: $version,
          regex: $regex,
          flags: $flags,
          captures: $captures,
          node_template: $node_template,
          edge_templates: $edge_templates,
          scope_method: $scope_method,
          trust_accuracy: 0.0,
          trust_extractions: 0,
          trust_corrections: 0,
          trust_rejections: 0,
          is_active: $is_active,
          created_at: datetime()
        })
        CREATE (s)-[:CONTAINS]->(p)
        RETURN p
        `,
        {
          ...pattern,
          captures: JSON.stringify(pattern.captures),
          node_template: pattern.node_template ? JSON.stringify(pattern.node_template) : null,
          edge_templates: JSON.stringify(pattern.edge_templates),
        }
      );
      const record = result.records[0];
      if (!record) throw new Error(`Failed to create pattern ${pattern.id}`);
      return this.toPattern(record.get('p').properties);
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private toSchema(props: Record<string, any>): Schema {
    return {
      id: props.id,
      name: props.name,
      type: props.type,
      extends: props.extends || undefined,
      version: props.version,
      detect_dependencies: props.detect_dependencies || [],
      detect_files: props.detect_files || [],
      detect_signatures: props.detect_signatures || [],
      trust_level: props.trust_level,
      trust_accuracy: props.trust_accuracy,
      trust_extractions: props.trust_extractions,
      trust_sample_rate: props.trust_sample_rate,
    };
  }

  private toPattern(props: Record<string, any>): Pattern {
    return {
      id: props.id,
      schema_id: props.schema_id,
      name: props.name,
      version: props.version,
      regex: props.regex,
      flags: props.flags,
      captures: typeof props.captures === 'string' ? JSON.parse(props.captures) : props.captures,
      node_template: props.node_template
        ? (typeof props.node_template === 'string' ? JSON.parse(props.node_template) : props.node_template)
        : null,
      edge_templates: typeof props.edge_templates === 'string'
        ? JSON.parse(props.edge_templates)
        : (props.edge_templates || []),
      scope_method: props.scope_method,
      trust_accuracy: props.trust_accuracy,
      trust_extractions: props.trust_extractions,
      trust_corrections: props.trust_corrections,
      trust_rejections: props.trust_rejections,
      is_active: props.is_active,
    };
  }

  private toCorrection(props: Record<string, any>): Correction {
    return {
      id: props.id,
      pattern_id: props.pattern_id,
      original_line_start: props.original_line_start,
      original_line_end: props.original_line_end,
      corrected_line_start: props.corrected_line_start,
      corrected_line_end: props.corrected_line_end,
      source_snippet: props.source_snippet,
      reasoning: props.reasoning,
      created_at: props.created_at,
    };
  }

  // --------------------------------------------------------------------------
  // Utility - Check if any schemas exist
  // --------------------------------------------------------------------------

  async hasSchemas(): Promise<boolean> {
    const session = this.session();
    try {
      const result = await session.run(`MATCH (s:Schema) RETURN count(s) AS count`);
      return (result.records[0]?.get('count')?.toNumber() || 0) > 0;
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // JSON Export/Import - Simple serialization for backup and sharing
  // --------------------------------------------------------------------------

  /**
   * Export all schemas, patterns, and prompts to JSON.
   * This creates a single portable blob that can be version-controlled
   * or shared with other instances.
   */
  async exportToJSON(): Promise<SchemaExport> {
    const session = this.session();
    try {
      // Get all schemas
      const schemasResult = await session.run(`
        MATCH (s:Schema)
        OPTIONAL MATCH (s)-[:EXTENDS]->(parent:Schema)
        RETURN s, parent.id AS extends_id
        ORDER BY s.type, s.name
      `);

      const schemas: SchemaExportEntry[] = schemasResult.records.map((r) => ({
        ...this.toSchema(r.get('s').properties),
        extends: r.get('extends_id') || undefined,
      }));

      // Get all patterns with their prompts
      const patternsResult = await session.run(`
        MATCH (p:Pattern)
        OPTIONAL MATCH (p)-[:HAS_PROMPT]->(pr:Prompt)
        RETURN p, collect(pr) AS prompts
        ORDER BY p.schema_id, p.name, p.version DESC
      `);

      const patterns: PatternExportEntry[] = patternsResult.records.map((r) => {
        const pattern = this.toPattern(r.get('p').properties);
        const prompts = r.get('prompts')
          .filter((pr: any) => pr !== null)
          .map((pr: any) => ({
            type: pr.properties.type as Prompt['type'],
            template: pr.properties.template,
            variables: pr.properties.variables || [],
          }));

        return {
          ...pattern,
          prompts: prompts.length > 0 ? prompts : undefined,
        };
      });

      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        schemas,
        patterns,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Import schemas, patterns, and prompts from JSON.
   * This will create or update existing data.
   *
   * @param data - The exported JSON data
   * @param options - Import options
   */
  async importFromJSON(
    data: SchemaExport,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const { overwrite = false, skipExisting = false } = options;
    const result: ImportResult = {
      schemas: { created: 0, updated: 0, skipped: 0 },
      patterns: { created: 0, updated: 0, skipped: 0 },
      prompts: { created: 0, updated: 0, skipped: 0 },
    };

    const session = this.session();
    try {
      // Import schemas first (for EXTENDS relationships)
      for (const schema of data.schemas) {
        const exists = await this.schemaExists(schema.id);

        if (exists && skipExisting) {
          result.schemas.skipped++;
          continue;
        }

        if (exists && !overwrite) {
          result.schemas.skipped++;
          continue;
        }

        if (exists && overwrite) {
          await session.run(
            `
            MATCH (s:Schema {id: $id})
            SET s.name = $name,
                s.type = $type,
                s.version = $version,
                s.detect_dependencies = $detect_dependencies,
                s.detect_files = $detect_files,
                s.detect_signatures = $detect_signatures,
                s.updated_at = datetime()
            `,
            schema
          );
          result.schemas.updated++;
        } else {
          await this.createSchema(schema);
          result.schemas.created++;
        }
      }

      // Import patterns
      for (const patternEntry of data.patterns) {
        const { prompts: patternPrompts, ...pattern } = patternEntry;
        const exists = await this.patternExists(pattern.id);

        if (exists && skipExisting) {
          result.patterns.skipped++;
          continue;
        }

        if (exists && !overwrite) {
          result.patterns.skipped++;
          continue;
        }

        if (exists && overwrite) {
          await session.run(
            `
            MATCH (p:Pattern {id: $id})
            SET p.regex = $regex,
                p.flags = $flags,
                p.captures = $captures,
                p.node_template = $node_template,
                p.edge_templates = $edge_templates,
                p.scope_method = $scope_method,
                p.is_active = $is_active,
                p.updated_at = datetime()
            `,
            {
              ...pattern,
              captures: JSON.stringify(pattern.captures),
              node_template: pattern.node_template ? JSON.stringify(pattern.node_template) : null,
              edge_templates: JSON.stringify(pattern.edge_templates),
            }
          );
          result.patterns.updated++;
        } else {
          await this.createPattern(pattern);
          result.patterns.created++;
        }

        // Import prompts for this pattern
        if (patternPrompts) {
          for (const prompt of patternPrompts) {
            await this.setPrompt(pattern.id, prompt.type, prompt.template);
            result.prompts.created++;
          }
        }
      }

      return result;
    } finally {
      await session.close();
    }
  }

  private async schemaExists(id: string): Promise<boolean> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (s:Schema {id: $id}) RETURN count(s) AS count`,
        { id }
      );
      return (result.records[0]?.get('count')?.toNumber() || 0) > 0;
    } finally {
      await session.close();
    }
  }

  private async patternExists(id: string): Promise<boolean> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (p:Pattern {id: $id}) RETURN count(p) AS count`,
        { id }
      );
      return (result.records[0]?.get('count')?.toNumber() || 0) > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all schemas, patterns, prompts, and corrections.
   * USE WITH CAUTION - this is destructive!
   */
  async clearAll(): Promise<void> {
    const session = this.session();
    try {
      await session.run(`
        MATCH (n)
        WHERE n:Schema OR n:Pattern OR n:Prompt OR n:Correction
        DETACH DELETE n
      `);
    } finally {
      await session.close();
    }
  }
}

// ============================================================================
// Export/Import Types
// ============================================================================

export interface SchemaExport {
  version: string;
  exported_at: string;
  schemas: SchemaExportEntry[];
  patterns: PatternExportEntry[];
}

export interface SchemaExportEntry extends Schema {
  // Extends is already in Schema, just keeping it explicit here
}

export interface PatternExportEntry extends Pattern {
  prompts?: PromptExportEntry[];
}

export interface PromptExportEntry {
  type: Prompt['type'];
  template: string;
  variables: string[];
}

export interface ImportOptions {
  /** If true, overwrite existing schemas/patterns */
  overwrite?: boolean;
  /** If true, skip existing items without error */
  skipExisting?: boolean;
}

export interface ImportResult {
  schemas: { created: number; updated: number; skipped: number };
  patterns: { created: number; updated: number; skipped: number };
  prompts: { created: number; updated: number; skipped: number };
}
