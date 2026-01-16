/**
 * RelatedFileResolver - Resolve imports to extract type signatures.
 *
 * Finds files that are imported and extracts their exported symbols
 * with type signatures. This provides context about what types and
 * functions are available from dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ImportInfo,
  RelatedFileContext,
  ExportInfo,
} from './types';
import { SourceFile } from '../types';

export interface RelatedFileResolverConfig {
  /** Project root directory */
  projectRoot: string;
  /** Path aliases from tsconfig/jsconfig */
  pathAliases: Record<string, string>;
  /** Maximum files to resolve */
  maxFiles: number;
  /** Maximum depth for transitive imports */
  maxDepth: number;
  /** File extensions to try when resolving */
  extensions: string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs'];

export class RelatedFileResolver {
  private config: RelatedFileResolverConfig;
  private resolvedCache: Map<string, RelatedFileContext> = new Map();
  private visitedPaths: Set<string> = new Set();

  constructor(config: Partial<RelatedFileResolverConfig> & { projectRoot: string }) {
    this.config = {
      projectRoot: config.projectRoot,
      pathAliases: config.pathAliases || {},
      maxFiles: config.maxFiles || 10,
      maxDepth: config.maxDepth || 2,
      extensions: config.extensions || DEFAULT_EXTENSIONS,
    };
  }

  /**
   * Resolve imports and extract type signatures from related files.
   */
  async resolve(
    file: SourceFile,
    imports: ImportInfo[]
  ): Promise<RelatedFileContext[]> {
    this.visitedPaths.clear();
    const results: RelatedFileContext[] = [];
    const relativeImports = imports.filter((i) => i.isRelative);

    // Start with the current file's directory
    const fileDir = path.dirname(file.path);

    for (const imp of relativeImports) {
      if (results.length >= this.config.maxFiles) break;

      // Check cache
      const cacheKey = `${fileDir}:${imp.module}`;
      if (this.resolvedCache.has(cacheKey)) {
        results.push(this.resolvedCache.get(cacheKey)!);
        continue;
      }

      const resolved = await this.resolveImport(imp, fileDir, file.language);
      if (resolved) {
        this.resolvedCache.set(cacheKey, resolved);
        results.push(resolved);
      }
    }

    return results;
  }

  /**
   * Resolve a single import to a file and extract exports.
   */
  private async resolveImport(
    imp: ImportInfo,
    fromDir: string,
    language: string
  ): Promise<RelatedFileContext | null> {
    // Resolve the path
    const resolvedPath = this.resolvePath(imp.module, fromDir);
    if (!resolvedPath) {
      return null;
    }

    // Skip if already visited (circular imports)
    if (this.visitedPaths.has(resolvedPath)) {
      return null;
    }
    this.visitedPaths.add(resolvedPath);

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return {
        importPath: imp.module,
        resolvedPath,
        relativePath: path.relative(this.config.projectRoot, resolvedPath),
        exports: [],
        parsed: false,
        parseError: 'File not found',
      };
    }

    // Read and parse the file
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const exports = this.extractExports(content, language);

