/**
 * ExternalKnowledgeClient - Query external sources for framework documentation.
 *
 * Used when semantic memory doesn't have enough context about a framework.
 * Results are cached and fed back into semantic memory for future use.
 *
 * Sources:
 * - Context7: Library-specific documentation and patterns
 * - Web Search: General framework tutorials and guides
 * - Package Registry: npm/pypi metadata and type definitions
 */

import {
  Context7Result,
  WebSearchResult,
  PackageInfo,
  ExternalKnowledgeResult,
} from './types';

export interface ExternalKnowledgeClientConfig {
  /** Context7 API endpoint */
  context7Endpoint?: string;
  /** Context7 API key */
  context7ApiKey?: string;
  /** Web search endpoint (SearXNG, etc.) */
  webSearchEndpoint?: string;
  /** npm registry endpoint */
  npmRegistryEndpoint: string;
  /** PyPI registry endpoint */
  pypiRegistryEndpoint: string;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Maximum results from web search */
  maxWebResults: number;
  /** Whether to actually call external services (false for testing) */
  enableExternalCalls: boolean;
}

const DEFAULT_CONFIG: ExternalKnowledgeClientConfig = {
  npmRegistryEndpoint: 'https://registry.npmjs.org',
  pypiRegistryEndpoint: 'https://pypi.org/pypi',
  timeoutMs: 5000,
  maxWebResults: 3,
  enableExternalCalls: false, // Disabled by default for safety
};

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class ExternalKnowledgeClient {
  private config: ExternalKnowledgeClientConfig;
  private cache: Map<string, CacheEntry<ExternalKnowledgeResult[]>> = new Map();
  private cacheTtlMs: number = 3600000; // 1 hour

  constructor(config: Partial<ExternalKnowledgeClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Query all available external sources for framework knowledge.
   */
  async queryAll(
    framework: string,
    language: string
  ): Promise<ExternalKnowledgeResult[]> {
    // Check cache first
    const cacheKey = `${framework}:${language}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const results: ExternalKnowledgeResult[] = [];

    // Query Context7 if available
    if (this.config.context7Endpoint) {
      const context7Result = await this.queryContext7(framework);
      if (context7Result) {
        results.push({
          source: 'context7',
          content: this.formatContext7Content(context7Result),
          confidence: 0.8,
          reference: `context7://${framework}`,
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    // Query package registry
    const registry = language === 'python' ? 'pypi' : 'npm';
    const packageInfo = await this.queryPackageRegistry(framework, registry);
    if (packageInfo) {
      results.push({
        source: 'package_registry',
        content: this.formatPackageContent(packageInfo),
        confidence: 0.7,
        reference: packageInfo.homepage || packageInfo.repository,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Query web search as fallback
    if (results.length === 0 && this.config.webSearchEndpoint) {
      const webResults = await this.searchWeb(`${framework} ${language} documentation patterns`);
      for (const result of webResults.slice(0, 2)) {
        results.push({
          source: 'web_search',
          content: result.snippet,
          confidence: result.relevance * 0.6, // Lower confidence for web results
          reference: result.url,
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    // Cache results
    if (results.length > 0) {
      this.setCache(cacheKey, results);
    }

    return results;
  }

  /**
   * Query Context7 for library documentation.
   */
  async queryContext7(
    library: string,
    version?: string,
    topic?: string
  ): Promise<Context7Result | null> {
    if (!this.config.context7Endpoint || !this.config.enableExternalCalls) {
      return null;
    }

    try {
      const params = new URLSearchParams({ library });
      if (version) params.set('version', version);
      if (topic) params.set('topic', topic);

      const response = await fetch(
        `${this.config.context7Endpoint}/query?${params}`,
        {
          headers: this.config.context7ApiKey
            ? { Authorization: `Bearer ${this.config.context7ApiKey}` }
            : {},
          signal: AbortSignal.timeout(this.config.timeoutMs),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        library: (data.library as string) || library,
        version: (data.version as string) || 'latest',
        documentation: (data.documentation as string) || '',
        patterns: (data.patterns as string[]) || [],
        apis: data.apis as string[] | undefined,
      };
    } catch (error) {
      console.warn(`Context7 query failed for ${library}:`, error);
      return null;
    }
  }

  /**
   * Search the web for framework documentation.
   */
  async searchWeb(
    query: string,
    options: {
      domainFilter?: string[];
      maxResults?: number;
    } = {}
  ): Promise<WebSearchResult[]> {
    if (!this.config.webSearchEndpoint || !this.config.enableExternalCalls) {
      return [];
    }

    const maxResults = options.maxResults || this.config.maxWebResults;

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: String(maxResults),
      });

      if (options.domainFilter?.length) {
        params.set('domains', options.domainFilter.join(','));
      }

      const response = await fetch(
        `${this.config.webSearchEndpoint}/search?${params}`,
        {
          signal: AbortSignal.timeout(this.config.timeoutMs),
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { results?: Record<string, unknown>[] };
      return (data.results || []).map((r) => ({
        url: r.url as string,
        title: r.title as string,
        snippet: (r.content as string) || (r.snippet as string) || '',
        relevance: (r.score as number) || 0.5,
      }));
    } catch (error) {
      console.warn(`Web search failed for "${query}":`, error);
      return [];
    }
  }

  /**
   * Query package registry for metadata.
   */
  async queryPackageRegistry(
    packageName: string,
    registry: 'npm' | 'pypi'
  ): Promise<PackageInfo | null> {
    if (!this.config.enableExternalCalls) {
      // Return mock data for common packages in test mode
      return this.getMockPackageInfo(packageName);
    }

    try {
      if (registry === 'npm') {
        return await this.queryNpm(packageName);
      } else {
        return await this.queryPypi(packageName);
      }
    } catch (error) {
      console.warn(`Package registry query failed for ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Query npm registry.
   */
  private async queryNpm(packageName: string): Promise<PackageInfo | null> {
    const response = await fetch(
      `${this.config.npmRegistryEndpoint}/${encodeURIComponent(packageName)}`,
      {
        signal: AbortSignal.timeout(this.config.timeoutMs),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    const distTags = data['dist-tags'] as Record<string, string> | undefined;
    const latest = distTags?.latest;
    const versions = data.versions as Record<string, Record<string, unknown>> | undefined;
    const versionData = latest && versions ? versions[latest] : null;
    const repository = data.repository as Record<string, string> | undefined;

    return {
      name: data.name as string,
      description: (data.description as string) || '',
      version: latest || 'unknown',
      homepage: data.homepage as string | undefined,
      repository: repository?.url?.replace(/^git\+/, '').replace(/\.git$/, ''),
      types: (versionData?.types as string) || (versionData?.typings as string),
      keywords: (data.keywords as string[]) || [],
    };
  }

  /**
   * Query PyPI registry.
   */
  private async queryPypi(packageName: string): Promise<PackageInfo | null> {
    const response = await fetch(
      `${this.config.pypiRegistryEndpoint}/${encodeURIComponent(packageName)}/json`,
      {
        signal: AbortSignal.timeout(this.config.timeoutMs),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { info: Record<string, unknown> };
    const info = data.info;
    const projectUrls = info.project_urls as Record<string, string> | undefined;
    const keywordsStr = info.keywords as string | undefined;

    return {
      name: info.name as string,
      description: (info.summary as string) || '',
      version: info.version as string,
      homepage: (info.home_page as string) || projectUrls?.Homepage,
      repository: projectUrls?.Repository || projectUrls?.Source,
      keywords: keywordsStr?.split(',').map((k) => k.trim()) || [],
    };
  }

  /**
   * Get mock package info for testing.
   */
  private getMockPackageInfo(packageName: string): PackageInfo | null {
    const mockPackages: Record<string, PackageInfo> = {
      '@nestjs/common': {
        name: '@nestjs/common',
        description: 'Nest - modern, fast, powerful node.js web framework',
        version: '10.0.0',
        homepage: 'https://nestjs.com',
        repository: 'https://github.com/nestjs/nest',
        types: '@types/nestjs__common',
        keywords: ['nest', 'framework', 'typescript', 'decorator'],
      },
      express: {
        name: 'express',
        description: 'Fast, unopinionated, minimalist web framework for node.',
        version: '4.18.2',
        homepage: 'https://expressjs.com',
        repository: 'https://github.com/expressjs/express',
        types: '@types/express',
        keywords: ['express', 'framework', 'web', 'rest', 'api'],
      },
      fastapi: {
        name: 'fastapi',
        description: 'FastAPI framework, high performance, easy to learn',
        version: '0.104.0',
        homepage: 'https://fastapi.tiangolo.com',
        repository: 'https://github.com/tiangolo/fastapi',
        keywords: ['fastapi', 'api', 'async', 'pydantic'],
      },
      prisma: {
        name: '@prisma/client',
        description: 'Prisma Client - Auto-generated query builder for Node.js & TypeScript',
        version: '5.0.0',
        homepage: 'https://prisma.io',
        repository: 'https://github.com/prisma/prisma',
        keywords: ['prisma', 'orm', 'database', 'typescript'],
      },
    };

    return mockPackages[packageName] || null;
  }

  /**
   * Format Context7 result into readable content.
   */
  private formatContext7Content(result: Context7Result): string {
    let content = `Library: ${result.library} v${result.version}\n\n`;

    if (result.documentation) {
      content += `Documentation:\n${result.documentation}\n\n`;
    }

    if (result.patterns.length > 0) {
      content += `Common Patterns:\n${result.patterns.map((p) => `- ${p}`).join('\n')}\n\n`;
    }

    if (result.apis?.length) {
      content += `APIs:\n${result.apis.slice(0, 10).map((a) => `- ${a}`).join('\n')}\n`;
    }

    return content;
  }

  /**
   * Format package info into readable content.
   */
  private formatPackageContent(info: PackageInfo): string {
    let content = `Package: ${info.name} v${info.version}\n`;
    content += `Description: ${info.description}\n`;

    if (info.homepage) {
      content += `Homepage: ${info.homepage}\n`;
    }

    if (info.keywords.length > 0) {
      content += `Keywords: ${info.keywords.join(', ')}\n`;
    }

    return content;
  }

  /**
   * Get from cache if not expired.
   */
  private getFromCache(key: string): ExternalKnowledgeResult[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry.
   */
  private setCache(key: string, data: ExternalKnowledgeResult[]): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set cache TTL.
   */
  setCacheTtl(ttlMs: number): void {
    this.cacheTtlMs = ttlMs;
  }

  /**
   * Enable or disable external calls.
   */
  setEnableExternalCalls(enabled: boolean): void {
    this.config.enableExternalCalls = enabled;
  }
}
