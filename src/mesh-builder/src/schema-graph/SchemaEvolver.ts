/**
 * SchemaEvolver - Use LLMs to generate and evolve extraction schemas.
 *
 * Tiered model approach:
 * - Groq (70B): Fast verification, simple corrections
 * - Claude Sonnet: Pattern rewrites, moderate complexity
 * - Claude Opus: Full schema generation, framework understanding
 *
 * Bootstrap flow:
 * 1. Detect project frameworks from dependencies
 * 2. Check graph for existing schemas
 * 3. If none, use LLM to generate initial schemas
 * 4. Evolve based on verification feedback
 */

import { GraphSchema, GraphPattern, SchemaGraphStore } from './SchemaGraphStore';

export interface LLMProvider {
  name: 'groq' | 'claude-sonnet' | 'claude-opus' | 'ollama';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface EvolverConfig {
  groq: LLMProvider;
  claudeSonnet: LLMProvider;
  claudeOpus: LLMProvider;

  // Thresholds for escalation
  escalateToSonnetConfidence: number; // If Groq confidence < this
  escalateToOpusConfidence: number; // If Sonnet confidence < this

  // Evolution thresholds
  correctionRateThreshold: number; // Trigger evolution if corrections > this
  rejectionRateThreshold: number; // Trigger evolution if rejections > this
  minSamplesForEvolution: number;
}

const DEFAULT_CONFIG: EvolverConfig = {
  groq: {
    name: 'groq',
    model: 'llama-3.3-70b-versatile',
  },
  claudeSonnet: {
    name: 'claude-sonnet',
    model: 'claude-sonnet-4-20250514',
  },
  claudeOpus: {
    name: 'claude-opus',
    model: 'claude-opus-4-20250514',
  },
  escalateToSonnetConfidence: 0.7,
  escalateToOpusConfidence: 0.5,
  correctionRateThreshold: 0.1,
  rejectionRateThreshold: 0.05,
  minSamplesForEvolution: 20,
};

export interface FrameworkDetection {
  language: string;
  frameworks: string[];
  dependencies: Record<string, string>;
  configFiles: string[];
}

export interface GeneratedSchema {
  schema: Omit<GraphSchema, 'id'>;
  patterns: Array<Omit<GraphPattern, 'id' | 'schema_id'>>;
}

export class SchemaEvolver {
  private config: EvolverConfig;
  private store: SchemaGraphStore;

  constructor(store: SchemaGraphStore, config: Partial<EvolverConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect frameworks from project files.
   */
  async detectFrameworks(projectPath: string): Promise<FrameworkDetection> {
    // Read common config files
    const fs = await import('fs/promises');
    const path = await import('path');

    const detection: FrameworkDetection = {
      language: 'unknown',
      frameworks: [],
      dependencies: {},
      configFiles: [],
    };

    // Check for package.json (Node.js)
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8')
      );
      detection.language = 'typescript';
      detection.configFiles.push('package.json');
      detection.dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Detect frameworks
      if (detection.dependencies['react']) detection.frameworks.push('react');
      if (detection.dependencies['next']) detection.frameworks.push('nextjs');
      if (detection.dependencies['express']) detection.frameworks.push('express');
      if (detection.dependencies['fastify']) detection.frameworks.push('fastify');
      if (detection.dependencies['@nestjs/core']) detection.frameworks.push('nestjs');
      if (detection.dependencies['vue']) detection.frameworks.push('vue');
      if (detection.dependencies['@angular/core']) detection.frameworks.push('angular');
    } catch {
      // No package.json
    }

    // Check for pyproject.toml (Python)
    try {
      const pyproject = await fs.readFile(
        path.join(projectPath, 'pyproject.toml'),
        'utf-8'
      );
      detection.language = 'python';
      detection.configFiles.push('pyproject.toml');

      // Simple TOML parsing for dependencies
      if (pyproject.includes('fastapi')) detection.frameworks.push('fastapi');
      if (pyproject.includes('django')) detection.frameworks.push('django');
      if (pyproject.includes('flask')) detection.frameworks.push('flask');
      if (pyproject.includes('starlette')) detection.frameworks.push('starlette');
      if (pyproject.includes('pydantic')) detection.frameworks.push('pydantic');
      if (pyproject.includes('sqlalchemy')) detection.frameworks.push('sqlalchemy');
    } catch {
      // No pyproject.toml
    }

