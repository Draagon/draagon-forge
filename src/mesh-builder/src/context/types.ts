/**
 * Type definitions for the Extraction Context Provider (REQ-034).
 *
 * These types define the interfaces for gathering context from multiple sources
 * to enrich Tier 3 AI discovery with project knowledge, semantic memory,
 * and external documentation.
 */

import { SourceFile, MeshNodeType } from '../types';

// ============================================================================
// STATIC ANALYSIS TYPES
// ============================================================================

/** Information about a single import statement */
export interface ImportInfo {
  /** The module being imported (e.g., '@nestjs/common', './user.service') */
  module: string;
  /** Symbols imported (e.g., ['Controller', 'Get', 'Post']) */
  symbols: string[];
  /** Whether this is a relative import (./foo, ../bar) */
  isRelative: boolean;
  /** Whether this appears to be a framework import */
  isFramework: boolean;
  /** Hint about which framework (e.g., 'nestjs', 'express', 'fastapi') */
  frameworkHint?: string;
  /** The raw import statement */
  raw: string;
  /** Line number in the file */
  line: number;
}

/** Information about a project dependency */
export interface DependencyInfo {
  /** Package name */
  name: string;
  /** Version (semver) */
  version: string;
  /** Category of dependency */
  category: 'framework' | 'orm' | 'testing' | 'utility' | 'build' | 'unknown';
  /** Whether it's a dev dependency */
  isDev: boolean;
}

/** Detection of a framework in use */
export interface FrameworkDetection {
  /** Framework name (e.g., 'nestjs', 'express', 'fastapi', 'django') */
  name: string;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Evidence that led to detection */
  evidence: string[];
  /** Associated language */
  language: string;
}

/** Result of static analysis */
export interface StaticAnalysisResult {
  /** All imports found in the file */
  imports: ImportInfo[];
  /** Project dependencies (from package.json, pyproject.toml, etc.) */
  dependencies: DependencyInfo[];
  /** Detected frameworks */
  frameworks: FrameworkDetection[];
  /** Project type */
  projectType: 'monorepo' | 'library' | 'application' | 'unknown';
  /** Path aliases from tsconfig/jsconfig */
  pathAliases: Record<string, string>;
  /** Analysis time in ms */
  analysisTimeMs: number;
}

// ============================================================================
// RELATED FILE TYPES
// ============================================================================

/** Information about an exported symbol */
export interface ExportInfo {
  /** Export name */
  name: string;
  /** Kind of export */
  kind: 'class' | 'function' | 'interface' | 'type' | 'const' | 'enum' | 'unknown';
  /** Type signature if available */
  signature?: string;
  /** Whether this is the default export */
  isDefault: boolean;
  /** JSDoc or docstring if available */
  documentation?: string;
}

/** Context from a related/imported file */
export interface RelatedFileContext {
  /** The import path that led us here */
  importPath: string;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Relative path from project root */
  relativePath: string;
  /** Exported symbols */
  exports: ExportInfo[];
  /** Whether this file was successfully parsed */
  parsed: boolean;
  /** Error message if parsing failed */
  parseError?: string;
}

// ============================================================================
// SEMANTIC MEMORY TYPES
// ============================================================================

/** A belief from semantic memory */
export interface BeliefResult {
  /** Unique belief ID */
  id: string;
  /** The belief content */
  content: string;
  /** Conviction score (0.0 - 1.0) */
  conviction: number;
  /** Source of the belief */
  source: 'claude_md' | 'constitution' | 'requirement' | 'user_input' | 'learned' | 'external';
  /** Domain (e.g., 'framework', 'architecture', 'testing') */
  domain?: string;
  /** Category */
  category?: string;
  /** Conditions for when this belief applies */
  conditions?: string[];
}

/** A known extraction pattern */
export interface PatternResult {
  /** Pattern ID */
  id: string;
  /** Description of what this pattern extracts */
  description: string;
  /** Regex pattern */
  pattern: string;
  /** Example code that matches */
  example: string;
  /** Node type this pattern creates */
  nodeType: MeshNodeType;
  /** Framework this pattern is for */
  framework?: string;
  /** Language */
  language: string;
  /** Trust score from schema evolution */
  trustScore: number;
}

// ============================================================================
// EXTERNAL KNOWLEDGE TYPES
// ============================================================================

/** Result from Context7 library documentation */
export interface Context7Result {
  /** Library name */
  library: string;
  /** Library version */
  version: string;
  /** Relevant documentation excerpt */
  documentation: string;
  /** Common patterns for this library */
  patterns: string[];
  /** API signatures */
  apis?: string[];
}

/** Result from web search */
export interface WebSearchResult {
  /** The URL */
  url: string;
  /** Page title */
  title: string;
  /** Relevant snippet */
  snippet: string;
  /** Relevance score */
  relevance: number;
}

/** Package registry information */
export interface PackageInfo {
  /** Package name */
  name: string;
  /** Package description */
  description: string;
  /** Latest version */
  version: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** Type definitions location */
  types?: string;
  /** Keywords */
  keywords: string[];
}

/** Combined external knowledge result */
export interface ExternalKnowledgeResult {
  /** Source of the knowledge */
  source: 'context7' | 'web_search' | 'package_registry';
  /** Content */
  content: string;
  /** Confidence in this knowledge */
  confidence: number;
  /** URL or reference */
  reference?: string;
  /** When this was fetched */
  fetchedAt: string;
}

// ============================================================================
// ENRICHED CONTEXT TYPES
// ============================================================================