      return {
        importPath: imp.module,
        resolvedPath,
        relativePath: path.relative(this.config.projectRoot, resolvedPath),
        exports,
        parsed: true,
      };
    } catch (error) {
      return {
        importPath: imp.module,
        resolvedPath,
        relativePath: path.relative(this.config.projectRoot, resolvedPath),
        exports: [],
        parsed: false,
        parseError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve an import path to an absolute file path.
   */
  private resolvePath(importPath: string, fromDir: string): string | null {
    // Handle path aliases
    for (const [alias, target] of Object.entries(this.config.pathAliases)) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        const relativePart = importPath.slice(alias.length);
        importPath = target + relativePart;
        fromDir = this.config.projectRoot;
        break;
      }
    }

    // Resolve relative path
    let resolved = path.resolve(fromDir, importPath);

    // Try with extensions if no extension provided
    if (!path.extname(resolved)) {
      for (const ext of this.config.extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
          return withExt;
        }

        // Try index file
        const indexPath = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }
    }

    // Check if resolved path exists
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    return null;
  }

  /**
   * Extract exported symbols from file content.
   */
  private extractExports(content: string, language: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    // TypeScript/JavaScript exports
    if (language === 'typescript' || language === 'javascript') {
      exports.push(...this.extractTSExports(content, lines));
    }

    // Python exports
    if (language === 'python') {
      exports.push(...this.extractPythonExports(content, lines));
    }

    return exports;
  }

  /**
   * Extract exports from TypeScript/JavaScript.
   */
  private extractTSExports(content: string, lines: string[]): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Track current class/interface for method extraction
    let currentClass: string | null = null;
    let braceDepth = 0;
    let inClass = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Track brace depth for class boundaries
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (braceDepth === 0) {
        inClass = false;
        currentClass = null;
      }

      // Export default class
      const defaultClassMatch = line.match(
        /^export\s+default\s+class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/
      );
      if (defaultClassMatch) {
        const [, name, extendsClass, implementsInterfaces] = defaultClassMatch;
        let signature = `class ${name}`;
        if (extendsClass) signature += ` extends ${extendsClass}`;
        if (implementsInterfaces) signature += ` implements ${implementsInterfaces.trim()}`;

        exports.push({
          name: name!,
          kind: 'class',
          signature,
          isDefault: true,
        });
        currentClass = name!;
        inClass = true;
        continue;
      }

      // Export class
      const classMatch = line.match(
        /^export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/
      );
      if (classMatch) {
        const [, name, extendsClass, implementsInterfaces] = classMatch;
        let signature = `class ${name}`;
        if (extendsClass) signature += ` extends ${extendsClass}`;
        if (implementsInterfaces) signature += ` implements ${implementsInterfaces.trim()}`;

        exports.push({
          name: name!,
          kind: 'class',
          signature,
          isDefault: false,
        });
        currentClass = name!;
        inClass = true;
        continue;
      }

      // Export interface
      const interfaceMatch = line.match(/^export\s+interface\s+(\w+)(?:<([^>]+)>)?(?:\s+extends\s+([\w,\s<>]+))?/);
      if (interfaceMatch) {
        const [, name, generics, extendsTypes] = interfaceMatch;
        let signature = `interface ${name}`;
        if (generics) signature += `<${generics}>`;
        if (extendsTypes) signature += ` extends ${extendsTypes.trim()}`;

        exports.push({
          name: name!,
          kind: 'interface',
          signature,
          isDefault: false,
        });
        continue;
      }

      // Export type
      const typeMatch = line.match(/^export\s+type\s+(\w+)(?:<([^>]+)>)?\s*=/);
      if (typeMatch) {
        const [, name, generics] = typeMatch;
        let signature = `type ${name}`;
        if (generics) signature += `<${generics}>`;

        exports.push({
          name: name!,
          kind: 'type',
          signature,
          isDefault: false,
        });
        continue;
      }

      // Export function
      const funcMatch = line.match(
        /^export\s+(?:async\s+)?function\s+(\w+)(?:<([^>]+)>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/
      );
      if (funcMatch) {
        const [, name, generics, params = '', returnType] = funcMatch;
        let signature = `function ${name}`;
        if (generics) signature += `<${generics}>`;
        signature += `(${params.trim()})`;
        if (returnType) signature += `: ${returnType.trim()}`;

        exports.push({
          name: name!,
          kind: 'function',
          signature,
          isDefault: false,
        });
        continue;
      }

      // Export const/let/var
      const constMatch = line.match(/^export\s+(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?/);
      if (constMatch) {
        const [, name, type] = constMatch;
        let signature = `const ${name}`;
        if (type) signature += `: ${type.trim()}`;

        exports.push({
          name: name!,
          kind: 'const',
          signature,
          isDefault: false,
        });
        continue;
      }

      // Export enum
      const enumMatch = line.match(/^export\s+enum\s+(\w+)/);
      if (enumMatch) {
        const [, name] = enumMatch;
        exports.push({
          name: name!,
          kind: 'enum',
          signature: `enum ${name}`,
          isDefault: false,
        });
        continue;
      }

      // Export default (non-class)
      const defaultMatch = line.match(/^export\s+default\s+(\w+)/);
      if (defaultMatch && !line.includes('class')) {
        const [, name] = defaultMatch;
        exports.push({
          name: name!,
          kind: 'unknown',
          isDefault: true,
        });
        continue;
      }

      // Named exports: export { a, b, c }
      const namedExportMatch = line.match(/^export\s+\{([^}]+)\}/);
      if (namedExportMatch) {
        const names = namedExportMatch[1]!.split(',').map((n) => n.trim().split(' as ')[0]!.trim());
        for (const name of names) {
          if (name && !exports.some((e) => e.name === name)) {
            exports.push({
              name,
              kind: 'unknown',
              isDefault: false,
            });
          }
        }
        continue;
      }

      // Extract methods if we're in a class
      if (inClass && currentClass && braceDepth >= 1) {
        const methodMatch = line.match(
          /^\s+(?:async\s+)?(\w+)(?:<([^>]+)>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/
        );
        if (methodMatch) {
          const [, methodName, generics, params = '', returnType] = methodMatch;
          if (methodName && !['constructor', 'if', 'for', 'while', 'switch'].includes(methodName)) {
            let signature = `${currentClass}.${methodName}`;
            if (generics) signature += `<${generics}>`;
            signature += `(${params.trim()})`;
            if (returnType) signature += `: ${returnType.trim()}`;

            // Check if this method export already exists
            if (!exports.some((e) => e.name === `${currentClass}.${methodName}`)) {
              exports.push({
                name: `${currentClass}.${methodName}`,
                kind: 'function',
                signature,
                isDefault: false,
              });
            }
          }
        }
      }
    }

    return exports;
  }

  /**
   * Extract exports from Python.
   */
  private extractPythonExports(content: string, lines: string[]): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Check for __all__ definition
    const allMatch = content.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
    let exportedNames: Set<string> | null = null;

    if (allMatch) {
      exportedNames = new Set(
        allMatch[1]!
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''))
          .filter((s) => s.length > 0)
      );
    }

    // Extract class definitions
    const classRegex = /^class\s+(\w+)(?:\(([^)]+)\))?:/gm;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const [, name, bases] = match;
      if (exportedNames && !exportedNames.has(name!)) continue;

      let signature = `class ${name}`;
      if (bases) signature += `(${bases.trim()})`;

      exports.push({
        name: name!,
        kind: 'class',
        signature,
        isDefault: false,
      });
    }

    // Extract function definitions
    const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;

    while ((match = funcRegex.exec(content)) !== null) {
      const [, name, params = '', returnType] = match;
      if (name!.startsWith('_') && !name!.startsWith('__')) continue; // Skip private
      if (exportedNames && !exportedNames.has(name!)) continue;

      let signature = `def ${name}(${params.trim()})`;
      if (returnType) signature += ` -> ${returnType.trim()}`;

      exports.push({
        name: name!,
        kind: 'function',
        signature,
        isDefault: false,
      });
    }

    return exports;
  }

  /**
   * Clear the resolution cache.
   */
  clearCache(): void {
    this.resolvedCache.clear();
  }

  /**
   * Update path aliases (e.g., after loading tsconfig).
   */
  setPathAliases(aliases: Record<string, string>): void {
    this.config.pathAliases = aliases;
  }
}