    // Check for requirements.txt (Python fallback)
    try {
      const requirements = await fs.readFile(
        path.join(projectPath, 'requirements.txt'),
        'utf-8'
      );
      if (detection.language === 'unknown') detection.language = 'python';
      detection.configFiles.push('requirements.txt');

      if (requirements.includes('fastapi')) detection.frameworks.push('fastapi');
      if (requirements.includes('django')) detection.frameworks.push('django');
      if (requirements.includes('flask')) detection.frameworks.push('flask');
    } catch {
      // No requirements.txt
    }

    // Check for go.mod (Go)
    try {
      const goMod = await fs.readFile(path.join(projectPath, 'go.mod'), 'utf-8');
      detection.language = 'go';
      detection.configFiles.push('go.mod');

      if (goMod.includes('gin-gonic')) detection.frameworks.push('gin');
      if (goMod.includes('echo')) detection.frameworks.push('echo');
      if (goMod.includes('fiber')) detection.frameworks.push('fiber');
    } catch {
      // No go.mod
    }

    // Check for Cargo.toml (Rust)
    try {
      const cargoToml = await fs.readFile(
        path.join(projectPath, 'Cargo.toml'),
        'utf-8'
      );
      detection.language = 'rust';
      detection.configFiles.push('Cargo.toml');

      if (cargoToml.includes('actix')) detection.frameworks.push('actix');
      if (cargoToml.includes('axum')) detection.frameworks.push('axum');
      if (cargoToml.includes('rocket')) detection.frameworks.push('rocket');
    } catch {
      // No Cargo.toml
    }

    // Dedupe frameworks
    detection.frameworks = [...new Set(detection.frameworks)];

    return detection;
  }

  /**
   * Bootstrap schemas for a project - generate if none exist.
   */
  async bootstrapSchemas(projectPath: string): Promise<GraphSchema[]> {
    // Detect what we're working with
    const detection = await this.detectFrameworks(projectPath);

    if (detection.language === 'unknown') {
      console.error('Could not detect project language');
      return [];
    }

    // Check if we already have schemas for these frameworks
    const existingSchemas = await this.store.findSchemasForFrameworks([
      detection.language,
      ...detection.frameworks,
    ]);

    if (existingSchemas.length > 0) {
      console.log(
        `Found ${existingSchemas.length} existing schemas for ${detection.frameworks.join(', ')}`
      );
      return existingSchemas;
    }

    // No schemas - generate with LLM
    console.log(
      `No schemas found. Generating for ${detection.language} with ${detection.frameworks.join(', ')}...`
    );

    const schemas: GraphSchema[] = [];

    // Generate base language schema
    const baseSchema = await this.generateBaseSchema(detection.language);
    const savedBase = await this.store.createSchema(baseSchema.schema);
    for (const pattern of baseSchema.patterns) {
      await this.store.createPattern({ ...pattern, schema_id: savedBase.id });
    }
    schemas.push(savedBase);

    // Generate framework-specific schemas
    for (const framework of detection.frameworks) {
      const frameworkSchema = await this.generateFrameworkSchema(
        detection.language,
        framework
      );
      const savedFramework = await this.store.createSchema(frameworkSchema.schema);
      for (const pattern of frameworkSchema.patterns) {
        await this.store.createPattern({ ...pattern, schema_id: savedFramework.id });
      }
      schemas.push(savedFramework);
    }

    return schemas;
  }

  /**
   * Generate a base language schema using Claude Opus.
   */
  async generateBaseSchema(language: string): Promise<GeneratedSchema> {
    const prompt = this.buildBaseSchemaPrompt(language);
    const response = await this.callLLM(this.config.claudeOpus, prompt);
    return this.parseSchemaResponse(response, language);
  }

  /**
   * Generate a framework-specific schema using Claude Opus.
   */
  async generateFrameworkSchema(
    language: string,
    framework: string
  ): Promise<GeneratedSchema> {
    const prompt = this.buildFrameworkSchemaPrompt(language, framework);
    const response = await this.callLLM(this.config.claudeOpus, prompt);
    return this.parseSchemaResponse(response, language, framework);
  }

