/**
 * FileExtractor - Orchestrates extraction from source files.
 *
 * This class coordinates:
 * - Schema matching
 * - Tier 1 pattern matching
 * - Routing to Tier 2/3 when needed
 * - Result aggregation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  SourceFile,
  FileExtractionResult,
  ProjectExtractionResult,
  ExtractionStatistics,
  MeshNode,
  MeshEdge,
  ProjectConfig,
  TierRoutingDecision,
} from '../types';
import { SchemaRegistry, SchemaMatch } from '../core/SchemaRegistry';
import { PatternMatcher, PatternMatcherResult } from '../core/PatternMatcher';
import { LanguageDetector, SupportedLanguage } from '../core/LanguageDetector';

export interface ExtractorOptions {
  /** Minimum confidence to accept tier 1 results */
  tier1Threshold: number;
  /** Whether to use AI for tier 2/3 */
  enableAI: boolean;
  /** Maximum file size to process (bytes) */
  maxFileSize: number;
  /** File patterns to exclude */
  excludePatterns: string[];
  /** Custom schemas directory */
  schemasDir?: string;
  /** List of changed files for incremental extraction (relative paths) */
  changedFiles?: string[];
}

const DEFAULT_OPTIONS: ExtractorOptions = {
  tier1Threshold: 0.3,
  enableAI: true,
  maxFileSize: 1024 * 1024, // 1MB
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/__pycache__/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/vendor/**',
    '**/.venv/**',
    '**/venv/**',
  ],
};

export class FileExtractor {
  private schemaRegistry: SchemaRegistry;
  private languageDetector: LanguageDetector;
  private options: ExtractorOptions;

  constructor(
    private projectConfig: ProjectConfig,
    options: Partial<ExtractorOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    const schemasDir =
      this.options.schemasDir ||
      path.join(__dirname, '..', '..', 'schemas');
    this.schemaRegistry = new SchemaRegistry(schemasDir);
    this.languageDetector = new LanguageDetector();
  }

  /**
   * Extract the entire project.
   */
  async extractProject(): Promise<ProjectExtractionResult> {
    const startTime = Date.now();
    const results: FileExtractionResult[] = [];
    const stats: ExtractionStatistics = {
      files_processed: 0,
      files_skipped: 0,
      tier1_extractions: 0,
      tier2_extractions: 0,
      tier3_extractions: 0,
      total_nodes: 0,
      total_edges: 0,
      schemas_generated: 0,
      extraction_time_ms: 0,
      ai_calls: 0,
      ai_tokens_used: 0,
    };

    // Load schemas
    await this.schemaRegistry.loadSchemas();

    // Find all source files
    const files = await this.findSourceFiles();

    // Process each file
    for (const filePath of files) {
      try {
        const result = await this.extractFile(filePath);
        if (result) {
          results.push(result);
          stats.files_processed++;
          stats.total_nodes += result.nodes.length;
          stats.total_edges += result.edges.length;

          // Update tier counts
          if (result.tier === 1) stats.tier1_extractions++;
          else if (result.tier === 2) stats.tier2_extractions++;
          else if (result.tier === 3) stats.tier3_extractions++;
        } else {
          stats.files_skipped++;
        }
      } catch (error) {
        console.error(`Error extracting ${filePath}:`, error);
        stats.files_skipped++;
      }
    }

    stats.extraction_time_ms = Date.now() - startTime;

    return {
      project_id: this.projectConfig.id,
      project_path: this.projectConfig.path,
      timestamp: new Date().toISOString(),
      statistics: stats,
      results,
    };
  }

  /**
   * Extract a single file.
   */
  async extractFile(filePath: string): Promise<FileExtractionResult | null> {
    // Read file
    const sourceFile = await this.loadSourceFile(filePath);
    if (!sourceFile) {
      return null;
    }

    // Skip non-code files
    if (!this.languageDetector.isCodeLanguage(sourceFile.language as SupportedLanguage)) {
      return null;
    }

    // Find matching schemas
    const schemaMatches = await this.schemaRegistry.findMatchingSchemas(sourceFile);

    // Decide which tier to use
    const routing = this.routeTier(sourceFile, schemaMatches);

    let nodes: MeshNode[] = [];
    let edges: MeshEdge[] = [];
    let confidence = 0;
    let tier: 1 | 2 | 3 = routing.tier;
    const schemasUsed: string[] = [];
    const unresolvedPatterns: string[] = [];
    const errors: string[] = [];

    if (routing.tier === 1 && routing.schemas && routing.schemas.length > 0) {
      // Tier 1: Apply schemas
      const matcher = new PatternMatcher(this.projectConfig.id);

      for (const schemaName of routing.schemas) {
        const schema = this.schemaRegistry.getSchema(schemaName);
        if (schema) {
          const result = matcher.match(sourceFile, schema);
          nodes.push(...result.nodes);
          edges.push(...result.edges);
          confidence = Math.max(confidence, result.confidence);
          schemasUsed.push(schemaName);
          unresolvedPatterns.push(...result.unresolvedPatterns);
        }
      }

      // Check if tier 1 results are sufficient
      if (confidence < this.options.tier1Threshold && this.options.enableAI) {
        // Need to escalate to tier 2
        tier = 2;
        // In full implementation, would call AI here
      }
    } else if (routing.tier === 2) {
      // Tier 2: AI-assisted
      // In full implementation, would call AI tier 2
      tier = 2;
      errors.push('Tier 2 AI not yet implemented');
    } else if (routing.tier === 3) {
      // Tier 3: Full AI discovery
      // In full implementation, would call AI tier 3
      tier = 3;
      errors.push('Tier 3 AI not yet implemented');
    }

    // Deduplicate nodes by id
    const uniqueNodes = this.deduplicateNodes(nodes);
    const uniqueEdges = this.deduplicateEdges(edges);

    return {
      file: sourceFile.relativePath,
      language: sourceFile.language,
      nodes: uniqueNodes,
      edges: uniqueEdges,
      confidence,
      tier,
      schemas_used: schemasUsed,
      unresolved_patterns: unresolvedPatterns,
      errors,
    };
  }

  /**
   * Find all source files in the project.
   * If changedFiles is provided, only returns those files (incremental mode).
   */
  private async findSourceFiles(): Promise<string[]> {
    // Incremental mode: only process changed files
    if (this.options.changedFiles && this.options.changedFiles.length > 0) {
      const files: string[] = [];
      for (const relPath of this.options.changedFiles) {
        const fullPath = path.join(this.projectConfig.path, relPath);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile() && stat.size <= this.options.maxFileSize) {
            files.push(fullPath);
          }
        } catch {
          // File may have been deleted - skip it
        }
      }
      return files;
    }

    // Full extraction mode
    const includePatterns = this.projectConfig.includePaths || ['**/*'];
    const excludePatterns = [
      ...this.options.excludePatterns,
      ...(this.projectConfig.excludePaths || []),
    ];

    const files: string[] = [];

    for (const pattern of includePatterns) {
      const fullPattern = path.join(this.projectConfig.path, pattern);
      const matches = await glob(fullPattern, {
        nodir: true,
        ignore: excludePatterns.map((p) =>
          path.join(this.projectConfig.path, p)
        ),
      });
      files.push(...matches);
    }

    // Filter by file size
    const validFiles: string[] = [];
    for (const file of files) {
      try {
        const stat = await fs.stat(file);
        if (stat.size <= this.options.maxFileSize) {
          validFiles.push(file);
        }
      } catch {
        // Skip files we can't stat
      }
    }

    return validFiles;
  }

  /**
   * Load a source file.
   */
  private async loadSourceFile(filePath: string): Promise<SourceFile | null> {
    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.projectConfig.path, filePath);
      const language = this.languageDetector.detect(filePath, content);

      return {
        path: filePath,
        relativePath,
        content,
        language,
        size: stat.size,
        lastModified: stat.mtime,
      };
    } catch (error) {
      console.error(`Failed to load file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Decide which tier to use for extraction.
   */
  private routeTier(
    file: SourceFile,
    schemaMatches: SchemaMatch[]
  ): TierRoutingDecision {
    // If we have high-confidence schema matches, use tier 1
    const firstMatch = schemaMatches[0];
    if (schemaMatches.length > 0 && firstMatch && firstMatch.score >= 0.5) {
      return {
        tier: 1,
        reason: `High-confidence schema match: ${firstMatch.schema.name}`,
        schemas: schemaMatches.map((m) => m.schema.name),
      };
    }

    // If we have any schema matches, try tier 1 first
    if (schemaMatches.length > 0) {
      return {
        tier: 1,
        reason: `Low-confidence schema match, will verify with tier 2 if needed`,
        schemas: schemaMatches.map((m) => m.schema.name),
      };
    }

    // No schemas match - need AI
    if (this.options.enableAI) {
      return {
        tier: 3,
        reason: `No matching schemas for ${file.language}, using AI discovery`,
      };
    }

    // AI disabled, try base language schema only
    return {
      tier: 1,
      reason: `No matching schemas, trying base ${file.language} extraction`,
      schemas: [`base-${file.language}`],
    };
  }

  /**
   * Deduplicate nodes by ID.
   */
  private deduplicateNodes(nodes: MeshNode[]): MeshNode[] {
    const seen = new Set<string>();
    return nodes.filter((node) => {
      if (seen.has(node.id)) {
        return false;
      }
      seen.add(node.id);
      return true;
    });
  }

  /**
   * Deduplicate edges by ID.
   */
  private deduplicateEdges(edges: MeshEdge[]): MeshEdge[] {
    const seen = new Set<string>();
    return edges.filter((edge) => {
      if (seen.has(edge.id)) {
        return false;
      }
      seen.add(edge.id);
      return true;
    });
  }

  /**
   * Get the schema registry (for testing/debugging).
   */
  getSchemaRegistry(): SchemaRegistry {
    return this.schemaRegistry;
  }
}
