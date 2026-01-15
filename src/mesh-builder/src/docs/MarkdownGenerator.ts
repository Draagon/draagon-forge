/**
 * MarkdownGenerator - Generate Markdown documentation from mesh data.
 *
 * Creates human-readable documentation including:
 * - API reference
 * - Function documentation
 * - Class documentation
 * - Architecture overview
 */

import { DocQueryBuilder, ApiDocData, FunctionDocData, ClassDocData } from './DocQueryBuilder';
import { ProjectExtractionResult } from '../types';

export interface MarkdownConfig {
  /** Project name for the title */
  projectName: string;
  /** Include table of contents */
  includeTOC: boolean;
  /** Include source links */
  includeSourceLinks: boolean;
  /** Base URL for source links */
  sourceBaseUrl?: string;
  /** Include mermaid diagrams */
  includeDiagrams: boolean;
}

const DEFAULT_CONFIG: MarkdownConfig = {
  projectName: 'Project',
  includeTOC: true,
  includeSourceLinks: true,
  includeDiagrams: true,
};

export class MarkdownGenerator {
  private config: MarkdownConfig;
  private queryBuilder: DocQueryBuilder;
  private result: ProjectExtractionResult;

  constructor(
    extractionResult: ProjectExtractionResult,
    config: Partial<MarkdownConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queryBuilder = new DocQueryBuilder(extractionResult);
    this.result = extractionResult;
  }

  /**
   * Generate complete documentation.
   */
  generate(): string {
    const sections: string[] = [];

    // Title
    sections.push(`# ${this.config.projectName} Documentation`);
    sections.push('');
    sections.push(`> Auto-generated from code knowledge mesh on ${new Date().toISOString()}`);
    sections.push('');

    // Table of contents
    if (this.config.includeTOC) {
      sections.push(this.generateTOC());
    }

    // Overview
    sections.push(this.generateOverview());

    // API Reference
    sections.push(this.generateAPIReference());

    // Classes
    sections.push(this.generateClassReference());

    // Functions
    sections.push(this.generateFunctionReference());

    return sections.join('\n');
  }

  /**
   * Generate API documentation only.
   */
  generateAPIDoc(): string {
    const sections: string[] = [];
    sections.push(`# ${this.config.projectName} API Reference`);
    sections.push('');
    sections.push(this.generateAPIReference());
    return sections.join('\n');
  }

