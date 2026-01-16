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
  GitContext,
  CrossProjectLink,
} from '../types';
import { SchemaRegistry, SchemaMatch } from '../core/SchemaRegistry';
import { PatternMatcher, PatternMatcherResult } from '../core/PatternMatcher';
import { LanguageDetector, SupportedLanguage } from '../core/LanguageDetector';
import { GitTracker } from '../git/GitTracker';
import { AIClient } from '../ai/AIClient';
import { Tier3Discoverer, SchemaSuggestion, EnrichedTier3DiscoveryContext } from '../ai/Tier3Discoverer';
import { Tier2Verifier, applyCorrections } from '../verifier/Tier2Verifier';
import {
  ExtractionContextProvider,
  ExtractionContextProviderConfig,
} from '../context';
import { SchemaEvolver } from '../schema-graph/SchemaEvolver';
import { SchemaGraphStore } from '../schema-graph/SchemaGraphStore';
import { ReferenceCollector, ExternalReference } from '../linking/ReferenceCollector';
import { CrossProjectMatcher, MatchCandidate } from '../linking/CrossProjectMatcher';
import { CrossServiceLinker, LinkingResult } from '../linking/CrossServiceLinker';

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
  /** Enable schema evolution after extraction */
  enableEvolution?: boolean;
  /** Neo4j connection URI for schema graph store */
  neo4jUri?: string;
  /** Neo4j username */
  neo4jUser?: string;
  /** Neo4j password */
  neo4jPassword?: string;
  /** Enable context gathering for Tier 3 discovery (REQ-034) */
  enableContextGathering?: boolean;
  /** Context provider configuration */
  contextProviderConfig?: Partial<ExtractionContextProviderConfig>;
}

const DEFAULT_OPTIONS: ExtractorOptions = {
  tier1Threshold: 0.5, // Raised from 0.3 to let Tier 2 activate more often
  enableAI: true,
  maxFileSize: 1024 * 1024, // 1MB
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/target/**',
    '**/__pycache__/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/vendor/**',
    '**/.venv/**',
    '**/venv/**',
    '**/.gradle/**',
    '**/gradle/**',
    '**/bin/**',
    '**/out/**',
    '**/.idea/**',
    '**/.vscode/**',
    '**/coverage/**',
    '**/*.map',
    '**/*.d.ts',
    '**/package-lock.json',
    '**/yarn.lock',
  ],
};

export class FileExtractor {
  private schemaRegistry: SchemaRegistry;
  private languageDetector: LanguageDetector;
  private gitTracker: GitTracker | null = null;
  private options: ExtractorOptions;

  // AI components (lazy-initialized when enableAI is true)
  private aiClient: AIClient | null = null;
  private tier2Verifier: Tier2Verifier | null = null;
  private tier3Discoverer: Tier3Discoverer | null = null;

  // Schema evolution components
  private schemaGraphStore: SchemaGraphStore | null = null;
  private schemaEvolver: SchemaEvolver | null = null;

  // Context gathering for Tier 3 (REQ-034)
  private contextProvider: ExtractionContextProvider | null = null;

  // Collected schema suggestions from Tier 3 discoveries
  private schemaSuggestions: SchemaSuggestion[] = [];

  // Cross-project linking components
  private referenceCollector: ReferenceCollector;
  private crossProjectMatcher: CrossProjectMatcher;
  private crossServiceLinker: CrossServiceLinker;

  // Collected external references for cross-project linking
  private collectedReferences: ExternalReference[] = [];

  // Cross-project link results from multi-project extraction
  private crossProjectLinks: CrossProjectLink[] = [];

  // Track AI usage stats
  private aiCalls: number = 0;
  private aiTokensUsed: number = 0;

