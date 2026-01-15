/**
 * DocQueryBuilder - Build queries to extract documentation data from the mesh.
 *
 * Provides structured queries for:
 * - API endpoint listings
 * - Function documentation
 * - Class hierarchies
 * - Dependency graphs
 */

import { MeshNode, MeshEdge, ProjectExtractionResult } from '../types';

export interface DocQuery {
  /** Query type */
  type: 'api' | 'function' | 'class' | 'dependency' | 'custom';
  /** Filter by project */
  projectId?: string;
  /** Filter by file pattern */
  filePattern?: string;
  /** Include related nodes */
  includeRelated?: boolean;
  /** Maximum depth for traversals */
  maxDepth?: number;
}

export interface ApiDocData {
  method: string;
  path: string;
  handler: string;
  parameters: ParameterInfo[];
  responses: ResponseInfo[];
  file: string;
  line: number;
  description?: string;
}

export interface ParameterInfo {
  name: string;
  type: string;
  location: 'path' | 'query' | 'body' | 'header';
  required: boolean;
  description?: string;
}

export interface ResponseInfo {
  status: number;
  description?: string;
  schema?: string;
}

export interface FunctionDocData {
  name: string;
  file: string;
  line: number;
  parameters: string[];
  returnType?: string;
  callers: string[];
  callees: string[];
  description?: string;
}

export interface ClassDocData {
  name: string;
  file: string;
  line: number;
  bases: string[];
  methods: string[];
  properties: string[];
  description?: string;
}

export interface DependencyDocData {
  source: string;
  target: string;
  type: string;
  projectId?: string;
}

export class DocQueryBuilder {
  constructor(private extractionResult: ProjectExtractionResult) {}

