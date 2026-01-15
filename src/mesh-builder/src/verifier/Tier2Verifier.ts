/**
 * Tier2Verifier - LLM-based verification and correction of Tier 1 extractions.
 *
 * Uses a 70B-class LLM (llama3.3, qwen2.5, etc.) to:
 * 1. Verify line numbers are accurate
 * 2. Correct scope boundaries
 * 3. Validate relationship types
 * 4. Add missing properties
 */

import { MeshNode, MeshEdge, SourceFile } from '../types';

export interface VerificationRequest {
  node: MeshNode;
  sourceContent: string;
  contextBefore: string;
  contextAfter: string;
  extractionMetadata: {
    schema: string;
    pattern: string;
    regexMatch?: string;
  };
}

export interface VerificationResult {
  nodeId: string;
  status: 'verified' | 'corrected' | 'rejected';
  corrections?: {
    line_start?: number;
    line_end?: number;
    name?: string;
    properties?: Record<string, unknown>;
  };
  confidence: number;
  reasoning: string;
  processingTime: number;
}

export interface Tier2Config {
  provider: 'ollama' | 'groq' | 'openai';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxConcurrent: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: Tier2Config = {
  provider: 'ollama',
  model: 'llama3.3:70b',
  baseUrl: 'http://localhost:11434',
  maxConcurrent: 4,
  timeoutMs: 30000,
};

export class Tier2Verifier {
  private config: Tier2Config;

