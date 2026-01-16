/**
 * ExtractionContextProvider - Main orchestrator for gathering context.
 *
 * Coordinates all context sources to build enriched context for Tier 3 AI discovery:
 * 1. Static Analysis (local, fast) - imports, dependencies, frameworks
 * 2. Related File Resolution (local, fast) - type signatures from imports
 * 3. Semantic Memory (local, fast) - beliefs and patterns from draagon-ai
 * 4. External Knowledge (remote, cached) - Context7, web search (only when needed)
 */

import { SourceFile } from '../types';
import {
  EnrichedTier3Context,
  ContextGatheringOptions,
  ContextMetadata,
  BeliefResult,
  PatternResult,
  ExternalKnowledgeResult,
  DEFAULT_CONTEXT_CONFIG,
  ContextProviderConfig,
} from './types';
import { StaticAnalyzer, StaticAnalyzerConfig } from './StaticAnalyzer';
import { RelatedFileResolver, RelatedFileResolverConfig } from './RelatedFileResolver';
import { SemanticMemoryClient, SemanticMemoryClientConfig } from './SemanticMemoryClient';
import { ExternalKnowledgeClient, ExternalKnowledgeClientConfig } from './ExternalKnowledgeClient';

export interface ExtractionContextProviderConfig {
  /** Project root directory */
  projectRoot: string;
  /** Project ID for semantic memory queries */
  projectId: string;
  /** Context provider configuration */
  contextConfig?: Partial<ContextProviderConfig>;
  /** Static analyzer configuration */
  staticAnalyzerConfig?: Partial<StaticAnalyzerConfig>;
  /** Related file resolver configuration */
  relatedFileConfig?: Partial<RelatedFileResolverConfig>;
  /** Semantic memory client configuration */
  semanticMemoryConfig?: Partial<SemanticMemoryClientConfig>;
  /** External knowledge client configuration */
  externalKnowledgeConfig?: Partial<ExternalKnowledgeClientConfig>;
}

export class ExtractionContextProvider {
  private config: ContextProviderConfig;
  private projectRoot: string;
  private projectId: string;

  private staticAnalyzer: StaticAnalyzer;
  private relatedFileResolver: RelatedFileResolver;
  private semanticMemoryClient: SemanticMemoryClient;
  private externalKnowledgeClient: ExternalKnowledgeClient;

  constructor(config: ExtractionContextProviderConfig) {
    this.projectRoot = config.projectRoot;
    this.projectId = config.projectId;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config.contextConfig };

    // Initialize all sub-components
    this.staticAnalyzer = new StaticAnalyzer({
      projectRoot: config.projectRoot,
      ...config.staticAnalyzerConfig,
    });

    this.relatedFileResolver = new RelatedFileResolver({
      projectRoot: config.projectRoot,
      ...config.relatedFileConfig,
    });

    this.semanticMemoryClient = new SemanticMemoryClient({
      memoryEndpoint: this.config.memoryEndpoint,
      ...config.semanticMemoryConfig,
    });

