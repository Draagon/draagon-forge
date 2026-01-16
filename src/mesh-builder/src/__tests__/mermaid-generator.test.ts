/**
 * Tests for MermaidGenerator diagram generation.
 */

import { MermaidGenerator } from '../docs/MermaidGenerator';
import {
  ProjectExtractionResult,
  MeshNode,
  MeshEdge,
  ExtractionMetadata,
  FileExtractionResult,
} from '../types';

// Default extraction metadata for tests
const defaultExtraction: ExtractionMetadata = {
  tier: 1,
  schema: 'test-schema',
  confidence: 1.0,
  extracted_at: new Date().toISOString(),
};

// Helper to create mock extraction result
function createMockExtraction(
  nodes: Array<Partial<MeshNode> & { id: string; name: string; type: MeshNode['type'] }>,
  edges: Array<Partial<MeshEdge> & { from_id: string; to_id: string }> = []
): ProjectExtractionResult {
  const completeNodes: MeshNode[] = nodes.map((n, i) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    source: n.source || { file: 'test.ts', line_start: i * 10, line_end: i * 10 + 5 },
    properties: n.properties || {},
    project_id: 'test-project',
    extraction: n.extraction || defaultExtraction,
  }));

  const completeEdges: MeshEdge[] = edges.map((e, i) => ({
    id: e.id || `edge_${i}`,
    type: e.type || 'CALLS',
    from_id: e.from_id,
    to_id: e.to_id,
    properties: e.properties || {},
    extraction: e.extraction || defaultExtraction,
  }));

  const fileResult: FileExtractionResult = {
    file: 'test.ts',
    language: 'typescript',
    nodes: completeNodes,
    edges: completeEdges,
    confidence: 1.0,
    tier: 1,
    schemas_used: ['test-schema'],
    unresolved_patterns: [],
    errors: [],
  };

  return {
    project_id: 'test-project',
    project_path: '/test/project',
    timestamp: new Date().toISOString(),
    results: [fileResult],
    statistics: {
      files_processed: 1,
      files_skipped: 0,
      tier1_extractions: completeNodes.length,
      tier2_extractions: 0,
      tier3_extractions: 0,
      total_nodes: completeNodes.length,
      total_edges: completeEdges.length,
      schemas_generated: 0,
      extraction_time_ms: 100,
      ai_calls: 0,
      ai_tokens_used: 0,
    },
  };
}