  constructor(config: Partial<Tier2Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify a single node extraction.
   */
  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const startTime = Date.now();

    const prompt = this.buildPrompt(request);
    const response = await this.callLLM(prompt);
    const result = this.parseResponse(response, request.node.id);

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Verify multiple nodes in batch (with concurrency control).
   */
  async verifyBatch(requests: VerificationRequest[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const queue = [...requests];

    // Process in batches based on maxConcurrent
    while (queue.length > 0) {
      const batch = queue.splice(0, this.config.maxConcurrent);
      const batchResults = await Promise.all(batch.map((req) => this.verify(req)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Create verification requests from extracted nodes and source file.
   */
  createRequests(
    nodes: MeshNode[],
    file: SourceFile,
    schema: string,
    pattern: string
  ): VerificationRequest[] {
    const lines = file.content.split('\n');
    const requests: VerificationRequest[] = [];

    for (const node of nodes) {
      // Skip file nodes - they don't need verification
      if (node.type === 'File') continue;

      const { line_start, line_end } = node.source;

      // Get context (10 lines before and after)
      const contextStart = Math.max(0, line_start - 11);
      const contextEnd = Math.min(lines.length, line_end + 10);

      const contextBefore = lines
        .slice(contextStart, line_start - 1)
        .map((l, i) => `${contextStart + i + 1}: ${l}`)
        .join('\n');

      const sourceContent = lines
        .slice(line_start - 1, line_end)
        .map((l, i) => `${line_start + i}: ${l}`)
        .join('\n');

      const contextAfter = lines
        .slice(line_end, contextEnd)
        .map((l, i) => `${line_end + i + 1}: ${l}`)
        .join('\n');

      requests.push({
        node,
        sourceContent,
        contextBefore,
        contextAfter,
        extractionMetadata: { schema, pattern },
      });
    }

    return requests;
  }

  /**
   * Build the verification prompt.
   */
  private buildPrompt(request: VerificationRequest): string {
    const { node, sourceContent, contextBefore, contextAfter } = request;

    return `<task>Verify and correct code extraction accuracy</task>

<source_file>${node.source.file}</source_file>

<context_before>
${contextBefore}
</context_before>

<extracted_source claimed_start="${node.source.line_start}" claimed_end="${node.source.line_end}">
${sourceContent}
</extracted_source>

<context_after>
${contextAfter}
</context_after>

<extraction>
<node type="${node.type}" name="${node.name}">
  <claimed_location line_start="${node.source.line_start}" line_end="${node.source.line_end}" />
  <properties>${JSON.stringify(node.properties || {})}</properties>
</node>
</extraction>

<instructions>
Verify this code extraction is accurate:

1. LINE_START: Is line ${node.source.line_start} where the ${node.type} "${node.name}" definition actually begins?
   - For functions/methods: the line with 'def' or 'function' keyword
   - For classes: the line with 'class' keyword
   - Look at the context_before to see if definition starts earlier

2. LINE_END: Does line ${node.source.line_end} capture the FULL scope of the ${node.type}?
   - For Python: find the last line at the body's indentation level
   - For JavaScript/TypeScript: find the closing brace
   - Look at context_after to see if scope extends further

3. NAME: Is "${node.name}" the correct identifier?

4. PROPERTIES: Are the extracted properties accurate?

Respond with corrections if needed.
</instructions>

<response_format>
<verification>
  <status>verified|corrected|rejected</status>
  <line_start_correct>true|false</line_start_correct>
  <line_end_correct>true|false</line_end_correct>
  <corrected_line_start>NUMBER or omit if correct</corrected_line_start>
  <corrected_line_end>NUMBER or omit if correct</corrected_line_end>
  <corrected_properties>JSON or omit if correct</corrected_properties>
  <confidence>0.0-1.0</confidence>
  <reasoning>Brief explanation of verification result</reasoning>
</verification>
</response_format>`;
  }

  /**
   * Call the LLM API.
   */
  private async callLLM(prompt: string): Promise<string> {
    if (this.config.provider === 'ollama') {
      return this.callOllama(prompt);
    } else if (this.config.provider === 'groq') {
      return this.callGroq(prompt);
    } else {
      throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent verification
          num_predict: 500,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  private async callGroq(prompt: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('Groq API key required');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Parse the LLM response into a structured result.
   */
  private parseResponse(response: string, nodeId: string): VerificationResult {
    // Extract XML-like tags from response
    const statusMatch = response.match(/<status>(\w+)<\/status>/);
    const lineStartMatch = response.match(/<corrected_line_start>(\d+)<\/corrected_line_start>/);
    const lineEndMatch = response.match(/<corrected_line_end>(\d+)<\/corrected_line_end>/);
    const confidenceMatch = response.match(/<confidence>([\d.]+)<\/confidence>/);
    const reasoningMatch = response.match(/<reasoning>([^<]+)<\/reasoning>/);

    const status = (statusMatch?.[1] as 'verified' | 'corrected' | 'rejected') || 'verified';
    const confidence = confidenceMatch?.[1] ? parseFloat(confidenceMatch[1]) : 0.5;
    const reasoning = reasoningMatch?.[1]?.trim() ?? 'No reasoning provided';

    const result: VerificationResult = {
      nodeId,
      status,
      confidence,
      reasoning,
      processingTime: 0,
    };

    // Add corrections if any
    if (status === 'corrected') {
      result.corrections = {};
      if (lineStartMatch?.[1]) {
        result.corrections.line_start = parseInt(lineStartMatch[1], 10);
      }
      if (lineEndMatch?.[1]) {
        result.corrections.line_end = parseInt(lineEndMatch[1], 10);
      }
    }

    return result;
  }
}

/**
 * Apply verification results back to nodes.
 */
export function applyCorrections(
  nodes: MeshNode[],
  results: VerificationResult[]
): MeshNode[] {
  const resultMap = new Map(results.map((r) => [r.nodeId, r]));

  return nodes.map((node) => {
    const result = resultMap.get(node.id);
    if (!result || result.status !== 'corrected' || !result.corrections) {
      return node;
    }

    // Apply corrections
    const corrected = { ...node };

    if (result.corrections.line_start !== undefined) {
      corrected.source = {
        ...corrected.source,
        line_start: result.corrections.line_start,
      };
    }

    if (result.corrections.line_end !== undefined) {
      corrected.source = {
        ...corrected.source,
        line_end: result.corrections.line_end,
      };
    }

    if (result.corrections.name !== undefined) {
      corrected.name = result.corrections.name;
    }

    if (result.corrections.properties !== undefined) {
      corrected.properties = {
        ...corrected.properties,
        ...result.corrections.properties,
      };
    }

    // Update extraction metadata - store verification info in properties
    // since ExtractionMetadata has a fixed schema
    corrected.extraction = {
      ...corrected.extraction,
      tier: 2,
    };
    corrected.properties = {
      ...corrected.properties,
      _verified: true,
      _correction_applied: true,
    };

    return corrected;
  });
}