/** Options for context gathering */
export interface ContextGatheringOptions {
  /** Skip external queries entirely (faster, less context) */
  skipExternal?: boolean;
  /** Maximum time for context gathering in ms */
  timeoutMs?: number;
  /** Minimum beliefs needed before querying external */
  minBeliefs?: number;
  /** Maximum related files to resolve */
  maxRelatedFiles?: number;
  /** Maximum depth for related file resolution */
  maxRelatedDepth?: number;
}

/** Metadata about the context gathering process */
export interface ContextMetadata {
  /** Total time spent gathering context */
  gatheringTimeMs: number;
  /** Which sources were queried */
  sourcesQueried: ('static' | 'related' | 'semantic' | 'context7' | 'web' | 'registry')[];
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Whether timeout was hit */
  timedOut: boolean;
  /** Errors encountered (non-fatal) */
  errors: string[];
}

/** The fully enriched context for Tier 3 discovery */
export interface EnrichedTier3Context {
  /** The source file being extracted */
  file: SourceFile;
  /** Project ID */
  projectId: string;
  /** Parsed imports (from static analysis) */
  imports: string[];

  // Static analysis results
  staticAnalysis: StaticAnalysisResult;

  // Related file context
  relatedFiles: RelatedFileContext[];

  // Semantic memory results
  beliefs: BeliefResult[];
  patterns: PatternResult[];

  // External knowledge (if queried)
  externalKnowledge: ExternalKnowledgeResult[];

  // Context gathering metadata
  contextMetadata: ContextMetadata;
}

// ============================================================================
// KNOWLEDGE FEEDBACK TYPES
// ============================================================================

/** Knowledge extracted from a successful extraction */
export interface ExtractedKnowledge {
  /** Type of knowledge */
  type: 'framework_pattern' | 'code_pattern' | 'naming_convention' | 'architecture';
  /** The knowledge content */
  content: string;
  /** Confidence in this knowledge */
  confidence: number;
  /** Associated framework */
  framework?: string;
  /** Language */
  language: string;
  /** Example code */
  example: string;
  /** Source file where this was learned */
  sourceFile: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/** Configuration for the context provider */
export interface ContextProviderConfig {
  /** Disable external queries entirely */
  disableExternal: boolean;
  /** Minimum beliefs before querying external */
  minBeliefsThreshold: number;
  /** Timeout for context gathering in ms */
  timeoutMs: number;
  /** Maximum related files to resolve */
  maxRelatedFiles: number;
  /** Maximum depth for related file resolution */
  maxRelatedDepth: number;
  /** Cache TTL for external results in ms */
  externalCacheTtlMs: number;
  /** draagon-ai memory endpoint (for MCP or direct connection) */
  memoryEndpoint?: string;
  /** Context7 API key */
  context7ApiKey?: string;
  /** Web search endpoint */
  webSearchEndpoint?: string;
}

/** Default configuration */
export const DEFAULT_CONTEXT_CONFIG: ContextProviderConfig = {
  disableExternal: false,
  minBeliefsThreshold: 3,
  timeoutMs: 3000,
  maxRelatedFiles: 10,
  maxRelatedDepth: 2,
  externalCacheTtlMs: 3600000, // 1 hour
};

// ============================================================================
// FRAMEWORK DETECTION PATTERNS
// ============================================================================

/** Known framework import patterns */
export const FRAMEWORK_PATTERNS: Record<string, { imports: string[]; language: string }> = {
  // TypeScript/JavaScript frameworks
  nestjs: { imports: ['@nestjs/common', '@nestjs/core'], language: 'typescript' },
  express: { imports: ['express'], language: 'typescript' },
  fastify: { imports: ['fastify'], language: 'typescript' },
  koa: { imports: ['koa'], language: 'typescript' },
  nextjs: { imports: ['next', 'next/router', 'next/image'], language: 'typescript' },
  react: { imports: ['react', 'react-dom'], language: 'typescript' },
  vue: { imports: ['vue', '@vue/'], language: 'typescript' },
  angular: { imports: ['@angular/core', '@angular/common'], language: 'typescript' },

  // Python frameworks
  fastapi: { imports: ['fastapi', 'from fastapi'], language: 'python' },
  django: { imports: ['django', 'from django'], language: 'python' },
  flask: { imports: ['flask', 'from flask'], language: 'python' },
  sqlalchemy: { imports: ['sqlalchemy', 'from sqlalchemy'], language: 'python' },

  // ORMs and databases
  prisma: { imports: ['@prisma/client'], language: 'typescript' },
  typeorm: { imports: ['typeorm'], language: 'typescript' },
  sequelize: { imports: ['sequelize'], language: 'typescript' },
  mongoose: { imports: ['mongoose'], language: 'typescript' },

  // Testing frameworks
  jest: { imports: ['jest', '@jest/'], language: 'typescript' },
  vitest: { imports: ['vitest'], language: 'typescript' },
  pytest: { imports: ['pytest', 'from pytest'], language: 'python' },
};

/** Dependency categories for known packages */
export const DEPENDENCY_CATEGORIES: Record<string, DependencyInfo['category']> = {
  // Frameworks
  '@nestjs/common': 'framework',
  '@nestjs/core': 'framework',
  'express': 'framework',
  'fastify': 'framework',
  'next': 'framework',
  'react': 'framework',
  'vue': 'framework',
  '@angular/core': 'framework',

  // ORMs
  '@prisma/client': 'orm',
  'typeorm': 'orm',
  'sequelize': 'orm',
  'mongoose': 'orm',

  // Testing
  'jest': 'testing',
  'vitest': 'testing',
  '@jest/core': 'testing',
  'mocha': 'testing',

  // Build tools
  'typescript': 'build',
  'esbuild': 'build',
  'webpack': 'build',
  'vite': 'build',
};
