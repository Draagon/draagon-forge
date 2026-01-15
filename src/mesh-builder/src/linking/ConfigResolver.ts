/**
 * ConfigResolver - Resolve configuration values from various sources.
 *
 * Supports:
 * - .env files
 * - docker-compose.yml
 * - terraform files
 * - config.json/yaml files
 * - Environment variable references
 *
 * Used to resolve actual values for queue names, API URLs, database
 * connections, etc. to enable cross-project linking.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ResolvedConfig {
  /** Resolved value */
  value: string;
  /** Source file */
  source: string;
  /** How the value was resolved */
  method: 'env' | 'docker-compose' | 'terraform' | 'config' | 'literal';
  /** Confidence in the resolution */
  confidence: number;
}

export interface ConfigResolverOptions {
  /** Project root path */
  projectPath: string;
  /** Additional paths to search for config files */
  additionalPaths?: string[];
  /** Environment name (e.g., 'production', 'development') */
  environment?: string;
}

export class ConfigResolver {
  private envVars: Map<string, string> = new Map();
  private dockerVars: Map<string, string> = new Map();
  private configVars: Map<string, string> = new Map();
  private loaded = false;

  constructor(private options: ConfigResolverOptions) {}

  /**
   * Load configuration from all sources.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    await Promise.all([
      this.loadEnvFiles(),
      this.loadDockerCompose(),
      this.loadConfigFiles(),
    ]);

    this.loaded = true;
  }

  /**
   * Resolve a value that may contain variable references.
   */
  async resolve(value: string): Promise<ResolvedConfig | null> {
    await this.load();

    // Check if it's an environment variable reference
    const envMatch = value.match(/^\$\{?([A-Z_][A-Z0-9_]*)\}?$/);
    if (envMatch) {
      const varName = envMatch[1] ?? '';
      return this.resolveEnvVar(varName);
    }

    // Check if it contains embedded env vars
    if (value.includes('${') || value.includes('$')) {
      return this.resolveEmbeddedVars(value);
    }

    // Return as literal
    return {
      value,
      source: 'literal',
      method: 'literal',
      confidence: 1.0,
    };
  }

  /**
   * Resolve an environment variable.
   */
  private resolveEnvVar(name: string): ResolvedConfig | null {
    // Check env files first
    const envValue = this.envVars.get(name);
    if (envValue) {
      return {
        value: envValue,
        source: '.env',
        method: 'env',
        confidence: 0.9,
      };
    }

    // Check docker-compose
    const dockerValue = this.dockerVars.get(name);
    if (dockerValue) {
      return {
        value: dockerValue,
        source: 'docker-compose.yml',
        method: 'docker-compose',
        confidence: 0.85,
      };
    }

    // Check config files
    const configValue = this.configVars.get(name);
    if (configValue) {
      return {
        value: configValue,
        source: 'config',
        method: 'config',
        confidence: 0.8,
      };
    }

    return null;
  }

  /**
   * Resolve a value with embedded variable references.
   */
  private async resolveEmbeddedVars(value: string): Promise<ResolvedConfig | null> {
    let resolved = value;
    let source = 'multiple';
    let minConfidence = 1.0;

    // Replace ${VAR} patterns
    const varPattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
    let match;
    while ((match = varPattern.exec(value)) !== null) {
      const varName = match[1] ?? '';
      const resolvedVar = this.resolveEnvVar(varName);
      if (resolvedVar) {
        resolved = resolved.replace(match[0], resolvedVar.value);
        minConfidence = Math.min(minConfidence, resolvedVar.confidence);
        source = resolvedVar.source;
      }
    }

    // Replace $VAR patterns
    const simpleVarPattern = /\$([A-Z_][A-Z0-9_]*)/g;
    while ((match = simpleVarPattern.exec(value)) !== null) {
      const varName = match[1] ?? '';
      const resolvedVar = this.resolveEnvVar(varName);
      if (resolvedVar) {
        resolved = resolved.replace(match[0], resolvedVar.value);
        minConfidence = Math.min(minConfidence, resolvedVar.confidence);
      }
    }

    if (resolved !== value) {
      return {
        value: resolved,
        source,
        method: 'env',
        confidence: minConfidence,
      };
    }

    return null;
  }