    this.externalKnowledgeClient = new ExternalKnowledgeClient({
      context7ApiKey: this.config.context7ApiKey,
      webSearchEndpoint: this.config.webSearchEndpoint,
      ...config.externalKnowledgeConfig,
    });
  }

  /**
   * Gather all context for a file extraction.
   * This is the main entry point called before Tier 3 AI discovery.
   */
  async gatherContext(
    file: SourceFile,
    options: ContextGatheringOptions = {}
  ): Promise<EnrichedTier3Context> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || this.config.timeoutMs;
    const minBeliefs = options.minBeliefs ?? this.config.minBeliefsThreshold;

    const metadata: ContextMetadata = {
      gatheringTimeMs: 0,
      sourcesQueried: [],
      cacheHits: 0,
      cacheMisses: 0,
      timedOut: false,
      errors: [],
    };

    // Initialize result with defaults
    let staticAnalysis: EnrichedTier3Context['staticAnalysis'] = {
      imports: [],
      dependencies: [],
      frameworks: [],
      projectType: 'unknown' as const,
      pathAliases: {},
      analysisTimeMs: 0,
    };
    let relatedFiles: EnrichedTier3Context['relatedFiles'] = [];
    let beliefs: BeliefResult[] = [];
    let patterns: PatternResult[] = [];
    let externalKnowledge: ExternalKnowledgeResult[] = [];

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Context gathering timeout')), timeoutMs);
    });

    try {
      // Phase 1: Static Analysis (ALWAYS, fast)
      try {
        staticAnalysis = await Promise.race([
          this.staticAnalyzer.analyze(file),
          timeoutPromise,
        ]);
        metadata.sourcesQueried.push('static');
      } catch (error) {
        if (error instanceof Error && error.message === 'Context gathering timeout') {
          metadata.timedOut = true;
          throw error;
        }
        metadata.errors.push(`Static analysis failed: ${error}`);
      }

      // Update related file resolver with path aliases
      if (Object.keys(staticAnalysis.pathAliases).length > 0) {
        this.relatedFileResolver.setPathAliases(staticAnalysis.pathAliases);
      }

      // Phase 2: Related Files + Semantic Memory (ALWAYS, parallel)
      const remainingTime = timeoutMs - (Date.now() - startTime);
      if (remainingTime > 0) {
        const relatedPromise = this.resolveRelatedFiles(file, staticAnalysis.imports, options)
          .then((result) => {
            metadata.sourcesQueried.push('related');
            return result;
          })
          .catch((error) => {
            metadata.errors.push(`Related file resolution failed: ${error}`);
            return [];
          });

        const frameworkNames = staticAnalysis.frameworks.map((f) => f.name);
        const semanticPromise = this.querySemanticMemory(file, frameworkNames)
          .then((result) => {
            metadata.sourcesQueried.push('semantic');
            return result;
          })
          .catch((error) => {
            metadata.errors.push(`Semantic memory query failed: ${error}`);
            return { beliefs: [], patterns: [] };
          });

        const phase2Timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Phase 2 timeout')), remainingTime);
        });

        try {
          const [resolvedFiles, semanticResult] = await Promise.race([
            Promise.all([relatedPromise, semanticPromise]),
            phase2Timeout,
          ]);
          relatedFiles = resolvedFiles;
          beliefs = semanticResult.beliefs;
          patterns = semanticResult.patterns;
        } catch (error) {
          if (error instanceof Error && error.message.includes('timeout')) {
            metadata.timedOut = true;
          }
        }
      }

      // Phase 3: External Knowledge (ONLY IF NEEDED)
      const remainingTime2 = timeoutMs - (Date.now() - startTime);
      const needsExternal =
        !options.skipExternal &&
        !this.config.disableExternal &&
        beliefs.length < minBeliefs &&
        staticAnalysis.frameworks.length > 0 &&
        remainingTime2 > 500; // Need at least 500ms for external queries

      if (needsExternal) {
        try {
          const externalTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('External query timeout')), remainingTime2);
          });

          const primaryFramework = staticAnalysis.frameworks[0];
          if (primaryFramework) {
            externalKnowledge = await Promise.race([
              this.externalKnowledgeClient.queryAll(primaryFramework.name, file.language),
              externalTimeout,
            ]);

            if (externalKnowledge.length > 0) {
              metadata.sourcesQueried.push('context7', 'web', 'registry');
              metadata.cacheMisses++;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('timeout')) {
            metadata.timedOut = true;
          }
          metadata.errors.push(`External knowledge query failed: ${error}`);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Context gathering timeout') {
        metadata.timedOut = true;
      } else {
        metadata.errors.push(`Context gathering failed: ${error}`);
      }
    }

    metadata.gatheringTimeMs = Date.now() - startTime;

    // Build enriched context
    return {
      file,
      projectId: this.projectId,
      imports: staticAnalysis.imports.map((i) => i.module),
      staticAnalysis,
      relatedFiles,
      beliefs,
      patterns,
      externalKnowledge,
      contextMetadata: metadata,
    };
  }

  /**
   * Resolve related files from imports.
   */
  private async resolveRelatedFiles(
    file: SourceFile,
    imports: EnrichedTier3Context['staticAnalysis']['imports'],
    options: ContextGatheringOptions
  ): Promise<EnrichedTier3Context['relatedFiles']> {
    const maxFiles = options.maxRelatedFiles ?? this.config.maxRelatedFiles;

    // Only resolve relative imports (local files)
    const relativeImports = imports.filter((i) => i.isRelative);
    if (relativeImports.length === 0) {
      return [];
    }

    return this.relatedFileResolver.resolve(file, relativeImports.slice(0, maxFiles));
  }

  /**
   * Query semantic memory for beliefs and patterns.
   */
  private async querySemanticMemory(
    file: SourceFile,
    frameworkNames: string[]
  ): Promise<{ beliefs: BeliefResult[]; patterns: PatternResult[] }> {
    // Build query from file context
    const queryParts = [file.language];
    if (frameworkNames.length > 0) {
      queryParts.push(...frameworkNames);
    }
    const query = queryParts.join(' ');

    // Query beliefs and patterns in parallel
    const [beliefs, patterns] = await Promise.all([
      this.semanticMemoryClient.queryBeliefs(query, {
        minConviction: 0.5,
        limit: 10,
        frameworks: frameworkNames,
      }),
      frameworkNames.length > 0
        ? this.semanticMemoryClient.queryPatterns(frameworkNames[0]!, file.language)
        : Promise.resolve([]),
    ]);

    return { beliefs, patterns };
  }

  /**
   * Store knowledge learned from a successful extraction.
   * Called after Tier 3 discovery to feed knowledge back into memory.
   */
  async storeLearnedKnowledge(
    extraction: {
      file: SourceFile;
      framework?: string;
      discoveries: Array<{
        nodeType: string;
        pattern?: string;
        confidence: number;
      }>;
    }
  ): Promise<void> {
    const { file, framework, discoveries } = extraction;

    for (const discovery of discoveries) {
      if (discovery.confidence >= 0.7 && discovery.pattern) {
        await this.semanticMemoryClient.storeExtractedKnowledge({
          type: 'code_pattern',
          content: `Pattern for ${discovery.nodeType}: ${discovery.pattern}`,
          confidence: discovery.confidence,
          framework,
          language: file.language,
          example: discovery.pattern,
          sourceFile: file.path,
        });
      }
    }
  }

  /**
   * Clear all caches.
   */
  clearCaches(): void {
    this.staticAnalyzer.clearCaches();
    this.relatedFileResolver.clearCache();
    this.semanticMemoryClient.clearCache();
    this.externalKnowledgeClient.clearCache();
  }

  /**
   * Get the semantic memory client for direct access.
   */
  getSemanticMemoryClient(): SemanticMemoryClient {
    return this.semanticMemoryClient;
  }

  /**
   * Get the external knowledge client for direct access.
   */
  getExternalKnowledgeClient(): ExternalKnowledgeClient {
    return this.externalKnowledgeClient;
  }
}
