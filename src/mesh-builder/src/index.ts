/**
 * @draagon-forge/mesh-builder
 *
 * Agentic code mesh extraction tool with three-tier schema-based analysis.
 *
 * Tier 1: Schema-based regex extraction (fast, deterministic)
 * Tier 2: AI-assisted disambiguation (when patterns are ambiguous)
 * Tier 3: AI-driven discovery (for unknown frameworks)
 */

// Core types
export * from './types';

// Core components
export { SchemaRegistry, SchemaInfo, SchemaMatch } from './core/SchemaRegistry';
export { PatternMatcher, MatchResult, PatternMatcherResult } from './core/PatternMatcher';
export { LanguageDetector, SupportedLanguage } from './core/LanguageDetector';

// Extractors
export { FileExtractor, ExtractorOptions } from './extractors/FileExtractor';

// AI components
export {
  AIClient,
  Tier2Enhancer,
  Tier3Discoverer,
  SchemaGenerator,
  SelfLearningPipeline,
} from './ai';
