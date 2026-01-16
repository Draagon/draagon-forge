/**
 * AIClient - Interface to Groq for AI-assisted extraction.
 *
 * Uses XML output format as required by the project constitution.
 * Provides methods for disambiguation (Tier 2) and discovery (Tier 3).
 */

import Groq from 'groq-sdk';

export interface AIClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Maximum retries on timeout (default: 2) */
  maxRetries?: number;
}

export interface AIResponse<T> {
  data: T;
  tokensUsed: number;
  model: string;
  latencyMs: number;
}

const DEFAULT_CONFIG: Required<AIClientConfig> = {
  apiKey: process.env['GROQ_API_KEY'] || '',
  model: 'llama-3.3-70b-versatile',
  maxTokens: 4096,
  temperature: 0.1,
  timeoutMs: 60000, // 60 seconds
  maxRetries: 2,
};

/**
 * Validation errors that can occur during AI response parsing.
 */
export class AIValidationError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'AIValidationError';
  }
}

export class AIClient {
  private client: Groq;
  private config: Required<AIClientConfig>;
  private totalTokensUsed: number = 0;
  private callCount: number = 0;

  constructor(config: AIClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.apiKey) {
      throw new Error('GROQ_API_KEY is required for AI operations');
    }

    this.client = new Groq({ apiKey: this.config.apiKey });
  }

  /**
   * Send a prompt and parse XML response with timeout and retry support.
   */
  async query<T>(
    systemPrompt: string,
    userPrompt: string,
    parseResponse: (xml: string) => T
  ): Promise<AIResponse<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let content = '';
    let tokensUsed = 0;

    // Retry loop with timeout
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.withTimeout(
          this.client.chat.completions.create({
            model: this.config.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
          }),
          this.config.timeoutMs
        );

        content = response.choices[0]?.message?.content || '';
        tokensUsed = response.usage?.total_tokens || 0;
        break; // Success - exit retry loop

      } catch (error) {
        lastError = error as Error;
        const isTimeout = (error as Error).message?.includes('timeout');
        const isRetryable = isTimeout || (error as Error).message?.includes('rate limit');

        if (!isRetryable || attempt === this.config.maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`AI request attempt ${attempt + 1} failed (${(error as Error).message}), retrying in ${backoffMs}ms...`);
        await this.delay(backoffMs);
      }
    }

    const latencyMs = Date.now() - startTime;

    this.totalTokensUsed += tokensUsed;
    this.callCount++;

    // Parse and validate response
    let data: T;
    try {
      data = parseResponse(content);
    } catch (parseError) {
      throw new AIValidationError(
        `Failed to parse AI response: ${(parseError as Error).message}`,
        content
      );
    }

    return {
      data,
      tokensUsed,
      model: this.config.model,
      latencyMs,
    };
  }

  /**
   * Wrap a promise with timeout protection.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`AI request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  /**
   * Helper to delay execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disambiguate an ambiguous extraction.
   */
  async disambiguate(
    context: DisambiguationContext
  ): Promise<AIResponse<DisambiguationResult>> {
    const systemPrompt = `You are a code analysis expert. Analyze the given code context and resolve the ambiguity.

Output your response in XML format:
<response>
  <resolved_value>The resolved value</resolved_value>
  <confidence>0.0 to 1.0</confidence>
  <reasoning>Why you chose this value</reasoning>
  <node_type>The appropriate MeshNodeType</node_type>
  <properties>
    <property name="key">value</property>
  </properties>
</response>`;

    const userPrompt = `File: ${context.file}
Language: ${context.language}
Framework: ${context.framework || 'unknown'}

Code context:
\`\`\`
${context.codeSnippet}
\`\`\`

Ambiguity: ${context.question}
Possible values: ${context.options.join(', ')}

Please resolve this ambiguity.`;

    const response = await this.query(systemPrompt, userPrompt, parseDisambiguationXML);

    // Validate and sanitize the AI response
    response.data = validateDisambiguationResult(response.data);

    return response;
  }

  /**
   * Discover code patterns in an unknown framework.
   */
  async discover(context: DiscoveryContext): Promise<AIResponse<DiscoveryResult>> {
    const systemPrompt = `You are a code analysis expert. Analyze the given source code and extract meaningful code entities and relationships.

Output your response in XML format:
<response>
  <framework_detected>
    <name>Framework name or "unknown"</name>
    <confidence>0.0 to 1.0</confidence>
  </framework_detected>
  <nodes>
    <node>
      <type>MeshNodeType (e.g., Class, Function, ApiEndpoint)</type>
      <name>Entity name</name>
      <line_start>Line number</line_start>
      <line_end>Line number</line_end>
      <confidence>0.0 to 1.0</confidence>
      <properties>
        <property name="key">value</property>
      </properties>
    </node>
  </nodes>
  <edges>
    <edge>
      <type>MeshEdgeType (e.g., CALLS, CONTAINS, IMPORTS)</type>
      <from_name>Source entity name</from_name>
      <to_name>Target entity name</to_name>
      <confidence>0.0 to 1.0</confidence>
    </edge>
  </edges>
  <schema_suggestions>
    <suggestion>
      <pattern>Regex pattern that would match this construct</pattern>
      <example>Example code that matches</example>
      <node_type>What node type it should create</node_type>
    </suggestion>
  </schema_suggestions>
</response>`;

    const userPrompt = `File: ${context.file}
Language: ${context.language}

Source code:
\`\`\`${context.language}
${context.content}
\`\`\`

Please analyze this code and extract all meaningful entities (classes, functions, API endpoints, database models, etc.) and their relationships.`;

    const response = await this.query(systemPrompt, userPrompt, parseDiscoveryXML);

    // Validate and sanitize the AI response
    response.data = validateDiscoveryResult(response.data);

    return response;
  }

  /**
   * Discover code patterns with enriched project context (REQ-034).
   * This uses beliefs, patterns, and external knowledge to improve discovery.
   */
  async discoverWithContext(context: EnrichedDiscoveryContext): Promise<AIResponse<DiscoveryResult>> {
    // Build enhanced system prompt with project knowledge
    let systemPrompt = `You are a code analysis expert.`;

    // Add framework specialization if detected
    if (context.frameworks && context.frameworks.length > 0) {
      const frameworkNames = context.frameworks.map(f => f.name).join(', ');
      systemPrompt += ` You are specializing in analyzing ${frameworkNames} code.`;
    }

    systemPrompt += ` Analyze the given source code and extract meaningful code entities and relationships.

`;

    // Add beliefs as project knowledge
    if (context.beliefs && context.beliefs.length > 0) {
      systemPrompt += `PROJECT KNOWLEDGE (beliefs about this codebase):
`;
      for (const belief of context.beliefs.slice(0, 10)) {
        systemPrompt += `- ${belief.content} (conviction: ${belief.conviction.toFixed(2)})
`;
      }
      systemPrompt += `
`;
    }

    // Add known patterns
    if (context.patterns && context.patterns.length > 0) {
      systemPrompt += `KNOWN PATTERNS (extraction patterns for this framework):
`;
      for (const pattern of context.patterns.slice(0, 5)) {
        systemPrompt += `- ${pattern.description}: ${pattern.pattern} → ${pattern.nodeType}
`;
      }
      systemPrompt += `
`;
    }

    // Add external knowledge
    if (context.externalKnowledge && context.externalKnowledge.length > 0) {
      systemPrompt += `EXTERNAL DOCUMENTATION:
`;
      for (const ext of context.externalKnowledge.slice(0, 3)) {
        systemPrompt += `[${ext.source}]: ${ext.content.slice(0, 500)}
`;
      }
      systemPrompt += `
`;
    }

    systemPrompt += `Output your response in XML format:
<response>
  <framework_detected>
    <name>Framework name or "unknown"</name>
    <confidence>0.0 to 1.0</confidence>
  </framework_detected>
  <nodes>
    <node>
      <type>MeshNodeType (e.g., Class, Function, ApiEndpoint)</type>
      <name>Entity name</name>
      <line_start>Line number</line_start>
      <line_end>Line number</line_end>
      <confidence>0.0 to 1.0</confidence>
      <properties>
        <property name="key">value</property>
      </properties>
    </node>
  </nodes>
  <edges>
    <edge>
      <type>MeshEdgeType (e.g., CALLS, CONTAINS, IMPORTS)</type>
      <from_name>Source entity name</from_name>
      <to_name>Target entity name</to_name>
      <confidence>0.0 to 1.0</confidence>
    </edge>
  </edges>
  <schema_suggestions>
    <suggestion>
      <pattern>Regex pattern that would match this construct</pattern>
      <example>Example code that matches</example>
      <node_type>What node type it should create</node_type>
    </suggestion>
  </schema_suggestions>
</response>`;

    // Build enhanced user prompt
    let userPrompt = `File: ${context.file}
Language: ${context.language}
`;

    // Add detected frameworks
    if (context.frameworks && context.frameworks.length > 0) {
      userPrompt += `
DETECTED FRAMEWORKS:
`;
      for (const fw of context.frameworks) {
        userPrompt += `- ${fw.name} (confidence: ${fw.confidence.toFixed(2)})
`;
        if (fw.evidence.length > 0) {
          userPrompt += `  Evidence: ${fw.evidence.slice(0, 3).join(', ')}
`;
        }
      }
    }

    // Add related file context (type signatures)
    if (context.relatedFiles && context.relatedFiles.length > 0) {
      userPrompt += `
RELATED FILES (type signatures from imports):
`;
      for (const related of context.relatedFiles.slice(0, 5)) {
        userPrompt += `- ${related.path}:
`;
        for (const exp of related.exports.slice(0, 5)) {
          if (exp.signature) {
            userPrompt += `    ${exp.signature}
`;
          } else {
            userPrompt += `    ${exp.kind} ${exp.name}
`;
          }
        }
      }
    }

    userPrompt += `
Source code:
\`\`\`${context.language}
${context.content}
\`\`\`

Please analyze this code and extract all meaningful entities (classes, functions, API endpoints, database models, etc.) and their relationships. Use the project knowledge and framework patterns provided to improve accuracy.`;

    const response = await this.query(systemPrompt, userPrompt, parseDiscoveryXML);

    // Validate and sanitize the AI response
    response.data = validateDiscoveryResult(response.data);

    return response;
  }

  /**
   * Generate a schema from discovered patterns.
   */
  async generateSchema(
    context: SchemaGenerationContext
  ): Promise<AIResponse<GeneratedSchema>> {
    const systemPrompt = `You are a code analysis expert. Generate a JSON schema for extracting code patterns based on the discovered entities.

Output your response in XML format:
<response>
  <schema>
    <name>Schema name (e.g., "flask", "express")</name>
    <version>1.0.0</version>
    <language>python or typescript</language>
    <description>What this schema extracts</description>
    <detection>
      <imports>
        <import>Import pattern to detect</import>
      </imports>
      <patterns>
        <pattern>Content pattern to detect</pattern>
      </patterns>
      <confidence_boost>0.3</confidence_boost>
    </detection>
    <extractors>
      <extractor name="extractor_name">
        <description>What it extracts</description>
        <pattern>
          <name>Pattern name</name>
          <regex>The regex pattern (escaped for JSON)</regex>
          <captures>
            <capture name="capture_name" group="1" />
          </captures>
          <node_template type="NodeType" name_from="capture_name">
            <property name="key">capture_or_literal</property>
          </node_template>
        </pattern>
      </extractor>
    </extractors>
  </schema>
  <confidence>0.0 to 1.0</confidence>
  <reasoning>Why this schema was generated</reasoning>
</response>`;

    const userPrompt = `Framework: ${context.frameworkName}
Language: ${context.language}

Discovered patterns:
${context.discoveries.map((d) => `- ${d.type}: ${d.name} at line ${d.line}`).join('\n')}

Example code snippets:
${context.examples.map((e) => `\`\`\`\n${e}\n\`\`\``).join('\n\n')}

