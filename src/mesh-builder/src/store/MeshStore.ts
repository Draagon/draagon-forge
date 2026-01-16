/**
 * MeshStore - Neo4j storage for the Code Knowledge Mesh.
 *
 * This is the authoritative store for extracted mesh data. It supports:
 * 1. Full extraction - replace all nodes/edges for a project
 * 2. Incremental extraction - merge changes from specific files
 * 3. Multi-branch tracking - separate meshes per branch
 * 4. Version history - track which commit each node was extracted from
 *
 * Key design:
 * - Nodes/edges are keyed by (project_id, branch, file_path)
 * - Incremental updates delete old data for changed files, then insert new
 * - Deleted files have their nodes/edges removed
 * - Query across branches to see differences
 */

import { MeshNode, MeshEdge, ProjectExtractionResult, GitContext } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface MeshStoreConfig {
  uri: string;
  user: string;
  password: string;
}

export interface StoredNode extends MeshNode {
  /** Branch this node belongs to */
  branch: string;
  /** Commit SHA when this was extracted */
  commit_sha: string;
  /** When this node was stored */
  stored_at: string;
}

export interface StoredEdge extends MeshEdge {
  /** Branch this edge belongs to */
  branch: string;
  /** Commit SHA when this was extracted */
  commit_sha: string;
  /** When this edge was stored */
  stored_at: string;
}

export interface MergeResult {
  /** Files that had data deleted */
  files_deleted: string[];
  /** Files that had data inserted */
  files_inserted: string[];
  /** Nodes removed */
  nodes_removed: number;
  /** Nodes inserted */
  nodes_inserted: number;
  /** Edges removed */
  edges_removed: number;
  /** Edges inserted */
  edges_inserted: number;
}

export interface MeshQuery {
  project_id: string;
  branch?: string;
  file_path?: string;
  node_type?: string;
  commit_sha?: string;
}

// ============================================================================
// MeshStore Implementation
// ============================================================================

export class MeshStore {
  private driver: any = null;
  private config: MeshStoreConfig;