  /**
   * Get all API endpoints.
   */
  getApiEndpoints(query?: Partial<DocQuery>): ApiDocData[] {
    const endpoints: ApiDocData[] = [];

    for (const fileResult of this.extractionResult.results) {
      if (query?.filePattern && !fileResult.file.includes(query.filePattern)) {
        continue;
      }

      for (const node of fileResult.nodes) {
        if (node.type !== 'ApiEndpoint') continue;

        const endpoint: ApiDocData = {
          method: (node.properties['method'] as string) || 'GET',
          path: (node.properties['path'] as string) || node.name,
          handler: node.name,
          parameters: this.extractParameters(node, fileResult.nodes),
          responses: this.extractResponses(node, fileResult.nodes),
          file: node.source.file,
          line: node.source.line_start,
          description: node.properties['description'] as string,
        };

        endpoints.push(endpoint);
      }
    }

    // Sort by path
    return endpoints.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Extract parameters for an endpoint.
   */
  private extractParameters(
    endpoint: MeshNode,
    allNodes: MeshNode[]
  ): ParameterInfo[] {
    const params: ParameterInfo[] = [];

    // Find ApiParameter nodes linked to this endpoint
    for (const node of allNodes) {
      if (node.type !== 'ApiParameter') continue;
      if (!this.isRelated(endpoint, node)) continue;

      params.push({
        name: node.name,
        type: (node.properties['type'] as string) || 'string',
        location: (node.properties['location'] as 'path' | 'query' | 'body' | 'header') || 'query',
        required: (node.properties['required'] as boolean) ?? false,
        description: node.properties['description'] as string,
      });
    }

    // Also extract from path (e.g., /users/{id})
    const pathParams = endpoint.properties['path']?.toString().match(/\{(\w+)\}/g) || [];
    for (const param of pathParams) {
      const name = param.replace(/[{}]/g, '');
      if (!params.find((p) => p.name === name)) {
        params.push({
          name,
          type: 'string',
          location: 'path',
          required: true,
        });
      }
    }

    return params;
  }

  /**
   * Extract responses for an endpoint.
   */
  private extractResponses(
    endpoint: MeshNode,
    allNodes: MeshNode[]
  ): ResponseInfo[] {
    const responses: ResponseInfo[] = [];

    // Find ApiResponse nodes linked to this endpoint
    for (const node of allNodes) {
      if (node.type !== 'ApiResponse') continue;
      if (!this.isRelated(endpoint, node)) continue;

      responses.push({
        status: (node.properties['status'] as number) || 200,
        description: node.properties['description'] as string,
        schema: node.properties['schema'] as string,
      });
    }

    // Default 200 response if none found
    if (responses.length === 0) {
      responses.push({ status: 200, description: 'Success' });
    }

    return responses.sort((a, b) => a.status - b.status);
  }

  /**
   * Check if two nodes are related (in same file, nearby lines).
   */
  private isRelated(a: MeshNode, b: MeshNode): boolean {
    if (a.source.file !== b.source.file) return false;
    // Within 50 lines
    return Math.abs(a.source.line_start - b.source.line_start) < 50;
  }

  /**
   * Get all functions.
   */
  getFunctions(query?: Partial<DocQuery>): FunctionDocData[] {
    const functions: FunctionDocData[] = [];
    const allEdges = this.getAllEdges();

    for (const fileResult of this.extractionResult.results) {
      if (query?.filePattern && !fileResult.file.includes(query.filePattern)) {
        continue;
      }

      for (const node of fileResult.nodes) {
        if (node.type !== 'Function' && node.type !== 'Method') continue;

        const callers = this.findCallers(node.id, allEdges, this.getAllNodes());
        const callees = this.findCallees(node.id, allEdges, this.getAllNodes());

        functions.push({
          name: node.name,
          file: node.source.file,
          line: node.source.line_start,
          parameters: this.extractFunctionParams(node),
          returnType: node.properties['return_type'] as string,
          callers: callers.map((n) => n.name),
          callees: callees.map((n) => n.name),
          description: node.properties['description'] as string,
        });
      }
    }

    return functions.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract function parameters.
   */
  private extractFunctionParams(node: MeshNode): string[] {
    const params = node.properties['parameters'];
    if (Array.isArray(params)) {
      return params.map(String);
    }
    if (typeof params === 'string') {
      return params.split(',').map((p) => p.trim());
    }
    return [];
  }

  /**
   * Get all classes.
   */
  getClasses(query?: Partial<DocQuery>): ClassDocData[] {
    const classes: ClassDocData[] = [];
    const allNodes = this.getAllNodes();
    const allEdges = this.getAllEdges();

    for (const fileResult of this.extractionResult.results) {
      if (query?.filePattern && !fileResult.file.includes(query.filePattern)) {
        continue;
      }

      for (const node of fileResult.nodes) {
        if (node.type !== 'Class' && node.type !== 'Interface') continue;

        const methods = this.findContainedMethods(node.id, allEdges, allNodes);
        const bases = this.findBases(node.id, allEdges, allNodes);

        classes.push({
          name: node.name,
          file: node.source.file,
          line: node.source.line_start,
          bases: bases.map((n) => n.name),
          methods: methods.map((n) => n.name),
          properties: this.extractClassProperties(node),
          description: node.properties['description'] as string,
        });
      }
    }

    return classes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract class properties.
   */
  private extractClassProperties(node: MeshNode): string[] {
    const props = node.properties['properties'];
    if (Array.isArray(props)) {
      return props.map(String);
    }
    return [];
  }

  /**
   * Get dependencies between nodes.
   */
  getDependencies(query?: Partial<DocQuery>): DependencyDocData[] {
    const deps: DependencyDocData[] = [];
    const allNodes = this.getAllNodes();
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

    for (const fileResult of this.extractionResult.results) {
      for (const edge of fileResult.edges) {
        const from = nodeMap.get(edge.from_id);
        const to = nodeMap.get(edge.to_id);

        if (!from || !to) continue;

        // Filter by file pattern if specified
        if (query?.filePattern) {
          if (!from.source.file.includes(query.filePattern) &&
              !to.source.file.includes(query.filePattern)) {
            continue;
          }
        }

        deps.push({
          source: from.name,
          target: to.name,
          type: edge.type,
          projectId: from.project_id,
        });
      }
    }

    return deps;
  }

  /**
   * Get all nodes across all files.
   */
  private getAllNodes(): MeshNode[] {
    return this.extractionResult.results.flatMap((r) => r.nodes);
  }

  /**
   * Get all edges across all files.
   */
  private getAllEdges(): MeshEdge[] {
    return this.extractionResult.results.flatMap((r) => r.edges);
  }

  /**
   * Find nodes that call a given node.
   */
  private findCallers(
    nodeId: string,
    edges: MeshEdge[],
    nodes: MeshNode[]
  ): MeshNode[] {
    const callerIds = edges
      .filter((e) => e.type === 'CALLS' && e.to_id === nodeId)
      .map((e) => e.from_id);

    return nodes.filter((n) => callerIds.includes(n.id));
  }

  /**
   * Find nodes that a given node calls.
   */
  private findCallees(
    nodeId: string,
    edges: MeshEdge[],
    nodes: MeshNode[]
  ): MeshNode[] {
    const calleeIds = edges
      .filter((e) => e.type === 'CALLS' && e.from_id === nodeId)
      .map((e) => e.to_id);

    return nodes.filter((n) => calleeIds.includes(n.id));
  }

  /**
   * Find methods contained by a class.
   */
  private findContainedMethods(
    classId: string,
    edges: MeshEdge[],
    nodes: MeshNode[]
  ): MeshNode[] {
    const methodIds = edges
      .filter((e) => e.type === 'CONTAINS' && e.from_id === classId)
      .map((e) => e.to_id);

    return nodes.filter(
      (n) => methodIds.includes(n.id) && (n.type === 'Method' || n.type === 'Function')
    );
  }

  /**
   * Find base classes/interfaces.
   */
  private findBases(
    classId: string,
    edges: MeshEdge[],
    nodes: MeshNode[]
  ): MeshNode[] {
    const baseIds = edges
      .filter(
        (e) =>
          (e.type === 'INHERITS' || e.type === 'IMPLEMENTS') &&
          e.from_id === classId
      )
      .map((e) => e.to_id);

    return nodes.filter((n) => baseIds.includes(n.id));
  }
}