describe('MermaidGenerator', () => {
  describe('generateClassDiagram', () => {
    it('generates class diagram with classes and methods', () => {
      const extraction = createMockExtraction(
        [
          {
            id: 'class_1',
            type: 'Class',
            name: 'UserService',
            properties: { properties: ['name', 'email'] },
          },
          {
            id: 'method_1',
            type: 'Method',
            name: 'getUser',
            properties: {},
          },
          {
            id: 'method_2',
            type: 'Method',
            name: 'createUser',
            properties: {},
          },
        ],
        [
          { type: 'CONTAINS', from_id: 'class_1', to_id: 'method_1' },
          { type: 'CONTAINS', from_id: 'class_1', to_id: 'method_2' },
        ]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateClassDiagram();

      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('class UserService');
      expect(diagram).toContain('+getUser()');
      expect(diagram).toContain('+createUser()');
    });

    it('shows inheritance relationships', () => {
      const extraction = createMockExtraction(
        [
          { id: 'class_1', type: 'Class', name: 'BaseService' },
          { id: 'class_2', type: 'Class', name: 'UserService' },
        ],
        [{ type: 'INHERITS', from_id: 'class_2', to_id: 'class_1' }]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateClassDiagram();

      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('BaseService <|-- UserService');
    });
  });

  describe('generateFlowchart', () => {
    it('generates flowchart with nodes and edges', () => {
      const extraction = createMockExtraction(
        [
          { id: 'fn_1', type: 'Function', name: 'processData' },
          { id: 'fn_2', type: 'Function', name: 'validateInput' },
          { id: 'fn_3', type: 'Function', name: 'saveResult' },
        ],
        [
          { type: 'CALLS', from_id: 'fn_1', to_id: 'fn_2' },
          { type: 'CALLS', from_id: 'fn_1', to_id: 'fn_3' },
        ]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateFlowchart();

      expect(diagram).toContain('flowchart TB');
      expect(diagram).toContain('processData');
      expect(diagram).toContain('validateInput');
      expect(diagram).toContain('saveResult');
      expect(diagram).toMatch(/processData.*-->.*validateInput/);
    });

    it('uses different arrows for different edge types', () => {
      const extraction = createMockExtraction(
        [
          { id: 'fn_1', type: 'Function', name: 'handler' },
          { id: 'fn_2', type: 'Function', name: 'helper' },
        ],
        [{ type: 'IMPORTS', from_id: 'fn_1', to_id: 'fn_2' }]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateFlowchart();

      // IMPORTS uses dashed arrow
      expect(diagram).toContain('-.->');
    });
  });

  describe('generateCallGraph', () => {
    it('generates call graph showing function relationships', () => {
      const extraction = createMockExtraction(
        [
          {
            id: 'fn_1',
            type: 'Function',
            name: 'main',
            properties: { parameters: ['args'] },
          },
          {
            id: 'fn_2',
            type: 'Function',
            name: 'processFile',
            properties: { parameters: ['path', 'options'] },
          },
          {
            id: 'fn_3',
            type: 'Function',
            name: 'saveOutput',
            properties: { parameters: ['data'] },
          },
        ],
        [
          { type: 'CALLS', from_id: 'fn_1', to_id: 'fn_2' },
          { type: 'CALLS', from_id: 'fn_2', to_id: 'fn_3' },
        ]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateCallGraph();

      expect(diagram).toContain('flowchart TB');
      // Should show function names with parameters
      expect(diagram).toMatch(/main.*\["main\(/);
    });

    it('filters by root function when specified', () => {
      const extraction = createMockExtraction(
        [
          { id: 'fn_1', type: 'Function', name: 'main' },
          { id: 'fn_2', type: 'Function', name: 'processFile' },
          { id: 'fn_3', type: 'Function', name: 'unrelated' },
        ],
        [
          { type: 'CALLS', from_id: 'fn_1', to_id: 'fn_2' },
          // fn_3 is not connected to main
        ]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateCallGraph({ rootFunction: 'main' });

      expect(diagram).toContain('main');
      // Should include connected function
      // unrelated should not be included since it's not connected
    });
  });

  describe('generateSequenceDiagram', () => {
    it('generates sequence diagram from API endpoints', () => {
      const extraction = createMockExtraction([
        {
          id: 'endpoint_1',
          type: 'ApiEndpoint',
          name: 'getUsers',
          properties: {
            method: 'GET',
            path: '/api/users',
          },
        },
      ]);

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateSequenceDiagram();

      expect(diagram).toContain('sequenceDiagram');
      expect(diagram).toContain('participant Client');
      expect(diagram).toContain('participant API');
      expect(diagram).toContain('GET /api/users');
    });
  });

  describe('generateERDiagram', () => {
    it('generates ER diagram from models', () => {
      const extraction = createMockExtraction([
        {
          id: 'model_1',
          type: 'Model',
          name: 'User',
          properties: {
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: 'string' },
              { name: 'createdAt', type: 'Date' },
            ],
          },
        },
      ]);

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateERDiagram();

      expect(diagram).toContain('erDiagram');
      expect(diagram).toContain('User');
      expect(diagram).toContain('string id');
      expect(diagram).toContain('string email');
    });
  });

  describe('generateModuleDependencies', () => {
    it('generates module dependency graph from imports', () => {
      const extraction = createMockExtraction([
        {
          id: 'import_1',
          type: 'Import',
          name: 'express',
          source: { file: 'src/server.ts', line_start: 1, line_end: 1 },
          properties: { module: 'express' },
        },
        {
          id: 'import_2',
          type: 'Import',
          name: 'lodash',
          source: { file: 'src/utils.ts', line_start: 1, line_end: 1 },
          properties: { module: 'lodash' },
        },
      ]);

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateModuleDependencies();

      expect(diagram).toContain('flowchart TB');
      // Should have subgraphs for directories
      expect(diagram).toMatch(/subgraph.*\[/);
    });
  });

  describe('configuration', () => {
    it('respects direction configuration', () => {
      const extraction = createMockExtraction([
        { id: 'fn_1', type: 'Function', name: 'test' },
      ]);

      const generator = new MermaidGenerator(extraction, { direction: 'LR' });
      const diagram = generator.generateFlowchart();

      expect(diagram).toContain('flowchart LR');
    });

    it('applies theme when specified', () => {
      const extraction = createMockExtraction([
        { id: 'fn_1', type: 'Function', name: 'test' },
      ]);

      const generator = new MermaidGenerator(extraction, { theme: 'dark' });
      const diagram = generator.wrapWithTheme(generator.generateFlowchart());

      expect(diagram).toContain("%%{init: {'theme': 'dark'}}%%");
    });

    it('limits nodes based on maxNodes config', () => {
      // Create many nodes
      const nodes = Array.from({ length: 50 }, (_, i) => ({
        id: `fn_${i}`,
        type: 'Class' as const,
        name: `Class${i}`,
      }));

      const extraction = createMockExtraction(nodes);
      const generator = new MermaidGenerator(extraction, { maxNodes: 10 });
      const diagram = generator.generateClassDiagram();

      // Count occurrences of "class Class" in the output
      const classMatches = diagram.match(/class Class\d+/g) || [];
      expect(classMatches.length).toBeLessThanOrEqual(10);
    });
  });

  describe('generateAll', () => {
    it('generates all diagram types', () => {
      const extraction = createMockExtraction([
        { id: 'class_1', type: 'Class', name: 'TestClass' },
        { id: 'fn_1', type: 'Function', name: 'testFn' },
        {
          id: 'endpoint_1',
          type: 'ApiEndpoint',
          name: 'getTest',
          properties: { method: 'GET', path: '/test' },
        },
        { id: 'model_1', type: 'Model', name: 'TestModel', properties: { fields: [] } },
      ]);

      const generator = new MermaidGenerator(extraction);
      const diagrams = generator.generateAll();

      expect(diagrams).toHaveProperty('class');
      expect(diagrams).toHaveProperty('flowchart');
      expect(diagrams).toHaveProperty('sequence');
      expect(diagrams).toHaveProperty('er');
      expect(diagrams).toHaveProperty('callGraph');
      expect(diagrams).toHaveProperty('moduleDeps');

      expect(diagrams.class).toContain('classDiagram');
      expect(diagrams.flowchart).toContain('flowchart');
      expect(diagrams.sequence).toContain('sequenceDiagram');
      expect(diagrams.er).toContain('erDiagram');
    });
  });

  describe('sanitization', () => {
    it('sanitizes identifiers with special characters', () => {
      const extraction = createMockExtraction(
        [
          { id: 'fn_1', type: 'Function', name: 'my-function.name@v2' },
          { id: 'fn_2', type: 'Function', name: 'helper' },
        ],
        [{ type: 'CALLS', from_id: 'fn_1', to_id: 'fn_2' }]
      );

      const generator = new MermaidGenerator(extraction);
      const diagram = generator.generateFlowchart();

      // The node ID should be sanitized (used in arrow definitions)
      expect(diagram).toMatch(/my_function_name_v2/);
      // The label can contain the original name for readability
      expect(diagram).toContain('my-function.name@v2');
      // Arrow syntax should use sanitized IDs
      expect(diagram).toMatch(/my_function_name_v2.*-->.*helper/);
    });
  });
});