  constructor(
    private projectConfig: ProjectConfig,
    options: Partial<ExtractorOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    const schemasDir =
      this.options.schemasDir ||
      path.join(__dirname, '..', '..', 'schemas');

    // Initialize schema graph store first if Neo4j is configured
    // This allows SchemaRegistry to load evolved schemas
    if (
      this.options.neo4jUri &&
      this.options.neo4jUser &&
      this.options.neo4jPassword
    ) {
      this.schemaGraphStore = new SchemaGraphStore({
        neo4jUri: this.options.neo4jUri,
        neo4jUser: this.options.neo4jUser,
        neo4jPassword: this.options.neo4jPassword,
      });
    }

    // Pass schema graph store to registry for loading evolved schemas
    this.schemaRegistry = new SchemaRegistry(schemasDir, this.schemaGraphStore || undefined);
    this.languageDetector = new LanguageDetector();

    // Initialize cross-project linking components
    this.referenceCollector = new ReferenceCollector();
    this.crossProjectMatcher = new CrossProjectMatcher({
      minConfidence: 0.5,
      enablePatternMatching: true,
      enableAIMatching: false, // Cost control - use literal/pattern matching only
    });
    this.crossServiceLinker = new CrossServiceLinker({
      minConfidence: 0.5,
      bidirectional: true,
    });

    // Initialize git tracker if project is a git repo
    try {
      this.gitTracker = new GitTracker(this.projectConfig.path);
      // Quick check if it's actually a git repo
      this.gitTracker.getContext();
    } catch {
      this.gitTracker = null;
    }

    // Initialize AI components if enabled and API key available
    if (this.options.enableAI && process.env['GROQ_API_KEY']) {
      try {
        this.aiClient = new AIClient();
        this.tier2Verifier = new Tier2Verifier({
          provider: 'groq',
          apiKey: process.env['GROQ_API_KEY'],
          model: 'llama-3.3-70b-versatile',
        });
        this.tier3Discoverer = new Tier3Discoverer(this.aiClient);
        console.log('AI components initialized for Tier 2/3 extraction');

        // Initialize schema evolution if Neo4j is configured
        // (SchemaGraphStore already initialized in constructor)
        if (
          this.options.enableEvolution !== false &&
          this.schemaGraphStore
        ) {
          this.schemaEvolver = new SchemaEvolver(this.schemaGraphStore, {
            groq: {
              name: 'groq',
              model: 'llama-3.3-70b-versatile',
              apiKey: process.env['GROQ_API_KEY'],
            },
            claudeSonnet: {
              name: 'claude-sonnet',
              model: 'claude-sonnet-4-20250514',
              apiKey: process.env['ANTHROPIC_API_KEY'],
            },
            claudeOpus: {
              name: 'claude-opus',
              model: 'claude-opus-4-20250514',
              apiKey: process.env['ANTHROPIC_API_KEY'],
            },
          });
          console.log('Schema evolution initialized');
        }

        // Initialize context provider for enhanced Tier 3 discovery (REQ-034)
        if (this.options.enableContextGathering !== false) {
          this.contextProvider = new ExtractionContextProvider({
            projectRoot: this.projectConfig.path,
            projectId: this.projectConfig.id,
            ...this.options.contextProviderConfig,
          });
          console.log('Context provider initialized for enhanced Tier 3 discovery');
        }
      } catch (error) {
        console.warn('Failed to initialize AI components:', error);
        // Continue without AI - will fall back to Tier 1 only
      }
    }
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

    // Add AI usage stats
    stats.ai_calls = this.aiCalls;
    stats.ai_tokens_used = this.aiTokensUsed;

    // Run schema evolution if we have suggestions OR corrections recorded
    // This ensures learning happens from both Tier 3 discoveries and Tier 2 corrections
    const shouldRunEvolution = this.schemaEvolver && (
      this.schemaSuggestions.length > 0 ||
      stats.tier2_extractions > 0  // Tier 2 means corrections may have been recorded
    );

    if (shouldRunEvolution) {
      try {
        console.log(`Running schema evolution (${this.schemaSuggestions.length} suggestions, ${stats.tier2_extractions} tier 2 extractions)...`);
        await this.schemaGraphStore?.connect();

        // Run evolution cycle for patterns that need improvement
        const evolvedCount = await this.schemaEvolver!.runEvolutionCycle();
        stats.schemas_generated = evolvedCount;

        console.log(`Schema evolution complete: ${evolvedCount} patterns evolved`);

        // CRITICAL FIX: Reload evolved schemas so future extractions use them
        if (evolvedCount > 0) {
          console.log('Reloading evolved schemas into registry...');
          await this.schemaRegistry.reloadEvolvedSchemas();
          console.log('Evolved schemas loaded successfully');
        }

        await this.schemaGraphStore?.close();
      } catch (error) {
        console.warn('Schema evolution failed:', error);
      }
    }

    stats.extraction_time_ms = Date.now() - startTime;

    // Collect external references for cross-project linking
    const partialResult = {
      project_id: this.projectConfig.id,
      project_path: this.projectConfig.path,
      timestamp: new Date().toISOString(),
      statistics: stats,
      results,
    };
    const externalRefs = this.referenceCollector.collect(partialResult as any);
    this.collectedReferences = externalRefs;

    // Get git context if available
    let gitContext: GitContext | undefined;
    if (this.gitTracker) {
      try {
        const ctx = this.gitTracker.getContext();
        gitContext = {
          commit_sha: ctx.commit_sha,
          commit_short: ctx.commit_short,
          commit_message: ctx.commit_message,
          author: ctx.author,
          committed_at: ctx.committed_at,
          branch: ctx.branch,
          tags: ctx.tags,
          is_clean: ctx.is_clean,
          remote_url: ctx.remote_url,
        };
      } catch {
        // Git context not available
      }
    }

    // Convert external references to result format
    const externalReferences = externalRefs.map(ref => ({
      type: ref.type,
      identifier: ref.identifier,
      direction: ref.direction,
      source_node_id: ref.sourceNodeId,
      source_file: ref.sourceFile,
      confidence: ref.confidence,
    }));

    return {
      project_id: this.projectConfig.id,
      project_path: this.projectConfig.path,
      timestamp: new Date().toISOString(),
      git: gitContext,
      statistics: stats,
      results,
      external_references: externalReferences.length > 0 ? externalReferences : undefined,
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
      if (confidence < this.options.tier1Threshold && this.options.enableAI && this.tier2Verifier) {
        // Escalate to tier 2: verify and correct tier 1 results
        tier = 2;
        try {
          const requests = this.tier2Verifier.createRequests(
            nodes,
            sourceFile,
            schemasUsed[0] || 'unknown',
            'tier1-extraction'
          );

          if (requests.length > 0) {
            const verificationResults = await this.tier2Verifier.verifyBatch(requests);
            nodes = applyCorrections(nodes, verificationResults);
            this.aiCalls += requests.length;

            // Record corrections for schema evolution feedback loop
            await this.recordCorrections(
              verificationResults,
              requests,
              schemasUsed[0] || 'unknown'
            );

            // Record verification results in Neo4j for trust scoring
            await this.recordVerificationResults(
              verificationResults,
              schemasUsed[0] || 'unknown'
            );

            // Recalculate confidence from verification
            const verifiedConfidence = verificationResults.reduce(
              (sum, r) => sum + r.confidence, 0
            ) / verificationResults.length;
            confidence = Math.max(confidence, verifiedConfidence);
          }
        } catch (error) {
          errors.push(`Tier 2 verification failed: ${error}`);
        }
      }
    } else if (routing.tier === 2 && this.tier2Verifier) {
      // Tier 2: AI-assisted verification (when routed directly)
      tier = 2;

      // First, try tier 1 extraction with base schema
      const matcher = new PatternMatcher(this.projectConfig.id);
      const baseSchema = this.schemaRegistry.getSchema(`base-${sourceFile.language}`);

      if (baseSchema) {
        const result = matcher.match(sourceFile, baseSchema);
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        confidence = result.confidence;
        schemasUsed.push(`base-${sourceFile.language}`);
      }

      // Then verify with AI
      try {
        const requests = this.tier2Verifier.createRequests(
          nodes,
          sourceFile,
          schemasUsed[0] || 'unknown',
          'tier2-direct'
        );

        if (requests.length > 0) {
          const verificationResults = await this.tier2Verifier.verifyBatch(requests);
          nodes = applyCorrections(nodes, verificationResults);
          this.aiCalls += requests.length;

          // Record corrections for schema evolution feedback loop
          await this.recordCorrections(
            verificationResults,
            requests,
            schemasUsed[0] || 'unknown'
          );

          // Record verification results in Neo4j for trust scoring
          await this.recordVerificationResults(
            verificationResults,
            schemasUsed[0] || 'unknown'
          );

          const verifiedConfidence = verificationResults.reduce(
            (sum, r) => sum + r.confidence, 0
          ) / verificationResults.length;
          confidence = Math.max(confidence, verifiedConfidence);
        }
      } catch (error) {
        errors.push(`Tier 2 verification failed: ${error}`);
      }
    } else if (routing.tier === 3 && this.tier3Discoverer) {
      // Tier 3: Full AI discovery
      tier = 3;
      try {
        let discoveryResult: import('../ai/Tier3Discoverer').Tier3Result;

        // Use context-enhanced discovery if context provider is available (REQ-034)
        if (this.contextProvider) {
          // Gather enriched context from multiple sources
          const enrichedContext = await this.contextProvider.gatherContext(sourceFile);

          // Convert to discovery context format
          const discoveryContext: EnrichedTier3DiscoveryContext = {
            file: sourceFile,
            projectId: this.projectConfig.id,
            imports: enrichedContext.imports,
            frameworks: enrichedContext.staticAnalysis.frameworks.map(f => ({
              name: f.name,
              confidence: f.confidence,
              evidence: f.evidence,
            })),
            beliefs: enrichedContext.beliefs.map(b => ({
              content: b.content,
              conviction: b.conviction,
              source: b.source,
            })),
            patterns: enrichedContext.patterns.map(p => ({
              description: p.description,
              pattern: p.pattern,
              nodeType: p.nodeType,
            })),
            relatedFiles: enrichedContext.relatedFiles.map(r => ({
              path: r.relativePath,
              exports: r.exports.map(e => ({
                name: e.name,
                kind: e.kind,
                signature: e.signature,
              })),
            })),
            externalKnowledge: enrichedContext.externalKnowledge.map(e => ({
              source: e.source,
              content: e.content,
              confidence: e.confidence,
            })),
          };

          // Use enhanced discovery with context
          discoveryResult = await this.tier3Discoverer.discoverWithContext(discoveryContext);

          // Store learned knowledge back into semantic memory
          if (discoveryResult.schemaSuggestions.length > 0) {
            await this.contextProvider.storeLearnedKnowledge({
              file: sourceFile,
              framework: discoveryResult.frameworkDetected?.name,
              discoveries: discoveryResult.schemaSuggestions.map(s => ({
                nodeType: s.nodeType,
                pattern: s.pattern,
                confidence: discoveryResult.result.confidence,
              })),
            });
          }

          // Log context gathering stats
          const meta = enrichedContext.contextMetadata;
          console.log(
            `Tier 3 with context: ${meta.sourcesQueried.join(', ')} ` +
            `(${meta.gatheringTimeMs}ms, ${enrichedContext.beliefs.length} beliefs, ` +
            `${enrichedContext.relatedFiles.length} related files)`
          );
        } else {
          // Fall back to basic discovery without context
          discoveryResult = await this.tier3Discoverer.discover({
            file: sourceFile,
            projectId: this.projectConfig.id,
          });
        }

        nodes.push(...discoveryResult.result.nodes);
        edges.push(...discoveryResult.result.edges);
        confidence = discoveryResult.result.confidence;
        this.aiCalls += discoveryResult.aiCalls;
        this.aiTokensUsed += discoveryResult.tokensUsed;

        // Collect schema suggestions for evolution
        this.schemaSuggestions.push(...discoveryResult.schemaSuggestions);

        if (discoveryResult.frameworkDetected) {
          // Store detected framework info in properties for later use
          const frameworkInfo = discoveryResult.frameworkDetected;
          if (nodes.length > 0 && nodes[0]) {
            nodes[0].properties = {
              ...nodes[0].properties,
              _detectedFramework: frameworkInfo.name,
              _frameworkConfidence: frameworkInfo.confidence,
            };
          }
        }
      } catch (error) {
        errors.push(`Tier 3 discovery failed: ${error}`);
      }
    } else if (routing.tier === 2) {
      // Tier 2 requested but AI not available
      tier = 2;
      errors.push('Tier 2 AI not available (no API key or initialization failed)');
    } else if (routing.tier === 3) {
      // Tier 3 requested but AI not available
      tier = 3;
      errors.push('Tier 3 AI not available (no API key or initialization failed)');
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

  // Combined glob pattern for all code files (using brace expansion for performance)
  private static readonly CODE_FILE_PATTERN =
    '**/*.{ts,tsx,js,jsx,mjs,cjs,py,java,kt,cs,go,rs,rb,php,swift,scala,c,cpp,h,hpp,cc,hh}';

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

    // Full extraction mode - use combined code file pattern unless explicitly overridden
    const includePatterns = this.projectConfig.includePaths || [FileExtractor.CODE_FILE_PATTERN];
    const excludePatterns = [
      ...this.options.excludePatterns,
      ...(this.projectConfig.excludePaths || []),
    ];

    // Run glob for all include patterns (typically just one combined pattern)
    const allMatches = await Promise.all(
      includePatterns.map((pattern) =>
        glob(path.join(this.projectConfig.path, pattern), {
          nodir: true,
          ignore: excludePatterns.map((p) =>
            path.join(this.projectConfig.path, p)
          ),
        })
      )
    );

    // Flatten and deduplicate
    const files = [...new Set(allMatches.flat())];

    // Filter by file size in parallel (batch of 100 at a time)
    const validFiles: string[] = [];
    const batchSize = 100;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const stats = await Promise.all(
        batch.map(async (file) => {
          try {
            const stat = await fs.stat(file);
            return stat.size <= this.options.maxFileSize ? file : null;
          } catch {
            return null;
          }
        })
      );
      validFiles.push(...(stats.filter(Boolean) as string[]));
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
   * Now considers trust scores from learning history.
   */
  private routeTier(
    file: SourceFile,
    schemaMatches: SchemaMatch[]
  ): TierRoutingDecision {
    const firstMatch = schemaMatches[0];

    // TRUST-AWARE ROUTING:
    // - High trust (>0.9) + evolved schema: skip Tier 2 verification
    // - Low trust (<0.7): always verify with Tier 2
    // - Medium trust: use confidence score

    if (schemaMatches.length > 0 && firstMatch) {
      const trustScore = firstMatch.trustScore;
      const isEvolved = firstMatch.isEvolved;
      const matchScore = firstMatch.score;

      // TRUSTED PATH: High trust evolved schema with good match
      // These schemas have proven accuracy, skip Tier 2
      if (trustScore !== undefined && trustScore >= 0.9 && isEvolved && matchScore >= 0.4) {
        return {
          tier: 1,
          reason: `Trusted evolved schema: ${firstMatch.schema.name} (trust: ${(trustScore * 100).toFixed(0)}%, evolved)`,
          schemas: schemaMatches.map((m) => m.schema.name),
        };
      }

      // HIGH CONFIDENCE: Good match score (includes trust boost)
      if (matchScore >= 0.5) {
        // But if trust is low, still escalate to Tier 2
        if (trustScore !== undefined && trustScore < 0.7 && this.options.enableAI) {
          return {
            tier: 2,
            reason: `Low-trust schema: ${firstMatch.schema.name} (trust: ${(trustScore * 100).toFixed(0)}%), needs verification`,
            schemas: schemaMatches.map((m) => m.schema.name),
          };
        }

        return {
          tier: 1,
          reason: `High-confidence schema match: ${firstMatch.schema.name}${trustScore !== undefined ? ` (trust: ${(trustScore * 100).toFixed(0)}%)` : ''}`,
          schemas: schemaMatches.map((m) => m.schema.name),
        };
      }

      // LOW CONFIDENCE: Have schemas but low match
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

  /**
   * Get collected schema suggestions from Tier 3 discoveries.
   */
  getSchemaSuggestions(): SchemaSuggestion[] {
    return [...this.schemaSuggestions];
  }

  /**
   * Get AI usage statistics.
   */
  getAIStats(): { calls: number; tokensUsed: number } {
    return {
      calls: this.aiCalls,
      tokensUsed: this.aiTokensUsed,
    };
  }

  /**
   * Check if AI components are available.
   */
  isAIEnabled(): boolean {
    return this.aiClient !== null;
  }

  /**
   * Check if schema evolution is available.
   */
  isEvolutionEnabled(): boolean {
    return this.schemaEvolver !== null;
  }

  /**
   * Get collected external references for cross-project linking.
   */
  getExternalReferences(): ExternalReference[] {
    return [...this.collectedReferences];
  }

  /**
   * Record verification results in Neo4j for trust score updates.
   * This tracks pattern accuracy: verified, corrected, or rejected.
   */
  private async recordVerificationResults(
    verificationResults: import('../verifier/Tier2Verifier').VerificationResult[],
    schemaName: string
  ): Promise<void> {
    if (!this.schemaGraphStore) {
      return; // No store configured, skip recording
    }

    try {
      await this.schemaGraphStore.connect();

      for (const result of verificationResults) {
        // Map verification status to trust score category
        const trustResult = result.status === 'verified'
          ? 'verified'
          : result.status === 'corrected'
            ? 'corrected'
            : 'rejected';

        // Pattern ID is schema:nodeType
        const patternId = `${schemaName}:${result.nodeId.split(':')[1] || 'unknown'}`;

        await this.schemaGraphStore.recordVerification(patternId, trustResult);
      }

      await this.schemaGraphStore.close();
    } catch (error) {
      console.warn('Failed to record verification results:', error);
      // Don't fail extraction if verification recording fails
    }
  }

  /**
   * Record corrections from Tier 2 verification for schema evolution.
   * This enables the feedback loop: corrections -> evolution -> better patterns.
   */
  private async recordCorrections(
    verificationResults: import('../verifier/Tier2Verifier').VerificationResult[],
    requests: import('../verifier/Tier2Verifier').VerificationRequest[],
    schemaName: string
  ): Promise<void> {
    if (!this.schemaGraphStore) {
      return; // No store configured, skip recording
    }

    // Find corrections (status === 'corrected')
    const corrections = verificationResults.filter(r => r.status === 'corrected');
    if (corrections.length === 0) {
      return;
    }

    try {
      await this.schemaGraphStore.connect();

      for (const correction of corrections) {
        // Find the original request to get context
        const request = requests.find(r => r.node.id === correction.nodeId);
        if (!request) continue;

        // Get the pattern ID from schema name (would need schema graph lookup)
        // For now, use schema name as pattern identifier
        const patternId = `${schemaName}:${request.node.type}`;

        // Build original vs corrected representation
        const original = JSON.stringify({
          line_start: request.node.source?.line_start,
          line_end: request.node.source?.line_end,
          name: request.node.name,
          properties: request.node.properties,
        });

        const corrected = JSON.stringify({
          line_start: correction.corrections?.line_start ?? request.node.source?.line_start,
          line_end: correction.corrections?.line_end ?? request.node.source?.line_end,
          name: correction.corrections?.name ?? request.node.name,
          properties: correction.corrections?.properties ?? request.node.properties,
        });

        const context = `${request.contextBefore}\n---\n${request.sourceContent}\n---\n${request.contextAfter}`;

        await this.schemaGraphStore.recordCorrection(
          patternId,
          original,
          corrected,
          context.slice(0, 2000) // Limit context size
        );
      }

      await this.schemaGraphStore.close();
    } catch (error) {
      console.warn('Failed to record corrections:', error);
      // Don't fail extraction if correction recording fails
    }
  }

  /**
   * Link references across multiple project extraction results.
   * This is the CRITICAL method that completes the cross-project linking pipeline.
   *
   * Call this after extracting multiple projects to create cross-project links.
   *
   * @param projectResults - Array of extraction results from multiple projects
   * @returns Linking result with cross-project links and edges
   */
  async linkAcrossProjects(
    projectResults: ProjectExtractionResult[]
  ): Promise<LinkingResult> {
    // Collect all external references from all projects
    const allReferences: ExternalReference[] = [];

    for (const result of projectResults) {
      // Use the external_references from each result
      if (result.external_references) {
        for (const ref of result.external_references) {
          allReferences.push({
            type: ref.type as ExternalReference['type'],
            identifier: ref.identifier,
            direction: ref.direction as ExternalReference['direction'],
            sourceNodeId: ref.source_node_id,
            sourceFile: ref.source_file,
            projectId: result.project_id,
            context: {},
            confidence: ref.confidence,
          });
        }
      }
    }

    console.log(`Cross-project linking: ${allReferences.length} references from ${projectResults.length} projects`);

    if (allReferences.length === 0) {
      return {
        links: [],
        edges: [],
        stats: {
          totalMatches: 0,
          linksCreated: 0,
          edgesCreated: 0,
          byType: {},
        },
      };
    }

    // Find matches across projects using CrossProjectMatcher
    const matches = await this.crossProjectMatcher.findMatches(allReferences);

    console.log(`Cross-project linking: ${matches.length} matches found`);

    if (matches.length === 0) {
      return {
        links: [],
        edges: [],
        stats: {
          totalMatches: 0,
          linksCreated: 0,
          edgesCreated: 0,
          byType: {},
        },
      };
    }

    // Create links and edges from matches using CrossServiceLinker
    const linkingResult = this.crossServiceLinker.createLinks(matches);

    console.log(`Cross-project linking: ${linkingResult.stats.linksCreated} links created, ${linkingResult.stats.edgesCreated} edges created`);

    // Store in internal state for later retrieval
    this.crossProjectLinks = linkingResult.links;

    return linkingResult;
  }

  /**
   * Get cross-project links created by linkAcrossProjects().
   */
  getCrossProjectLinks(): CrossProjectLink[] {
    return [...this.crossProjectLinks];
  }

  /**
   * Get the CrossProjectMatcher instance for configuration or testing.
   */
  getCrossProjectMatcher(): CrossProjectMatcher {
    return this.crossProjectMatcher;
  }

  /**
   * Get the CrossServiceLinker instance for configuration or testing.
   */
  getCrossServiceLinker(): CrossServiceLinker {
    return this.crossServiceLinker;
  }
}