  /**
   * Generate table of contents.
   */
  private generateTOC(): string {
    const lines: string[] = [];
    lines.push('## Table of Contents');
    lines.push('');
    lines.push('- [Overview](#overview)');
    lines.push('- [API Reference](#api-reference)');
    lines.push('- [Classes](#classes)');
    lines.push('- [Functions](#functions)');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate project overview.
   */
  private generateOverview(): string {
    const lines: string[] = [];
    const stats = this.result.statistics;

    lines.push('## Overview');
    lines.push('');
    lines.push('### Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Files Processed | ${stats.files_processed} |`);
    lines.push(`| Total Nodes | ${stats.total_nodes} |`);
    lines.push(`| Total Edges | ${stats.total_edges} |`);
    lines.push(`| Extraction Time | ${stats.extraction_time_ms}ms |`);
    lines.push('');

    // Add diagram if enabled
    if (this.config.includeDiagrams) {
      lines.push('### Architecture Overview');
      lines.push('');
      lines.push('```mermaid');
      lines.push(this.generateArchitectureDiagram());
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate architecture diagram in Mermaid.
   */
  private generateArchitectureDiagram(): string {
    const endpoints = this.queryBuilder.getApiEndpoints();
    const classes = this.queryBuilder.getClasses();

    const lines: string[] = [];
    lines.push('graph TD');

    // Add API endpoints
    const uniquePaths = new Set(
      endpoints.map((e) => e.path.split('/')[1]).filter((p): p is string => Boolean(p))
    );
    for (const path of Array.from(uniquePaths).slice(0, 10)) {
      lines.push(`    API_${this.sanitizeId(path)}[/${path}]`);
    }

    // Add main classes
    for (const cls of classes.slice(0, 10)) {
      lines.push(`    ${this.sanitizeId(cls.name)}[${cls.name}]`);
    }

    // Add some relationships
    const deps = this.queryBuilder.getDependencies();
    const addedEdges = new Set<string>();
    for (const dep of deps.slice(0, 20)) {
      const edgeKey = `${dep.source}-${dep.target}`;
      if (!addedEdges.has(edgeKey)) {
        lines.push(`    ${this.sanitizeId(dep.source)} --> ${this.sanitizeId(dep.target)}`);
        addedEdges.add(edgeKey);
      }
    }

    return lines.join('\n');
  }

  /**
   * Sanitize identifier for Mermaid.
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
  }

  /**
   * Generate API reference section.
   */
  private generateAPIReference(): string {
    const endpoints = this.queryBuilder.getApiEndpoints();
    if (endpoints.length === 0) return '';

    const lines: string[] = [];
    lines.push('## API Reference');
    lines.push('');

    // Group by path prefix
    const grouped = this.groupEndpointsByPrefix(endpoints);

    for (const [prefix, prefixEndpoints] of grouped) {
      lines.push(`### ${prefix || 'Root'}`);
      lines.push('');

      for (const endpoint of prefixEndpoints) {
        lines.push(this.formatEndpoint(endpoint));
      }
    }

    return lines.join('\n');
  }

  /**
   * Group endpoints by path prefix.
   */
  private groupEndpointsByPrefix(endpoints: ApiDocData[]): Map<string, ApiDocData[]> {
    const groups = new Map<string, ApiDocData[]>();

    for (const endpoint of endpoints) {
      const parts = endpoint.path.split('/').filter(Boolean);
      const prefix = parts[0] || '';
      const existing = groups.get(prefix) || [];
      existing.push(endpoint);
      groups.set(prefix, existing);
    }

    return groups;
  }

  /**
   * Format a single endpoint.
   */
  private formatEndpoint(endpoint: ApiDocData): string {
    const lines: string[] = [];

    // Method and path
    const methodBadge = this.getMethodBadge(endpoint.method);
    lines.push(`#### ${methodBadge} \`${endpoint.path}\``);
    lines.push('');

    // Description
    if (endpoint.description) {
      lines.push(endpoint.description);
      lines.push('');
    }

    // Source link
    if (this.config.includeSourceLinks) {
      const link = this.buildSourceLink(endpoint.file, endpoint.line);
      lines.push(`📍 [${endpoint.file}:${endpoint.line}](${link})`);
      lines.push('');
    }

    // Parameters
    if (endpoint.parameters.length > 0) {
      lines.push('**Parameters:**');
      lines.push('');
      lines.push('| Name | Type | Location | Required | Description |');
      lines.push('|------|------|----------|----------|-------------|');
      for (const param of endpoint.parameters) {
        const required = param.required ? '✓' : '';
        lines.push(
          `| \`${param.name}\` | ${param.type} | ${param.location} | ${required} | ${param.description || ''} |`
        );
      }
      lines.push('');
    }

    // Responses
    if (endpoint.responses.length > 0) {
      lines.push('**Responses:**');
      lines.push('');
      for (const response of endpoint.responses) {
        lines.push(`- **${response.status}**: ${response.description || ''}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get method badge.
   */
  private getMethodBadge(method: string): string {
    const badges: Record<string, string> = {
      GET: '🟢 GET',
      POST: '🟡 POST',
      PUT: '🟠 PUT',
      PATCH: '🟣 PATCH',
      DELETE: '🔴 DELETE',
    };
    return badges[method] || method;
  }

  /**
   * Build source link.
   */
  private buildSourceLink(file: string, line: number): string {
    if (this.config.sourceBaseUrl) {
      return `${this.config.sourceBaseUrl}/${file}#L${line}`;
    }
    return `${file}#L${line}`;
  }

  /**
   * Generate class reference section.
   */
  private generateClassReference(): string {
    const classes = this.queryBuilder.getClasses();
    if (classes.length === 0) return '';

    const lines: string[] = [];
    lines.push('## Classes');
    lines.push('');

    for (const cls of classes) {
      lines.push(this.formatClass(cls));
    }

    return lines.join('\n');
  }

  /**
   * Format a single class.
   */
  private formatClass(cls: ClassDocData): string {
    const lines: string[] = [];

    lines.push(`### ${cls.name}`);
    lines.push('');

    // Description
    if (cls.description) {
      lines.push(cls.description);
      lines.push('');
    }

    // Source link
    if (this.config.includeSourceLinks) {
      const link = this.buildSourceLink(cls.file, cls.line);
      lines.push(`📍 [${cls.file}:${cls.line}](${link})`);
      lines.push('');
    }

    // Inheritance
    if (cls.bases.length > 0) {
      lines.push(`**Extends:** ${cls.bases.map((b) => `\`${b}\``).join(', ')}`);
      lines.push('');
    }

    // Methods
    if (cls.methods.length > 0) {
      lines.push('**Methods:**');
      lines.push('');
      for (const method of cls.methods) {
        lines.push(`- \`${method}()\``);
      }
      lines.push('');
    }

    // Properties
    if (cls.properties.length > 0) {
      lines.push('**Properties:**');
      lines.push('');
      for (const prop of cls.properties) {
        lines.push(`- \`${prop}\``);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate function reference section.
   */
  private generateFunctionReference(): string {
    const functions = this.queryBuilder.getFunctions();
    // Only include top-level functions, not methods
    const topLevel = functions.filter((f) => !f.name.includes('.'));

    if (topLevel.length === 0) return '';

    const lines: string[] = [];
    lines.push('## Functions');
    lines.push('');

    // Group by file
    const grouped = this.groupFunctionsByFile(topLevel);

    for (const [file, fileFunctions] of grouped) {
      lines.push(`### ${file}`);
      lines.push('');

      for (const func of fileFunctions) {
        lines.push(this.formatFunction(func));
      }
    }

    return lines.join('\n');
  }

  /**
   * Group functions by file.
   */
  private groupFunctionsByFile(functions: FunctionDocData[]): Map<string, FunctionDocData[]> {
    const groups = new Map<string, FunctionDocData[]>();

    for (const func of functions) {
      const existing = groups.get(func.file) || [];
      existing.push(func);
      groups.set(func.file, existing);
    }

    return groups;
  }

  /**
   * Format a single function.
   */
  private formatFunction(func: FunctionDocData): string {
    const lines: string[] = [];

    // Signature
    const params = func.parameters.join(', ');
    const returnType = func.returnType ? ` -> ${func.returnType}` : '';
    lines.push(`#### \`${func.name}(${params})${returnType}\``);
    lines.push('');

    // Description
    if (func.description) {
      lines.push(func.description);
      lines.push('');
    }

    // Source link
    if (this.config.includeSourceLinks) {
      const link = this.buildSourceLink(func.file, func.line);
      lines.push(`📍 [${func.file}:${func.line}](${link})`);
      lines.push('');
    }

    // Callers
    if (func.callers.length > 0) {
      lines.push(`**Called by:** ${func.callers.slice(0, 5).map((c) => `\`${c}\``).join(', ')}`);
      if (func.callers.length > 5) {
        lines.push(` ... and ${func.callers.length - 5} more`);
      }
      lines.push('');
    }

    // Callees
    if (func.callees.length > 0) {
      lines.push(`**Calls:** ${func.callees.slice(0, 5).map((c) => `\`${c}\``).join(', ')}`);
      if (func.callees.length > 5) {
        lines.push(` ... and ${func.callees.length - 5} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