  /**
   * Evolve a pattern based on verification feedback.
   */
  async evolvePattern(
    patternId: string,
    corrections: Array<{ original: string; corrected: string; context: string }>
  ): Promise<GraphPattern | null> {
    // First try with Groq (fast, cheap)
    const groqPrompt = this.buildPatternEvolutionPrompt(corrections);
    let response = await this.callLLM(this.config.groq, groqPrompt);
    let parsed = this.parseEvolutionResponse(response);

    // Escalate if confidence is low
    if (parsed.confidence < this.config.escalateToSonnetConfidence) {
      console.log('Escalating to Claude Sonnet for pattern evolution...');
      response = await this.callLLM(this.config.claudeSonnet, groqPrompt);
      parsed = this.parseEvolutionResponse(response);
    }

    if (parsed.confidence < this.config.escalateToOpusConfidence) {
      console.log('Escalating to Claude Opus for pattern evolution...');
      response = await this.callLLM(this.config.claudeOpus, groqPrompt);
      parsed = this.parseEvolutionResponse(response);
    }

    if (!parsed.newRegex) {
      console.log('Could not generate improved pattern');
      return null;
    }

    // Create evolved pattern
    return this.store.evolvePattern(
      patternId,
      { regex: parsed.newRegex },
      parsed.evolvedBy,
      parsed.reason
    );
  }

  /**
   * Run evolution cycle on patterns that need improvement.
   */
  async runEvolutionCycle(): Promise<number> {
    const patternsToEvolve = await this.store.getPatternsNeedingEvolution(
      this.config.correctionRateThreshold,
      this.config.rejectionRateThreshold,
      this.config.minSamplesForEvolution
    );

    console.log(`Found ${patternsToEvolve.length} patterns needing evolution`);

    let evolved = 0;
    for (const pattern of patternsToEvolve) {
      // For now, just log - in real implementation, we'd gather correction examples
      console.log(
        `Pattern ${pattern.name}: ${pattern.trust.accuracy.toFixed(2)} accuracy`
      );
      evolved++;
    }

    return evolved;
  }

  // Prompt builders

  private buildBaseSchemaPrompt(language: string): string {
    return `<task>Generate extraction schema for ${language}</task>

<instructions>
Create a comprehensive extraction schema for ${language} source code.
The schema should extract:
1. Classes/structs with inheritance
2. Functions/methods with parameters and return types
3. Import/require statements
4. Module-level variables and constants
5. Decorators/annotations

For each extraction pattern, provide:
- A regex that works with multiline flag
- Named capture groups for key data
- A node template defining the extracted type

Use standard ${language} conventions and common patterns.
</instructions>

<response_format>
<schema>
  <name>base-${language}</name>
  <version>1.0.0</version>
  <description>Base ${language} extraction patterns</description>
</schema>

<patterns>
  <pattern>
    <name>pattern_name</name>
    <description>What this pattern extracts</description>
    <regex>the_regex_pattern</regex>
    <flags>gm</flags>
    <captures>
      <capture name="name" group="1" />
      <capture name="params" group="2" default="" />
    </captures>
    <node_template type="Function" name_from="name">
      <property name="parameters" from="params" />
    </node_template>
  </pattern>
  <!-- more patterns -->
</patterns>
</response_format>`;
  }

  private buildFrameworkSchemaPrompt(language: string, framework: string): string {
    return `<task>Generate extraction schema for ${framework} (${language})</task>

<instructions>
Create an extraction schema specifically for ${framework} framework patterns.
Focus on framework-specific constructs:
- Route definitions / endpoints
- Middleware / interceptors
- Models / schemas
- Dependency injection
- Configuration patterns
- Testing utilities

For each pattern, consider:
- Common ${framework} idioms and conventions
- Decorator/annotation patterns used
- File naming conventions
- Common import patterns

Do NOT duplicate base ${language} patterns (classes, functions) - only add ${framework}-specific patterns.
</instructions>

<response_format>
<schema>
  <name>${framework}</name>
  <version>1.0.0</version>
  <framework>${framework}</framework>
  <description>${framework} framework extraction patterns</description>
  <detection>
    <dependency>${framework}</dependency>
  </detection>
</schema>

<patterns>
  <pattern>
    <name>pattern_name</name>
    <description>What this pattern extracts</description>
    <regex>the_regex_pattern</regex>
    <flags>gm</flags>
    <captures>
      <capture name="name" group="1" />
    </captures>
    <node_template type="APIEndpoint" name_from="name">
      <property name="framework" value="${framework}" />
    </node_template>
    <verification_prompt>Prompt for LLM to verify this extraction</verification_prompt>
  </pattern>
</patterns>
</response_format>`;
  }

