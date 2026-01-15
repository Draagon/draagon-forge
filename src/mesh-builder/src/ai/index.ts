/**
 * AI Tier components for intelligent code extraction.
 *
 * Three-tier system:
 * - Tier 1: Schema-based regex extraction (handled by PatternMatcher)
 * - Tier 2: AI-assisted disambiguation (Tier2Enhancer)
 * - Tier 3: Full AI discovery (Tier3Discoverer)
 *
 * Plus self-learning:
 * - SchemaGenerator: Creates schemas from discoveries
 * - SelfLearningPipeline: Orchestrates the entire flow
 */

export {
  AIClient,
  AIClientConfig,
  AIResponse,
  AIStats,
  DisambiguationContext,
  DisambiguationResult,
  DiscoveryContext,
  DiscoveryResult,
  SchemaGenerationContext,
  GeneratedSchema,
} from './AIClient';

export {
  Tier2Enhancer,
  Tier2EnhancerConfig,
  Tier2Context,
  Tier2Result,
  Enhancement,
} from './Tier2Enhancer';

export {
  Tier3Discoverer,
  Tier3DiscovererConfig,
  Tier3Context,
  Tier3Result,
  SchemaSuggestion,
} from './Tier3Discoverer';

export {
  SchemaGenerator,
  SchemaGeneratorConfig,
  GenerationResult,
  ValidationResult,
  PatternDefinition,
} from './SchemaGenerator';

export {
  SelfLearningPipeline,
  PipelineConfig,
  PipelineResult,
  LearningResult,
  PipelineStats,
  LearningStats,
} from './SelfLearningPipeline';
