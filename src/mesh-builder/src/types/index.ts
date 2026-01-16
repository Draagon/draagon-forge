/**
 * Core types for the Code Knowledge Mesh system.
 *
 * The mesh is a graph structure with nodes (code elements) and edges (relationships).
 * Extraction happens in three tiers:
 *   - Tier 1: Schema-based regex extraction (fast, deterministic)
 *   - Tier 2: AI-assisted disambiguation (when patterns are ambiguous)
 *   - Tier 3: AI-driven discovery (for unknown frameworks)
 */

// ============================================================================
// SOURCE LOCATION
// ============================================================================

/** Precise location within a source file */
export interface SourceLocation {
  file: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
}

// ============================================================================
// EXTRACTION METADATA
// ============================================================================

/** Metadata about how a node/edge was extracted */
export interface ExtractionMetadata {
  /** Which extraction tier was used (1=schema, 2=AI-assisted, 3=AI-discovery) */
  tier: 1 | 2 | 3;
  /** Schema name if tier 1 or 2 */
  schema?: string;
  /** Confidence in the extraction (0.0-1.0) */
  confidence: number;
  /** ISO timestamp of extraction */
  extracted_at: string;
}

// ============================================================================
// MESH NODE TYPES
// ============================================================================

/** All supported node types in the mesh */
export type MeshNodeType =
  // Code structure
  | 'File'
  | 'Module'
  | 'Class'
  | 'Interface'
  | 'Function'
  | 'Method'
  | 'Variable'
  | 'Import'
  | 'Decorator'
  // API layer
  | 'ApiEndpoint'
  | 'ApiParameter'
  | 'ApiResponse'
  // Messaging
  | 'Queue'
  | 'Topic'
  | 'Consumer'
  | 'Producer'
  // Data layer
  | 'Database'
  | 'Table'
  | 'Column'
  | 'Model'
  // External
  | 'ExternalService'
  | 'ConfigValue';

/** A node in the code knowledge mesh */
export interface MeshNode {
  /** Unique identifier (UUID) */
  id: string;
  /** Type of code element */
  type: MeshNodeType;
  /** Name of the element */
  name: string;
  /** Additional properties specific to the node type */
  properties: Record<string, unknown>;
  /** Source location */
  source: SourceLocation;
  /** Project this node belongs to */
  project_id: string;
  /** Extraction metadata */
  extraction: ExtractionMetadata;
}

// ============================================================================
// MESH EDGE TYPES
// ============================================================================

/** All supported edge types in the mesh */
export type MeshEdgeType =
  // Structural
  | 'CONTAINS'
  | 'IMPORTS'
  | 'EXPORTS'
  // Inheritance
  | 'INHERITS'
  | 'IMPLEMENTS'
  // Usage
  | 'CALLS'
  | 'USES'
  | 'RETURNS'
  | 'ACCEPTS'
  // Decorators
  | 'DECORATES'
  | 'DECORATED_BY'
  // API
  | 'EXPOSES'
  | 'HANDLED_BY'
  // Messaging
  | 'PUBLISHES_TO'
  | 'SUBSCRIBES_TO'
  // Data
  | 'READS_FROM'
  | 'WRITES_TO'
  | 'QUERIES'
  // Cross-service
  | 'CALLS_SERVICE'
  | 'DEPENDS_ON';

/** An edge (relationship) in the code knowledge mesh */
export interface MeshEdge {
  /** Unique identifier (UUID) */
  id: string;
  /** Type of relationship */
  type: MeshEdgeType;
  /** Source node ID */
  from_id: string;
  /** Target node ID */
  to_id: string;
  /** Additional properties */
  properties?: Record<string, unknown>;
  /** Extraction metadata */
  extraction: ExtractionMetadata;
}

// ============================================================================
// EXTRACTION RESULTS
// ============================================================================

