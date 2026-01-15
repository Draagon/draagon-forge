/**
 * Schema Graph Module - Living extraction schemas in Neo4j.
 *
 * This module provides:
 * - SchemaGraphStore: Store and query schemas in Neo4j
 * - SchemaEvolver: Generate and evolve schemas using LLMs
 *
 * Key features:
 * - Start with zero schemas - bootstrap from LLM
 * - Self-improvement based on verification feedback
 * - Trust scoring per pattern
 * - Version history via EVOLVED_FROM edges
 * - Export/import for version control
 */

export {
  SchemaGraphStore,
  GraphSchema,
  GraphPattern,
  SchemaGraphConfig,
} from './SchemaGraphStore';

export {
  SchemaEvolver,
  EvolverConfig,
  LLMProvider,
  FrameworkDetection,
  GeneratedSchema,
} from './SchemaEvolver';

export {
  SchemaStore,
  Schema,
  Pattern,
  Prompt,
  Correction,
  CaptureConfig,
  NodeTemplate,
  EdgeTemplate,
  StoreConfig,
  SchemaExport,
  SchemaExportEntry,
  PatternExportEntry,
  PromptExportEntry,
  ImportOptions,
  ImportResult,
} from './SchemaStore';
