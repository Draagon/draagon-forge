/**
 * SchemaGenerator - Generate JSON schemas from AI discoveries.
 *
 * This enables self-learning: patterns discovered by Tier 3 can be
 * converted into schemas for Tier 1 extraction in future files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { AIClient, AIResponse, GeneratedSchema } from './AIClient';
import { Schema, MeshNodeType, MeshEdgeType, CaptureConfig } from '../types';
import { SchemaSuggestion } from './Tier3Discoverer';

type TransformType = CaptureConfig['transform'];

export interface SchemaGeneratorConfig {
  /** Minimum occurrences before generating a schema pattern */
  minOccurrences: number;
  /** Output directory for generated schemas */
  outputDir: string;
  /** Whether to auto-save generated schemas */
  autoSave: boolean;
}

const DEFAULT_CONFIG: SchemaGeneratorConfig = {
  minOccurrences: 3,
  outputDir: 'schemas/custom',
  autoSave: false,
};

export interface GenerationResult {
  schema: Schema;
  confidence: number;
  reasoning: string;
  validationResult: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SchemaGenerator {
  private config: SchemaGeneratorConfig;

  constructor(
    private aiClient: AIClient,
    config: Partial<SchemaGeneratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a schema from aggregated discoveries.
   */
  async generateFromDiscoveries(
    frameworkName: string,
    language: string,
    suggestions: SchemaSuggestion[],
    examples: string[]
  ): Promise<GenerationResult> {
    // Filter suggestions by occurrence count
    const significantSuggestions = suggestions.filter(
      (s) => s.count >= this.config.minOccurrences
    );

    if (significantSuggestions.length === 0) {
      return this.createEmptyResult(
        frameworkName,
        language,
        'Not enough pattern occurrences'
      );
    }

    // Call AI to generate schema
    const aiResult = await this.aiClient.generateSchema({
      frameworkName,
      language,
      discoveries: significantSuggestions.map((s) => ({
        type: s.nodeType,
        name: s.pattern,
        line: 0,
      })),
      examples,
    });

    // Convert AI result to proper Schema format
    const schema = this.convertToSchema(aiResult.data.schema, frameworkName, language);

    // Validate the schema
    const validation = this.validateSchema(schema);

    // Save if configured and valid
    if (this.config.autoSave && validation.valid) {
      await this.saveSchema(schema);
    }

    return {
      schema,
      confidence: aiResult.data.confidence,
      reasoning: aiResult.data.reasoning,
      validationResult: validation,
    };
  }

  /**
   * Generate schema from a single well-understood pattern.
   */
  async generateFromPattern(
    pattern: PatternDefinition
  ): Promise<GenerationResult> {
    const schema = this.buildSchemaFromPattern(pattern);
    const validation = this.validateSchema(schema);

    if (this.config.autoSave && validation.valid) {
      await this.saveSchema(schema);
    }

    return {
      schema,
      confidence: 0.8,
      reasoning: 'Generated from explicit pattern definition',
      validationResult: validation,
    };
  }

  /**
   * Convert AI-generated schema to proper Schema format.
   */
  private convertToSchema(
    generated: GeneratedSchema['schema'],
    frameworkName: string,
    language: string
  ): Schema {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      name: generated.name || `${frameworkName}-custom`,
      version: generated.version || '1.0.0',
      language: generated.language || language,
      description: generated.description || `Auto-generated schema for ${frameworkName}`,
      detection: {
        imports: generated.detection.imports,
        patterns: generated.detection.patterns,
        confidence_boost: generated.detection.confidenceBoost || 0.3,
      },
      extractors: this.buildExtractors(generated.extractors),
      ai_hints: {
        framework_context: `Auto-generated schema for ${frameworkName} framework`,
        common_patterns: generated.detection.patterns,
      },
    };
  }

  /**
   * Build extractors from AI-generated structure.
   */
  private buildExtractors(
    aiExtractors: GeneratedSchema['schema']['extractors']
  ): Schema['extractors'] {
    const extractors: Schema['extractors'] = {};

    for (const [name, extractor] of Object.entries(aiExtractors)) {
      extractors[name] = {
        description: extractor.description,
        patterns: extractor.patterns.map((p) => ({
          name: p.name,
          regex: p.regex,
          captures: Object.fromEntries(
            Object.entries(p.captures).map(([k, v]) => [
              k,
              { group: v.group },
            ])
          ),
          node_template: p.nodeTemplate
            ? {
                type: p.nodeTemplate.type as MeshNodeType,
                name_from: p.nodeTemplate.nameFrom,
                properties: p.nodeTemplate.properties,
              }
            : undefined,
        })),
      };
    }

    return extractors;
  }

  /**
   * Build schema from explicit pattern definition.
   */
  private buildSchemaFromPattern(pattern: PatternDefinition): Schema {
    const extractorName = pattern.extractorName || 'main';

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      name: pattern.schemaName,
      version: '1.0.0',
      language: pattern.language,
      description: pattern.description || `Schema for ${pattern.schemaName}`,
      detection: {
        imports: pattern.detectionImports || [],
        patterns: pattern.detectionPatterns || [],
        confidence_boost: 0.3,
      },
      extractors: {
        [extractorName]: {
          description: pattern.description,
          patterns: [
            {
              name: pattern.patternName || 'main',
              regex: pattern.regex,
              captures: pattern.captures,
              node_template: pattern.nodeTemplate,
              edge_template: pattern.edgeTemplate,
            },
          ],
        },
      },
    };
  }

