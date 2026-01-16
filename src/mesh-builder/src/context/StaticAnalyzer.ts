/**
 * StaticAnalyzer - Fast, local analysis of file and project structure.
 *
 * Parses imports, detects frameworks, reads dependencies from package.json/pyproject.toml.
 * This is the first step in context gathering - fast and free (no AI calls).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ImportInfo,
  DependencyInfo,
  FrameworkDetection,
  StaticAnalysisResult,
  FRAMEWORK_PATTERNS,
  DEPENDENCY_CATEGORIES,
} from './types';
import { SourceFile } from '../types';

export interface StaticAnalyzerConfig {
  /** Project root directory */
  projectRoot: string;
  /** Additional framework patterns to detect */
  additionalPatterns?: Record<string, { imports: string[]; language: string }>;
}

export class StaticAnalyzer {
  private config: StaticAnalyzerConfig;
  private dependencyCache: Map<string, DependencyInfo[]> = new Map();
  private pathAliasCache: Map<string, Record<string, string>> = new Map();

  constructor(config: StaticAnalyzerConfig) {
    this.config = config;
  }

  /**
   * Analyze a source file for imports, frameworks, and dependencies.
   */
  async analyze(file: SourceFile): Promise<StaticAnalysisResult> {
    const startTime = Date.now();

    // Parse imports from the file
    const imports = this.parseImports(file);

    // Load dependencies (cached per project)
    const dependencies = await this.loadDependencies();

    // Detect frameworks based on imports and dependencies
    const frameworks = this.detectFrameworks(imports, dependencies, file.language);

    // Load path aliases from tsconfig/jsconfig
    const pathAliases = await this.loadPathAliases();

    // Detect project type
    const projectType = this.detectProjectType(dependencies);

    return {
      imports,
      dependencies,
      frameworks,
      projectType,
      pathAliases,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Parse import statements from a source file.
   */
  private parseImports(file: SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // TypeScript/JavaScript ES6 imports
      const es6Match = line.match(
        /^import\s+(?:(?:\{([^}]+)\})|(?:(\*\s+as\s+\w+))|(?:(\w+)))\s+from\s+['"]([^'"]+)['"]/
      );
      if (es6Match) {
        const [, namedImports, namespaceImport, defaultImport, modulePath] = es6Match;
        const symbols: string[] = [];

        if (namedImports) {
          symbols.push(
            ...namedImports.split(',').map((s) => s.trim().split(' as ')[0]!.trim())
          );
        }
        if (namespaceImport) {
          symbols.push(namespaceImport.replace('* as ', '').trim());
        }
        if (defaultImport) {
          symbols.push(defaultImport);
        }

        imports.push(this.createImportInfo(modulePath!, symbols, line, lineNum, file.language));
        continue;
      }

      // TypeScript/JavaScript type-only imports
      const typeImportMatch = line.match(
        /^import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/
      );
      if (typeImportMatch) {
        const [, namedTypes, modulePath] = typeImportMatch;
        const symbols = namedTypes!.split(',').map((s) => s.trim());
        imports.push(this.createImportInfo(modulePath!, symbols, line, lineNum, file.language));
        continue;
      }

      // CommonJS require
      const requireMatch = line.match(/(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        const [, destructured, varName, modulePath] = requireMatch;
        const symbols: string[] = [];

        if (destructured) {
          symbols.push(...destructured.split(',').map((s) => s.trim()));
        }
        if (varName) {
          symbols.push(varName);
        }

        imports.push(this.createImportInfo(modulePath!, symbols, line, lineNum, file.language));
        continue;
      }

      // Python imports: import X
      const pythonImportMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
      if (pythonImportMatch && file.language === 'python') {
        const [, modulePath, alias] = pythonImportMatch;
        imports.push(
          this.createImportInfo(modulePath!, alias ? [alias] : [modulePath!], line, lineNum, 'python')
        );
        continue;
      }

      // Python imports: from X import Y
      const pythonFromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
      if (pythonFromMatch && file.language === 'python') {
        const [, modulePath, importsPart] = pythonFromMatch;
        const symbols = importsPart!
          .split(',')
          .map((s) => s.trim().split(' as ')[0]!.trim())
          .filter((s) => s !== '*');

        imports.push(this.createImportInfo(modulePath!, symbols, line, lineNum, 'python'));
        continue;
      }

      // Go imports
      const goImportMatch = line.match(/^\s*(?:import\s+)?"([^"]+)"/);
      if (goImportMatch && file.language === 'go') {
        const [, modulePath] = goImportMatch;
        const packageName = modulePath!.split('/').pop()!;
        imports.push(this.createImportInfo(modulePath!, [packageName], line, lineNum, 'go'));
        continue;
      }

      // Rust use statements
      const rustUseMatch = line.match(/^use\s+([\w:]+)(?:::(\{[^}]+\}|\w+))?/);
      if (rustUseMatch && file.language === 'rust') {
        const [, modulePath, symbolsPart] = rustUseMatch;
        let symbols: string[] = [];

        if (symbolsPart) {
          if (symbolsPart.startsWith('{')) {
            symbols = symbolsPart.slice(1, -1).split(',').map((s) => s.trim());
          } else {
            symbols = [symbolsPart];
          }
        } else {
          symbols = [modulePath!.split('::').pop()!];
        }

        imports.push(this.createImportInfo(modulePath!, symbols, line, lineNum, 'rust'));
        continue;
      }
    }

