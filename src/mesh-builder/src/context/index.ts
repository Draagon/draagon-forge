/**
 * Extraction Context Provider Module (REQ-034)
 *
 * Provides enriched context for Tier 3 AI discovery by gathering information
 * from multiple sources: static analysis, related files, semantic memory,
 * and external knowledge.
 */

// Main orchestrator
export {
  ExtractionContextProvider,
  ExtractionContextProviderConfig,
} from './ExtractionContextProvider';

// Component classes
export { StaticAnalyzer, StaticAnalyzerConfig } from './StaticAnalyzer';
export { RelatedFileResolver, RelatedFileResolverConfig } from './RelatedFileResolver';
export { SemanticMemoryClient, SemanticMemoryClientConfig } from './SemanticMemoryClient';
export {
  ExternalKnowledgeClient,
  ExternalKnowledgeClientConfig,
} from './ExternalKnowledgeClient';

// Types
export {
  // Static analysis types
  ImportInfo,
  DependencyInfo,
  FrameworkDetection,
  StaticAnalysisResult,

  // Related file types
  ExportInfo,
  RelatedFileContext,

  // Semantic memory types
  BeliefResult,
  PatternResult,

  // External knowledge types
  Context7Result,
  WebSearchResult,
  PackageInfo,
  ExternalKnowledgeResult,

  // Enriched context types
  ContextGatheringOptions,
  ContextMetadata,
  EnrichedTier3Context,

  // Knowledge feedback types
  ExtractedKnowledge,

  // Configuration
  ContextProviderConfig,
  DEFAULT_CONTEXT_CONFIG,

  // Constants
  FRAMEWORK_PATTERNS,
  DEPENDENCY_CATEGORIES,
} from './types';
