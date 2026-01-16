/**
 * SchemaRegistry - Manages JSON schemas for code extraction patterns.
 *
 * Responsibilities:
 * - Load schemas from disk (base schemas)
 * - Load evolved schemas from Neo4j (learned patterns)
 * - Index schemas by language with trust scores
 * - Find matching schemas for source files
 * - Support adding new schemas (self-learning)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Schema, SourceFile, CaptureConfig } from '../types';
import { SchemaGraphStore, GraphSchema, GraphPattern } from '../schema-graph/SchemaGraphStore';

export interface SchemaInfo {
  name: string;
  version: string;
  language: string;
  path: string;
  isCustom: boolean;
  /** Trust level from learning (if available) */
  trustLevel?: 'low' | 'medium' | 'high' | 'trusted';
  /** Accuracy score 0-1 (if available) */
  accuracy?: number;
}

export interface SchemaMatch {
  schema: Schema;
  score: number;
  matchedBy: ('imports' | 'files' | 'patterns')[];
  /** Trust score from learning history (0-1) */
  trustScore?: number;
  /** Whether this schema was evolved from corrections */
  isEvolved?: boolean;
}

export class SchemaRegistry {
  private schemas: Map<string, Schema> = new Map();
  private schemasByLanguage: Map<string, Schema[]> = new Map();
  private schemaPaths: Map<string, string> = new Map();
  private loaded: boolean = false;

  /** Trust scores from Neo4j (schemaName -> accuracy) */
  private trustScores: Map<string, number> = new Map();
  /** Schemas that were evolved from corrections */
  private evolvedSchemas: Set<string> = new Set();
  /** Optional connection to schema graph store */
  private schemaGraphStore?: SchemaGraphStore;

  constructor(private schemaDir: string, schemaGraphStore?: SchemaGraphStore) {
    this.schemaGraphStore = schemaGraphStore;
  }

  /**
   * Set the schema graph store for loading evolved patterns.
   */
  setSchemaGraphStore(store: SchemaGraphStore): void {
    this.schemaGraphStore = store;
  }

  /**
   * Load all schemas from the schema directory AND Neo4j evolved schemas.
   * Schemas are loaded from nested directories and indexed by language.
   * Evolved schemas from Neo4j override base schemas with the same name.
   */
  async loadSchemas(): Promise<void> {
    if (this.loaded) return;

    // Step 1: Load base schemas from JSON files
    const pattern = path.join(this.schemaDir, '**/*.json');
    const files = await glob(pattern, { nodir: true });

    for (const file of files) {
      await this.loadSchemaFile(file);
    }

    // Step 2: Load evolved schemas from Neo4j (if configured)
    if (this.schemaGraphStore) {
      await this.loadEvolvedSchemas();
    }

    this.loaded = true;
  }

  /**
   * Load evolved schemas and trust scores from Neo4j.
   * Evolved schemas override base schemas with matching names.
   */
  private async loadEvolvedSchemas(): Promise<void> {
    if (!this.schemaGraphStore) return;

    try {
      await this.schemaGraphStore.connect();

      // Check if any schemas exist in Neo4j
      const hasSchemas = await this.schemaGraphStore.hasSchemas();
      if (!hasSchemas) {
        await this.schemaGraphStore.close();
        return;
      }

      // Export all schemas from Neo4j
      const exported = await this.schemaGraphStore.exportSchemas();

      for (const { schema: graphSchema, patterns } of exported) {
        // Store trust score
        this.trustScores.set(graphSchema.name, graphSchema.trust.accuracy);

        // Check if this is an evolved schema (has parent version)
        if (graphSchema.parent_version) {
          this.evolvedSchemas.add(graphSchema.name);
        }

        // Convert GraphSchema + GraphPattern[] to Schema format
        const convertedSchema = this.convertGraphSchemaToSchema(graphSchema, patterns);

        // Override existing schema if this is evolved (higher version)
        const existing = this.schemas.get(graphSchema.name);
        if (!existing || this.shouldReplaceSchema(existing, graphSchema)) {
          // Remove from language index if replacing
          if (existing) {
            const langSchemas = this.schemasByLanguage.get(existing.language) || [];
            const filtered = langSchemas.filter(s => s.name !== existing.name);
            this.schemasByLanguage.set(existing.language, filtered);
          }

          // Add evolved schema
          this.schemas.set(graphSchema.name, convertedSchema);
          const langSchemas = this.schemasByLanguage.get(graphSchema.language) || [];
          langSchemas.push(convertedSchema);
          this.schemasByLanguage.set(graphSchema.language, langSchemas);

          console.log(`Loaded evolved schema: ${graphSchema.name} v${graphSchema.version} (accuracy: ${(graphSchema.trust.accuracy * 100).toFixed(1)}%)`);
        }
      }

      await this.schemaGraphStore.close();
    } catch (error) {
      console.warn('Failed to load evolved schemas from Neo4j:', error);
      // Continue with base schemas only
    }
  }

