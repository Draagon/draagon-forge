/**
 * Mesh Storage Module - Neo4j storage for Code Knowledge Mesh.
 *
 * The MeshStore is the authoritative store for extracted mesh data.
 * It supports full and incremental extractions with multi-branch tracking.
 */

export {
  MeshStore,
  MeshStoreConfig,
  StoredNode,
  StoredEdge,
  MergeResult,
  MeshQuery,
} from './MeshStore';
