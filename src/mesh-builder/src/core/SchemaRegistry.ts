/**
 * SchemaRegistry - Manages JSON schemas for code extraction patterns.
 *
 * Responsibilities:
 * - Load schemas from disk
 * - Index schemas by language
 * - Find matching schemas for source files
 * - Support adding new schemas (self-learning)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Schema, SourceFile } from '../types';

export interface SchemaInfo {
  name: string;
  version: string;
  language: string;
  path: string;
  isCustom: boolean;
}

export interface SchemaMatch {
  schema: Schema;
  score: number;
  matchedBy: ('imports' | 'files' | 'patterns')[];
}

export class SchemaRegistry {
  private schemas: Map<string, Schema> = new Map();
  private schemasByLanguage: Map<string, Schema[]> = new Map();
  private schemaPaths: Map<string, string> = new Map();
  private loaded: boolean = false;

  constructor(private schemaDir: string) {}

  /**
   * Load all schemas from the schema directory.
   * Schemas are loaded from nested directories and indexed by language.
   */
  async loadSchemas(): Promise<void> {
    if (this.loaded) return;

    const pattern = path.join(this.schemaDir, '**/*.json');
    const files = await glob(pattern, { nodir: true });

    for (const file of files) {
      await this.loadSchemaFile(file);
    }

    this.loaded = true;
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

      // Index by language
      const langSchemas = this.schemasByLanguage.get(schema.language) || [];
      langSchemas.push(schema);
      this.schemasByLanguage.set(schema.language, langSchemas);
    } catch (error) {
      console.error(`Failed to load schema ${filePath}:`, error);
    }
  }

  /**
   * Find schemas that match a given source file.
   * Returns schemas sorted by match score (highest first).
   */
  async findMatchingSchemas(file: SourceFile): Promise<SchemaMatch[]> {
    await this.loadSchemas();

    const matches: SchemaMatch[] = [];
    const langSchemas = this.schemasByLanguage.get(file.language) || [];

    for (const schema of langSchemas) {
      const match = this.scoreSchema(schema, file);
      if (match.score > 0) {
        matches.push(match);
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches;
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
   * Force reload of all schemas.
   */
  async reload(): Promise<void> {
    this.schemas.clear();
    this.schemasByLanguage.clear();
    this.schemaPaths.clear();
    this.loaded = false;
    await this.loadSchemas();
  }
}