  /**
   * Determine if an evolved schema should replace a base schema.
   */
  private shouldReplaceSchema(existing: Schema, graphSchema: GraphSchema): boolean {
    // Always prefer evolved schemas with good accuracy
    if (graphSchema.trust.accuracy >= 0.7) {
      return true;
    }
    // Replace if versions differ (evolved is newer)
    if (existing.version !== graphSchema.version) {
      const existingParts = existing.version.split('.').map(Number);
      const graphParts = graphSchema.version.split('.').map(Number);
      for (let i = 0; i < Math.max(existingParts.length, graphParts.length); i++) {
        const e = existingParts[i] || 0;
        const g = graphParts[i] || 0;
        if (g > e) return true;
        if (g < e) return false;
      }
    }
    return false;
  }

  /**
   * Convert Neo4j GraphSchema + patterns to runtime Schema format.
   */
  private convertGraphSchemaToSchema(graphSchema: GraphSchema, patterns: GraphPattern[]): Schema {
    const extractors: Schema['extractors'] = {};

    // Group patterns by a category (use pattern name prefix or 'default')
    for (const pattern of patterns) {
      const category = pattern.name.split('_')[0] || 'default';

      if (!extractors[category]) {
        extractors[category] = {
          description: pattern.description,
          patterns: [],
        };
      }

      extractors[category].patterns.push({
        name: pattern.name,
        regex: pattern.regex,
        flags: pattern.flags,
        captures: pattern.captures as Record<string, CaptureConfig>,
        node_template: pattern.node_template as Schema['extractors'][string]['patterns'][number]['node_template'],
        edge_template: pattern.edge_template as Schema['extractors'][string]['patterns'][number]['edge_template'],
      });
    }

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      name: graphSchema.name,
      version: graphSchema.version,
      language: graphSchema.language,
      description: graphSchema.description,
      detection: {
        imports: graphSchema.detection.dependencies,
        files: graphSchema.detection.files,
        patterns: graphSchema.detection.content_patterns,
        confidence_boost: 0.3, // Default boost
      },
      extractors,
    };
  }

  /**
   * Load a single schema file.
   */
  private async loadSchemaFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const schema: Schema = JSON.parse(content) as Schema;

      // Validate required fields
      if (!schema.name || !schema.language) {
        console.warn(`Invalid schema at ${filePath}: missing name or language`);
        return;
      }

      if (!schema.detection) {
        console.warn(`Invalid schema at ${filePath}: missing detection config`);
        return;
      }

      // Store by name
      this.schemas.set(schema.name, schema);
      this.schemaPaths.set(schema.name, filePath);

      // Index by primary language
      const langSchemas = this.schemasByLanguage.get(schema.language) || [];
      langSchemas.push(schema);
      this.schemasByLanguage.set(schema.language, langSchemas);

      // Index by additional languages (e.g., JavaScript for TypeScript schema)
      if (schema.additional_languages) {
        for (const additionalLang of schema.additional_languages) {
          const addLangSchemas = this.schemasByLanguage.get(additionalLang) || [];
          addLangSchemas.push(schema);
          this.schemasByLanguage.set(additionalLang, addLangSchemas);
        }
      }
    } catch (error) {
      console.error(`Failed to load schema ${filePath}:`, error);
    }
  }

  /**
   * Find schemas that match a given source file.
   * Returns schemas sorted by match score (highest first).
   * Trust scores from learning history are factored into ranking.
   */
  async findMatchingSchemas(file: SourceFile): Promise<SchemaMatch[]> {
    await this.loadSchemas();

    const matches: SchemaMatch[] = [];
    const langSchemas = this.schemasByLanguage.get(file.language) || [];

    for (const schema of langSchemas) {
      const match = this.scoreSchema(schema, file);
      if (match.score > 0) {
        // Add trust information
        match.trustScore = this.trustScores.get(schema.name);
        match.isEvolved = this.evolvedSchemas.has(schema.name);

        // Boost score by trust (if available)
        if (match.trustScore !== undefined) {
          // Trust score acts as a multiplier (0.5 to 1.5x)
          const trustBoost = 0.5 + match.trustScore;
          match.score *= trustBoost;
        }

        matches.push(match);
      }
    }

    // Sort by score descending (now includes trust boost)
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Get trust score for a schema.
   */
  getTrustScore(schemaName: string): number | undefined {
    return this.trustScores.get(schemaName);
  }

  /**
   * Check if a schema has been evolved from corrections.
   */
  isSchemaEvolved(schemaName: string): boolean {
    return this.evolvedSchemas.has(schemaName);
  }

  /**
   * Score how well a schema matches a file.
   */
  private scoreSchema(schema: Schema, file: SourceFile): SchemaMatch {
    let score = 0;
    const matchedBy: ('imports' | 'files' | 'patterns')[] = [];

    // Check import patterns (strongest signal)
    if (schema.detection.imports) {
      for (const importPattern of schema.detection.imports) {
        if (file.content.includes(importPattern)) {
          score += schema.detection.confidence_boost;
          if (!matchedBy.includes('imports')) {
            matchedBy.push('imports');
          }
        }
      }
    }

    // Check file patterns (medium signal)
    if (schema.detection.files) {
      for (const filePattern of schema.detection.files) {
        const regex = new RegExp(
          filePattern.replace(/\*/g, '.*').replace(/\?/g, '.')
        );
        if (regex.test(file.relativePath)) {
          score += schema.detection.confidence_boost * 0.5;
          if (!matchedBy.includes('files')) {
            matchedBy.push('files');
          }
        }
      }
    }

    // Check content patterns (weaker signal)
    if (schema.detection.patterns) {
      for (const pattern of schema.detection.patterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(file.content)) {
            score += schema.detection.confidence_boost * 0.3;
            if (!matchedBy.includes('patterns')) {
              matchedBy.push('patterns');
            }
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    return { schema, score, matchedBy };
  }

  /**
   * Get a schema by name.
   */
  getSchema(name: string): Schema | undefined {
    return this.schemas.get(name);
  }

  /**
   * Add a new schema (for self-learning from Tier 3 discoveries).
   */
  async addSchema(schema: Schema, persist: boolean = true): Promise<void> {
    // Validate schema
    if (!schema.name || !schema.language || !schema.detection) {
      throw new Error('Invalid schema: missing required fields');
    }

    // Remove existing if present (for updates)
    if (this.schemas.has(schema.name)) {
      const existing = this.schemasByLanguage.get(schema.language) || [];
      const filtered = existing.filter((s) => s.name !== schema.name);
      this.schemasByLanguage.set(schema.language, filtered);
    }

    // Add to registry
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
        schema.language,
        `${schema.name}.json`
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
      this.schemaPaths.set(schema.name, filePath);
    }
  }

  /**
   * List all available schemas.
   */
  listSchemas(): SchemaInfo[] {
    return Array.from(this.schemas.entries()).map(([name, schema]) => ({
      name,
      version: schema.version,
      language: schema.language,
      path: this.schemaPaths.get(name) || '',
      isCustom: this.schemaPaths.get(name)?.includes('/custom/') || false,
    }));
  }

  /**
   * Get all schemas for a specific language.
   */
  getSchemasForLanguage(language: string): Schema[] {
    return this.schemasByLanguage.get(language) || [];
  }

  /**
   * Get count of loaded schemas.
   */
  get schemaCount(): number {
    return this.schemas.size;
  }

  /**
   * Check if schemas have been loaded.
   */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Force reload of all schemas (including evolved schemas from Neo4j).
   */
  async reload(): Promise<void> {
    this.schemas.clear();
    this.schemasByLanguage.clear();
    this.schemaPaths.clear();
    this.trustScores.clear();
    this.evolvedSchemas.clear();
    this.loaded = false;
    await this.loadSchemas();
  }

  /**
   * Reload only evolved schemas from Neo4j (for post-evolution refresh).
   */
  async reloadEvolvedSchemas(): Promise<void> {
    if (!this.schemaGraphStore) return;
    await this.loadEvolvedSchemas();
  }
}
