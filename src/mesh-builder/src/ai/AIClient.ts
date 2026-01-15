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
};

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
   * Send a prompt and parse XML response.
   */
  async query<T>(
    systemPrompt: string,
    userPrompt: string,
    parseResponse: (xml: string) => T
  ): Promise<AIResponse<T>> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    this.totalTokensUsed += tokensUsed;
    this.callCount++;

    const data = parseResponse(content);

    return {
      data,
      tokensUsed,
      model: this.config.model,
      latencyMs,
    };
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

    return this.query(systemPrompt, userPrompt, parseDisambiguationXML);
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

    return this.query(systemPrompt, userPrompt, parseDiscoveryXML);
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
      extractors: {}, // Simplified - full implementation would parse extractors
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
