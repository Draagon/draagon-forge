/**
 * SelfLearningPipeline - Orchestrates the three-tier extraction with learning.
 *
 * This is the main entry point for intelligent code extraction that:
 * 1. Tries Tier 1 (schema-based) first
 * 2. Escalates to Tier 2 (AI-assisted) for low-confidence results
 * 3. Uses Tier 3 (AI-discovery) for unknown frameworks
 * 4. Generates new schemas from discoveries for future use
 */

import { SourceFile, FileExtractionResult, Schema } from '../types';
import { SchemaRegistry, SchemaMatch } from '../core/SchemaRegistry';
import { PatternMatcher } from '../core/PatternMatcher';
import { AIClient } from './AIClient';
import { Tier2Enhancer, Tier2Result } from './Tier2Enhancer';
import { Tier3Discoverer, Tier3Result, SchemaSuggestion } from './Tier3Discoverer';
import { SchemaGenerator, GenerationResult } from './SchemaGenerator';

export interface PipelineConfig {
  /** Confidence threshold for Tier 1 acceptance */
  tier1Threshold: number;
  /** Confidence threshold for Tier 2 acceptance */
  tier2Threshold: number;
  /** Enable AI tiers */
  enableAI: boolean;
  /** Enable self-learning (schema generation) */
  enableLearning: boolean;
  /** Minimum discoveries before generating a schema */
  learningThreshold: number;
  /** Maximum AI calls per file */
  maxAICallsPerFile: number;
}

const DEFAULT_CONFIG: PipelineConfig = {
  tier1Threshold: 0.4,
  tier2Threshold: 0.6,
  enableAI: true,
  enableLearning: true,
  learningThreshold: 5,
  maxAICallsPerFile: 10,
};

export interface PipelineResult {
  file: string;
  result: FileExtractionResult;
  tierUsed: 1 | 2 | 3;
  schemasMatched: string[];
  frameworkDetected?: string;
  learningResult?: LearningResult;
  stats: PipelineStats;
}

export interface LearningResult {
  suggestionsCollected: number;
  schemaGenerated: boolean;
  schemaName?: string;
  schemaPath?: string;
}

export interface PipelineStats {
  tier1Time: number;
  tier2Time: number;
  tier3Time: number;
  totalTime: number;
  aiCalls: number;
  tokensUsed: number;
}

export class SelfLearningPipeline {
  private config: PipelineConfig;
  private schemaRegistry: SchemaRegistry;
  private patternMatcher: PatternMatcher;
  private tier2Enhancer?: Tier2Enhancer;
  private tier3Discoverer?: Tier3Discoverer;
  private schemaGenerator?: SchemaGenerator;

  // Learning state
  private suggestionsByFramework: Map<string, SchemaSuggestion[]> = new Map();
  private examplesByFramework: Map<string, string[]> = new Map();

  constructor(
    schemaRegistry: SchemaRegistry,
    projectId: string,
    aiClient?: AIClient,
    config: Partial<PipelineConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.schemaRegistry = schemaRegistry;
    this.patternMatcher = new PatternMatcher(projectId);

    if (aiClient && this.config.enableAI) {
      this.tier2Enhancer = new Tier2Enhancer(aiClient);
      this.tier3Discoverer = new Tier3Discoverer(aiClient);

      if (this.config.enableLearning) {
        this.schemaGenerator = new SchemaGenerator(aiClient);
      }
    }
  }