  /**
   * Validate a schema for correctness.
   */
  validateSchema(schema: Schema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!schema.name) errors.push('Missing schema name');
    if (!schema.language) errors.push('Missing language');
    if (!schema.detection) errors.push('Missing detection config');

    // Detection validation
    if (schema.detection) {
      if (
        !schema.detection.imports?.length &&
        !schema.detection.patterns?.length &&
        !schema.detection.files?.length
      ) {
        warnings.push('No detection patterns defined - schema may never match');
      }
    }

    // Extractors validation
    if (!schema.extractors || Object.keys(schema.extractors).length === 0) {
      errors.push('No extractors defined');
    } else {
      for (const [name, extractor] of Object.entries(schema.extractors)) {
        if (!extractor.patterns?.length) {
          warnings.push(`Extractor "${name}" has no patterns`);
          continue;
        }

        for (const pattern of extractor.patterns) {
          // Validate regex
          try {
            new RegExp(pattern.regex);
          } catch (e) {
            errors.push(`Invalid regex in ${name}: ${pattern.regex}`);
          }

          // Validate captures reference valid groups
          if (pattern.captures) {
            for (const [capName, config] of Object.entries(pattern.captures)) {
              if (config.group < 0) {
                errors.push(`Invalid capture group in ${name}.${capName}`);
              }
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Save schema to disk.
   */
  async saveSchema(schema: Schema): Promise<string> {
    const dir = path.join(this.config.outputDir, schema.language);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${schema.name}.json`;
    const filepath = path.join(dir, filename);

    await fs.writeFile(filepath, JSON.stringify(schema, null, 2));
    return filepath;
  }

  /**
   * Create empty result for failed generation.
   */
  private createEmptyResult(
    frameworkName: string,
    language: string,
    reason: string
  ): GenerationResult {
    return {
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        name: `${frameworkName}-failed`,
        version: '0.0.0',
        language,
        detection: { confidence_boost: 0 },
        extractors: {},
      },
      confidence: 0,
      reasoning: reason,
      validationResult: {
        valid: false,
        errors: [reason],
        warnings: [],
      },
    };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PatternDefinition {
  schemaName: string;
  language: string;
  description?: string;
  detectionImports?: string[];
  detectionPatterns?: string[];
  extractorName?: string;
  patternName?: string;
  regex: string;
  captures: Record<string, { group: number; transform?: TransformType; default?: string }>;
  nodeTemplate?: {
    type: MeshNodeType;
    name_from?: string;
    properties: Record<string, string>;
  };
  edgeTemplate?: {
    type: MeshEdgeType;
    from: string;
    to: string;
    properties?: Record<string, string>;
  };
}