/** Result of extracting a single file */
export interface FileExtractionResult {
  /** File path */
  file: string;
  /** Detected language */
  language: string;
  /** Extracted nodes */
  nodes: MeshNode[];
  /** Extracted edges */
  edges: MeshEdge[];
  /** Overall confidence */
  confidence: number;
  /** Highest tier used */
  tier: 1 | 2 | 3;
  /** Schemas that were applied */
  schemas_used: string[];
  /** Patterns that couldn't be resolved */
  unresolved_patterns: string[];
  /** Any errors encountered */
  errors: string[];
}

/** Git context for versioned extraction */
export interface GitContext {
  /** Full commit SHA */
  commit_sha: string;
  /** Short commit SHA (first 8 chars) */
  commit_short: string;
  /** Commit message (first line) */
  commit_message: string;
  /** Commit author */
  author: string;
  /** Commit timestamp (ISO) */
  committed_at: string;
  /** Current branch name */
  branch: string;
  /** Git tags on this commit */
  tags: string[];
  /** Is the working directory clean? */
  is_clean: boolean;
  /** Remote origin URL (if available) */
  remote_url?: string;
}

/** Result of extracting an entire project */
export interface ProjectExtractionResult {
  /** Project identifier */
  project_id: string;
  /** Project root path */
  project_path: string;
  /** ISO timestamp */
  timestamp: string;
  /** Git context (commit, branch, tags) */
  git?: GitContext;
  /** Extraction statistics */
  statistics: ExtractionStatistics;
  /** Per-file results */
  results: FileExtractionResult[];
  /** Cross-project links (if multiple projects analyzed) */
  cross_project_links?: CrossProjectLink[];
  /** External references collected for cross-project linking */
  external_references?: ExternalReferenceInfo[];
}

/** External reference info for cross-project linking */
export interface ExternalReferenceInfo {
  /** Type of reference (queue, api, database, etc.) */
  type: string;
  /** Identifier (queue name, API path, etc.) */
  identifier: string;
  /** Direction (produce, consume, both) */
  direction: string;
  /** Source node ID */
  source_node_id: string;
  /** Source file */
  source_file: string;
  /** Confidence */
  confidence: number;
}

/** Statistics from an extraction run */
export interface ExtractionStatistics {
  files_processed: number;
  files_skipped: number;
  tier1_extractions: number;
  tier2_extractions: number;
  tier3_extractions: number;
  total_nodes: number;
  total_edges: number;
  schemas_generated: number;
  extraction_time_ms: number;
  ai_calls: number;
  ai_tokens_used: number;
}

/** A link between two projects (e.g., via queue, API, database) */
export interface CrossProjectLink {
  /** Type of cross-project connection */
  type: 'queue' | 'api' | 'database' | 'library';
  /** Source project ID */
  from_project: string;
  /** Target project ID */
  to_project: string;
  /** Source node ID */
  from_node_id: string;
  /** Target node ID */
  to_node_id: string;
  /** Confidence in the link */
  confidence: number;
  /** How the link was resolved */
  resolution_method: 'literal' | 'config' | 'ai';
}

// ============================================================================
// SCHEMA TYPES
// ============================================================================

/** A schema definition for extracting code patterns */
export interface Schema {
  /** JSON Schema version */
  $schema: string;
  /** Unique schema name */
  name: string;
  /** Schema version */
  version: string;
  /** Primary target language */
  language: string;
  /** Additional languages this schema can handle (e.g., "javascript" for a TypeScript schema) */
  additional_languages?: string[];
  /** Description */
  description?: string;
  /** How to detect if this schema applies */
  detection: SchemaDetection;
  /** Pattern extractors */
  extractors: Record<string, SchemaExtractor>;
  /** Hints for AI tiers */
  ai_hints?: AIHints;
}

/** How to detect if a schema applies to a file */
export interface SchemaDetection {
  /** Import patterns to look for */
  imports?: string[];
  /** File path patterns */
  files?: string[];
  /** Content patterns */
  patterns?: string[];
  /** Confidence boost when detected (0.0-1.0) */
  confidence_boost: number;
}

/** An extractor within a schema */
export interface SchemaExtractor {
  /** Description of what this extracts */
  description?: string;
  /** Patterns to match */
  patterns: ExtractorPattern[];
}