  private buildPatternEvolutionPrompt(
    corrections: Array<{ original: string; corrected: string; context: string }>
  ): string {
    const examples = corrections
      .slice(0, 5)
      .map(
        (c, i) => `
Example ${i + 1}:
  Original: ${c.original}
  Corrected: ${c.corrected}
  Context: ${c.context}
`
      )
      .join('\n');

    return `<task>Improve extraction pattern based on corrections</task>

<corrections>
${examples}
</corrections>

<instructions>
Analyze the corrections above and suggest an improved regex pattern.
The corrections show what the current pattern extracted vs. what it should have extracted.

Consider:
1. Why did the original pattern fail?
2. What pattern change would fix these cases?
3. Will the change break existing correct extractions?

Keep changes minimal - only fix the identified issues.
</instructions>

<response_format>
<evolution>
  <new_regex>improved_regex_here</new_regex>
  <confidence>0.0-1.0</confidence>
  <reason>Why this change fixes the issues</reason>
  <test_cases>
    <case input="..." expected="..." />
  </test_cases>
</evolution>
</response_format>`;
  }

  // API callers

  private async callLLM(provider: LLMProvider, prompt: string): Promise<string> {
    if (provider.name === 'groq') {
      return this.callGroq(provider, prompt);
    } else if (provider.name.startsWith('claude')) {
      return this.callAnthropic(provider, prompt);
    } else if (provider.name === 'ollama') {
      return this.callOllama(provider, prompt);
    }
    throw new Error(`Unknown provider: ${provider.name}`);
  }

  private async callGroq(provider: LLMProvider, prompt: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || '';
  }

  private async callAnthropic(provider: LLMProvider, prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
    };
    return data.content[0]?.text || '';
  }

  private async callOllama(provider: LLMProvider, prompt: string): Promise<string> {
    const baseUrl = provider.baseUrl || 'http://localhost:11434';
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  // Response parsers

  private parseSchemaResponse(
    response: string,
    language: string,
    framework?: string
  ): GeneratedSchema {
    // Parse XML-like response
    const nameMatch = response.match(/<name>([^<]+)<\/name>/);
    const versionMatch = response.match(/<version>([^<]+)<\/version>/);
    const descMatch = response.match(/<description>([^<]+)<\/description>/);

    const schema: Omit<GraphSchema, 'id'> = {
      name: nameMatch?.[1] || `base-${language}`,
      version: versionMatch?.[1] || '1.0.0',
      language,
      framework,
      description: descMatch?.[1] || `Auto-generated schema for ${framework || language}`,
      detection: {
        dependencies: framework ? [framework] : [],
        files: [],
        content_patterns: [],
      },
      trust: {
        level: 'low',
        accuracy: 0,
        extractions_total: 0,
        last_evolved: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      created_by: 'bootstrap',
    };

    // Parse patterns
    const patterns: Array<Omit<GraphPattern, 'id' | 'schema_id'>> = [];
    const patternMatches = response.matchAll(/<pattern>([\s\S]*?)<\/pattern>/g);

    for (const match of patternMatches) {
      const patternXml = match[1];
      if (!patternXml) continue;

      const patternName = patternXml.match(/<name>([^<]+)<\/name>/)?.[1] || 'unnamed';
      const patternDesc = patternXml.match(/<description>([^<]+)<\/description>/)?.[1] || '';
      const regex = patternXml.match(/<regex>([^<]+)<\/regex>/)?.[1] || '';
      const flags = patternXml.match(/<flags>([^<]+)<\/flags>/)?.[1] || 'gm';

      if (regex) {
        patterns.push({
          name: patternName,
          description: patternDesc,
          regex,
          flags,
          captures: {}, // Would parse from XML in full implementation
          trust: {
            accuracy: 0,
            extractions: 0,
            corrections: 0,
            rejections: 0,
          },
          version: 1,
        });
      }
    }

    return { schema, patterns };
  }

  private parseEvolutionResponse(response: string): {
    newRegex: string | null;
    confidence: number;
    reason: string;
    evolvedBy: GraphPattern['evolved_by'];
  } {
    const regexMatch = response.match(/<new_regex>([^<]+)<\/new_regex>/);
    const confidenceMatch = response.match(/<confidence>([\d.]+)<\/confidence>/);
    const reasonMatch = response.match(/<reason>([^<]+)<\/reason>/);

    return {
      newRegex: regexMatch?.[1] || null,
      confidence: confidenceMatch?.[1] ? parseFloat(confidenceMatch[1]) : 0.5,
      reason: reasonMatch?.[1] || 'No reason provided',
      evolvedBy: 'groq', // Would determine from which LLM was used
    };
  }
}