    return imports;
  }

  /**
   * Create an ImportInfo object with framework detection.
   */
  private createImportInfo(
    module: string,
    symbols: string[],
    raw: string,
    line: number,
    language: string
  ): ImportInfo {
    const isRelative = module.startsWith('.') || module.startsWith('/');
    const frameworkHint = this.detectFrameworkFromImport(module, language);

    return {
      module,
      symbols,
      isRelative,
      isFramework: frameworkHint !== undefined,
      frameworkHint,
      raw: raw.trim(),
      line,
    };
  }

  /**
   * Detect which framework an import belongs to.
   */
  private detectFrameworkFromImport(module: string, language: string): string | undefined {
    const allPatterns = { ...FRAMEWORK_PATTERNS, ...this.config.additionalPatterns };

    for (const [framework, config] of Object.entries(allPatterns)) {
      if (config.language !== language && language !== 'typescript' && language !== 'javascript') {
        continue;
      }

      for (const pattern of config.imports) {
        if (module === pattern || module.startsWith(pattern + '/') || module.startsWith(pattern)) {
          return framework;
        }
      }
    }

    return undefined;
  }

  /**
   * Load dependencies from package.json or pyproject.toml.
   */
  private async loadDependencies(): Promise<DependencyInfo[]> {
    // Check cache first
    if (this.dependencyCache.has(this.config.projectRoot)) {
      return this.dependencyCache.get(this.config.projectRoot)!;
    }

    const dependencies: DependencyInfo[] = [];

    // Try package.json (Node.js)
    const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);

        // Regular dependencies
        if (pkg.dependencies) {
          for (const [name, version] of Object.entries(pkg.dependencies)) {
            dependencies.push({
              name,
              version: version as string,
              category: DEPENDENCY_CATEGORIES[name] || 'unknown',
              isDev: false,
            });
          }
        }

        // Dev dependencies
        if (pkg.devDependencies) {
          for (const [name, version] of Object.entries(pkg.devDependencies)) {
            dependencies.push({
              name,
              version: version as string,
              category: DEPENDENCY_CATEGORIES[name] || 'unknown',
              isDev: true,
            });
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    // Try pyproject.toml (Python)
    const pyprojectPath = path.join(this.config.projectRoot, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        // Simple TOML parsing for dependencies
        const depMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (depMatch) {
          const depLines = depMatch[1]!.split('\n');
          for (const line of depLines) {
            const match = line.match(/["']([^"'>=<]+)/);
            if (match) {
              dependencies.push({
                name: match[1]!,
                version: '*',
                category: 'unknown',
                isDev: false,
              });
            }
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    // Try requirements.txt (Python)
    const requirementsPath = path.join(this.config.projectRoot, 'requirements.txt');
    if (fs.existsSync(requirementsPath) && dependencies.length === 0) {
      try {
        const content = fs.readFileSync(requirementsPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([a-zA-Z0-9_-]+)/);
          if (match) {
            dependencies.push({
              name: match[1]!,
              version: '*',
              category: 'unknown',
              isDev: false,
            });
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    this.dependencyCache.set(this.config.projectRoot, dependencies);
    return dependencies;
  }

  /**
   * Detect frameworks based on imports and dependencies.
   */
  private detectFrameworks(
    imports: ImportInfo[],
    dependencies: DependencyInfo[],
    language: string
  ): FrameworkDetection[] {
    const detections: Map<string, FrameworkDetection> = new Map();
    const allPatterns = { ...FRAMEWORK_PATTERNS, ...this.config.additionalPatterns };

    // Detect from imports
    for (const imp of imports) {
      if (imp.frameworkHint) {
        const existing = detections.get(imp.frameworkHint);
        if (existing) {
          existing.confidence = Math.min(1.0, existing.confidence + 0.1);
          existing.evidence.push(`import: ${imp.module}`);
        } else {
          detections.set(imp.frameworkHint, {
            name: imp.frameworkHint,
            confidence: 0.7,
            evidence: [`import: ${imp.module}`],
            language: allPatterns[imp.frameworkHint]?.language || language,
          });
        }
      }
    }

    // Boost confidence from dependencies
    for (const dep of dependencies) {
      for (const [framework, config] of Object.entries(allPatterns)) {
        if (config.imports.some((pattern) => dep.name === pattern || dep.name.startsWith(pattern))) {
          const existing = detections.get(framework);
          if (existing) {
            existing.confidence = Math.min(1.0, existing.confidence + 0.2);
            existing.evidence.push(`dependency: ${dep.name}@${dep.version}`);
          } else {
            detections.set(framework, {
              name: framework,
              confidence: 0.6,
              evidence: [`dependency: ${dep.name}@${dep.version}`],
              language: config.language,
            });
          }
        }
      }
    }

    // Sort by confidence
    return Array.from(detections.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Load path aliases from tsconfig.json or jsconfig.json.
   */
  private async loadPathAliases(): Promise<Record<string, string>> {
    // Check cache
    if (this.pathAliasCache.has(this.config.projectRoot)) {
      return this.pathAliasCache.get(this.config.projectRoot)!;
    }

    const aliases: Record<string, string> = {};

    // Try tsconfig.json
    const tsconfigPath = path.join(this.config.projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const content = fs.readFileSync(tsconfigPath, 'utf-8');
        // Remove comments for JSON parsing
        const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const config = JSON.parse(cleaned);

        if (config.compilerOptions?.paths) {
          const baseUrl = config.compilerOptions.baseUrl || '.';
          for (const [alias, targets] of Object.entries(config.compilerOptions.paths)) {
            const cleanAlias = alias.replace('/*', '');
            const target = (targets as string[])[0]?.replace('/*', '');
            if (target) {
              aliases[cleanAlias] = path.join(baseUrl, target);
            }
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    // Try jsconfig.json
    const jsconfigPath = path.join(this.config.projectRoot, 'jsconfig.json');
    if (fs.existsSync(jsconfigPath) && Object.keys(aliases).length === 0) {
      try {
        const content = fs.readFileSync(jsconfigPath, 'utf-8');
        const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const config = JSON.parse(cleaned);

        if (config.compilerOptions?.paths) {
          const baseUrl = config.compilerOptions.baseUrl || '.';
          for (const [alias, targets] of Object.entries(config.compilerOptions.paths)) {
            const cleanAlias = alias.replace('/*', '');
            const target = (targets as string[])[0]?.replace('/*', '');
            if (target) {
              aliases[cleanAlias] = path.join(baseUrl, target);
            }
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    this.pathAliasCache.set(this.config.projectRoot, aliases);
    return aliases;
  }

  /**
   * Detect project type from dependencies.
   */
  private detectProjectType(
    dependencies: DependencyInfo[]
  ): 'monorepo' | 'library' | 'application' | 'unknown' {
    const depNames = new Set(dependencies.map((d) => d.name));

    // Check for monorepo indicators
    if (depNames.has('lerna') || depNames.has('nx') || depNames.has('turbo')) {
      return 'monorepo';
    }

    // Check workspaces in package.json
    const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        if (pkg.workspaces) {
          return 'monorepo';
        }
      } catch (error) {
        // Ignore
      }
    }

    // Check for library indicators (mainly publishes to npm/pypi)
    const packageJsonExists = fs.existsSync(packageJsonPath);
    if (packageJsonExists) {
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        if (pkg.main || pkg.module || pkg.exports || pkg.types) {
          return 'library';
        }
      } catch (error) {
        // Ignore
      }
    }

    // Check for application indicators
    if (
      depNames.has('express') ||
      depNames.has('fastify') ||
      depNames.has('@nestjs/core') ||
      depNames.has('next') ||
      depNames.has('react-dom')
    ) {
      return 'application';
    }

    return 'unknown';
  }

  /**
   * Clear all caches.
   */
  clearCaches(): void {
    this.dependencyCache.clear();
    this.pathAliasCache.clear();
  }
}