  constructor(config: MeshStoreConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const neo4j = await import('neo4j-driver');
    this.driver = neo4j.default.driver(
      this.config.uri,
      neo4j.default.auth.basic(this.config.user, this.config.password)
    );
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  private session() {
    if (!this.driver) throw new Error('Not connected');
    return this.driver.session();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const session = this.session();
    try {
      // Constraints for mesh nodes
      await session.run(`
        CREATE CONSTRAINT mesh_node_id IF NOT EXISTS
        FOR (n:MeshNode) REQUIRE n.id IS UNIQUE
      `);

      // Indexes for efficient queries
      await session.run(`
        CREATE INDEX mesh_node_project_branch IF NOT EXISTS
        FOR (n:MeshNode) ON (n.project_id, n.branch)
      `);
      await session.run(`
        CREATE INDEX mesh_node_file IF NOT EXISTS
        FOR (n:MeshNode) ON (n.project_id, n.branch, n.file_path)
      `);
      await session.run(`
        CREATE INDEX mesh_node_type IF NOT EXISTS
        FOR (n:MeshNode) ON (n.type)
      `);
      await session.run(`
        CREATE INDEX mesh_node_commit IF NOT EXISTS
        FOR (n:MeshNode) ON (n.commit_sha)
      `);

      // Constraints for mesh edges
      await session.run(`
        CREATE CONSTRAINT mesh_edge_id IF NOT EXISTS
        FOR ()-[e:MESH_EDGE]-() REQUIRE e.id IS UNIQUE
      `);
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Full Extraction - Replace all data for a project/branch
  // --------------------------------------------------------------------------

  /**
   * Store a full extraction result, replacing all existing data for this project/branch.
   */
  async storeFullExtraction(result: ProjectExtractionResult): Promise<MergeResult> {
    const branch = result.git?.branch || 'unknown';
    const commitSha = result.git?.commit_sha || 'unknown';
    const projectId = result.project_id;

    const mergeResult: MergeResult = {
      files_deleted: [],
      files_inserted: [],
      nodes_removed: 0,
      nodes_inserted: 0,
      edges_removed: 0,
      edges_inserted: 0,
    };

    const session = this.session();
    try {
      // Delete all existing nodes and edges for this project/branch
      const deleteResult = await session.run(
        `
        MATCH (n:MeshNode {project_id: $project_id, branch: $branch})
        WITH n, n.file_path AS file
        DETACH DELETE n
        RETURN count(n) AS deleted_nodes, collect(DISTINCT file) AS deleted_files
        `,
        { project_id: projectId, branch }
      );

      const record = deleteResult.records[0];
      if (record) {
        mergeResult.nodes_removed = record.get('deleted_nodes')?.toNumber?.() || 0;
        mergeResult.files_deleted = record.get('deleted_files') || [];
      }

      // Insert all new nodes and edges
      for (const fileResult of result.results) {
        await this.insertFileData(
          session,
          projectId,
          branch,
          commitSha,
          fileResult.file,
          fileResult.nodes,
          fileResult.edges
        );
        mergeResult.files_inserted.push(fileResult.file);
        mergeResult.nodes_inserted += fileResult.nodes.length;
        mergeResult.edges_inserted += fileResult.edges.length;
      }

      return mergeResult;
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Incremental Extraction - Merge changes for specific files
  // --------------------------------------------------------------------------

  /**
   * Merge an incremental extraction result.
   *
   * This will:
   * 1. Delete nodes/edges for files in deletedFiles
   * 2. Delete nodes/edges for files that were re-extracted
   * 3. Insert new nodes/edges for re-extracted files
   *
   * @param result - The extraction result (only contains changed files)
   * @param deletedFiles - Files that were deleted in git
   */
  async mergeIncrementalExtraction(
    result: ProjectExtractionResult,
    deletedFiles: string[] = []
  ): Promise<MergeResult> {
    const branch = result.git?.branch || 'unknown';
    const commitSha = result.git?.commit_sha || 'unknown';
    const projectId = result.project_id;

    const mergeResult: MergeResult = {
      files_deleted: [],
      files_inserted: [],
      nodes_removed: 0,
      nodes_inserted: 0,
      edges_removed: 0,
      edges_inserted: 0,
    };

    const session = this.session();
    try {
      // 1. Delete data for deleted files
      for (const file of deletedFiles) {
        const deleteCount = await this.deleteFileData(session, projectId, branch, file);
        mergeResult.files_deleted.push(file);
        mergeResult.nodes_removed += deleteCount;
      }

      // 2. For each extracted file, delete old data and insert new
      for (const fileResult of result.results) {
        // Delete old data for this file
        const deleteCount = await this.deleteFileData(
          session,
          projectId,
          branch,
          fileResult.file
        );
        mergeResult.nodes_removed += deleteCount;

        // Insert new data
        await this.insertFileData(
          session,
          projectId,
          branch,
          commitSha,
          fileResult.file,
          fileResult.nodes,
          fileResult.edges
        );
        mergeResult.files_inserted.push(fileResult.file);
        mergeResult.nodes_inserted += fileResult.nodes.length;
        mergeResult.edges_inserted += fileResult.edges.length;
      }

      return mergeResult;
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  /**
   * Get all nodes for a project/branch.
   */
  async getNodes(query: MeshQuery): Promise<StoredNode[]> {
    const session = this.session();
    try {
      let cypher = 'MATCH (n:MeshNode {project_id: $project_id';
      const params: Record<string, any> = { project_id: query.project_id };

      if (query.branch) {
        cypher += ', branch: $branch';
        params.branch = query.branch;
      }
      cypher += '})';

      if (query.file_path) {
        cypher += ' WHERE n.file_path = $file_path';
        params.file_path = query.file_path;
      }
      if (query.node_type) {
        cypher += query.file_path ? ' AND' : ' WHERE';
        cypher += ' n.type = $node_type';
        params.node_type = query.node_type;
      }

      cypher += ' RETURN n ORDER BY n.file_path, n.source_line_start';

      const result = await session.run(cypher, params);
      return result.records.map((r: any) => this.toStoredNode(r.get('n').properties));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all edges for a project/branch.
   */
  async getEdges(query: MeshQuery): Promise<StoredEdge[]> {
    const session = this.session();
    try {
      let cypher = `
        MATCH (from:MeshNode {project_id: $project_id`;
      const params: Record<string, any> = { project_id: query.project_id };

      if (query.branch) {
        cypher += ', branch: $branch';
        params.branch = query.branch;
      }
      cypher += '})-[e:MESH_EDGE]->(to:MeshNode) RETURN e, from.id AS from_id, to.id AS to_id';

      const result = await session.run(cypher, params);
      return result.records.map((r: any) => this.toStoredEdge(
        r.get('e').properties,
        r.get('from_id'),
        r.get('to_id')
      ));
    } finally {
      await session.close();
    }
  }

  /**
   * Get mesh statistics for a project/branch.
   */
  async getStatistics(projectId: string, branch?: string): Promise<{
    total_nodes: number;
    total_edges: number;
    files: number;
    node_types: Record<string, number>;
    last_commit?: string;
  }> {
    const session = this.session();
    try {
      const branchClause = branch ? ', branch: $branch' : '';
      const params: Record<string, any> = { project_id: projectId };
      if (branch) params.branch = branch;

      const result = await session.run(
        `
        MATCH (n:MeshNode {project_id: $project_id${branchClause}})
        WITH n
        OPTIONAL MATCH (n)-[e:MESH_EDGE]->()
        WITH
          count(DISTINCT n) AS total_nodes,
          count(e) AS total_edges,
          count(DISTINCT n.file_path) AS files,
          collect(n.type) AS types,
          max(n.commit_sha) AS last_commit
        RETURN total_nodes, total_edges, files, types, last_commit
        `,
        params
      );

      const record = result.records[0];
      if (!record) {
        return { total_nodes: 0, total_edges: 0, files: 0, node_types: {} };
      }

      // Count node types
      const types = record.get('types') || [];
      const node_types: Record<string, number> = {};
      for (const t of types) {
        node_types[t] = (node_types[t] || 0) + 1;
      }

      return {
        total_nodes: record.get('total_nodes')?.toNumber?.() || 0,
        total_edges: record.get('total_edges')?.toNumber?.() || 0,
        files: record.get('files')?.toNumber?.() || 0,
        node_types,
        last_commit: record.get('last_commit') || undefined,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Export the entire mesh for a project/branch as JSON.
   */
  async exportToJSON(projectId: string, branch?: string): Promise<ProjectExtractionResult> {
    const nodes = await this.getNodes({ project_id: projectId, branch });
    const edges = await this.getEdges({ project_id: projectId, branch });
    const stats = await this.getStatistics(projectId, branch);

    // Group by file
    const fileMap = new Map<string, { nodes: MeshNode[]; edges: MeshEdge[] }>();
    for (const node of nodes) {
      const filePath = node.source.file;
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { nodes: [], edges: [] });
      }
      fileMap.get(filePath)!.nodes.push(node);
    }

    // Add edges to files (based on from_id)
    const nodeToFile = new Map<string, string>();
    for (const node of nodes) {
      nodeToFile.set(node.id, node.source.file);
    }
    for (const edge of edges) {
      const filePath = nodeToFile.get(edge.from_id);
      if (filePath && fileMap.has(filePath)) {
        fileMap.get(filePath)!.edges.push(edge);
      }
    }

    return {
      project_id: projectId,
      project_path: '', // Not stored
      timestamp: new Date().toISOString(),
      git: stats.last_commit
        ? {
            commit_sha: stats.last_commit,
            commit_short: stats.last_commit.substring(0, 8),
            commit_message: '',
            author: '',
            committed_at: '',
            branch: branch || 'unknown',
            tags: [],
            is_clean: true,
          }
        : undefined,
      statistics: {
        files_processed: stats.files,
        files_skipped: 0,
        tier1_extractions: 0,
        tier2_extractions: 0,
        tier3_extractions: 0,
        total_nodes: stats.total_nodes,
        total_edges: stats.total_edges,
        schemas_generated: 0,
        extraction_time_ms: 0,
        ai_calls: 0,
        ai_tokens_used: 0,
      },
      results: Array.from(fileMap.entries()).map(([file, data]) => ({
        file,
        language: data.nodes[0]?.properties?.language as string || 'unknown',
        nodes: data.nodes,
        edges: data.edges,
        confidence: 1.0,
        tier: 1 as const,
        schemas_used: [],
        unresolved_patterns: [],
        errors: [],
      })),
    };
  }

  // --------------------------------------------------------------------------
  // Diff Methods - Compare meshes between commits/branches
  // --------------------------------------------------------------------------

  /**
   * Get all projects with their last extraction time.
   * Ordered by most recent first.
   */
  async getProjects(): Promise<Array<{
    project_id: string;
    branches: string[];
    last_extraction: string;
    total_nodes: number;
  }>> {
    const session = this.session();
    try {
      const result = await session.run(`
        MATCH (n:MeshNode)
        WITH n.project_id AS project_id,
             collect(DISTINCT n.branch) AS branches,
             max(n.stored_at) AS last_extraction,
             count(n) AS total_nodes
        RETURN project_id, branches, last_extraction, total_nodes
        ORDER BY last_extraction DESC
      `);

      return result.records.map((r: any) => ({
        project_id: r.get('project_id'),
        branches: r.get('branches'),
        last_extraction: r.get('last_extraction'),
        total_nodes: r.get('total_nodes')?.toNumber?.() || 0,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Search projects by name pattern.
   */
  async searchProjects(query: string): Promise<Array<{
    project_id: string;
    branches: string[];
    last_extraction: string;
    total_nodes: number;
  }>> {
    const session = this.session();
    try {
      const result = await session.run(`
        MATCH (n:MeshNode)
        WHERE toLower(n.project_id) CONTAINS toLower($query)
        WITH n.project_id AS project_id,
             collect(DISTINCT n.branch) AS branches,
             max(n.stored_at) AS last_extraction,
             count(n) AS total_nodes
        RETURN project_id, branches, last_extraction, total_nodes
        ORDER BY last_extraction DESC
      `, { query });

      return result.records.map((r: any) => ({
        project_id: r.get('project_id'),
        branches: r.get('branches'),
        last_extraction: r.get('last_extraction'),
        total_nodes: r.get('total_nodes')?.toNumber?.() || 0,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get files that exist in the mesh for a project/branch.
   */
  async getFiles(projectId: string, branch: string): Promise<string[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `
        MATCH (n:MeshNode {project_id: $project_id, branch: $branch})
        RETURN DISTINCT n.file_path AS file
        ORDER BY file
        `,
        { project_id: projectId, branch }
      );
      return result.records.map((r: any) => r.get('file'));
    } finally {
      await session.close();
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private async deleteFileData(
    session: any,
    projectId: string,
    branch: string,
    filePath: string
  ): Promise<number> {
    const result = await session.run(
      `
      MATCH (n:MeshNode {project_id: $project_id, branch: $branch, file_path: $file_path})
      WITH n, count(n) AS cnt
      DETACH DELETE n
      RETURN cnt
      `,
      { project_id: projectId, branch, file_path: filePath }
    );
    return result.records[0]?.get('cnt')?.toNumber?.() || 0;
  }

  private async insertFileData(
    session: any,
    projectId: string,
    branch: string,
    commitSha: string,
    filePath: string,
    nodes: MeshNode[],
    edges: MeshEdge[]
  ): Promise<void> {
    const storedAt = new Date().toISOString();

    // Insert nodes
    for (const node of nodes) {
      await session.run(
        `
        CREATE (n:MeshNode {
          id: $id,
          type: $type,
          name: $name,
          properties: $properties,
          file_path: $file_path,
          source_line_start: $source_line_start,
          source_line_end: $source_line_end,
          project_id: $project_id,
          branch: $branch,
          commit_sha: $commit_sha,
          stored_at: $stored_at,
          tier: $tier,
          schema: $schema,
          confidence: $confidence
        })
        `,
        {
          id: node.id,
          type: node.type,
          name: node.name,
          properties: JSON.stringify(node.properties),
          file_path: filePath,
          source_line_start: node.source.line_start,
          source_line_end: node.source.line_end,
          project_id: projectId,
          branch,
          commit_sha: commitSha,
          stored_at: storedAt,
          tier: node.extraction.tier,
          schema: node.extraction.schema || null,
          confidence: node.extraction.confidence,
        }
      );
    }

    // Insert edges
    for (const edge of edges) {
      await session.run(
        `
        MATCH (from:MeshNode {id: $from_id})
        MATCH (to:MeshNode {id: $to_id})
        CREATE (from)-[e:MESH_EDGE {
          id: $id,
          type: $type,
          properties: $properties,
          branch: $branch,
          commit_sha: $commit_sha,
          stored_at: $stored_at,
          tier: $tier,
          confidence: $confidence
        }]->(to)
        `,
        {
          id: edge.id,
          from_id: edge.from_id,
          to_id: edge.to_id,
          type: edge.type,
          properties: edge.properties ? JSON.stringify(edge.properties) : null,
          branch,
          commit_sha: commitSha,
          stored_at: storedAt,
          tier: edge.extraction.tier,
          confidence: edge.extraction.confidence,
        }
      );
    }
  }

  private toStoredNode(props: Record<string, any>): StoredNode {
    return {
      id: props.id,
      type: props.type,
      name: props.name,
      properties: props.properties ? JSON.parse(props.properties) : {},
      source: {
        file: props.file_path,
        line_start: props.source_line_start,
        line_end: props.source_line_end,
      },
      project_id: props.project_id,
      extraction: {
        tier: props.tier,
        schema: props.schema || undefined,
        confidence: props.confidence,
        extracted_at: props.stored_at,
      },
      branch: props.branch,
      commit_sha: props.commit_sha,
      stored_at: props.stored_at,
    };
  }

  private toStoredEdge(
    props: Record<string, any>,
    fromId?: string,
    toId?: string
  ): StoredEdge {
    return {
      id: props.id,
      type: props.type,
      from_id: fromId || props.from_id || '',
      to_id: toId || props.to_id || '',
      properties: props.properties ? JSON.parse(props.properties) : undefined,
      extraction: {
        tier: props.tier,
        confidence: props.confidence,
        extracted_at: props.stored_at,
      },
      branch: props.branch,
      commit_sha: props.commit_sha,
      stored_at: props.stored_at,
    };
  }
}