  /**
   * Process a file through the three-tier pipeline.
   */
  async process(
    file: SourceFile,
    projectId: string
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const stats: PipelineStats = {
      tier1Time: 0,
      tier2Time: 0,
      tier3Time: 0,
      totalTime: 0,
      aiCalls: 0,
      tokensUsed: 0,
    };

    // Find matching schemas
    const schemaMatches = await this.schemaRegistry.findMatchingSchemas(file);
    const schemasMatched = schemaMatches.map((m) => m.schema.name);

    // TIER 1: Schema-based extraction
    const tier1Start = Date.now();
    const tier1Result = await this.runTier1(file, schemaMatches);
    stats.tier1Time = Date.now() - tier1Start;

    // Check if Tier 1 is sufficient
    if (tier1Result.confidence >= this.config.tier1Threshold || !this.config.enableAI) {
      return {
        file: file.relativePath,
        result: this.toFileResult(file, tier1Result, 1, schemasMatched),
        tierUsed: 1,
        schemasMatched,
        stats: { ...stats, totalTime: Date.now() - startTime },
      };
    }

    // TIER 2: AI-assisted enhancement
    if (this.tier2Enhancer && tier1Result.nodes.length > 0) {
      const tier2Start = Date.now();
      const tier2Result = await this.runTier2(file, tier1Result, schemasMatched[0]);
      stats.tier2Time = Date.now() - tier2Start;
      stats.aiCalls += tier2Result.aiCalls;
      stats.tokensUsed += tier2Result.tokensUsed;

      if (tier2Result.confidence >= this.config.tier2Threshold) {
        return {
          file: file.relativePath,
          result: this.tier2ToFileResult(file, tier2Result, schemasMatched),
          tierUsed: 2,
          schemasMatched,
          stats: { ...stats, totalTime: Date.now() - startTime },
        };
      }
    }

    // TIER 3: Full AI discovery
    if (this.tier3Discoverer) {
      const tier3Start = Date.now();
      const tier3Result = await this.runTier3(file, projectId);
      stats.tier3Time = Date.now() - tier3Start;
      stats.aiCalls += tier3Result.aiCalls;
      stats.tokensUsed += tier3Result.tokensUsed;

      // Process learning if enabled
      let learningResult: LearningResult | undefined;
      if (this.config.enableLearning && tier3Result.frameworkDetected) {
        learningResult = await this.processLearning(
          tier3Result,
          file
        );
      }

      return {
        file: file.relativePath,
        result: tier3Result.result,
        tierUsed: 3,
        schemasMatched,
        frameworkDetected: tier3Result.frameworkDetected?.name,
        learningResult,
        stats: { ...stats, totalTime: Date.now() - startTime },
      };
    }

    // Fallback to Tier 1 result
    return {
      file: file.relativePath,
      result: this.toFileResult(file, tier1Result, 1, schemasMatched),
      tierUsed: 1,
      schemasMatched,
      stats: { ...stats, totalTime: Date.now() - startTime },
    };
  }

  /**
   * Run Tier 1 extraction.
   */
  private async runTier1(
    file: SourceFile,
    schemaMatches: SchemaMatch[]
  ): Promise<Tier1Result> {
    if (schemaMatches.length === 0) {
      return { nodes: [], edges: [], confidence: 0, schemasUsed: [] };
    }

    // Apply best matching schema
    const bestMatch = schemaMatches[0]!;
    const result = this.patternMatcher.match(file, bestMatch.schema);

    return {
      nodes: result.nodes,
      edges: result.edges,
      confidence: result.confidence,
      schemasUsed: [bestMatch.schema.name],
    };
  }

  /**
   * Run Tier 2 enhancement.
   */
  private async runTier2(
    file: SourceFile,
    tier1Result: Tier1Result,
    framework?: string
  ): Promise<Tier2Result> {
    if (!this.tier2Enhancer) {
      throw new Error('Tier 2 enhancer not initialized');
    }

    return this.tier2Enhancer.enhance({
      file,
      tier1Result: {
        nodes: tier1Result.nodes,
        edges: tier1Result.edges,
        confidence: tier1Result.confidence,
        matchCount: tier1Result.nodes.length,
        unresolvedPatterns: [],
      },
      framework,
      projectId: tier1Result.nodes[0]?.project_id || 'unknown',
    });
  }

  /**
   * Run Tier 3 discovery.
   */
  private async runTier3(file: SourceFile, projectId: string): Promise<Tier3Result> {
    if (!this.tier3Discoverer) {
      throw new Error('Tier 3 discoverer not initialized');
    }

    return this.tier3Discoverer.discover({
      file,
      projectId,
    });
  }