  /**
   * Load .env files.
   */
  private async loadEnvFiles(): Promise<void> {
    const envFiles = [
      '.env',
      '.env.local',
      `.env.${this.options.environment || 'development'}`,
    ];

    for (const filename of envFiles) {
      const filePath = path.join(this.options.projectPath, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        this.parseEnvFile(content);
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  /**
   * Parse .env file content.
   */
  private parseEnvFile(content: string): void {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      this.envVars.set(key, value);
    }
  }

  /**
   * Load docker-compose.yml.
   */
  private async loadDockerCompose(): Promise<void> {
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.yaml',
      `docker-compose.${this.options.environment || 'development'}.yml`,
    ];

    for (const filename of composeFiles) {
      const filePath = path.join(this.options.projectPath, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        this.parseDockerCompose(content);
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  /**
   * Parse docker-compose.yml content.
   */
  private parseDockerCompose(content: string): void {
    try {
      const compose = yaml.load(content) as Record<string, unknown>;
      if (!compose) return;

      // Extract environment variables from services
      const services = compose['services'] as Record<string, unknown>;
      if (services) {
        for (const service of Object.values(services)) {
          const svc = service as Record<string, unknown>;
          const env = svc['environment'];

          if (Array.isArray(env)) {
            // Array format: - VAR=value
            for (const item of env) {
              if (typeof item === 'string') {
                const eqIndex = item.indexOf('=');
                if (eqIndex > 0) {
                  const key = item.substring(0, eqIndex);
                  const value = item.substring(eqIndex + 1);
                  this.dockerVars.set(key, value);
                }
              }
            }
          } else if (env && typeof env === 'object') {
            // Object format: VAR: value
            for (const [key, value] of Object.entries(env)) {
              if (typeof value === 'string') {
                this.dockerVars.set(key, value);
              }
            }
          }
        }
      }
    } catch {
      // Invalid YAML, skip
    }
  }

  /**
   * Load config files (JSON/YAML).
   */
  private async loadConfigFiles(): Promise<void> {
    const configFiles = [
      'config.json',
      'config.yaml',
      'config.yml',
      `config.${this.options.environment || 'development'}.json`,
      `config.${this.options.environment || 'development'}.yaml`,
    ];

    for (const filename of configFiles) {
      const filePath = path.join(this.options.projectPath, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        this.parseConfigFile(content, filename);
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  /**
   * Parse config file content.
   */
  private parseConfigFile(content: string, filename: string): void {
    try {
      let config: Record<string, unknown>;

      if (filename.endsWith('.json')) {
        config = JSON.parse(content);
      } else {
        config = yaml.load(content) as Record<string, unknown>;
      }

      if (!config) return;

      // Flatten config to key-value pairs
      this.flattenConfig(config, '');
    } catch {
      // Invalid file, skip
    }
  }

  /**
   * Flatten nested config to key-value pairs.
   */
  private flattenConfig(obj: Record<string, unknown>, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        this.configVars.set(fullKey, value);
        // Also set without prefix for simple lookup
        this.configVars.set(key, value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        this.configVars.set(fullKey, String(value));
        this.configVars.set(key, String(value));
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenConfig(value as Record<string, unknown>, fullKey);
      }
    }
  }

  /**
   * Get all resolved variables.
   */
  getAllVariables(): Map<string, ResolvedConfig> {
    const all = new Map<string, ResolvedConfig>();

    for (const [key, value] of this.envVars) {
      all.set(key, { value, source: '.env', method: 'env', confidence: 0.9 });
    }

    for (const [key, value] of this.dockerVars) {
      if (!all.has(key)) {
        all.set(key, { value, source: 'docker-compose.yml', method: 'docker-compose', confidence: 0.85 });
      }
    }

    for (const [key, value] of this.configVars) {
      if (!all.has(key)) {
        all.set(key, { value, source: 'config', method: 'config', confidence: 0.8 });
      }
    }

    return all;
  }
}