Generate a JSON schema that can extract these patterns using regex.`;

    return this.query(systemPrompt, userPrompt, parseSchemaGenerationXML);
  }

  /**
   * Get usage statistics.
   */
  getStats(): AIStats {
    return {
      totalTokensUsed: this.totalTokensUsed,
      callCount: this.callCount,
      averageTokensPerCall:
        this.callCount > 0 ? this.totalTokensUsed / this.callCount : 0,
    };
  }

  /**
   * Reset usage statistics.
   */
  resetStats(): void {
    this.totalTokensUsed = 0;
    this.callCount = 0;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface DisambiguationContext {
  file: string;
  language: string;
  framework?: string;
  codeSnippet: string;
  question: string;
  options: string[];
}

export interface DisambiguationResult {
  resolvedValue: string;
  confidence: number;
  reasoning: string;
  nodeType?: string;
  properties: Record<string, string>;
}

export interface DiscoveryContext {
  file: string;
  language: string;
  content: string;
}

/**
 * Enhanced discovery context with project knowledge (REQ-034).
 */
export interface EnrichedDiscoveryContext extends DiscoveryContext {
  /** Detected frameworks with confidence */
  frameworks?: Array<{
    name: string;
    confidence: number;
    evidence: string[];
  }>;
  /** Relevant beliefs from semantic memory */
  beliefs?: Array<{
    content: string;
    conviction: number;
    source: string;
  }>;
  /** Known extraction patterns for detected frameworks */
  patterns?: Array<{
    description: string;
    pattern: string;
    nodeType: string;
  }>;
  /** Type signatures from related files */
  relatedFiles?: Array<{
    path: string;
    exports: Array<{
      name: string;
      kind: string;
      signature?: string;
    }>;
  }>;
  /** External knowledge (from Context7, web, etc.) */
  externalKnowledge?: Array<{
    source: string;
    content: string;
    confidence: number;
  }>;
}

export interface DiscoveryResult {
  frameworkDetected?: {
    name: string;
    confidence: number;
  };
  nodes: Array<{
    type: string;
    name: string;
    lineStart: number;
    lineEnd: number;
    confidence: number;
    properties: Record<string, string>;
  }>;
  edges: Array<{
    type: string;
    fromName: string;
    toName: string;
    confidence: number;
  }>;
  schemaSuggestions: Array<{
    pattern: string;
    example: string;
    nodeType: string;
  }>;
}

export interface SchemaGenerationContext {
  frameworkName: string;
  language: string;
  discoveries: Array<{
    type: string;
    name: string;
    line: number;
  }>;
  examples: string[];
}

export interface GeneratedSchema {
  schema: {
    name: string;
    version: string;
    language: string;
    description: string;
    detection: {
      imports: string[];
      patterns: string[];
      confidenceBoost: number;
    };
    extractors: Record<
      string,
      {
        description: string;
        patterns: Array<{
          name: string;
          regex: string;
          captures: Record<string, { group: number }>;
          nodeTemplate?: {
            type: string;
            nameFrom: string;
            properties: Record<string, string>;
          };
        }>;
      }
    >;
  };
  confidence: number;
  reasoning: string;
}

export interface AIStats {
  totalTokensUsed: number;
  callCount: number;
  averageTokensPerCall: number;
}

// ============================================================================
// XML Parsers
// ============================================================================

function parseDisambiguationXML(xml: string): DisambiguationResult {
  const resolvedValue = extractXMLTag(xml, 'resolved_value') || '';
  const confidence = parseFloat(extractXMLTag(xml, 'confidence') || '0');
  const reasoning = extractXMLTag(xml, 'reasoning') || '';
  const nodeType = extractXMLTag(xml, 'node_type');

  const properties: Record<string, string> = {};
  const propsMatch = xml.match(/<properties>([\s\S]*?)<\/properties>/);
  if (propsMatch && propsMatch[1]) {
    const propMatches = propsMatch[1].matchAll(
      /<property name="([^"]+)">([^<]*)<\/property>/g
    );
    for (const match of propMatches) {
      if (match[1] && match[2] !== undefined) {
        properties[match[1]] = match[2];
      }
    }
  }

  return { resolvedValue, confidence, reasoning, nodeType, properties };
}

function parseDiscoveryXML(xml: string): DiscoveryResult {
  let frameworkDetected: DiscoveryResult['frameworkDetected'];
  const fwMatch = xml.match(
    /<framework_detected>[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<confidence>([^<]*)<\/confidence>[\s\S]*?<\/framework_detected>/
  );
  if (fwMatch && fwMatch[1] && fwMatch[1] !== 'unknown') {
    frameworkDetected = {
      name: fwMatch[1],
      confidence: parseFloat(fwMatch[2] || '0'),
    };
  }

  const nodes: DiscoveryResult['nodes'] = [];
  const nodesMatch = xml.match(/<nodes>([\s\S]*?)<\/nodes>/);
  if (nodesMatch && nodesMatch[1]) {
    const nodeMatches = nodesMatch[1].matchAll(/<node>([\s\S]*?)<\/node>/g);
    for (const match of nodeMatches) {
      const nodeXml = match[1];
      if (!nodeXml) continue;

      const properties: Record<string, string> = {};
      const propsMatch2 = nodeXml.match(/<properties>([\s\S]*?)<\/properties>/);
      if (propsMatch2 && propsMatch2[1]) {
        const propMatches = propsMatch2[1].matchAll(
          /<property name="([^"]+)">([^<]*)<\/property>/g
        );
        for (const pm of propMatches) {
          if (pm[1] && pm[2] !== undefined) {
            properties[pm[1]] = pm[2];
          }
        }
      }

      nodes.push({
        type: extractXMLTag(nodeXml, 'type') || '',
        name: extractXMLTag(nodeXml, 'name') || '',
        lineStart: parseInt(extractXMLTag(nodeXml, 'line_start') || '0'),
        lineEnd: parseInt(extractXMLTag(nodeXml, 'line_end') || '0'),
        confidence: parseFloat(extractXMLTag(nodeXml, 'confidence') || '0'),
        properties,
      });
    }
  }

  const edges: DiscoveryResult['edges'] = [];
  const edgesMatch = xml.match(/<edges>([\s\S]*?)<\/edges>/);
  if (edgesMatch && edgesMatch[1]) {
    const edgeMatches = edgesMatch[1].matchAll(/<edge>([\s\S]*?)<\/edge>/g);
    for (const match of edgeMatches) {
      const edgeXml = match[1];
      if (!edgeXml) continue;

      edges.push({
        type: extractXMLTag(edgeXml, 'type') || '',
        fromName: extractXMLTag(edgeXml, 'from_name') || '',
        toName: extractXMLTag(edgeXml, 'to_name') || '',
        confidence: parseFloat(extractXMLTag(edgeXml, 'confidence') || '0'),
      });
    }
  }

  const schemaSuggestions: DiscoveryResult['schemaSuggestions'] = [];
  const suggestionsMatch = xml.match(
    /<schema_suggestions>([\s\S]*?)<\/schema_suggestions>/
  );
  if (suggestionsMatch && suggestionsMatch[1]) {
    const suggestionMatches = suggestionsMatch[1].matchAll(
      /<suggestion>([\s\S]*?)<\/suggestion>/g
    );
    for (const match of suggestionMatches) {
      const suggXml = match[1];
      if (!suggXml) continue;

      schemaSuggestions.push({
        pattern: extractXMLTag(suggXml, 'pattern') || '',
        example: extractXMLTag(suggXml, 'example') || '',
        nodeType: extractXMLTag(suggXml, 'node_type') || '',
      });
    }
  }

  return { frameworkDetected, nodes, edges, schemaSuggestions };
}

function parseSchemaGenerationXML(xml: string): GeneratedSchema {
  const schemaMatch = xml.match(/<schema>([\s\S]*?)<\/schema>/);
  const schemaXml = schemaMatch?.[1] || '';

  const importsMatch = schemaXml.match(/<imports>([\s\S]*?)<\/imports>/);
  const imports: string[] = [];
  if (importsMatch && importsMatch[1]) {
    const importMatches = importsMatch[1].matchAll(/<import>([^<]*)<\/import>/g);
    for (const m of importMatches) {
      if (m[1]) imports.push(m[1]);
    }
  }

  const patternsMatch = schemaXml.match(
    /<detection>[\s\S]*?<patterns>([\s\S]*?)<\/patterns>/
  );
  const patterns: string[] = [];
  if (patternsMatch && patternsMatch[1]) {
    const patternMatches = patternsMatch[1].matchAll(
      /<pattern>([^<]*)<\/pattern>/g
    );
    for (const m of patternMatches) {
      if (m[1]) patterns.push(m[1]);
    }
  }

  // Parse extractors section
  const extractors: GeneratedSchema['schema']['extractors'] = {};
  const extractorsMatch = schemaXml.match(/<extractors>([\s\S]*?)<\/extractors>/);
  if (extractorsMatch && extractorsMatch[1]) {
    // Match each extractor with its name attribute
    const extractorMatches = extractorsMatch[1].matchAll(
      /<extractor\s+name="([^"]+)">([\s\S]*?)<\/extractor>/g
    );

    for (const match of extractorMatches) {
      const extractorName = match[1];
      const extractorXml = match[2];
      if (!extractorName || !extractorXml) continue;

      const extractorPatterns: GeneratedSchema['schema']['extractors'][string]['patterns'] = [];

      // Parse patterns within this extractor
      const patternBlockMatches = extractorXml.matchAll(/<pattern>([\s\S]*?)<\/pattern>/g);
      for (const patternMatch of patternBlockMatches) {
        const patternXml = patternMatch[1];
        if (!patternXml) continue;

        // Parse captures
        const captures: Record<string, { group: number }> = {};
        const captureMatches = patternXml.matchAll(
          /<capture\s+name="([^"]+)"\s+group="(\d+)"\s*\/>/g
        );
        for (const cm of captureMatches) {
          if (cm[1] && cm[2]) {
            captures[cm[1]] = { group: parseInt(cm[2]) };
          }
        }

        // Parse node_template if present
        let nodeTemplate: GeneratedSchema['schema']['extractors'][string]['patterns'][number]['nodeTemplate'] | undefined;
        const nodeTemplateMatch = patternXml.match(
          /<node_template\s+type="([^"]+)"\s+name_from="([^"]+)">([\s\S]*?)<\/node_template>/
        );
        if (nodeTemplateMatch) {
          const templateProps: Record<string, string> = {};
          const propMatches = (nodeTemplateMatch[3] || '').matchAll(
            /<property\s+name="([^"]+)">([^<]*)<\/property>/g
          );
          for (const pm of propMatches) {
            if (pm[1] && pm[2] !== undefined) {
              templateProps[pm[1]] = pm[2];
            }
          }

          nodeTemplate = {
            type: nodeTemplateMatch[1] || '',
            nameFrom: nodeTemplateMatch[2] || '',
            properties: templateProps,
          };
        }

        extractorPatterns.push({
          name: extractXMLTag(patternXml, 'name') || '',
          regex: extractXMLTag(patternXml, 'regex') || '',
          captures,
          nodeTemplate,
        });
      }

      extractors[extractorName] = {
        description: extractXMLTag(extractorXml, 'description') || '',
        patterns: extractorPatterns,
      };
    }
  }

  return {
    schema: {
      name: extractXMLTag(schemaXml, 'name') || 'unknown',
      version: extractXMLTag(schemaXml, 'version') || '1.0.0',
      language: extractXMLTag(schemaXml, 'language') || 'unknown',
      description: extractXMLTag(schemaXml, 'description') || '',
      detection: {
        imports,
        patterns,
        confidenceBoost: parseFloat(
          extractXMLTag(schemaXml, 'confidence_boost') || '0.3'
        ),
      },
      extractors,
    },
    confidence: parseFloat(extractXMLTag(xml, 'confidence') || '0'),
    reasoning: extractXMLTag(xml, 'reasoning') || '',
  };
}

function extractXMLTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

// ============================================================================
// Runtime Validators
// ============================================================================

/** Valid node types for validation */
const VALID_NODE_TYPES = new Set([
  'File', 'Module', 'Class', 'Interface', 'Function', 'Method',
  'Variable', 'Import', 'Decorator', 'ApiEndpoint', 'ApiParameter',
  'ApiResponse', 'Queue', 'Topic', 'Consumer', 'Producer',
  'Database', 'Table', 'Column', 'Model', 'ExternalService', 'ConfigValue',
]);

/** Valid edge types for validation */
const VALID_EDGE_TYPES = new Set([
  'CONTAINS', 'IMPORTS', 'EXPORTS', 'INHERITS', 'IMPLEMENTS',
  'CALLS', 'USES', 'RETURNS', 'ACCEPTS', 'DECORATES', 'DECORATED_BY',
  'EXPOSES', 'HANDLED_BY', 'PUBLISHES_TO', 'SUBSCRIBES_TO',
  'READS_FROM', 'WRITES_TO', 'QUERIES', 'CALLS_SERVICE', 'DEPENDS_ON',
]);

/**
 * Validate that a confidence value is within valid range.
 */
function validateConfidence(value: number, field: string): number {
  if (isNaN(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Validate and sanitize a discovery result from AI.
 * Filters out invalid nodes/edges and clamps confidence values.
 */
export function validateDiscoveryResult(result: DiscoveryResult): DiscoveryResult {
  // Validate framework detection
  let frameworkDetected = result.frameworkDetected;
  if (frameworkDetected) {
    frameworkDetected = {
      name: frameworkDetected.name || 'unknown',
      confidence: validateConfidence(frameworkDetected.confidence, 'framework_confidence'),
    };
    if (frameworkDetected.name === 'unknown' || frameworkDetected.name === '') {
      frameworkDetected = undefined;
    }
  }

  // Validate and filter nodes
  const nodes = result.nodes.filter(node => {
    // Must have a name
    if (!node.name || node.name.trim() === '') return false;

    // Must have valid line numbers
    if (node.lineStart < 0 || node.lineEnd < node.lineStart) return false;

    return true;
  }).map(node => ({
    ...node,
    type: VALID_NODE_TYPES.has(node.type) ? node.type : 'Function', // Default to Function
    confidence: validateConfidence(node.confidence, 'node_confidence'),
  }));

  // Validate and filter edges
  const edges = result.edges.filter(edge => {
    // Must have from and to
    if (!edge.fromName || !edge.toName) return false;
    // from and to must be different
    if (edge.fromName === edge.toName) return false;
    return true;
  }).map(edge => ({
    ...edge,
    type: VALID_EDGE_TYPES.has(edge.type) ? edge.type : 'USES', // Default to USES
    confidence: validateConfidence(edge.confidence, 'edge_confidence'),
  }));

  // Filter schema suggestions
  const schemaSuggestions = result.schemaSuggestions.filter(sugg => {
    return sugg.pattern && sugg.pattern.trim() !== '' && sugg.nodeType;
  });

  return {
    frameworkDetected,
    nodes,
    edges,
    schemaSuggestions,
  };
}

/**
 * Validate a disambiguation result from AI.
 */
export function validateDisambiguationResult(result: DisambiguationResult): DisambiguationResult {
  return {
    ...result,
    confidence: validateConfidence(result.confidence, 'confidence'),
  };
}