  /**
   * Process learning from Tier 3 discoveries.
   */
  private async processLearning(
    tier3Result: Tier3Result,
    file: SourceFile
  ): Promise<LearningResult> {
    const frameworkName = tier3Result.frameworkDetected?.name || 'unknown';

    // Collect suggestions
    const existing = this.suggestionsByFramework.get(frameworkName) || [];
    for (const suggestion of tier3Result.schemaSuggestions) {
      const found = existing.find((s) => s.pattern === suggestion.pattern);
      if (found) {
        found.count++;
      } else {
        existing.push(suggestion);
      }
    }
    this.suggestionsByFramework.set(frameworkName, existing);

    // Collect examples
    const examples = this.examplesByFramework.get(frameworkName) || [];
    if (file.content.length < 5000) {
      examples.push(file.content.substring(0, 2000));
    }
    this.examplesByFramework.set(frameworkName, examples.slice(-10)); // Keep last 10

    // Check if we have enough data to generate a schema
    const totalOccurrences = existing.reduce((sum, s) => sum + s.count, 0);

    if (totalOccurrences >= this.config.learningThreshold && this.schemaGenerator) {
      try {
        const generated = await this.schemaGenerator.generateFromDiscoveries(
          frameworkName,
          file.language,
          existing,
          examples
        );

        if (generated.validationResult.valid) {
          const schemaPath = await this.schemaGenerator.saveSchema(generated.schema);
          await this.schemaRegistry.addSchema(generated.schema, false);

          // Clear learning state for this framework
          this.suggestionsByFramework.delete(frameworkName);
          this.examplesByFramework.delete(frameworkName);

          return {
            suggestionsCollected: existing.length,
            schemaGenerated: true,
            schemaName: generated.schema.name,
            schemaPath,
          };
        }
      } catch (error) {
        console.error('Failed to generate schema:', error);
      }
    }

    return {
      suggestionsCollected: existing.length,
      schemaGenerated: false,
    };
  }

  /**
   * Convert Tier 1 result to FileExtractionResult.
   */
  private toFileResult(
    file: SourceFile,
    result: Tier1Result,
    tier: 1 | 2 | 3,
    schemasUsed: string[]
  ): FileExtractionResult {
    return {
      file: file.relativePath,
      language: file.language,
      nodes: result.nodes,
      edges: result.edges,
      confidence: result.confidence,
      tier,
      schemas_used: schemasUsed,
      unresolved_patterns: [],
      errors: [],
    };
  }

  /**
   * Convert Tier 2 result to FileExtractionResult.
   */
  private tier2ToFileResult(
    file: SourceFile,
    result: Tier2Result,
    schemasUsed: string[]
  ): FileExtractionResult {
    return {
      file: file.relativePath,
      language: file.language,
      nodes: result.enhancedNodes,
      edges: result.enhancedEdges,
      confidence: result.confidence,
      tier: 2,
      schemas_used: schemasUsed,
      unresolved_patterns: [],
      errors: [],
    };
  }

  /**
   * Get current learning statistics.
   */
  getLearningStats(): LearningStats {
    const stats: LearningStats = {
      frameworksDetected: [],
      totalSuggestions: 0,
      readyForGeneration: [],
    };

    for (const [framework, suggestions] of this.suggestionsByFramework) {
      const count = suggestions.reduce((sum, s) => sum + s.count, 0);
      stats.frameworksDetected.push(framework);
      stats.totalSuggestions += count;

      if (count >= this.config.learningThreshold) {
        stats.readyForGeneration.push(framework);
      }
    }

    return stats;
  }

  /**
   * Force schema generation for a framework.
   */
  async forceSchemaGeneration(frameworkName: string): Promise<GenerationResult | null> {
    if (!this.schemaGenerator) return null;

    const suggestions = this.suggestionsByFramework.get(frameworkName);
    const examples = this.examplesByFramework.get(frameworkName);

    if (!suggestions || suggestions.length === 0) return null;

    return this.schemaGenerator.generateFromDiscoveries(
      frameworkName,
      'python', // Default, should be tracked per framework
      suggestions,
      examples || []
    );
  }
}

// ============================================================================
// Types
// ============================================================================

interface Tier1Result {
  nodes: FileExtractionResult['nodes'];
  edges: FileExtractionResult['edges'];
  confidence: number;
  schemasUsed: string[];
}

export interface LearningStats {
  frameworksDetected: string[];
  totalSuggestions: number;
  readyForGeneration: string[];
}
