/**
 * Git Integration Module - Version-aware extraction tracking.
 *
 * Provides:
 * - GitTracker: Get git context (commit, branch, tags)
 * - ExtractionStateStore: Track extraction state per project/branch
 * - Incremental extraction support
 * - Semantic diffing between versions
 */

export {
  GitTracker,
  ExtractionStateStore,
  GitContext,
  ExtractionState,
  ChangedFiles,
  SemanticDiff,
  NodeDiff,
  NodeModification,
  EdgeDiff,
  VersionedDependency,
} from './GitTracker';