/** A pattern for extraction */
export interface ExtractorPattern {
  /** Pattern name for debugging */
  name?: string;
  /** Regex pattern */
  regex: string;
  /** Regex flags (default: 'gm') */
  flags?: string;
  /** How to map capture groups */
  captures: Record<string, CaptureConfig>;
  /** Extra lines to capture for context */
  context_lines?: number;
  /** Template for creating a node */
  node_template?: NodeTemplate;
  /** Template for creating an edge */
  edge_template?: EdgeTemplate;
}

/** Configuration for a capture group */
export interface CaptureConfig {
  /** Capture group index */
  group: number;
  /** Transform to apply */
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'camelCase' | 'snakeCase';
  /** Default value if not captured */
  default?: string;
}

/** Template for creating a node from a pattern match */
export interface NodeTemplate {
  /** Node type to create */
  type: MeshNodeType;
  /** Which capture to use for the name */
  name_from?: string;
  /** Properties to set (values are capture names or literals) */
  properties: Record<string, string>;
}

/** Template for creating an edge from a pattern match */
export interface EdgeTemplate {
  /** Edge type to create */
  type: MeshEdgeType;
  /** Source node (capture name or 'current_file', 'current_class', etc.) */
  from: string;
  /** Target node (capture name) */
  to: string;
  /** Properties to set */
  properties?: Record<string, string>;
}

/** Hints for AI-assisted extraction */
export interface AIHints {
  /** Common disambiguation questions */
  disambiguation?: string[];
  /** Common patterns in this framework */
  common_patterns?: string[];
  /** Context about the framework */
  framework_context?: string;
}

// ============================================================================
// SOURCE FILE
// ============================================================================

/** A source file to be analyzed */
export interface SourceFile {
  /** Absolute path */
  path: string;
  /** Path relative to project root */
  relativePath: string;
  /** File content */
  content: string;
  /** Detected language */
  language: string;
  /** File size in bytes */
  size: number;
  /** Last modification time */
  lastModified: Date;
}

// ============================================================================
// PROJECT CONFIGURATION
// ============================================================================

/** Configuration for a project to analyze */
export interface ProjectConfig {
  /** Unique project identifier */
  id: string;
  /** Display name */
  name: string;
  /** Local path */
  path: string;
  /** Git repository URL */
  gitUrl?: string;
  /** Branch to track */
  branch?: string;
  /** Paths to include (glob patterns) */
  includePaths?: string[];
  /** Paths to exclude (glob patterns) */
  excludePaths?: string[];
  /** Custom schemas directory */
  schemasDir?: string;
}

// ============================================================================
// TIER ROUTING
// ============================================================================

/** Result of tier routing decision */
export interface TierRoutingDecision {
  /** Which tier to use */
  tier: 1 | 2 | 3;
  /** Reason for the decision */
  reason: string;
  /** Schemas to try for tier 1 */
  schemas?: string[];
  /** Specific questions for tier 2 */
  disambiguation_questions?: string[];
}

// ============================================================================
// AI RESPONSE TYPES
// ============================================================================

/** Response from AI disambiguation (Tier 2) */
export interface AIDisambiguationResponse {
  /** Resolved value */
  value: string;
  /** Confidence in resolution */
  confidence: number;
  /** Reasoning */
  reasoning: string;
}

/** Response from AI discovery (Tier 3) */
export interface AIDiscoveryResponse {
  /** Detected framework */
  framework_detected?: {
    name: string;
    confidence: number;
  };
  /** Discovered nodes */
  nodes: Array<{
    type: MeshNodeType;
    name: string;
    properties: Record<string, unknown>;
    location: SourceLocation;
    confidence: number;
  }>;
  /** Discovered edges */
  edges: Array<{
    type: MeshEdgeType;
    from_name: string;
    to_name: string;
    confidence: number;
  }>;
  /** Suggestions for new schema patterns */
  schema_suggestions?: Array<{
    pattern: string;
    example: string;
    node_type: MeshNodeType;
  }>;
}
