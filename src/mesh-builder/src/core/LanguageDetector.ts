/**
 * LanguageDetector - Detects programming language from file extension and content.
 *
 * Supports:
 * - File extension mapping
 * - Shebang detection
 * - Content heuristics for edge cases
 */

import * as path from 'path';

export type SupportedLanguage =
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'kotlin'
  | 'swift'
  | 'scala'
  | 'sql'
  | 'yaml'
  | 'json'
  | 'markdown'
  | 'unknown';

interface LanguageConfig {
  extensions: string[];
  shebangs?: string[];
  contentPatterns?: RegExp[];
}

const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  python: {
    extensions: ['.py', '.pyw', '.pyx', '.pxd', '.pxi'],
    shebangs: ['python', 'python3', 'python2'],
    contentPatterns: [
      /^import\s+\w+/m,
      /^from\s+\w+\s+import/m,
      /^def\s+\w+\s*\(/m,
      /^class\s+\w+/m,
    ],
  },
  typescript: {
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    contentPatterns: [
      /^import\s+.*\s+from\s+['"]/m,
      /^export\s+(interface|type|class|function|const)/m,
      /:\s*(string|number|boolean|void|any)\s*[;=)]/,
    ],
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    shebangs: ['node', 'nodejs', 'deno', 'bun'],
    contentPatterns: [
      /^import\s+.*\s+from\s+['"]/m,
      /^const\s+\w+\s*=/m,
      /^function\s+\w+\s*\(/m,
      /module\.exports\s*=/,
    ],
  },
  java: {
    extensions: ['.java'],
    contentPatterns: [
      /^package\s+[\w.]+;/m,
      /^import\s+[\w.]+;/m,
      /public\s+(class|interface|enum)\s+\w+/,
    ],
  },
  go: {
    extensions: ['.go'],
    contentPatterns: [/^package\s+\w+/m, /^import\s+\(/m, /^func\s+\w+\s*\(/m],
  },
  rust: {
    extensions: ['.rs'],
    contentPatterns: [
      /^use\s+[\w:]+;/m,
      /^mod\s+\w+;/m,
      /^fn\s+\w+\s*\(/m,
      /^pub\s+(fn|struct|enum|trait)/m,
    ],
  },
  ruby: {
    extensions: ['.rb', '.rake', '.gemspec'],
    shebangs: ['ruby'],
    contentPatterns: [
      /^require\s+['"]/m,
      /^class\s+\w+/m,
      /^def\s+\w+/m,
      /^module\s+\w+/m,
    ],
  },
  php: {
    extensions: ['.php', '.phtml', '.php5', '.php7'],
    contentPatterns: [/^<\?php/m, /^namespace\s+[\w\\]+;/m, /^use\s+[\w\\]+;/m],
  },
  csharp: {
    extensions: ['.cs'],
    contentPatterns: [
      /^using\s+[\w.]+;/m,
      /^namespace\s+[\w.]+/m,
      /public\s+(class|interface|struct)\s+\w+/,
    ],
  },
  cpp: {
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h++'],
    contentPatterns: [
      /^#include\s+[<"]/m,
      /^namespace\s+\w+\s*{/m,
      /^class\s+\w+\s*[:{]/,
    ],
  },
  c: {
    extensions: ['.c', '.h'],
    contentPatterns: [/^#include\s+[<"]/m, /^typedef\s+/m, /^struct\s+\w+\s*{/],
  },
  kotlin: {
    extensions: ['.kt', '.kts'],
    contentPatterns: [
      /^package\s+[\w.]+/m,
      /^import\s+[\w.]+/m,
      /^fun\s+\w+\s*\(/m,
      /^class\s+\w+/m,
    ],
  },
  swift: {
    extensions: ['.swift'],
    contentPatterns: [
      /^import\s+\w+/m,
      /^func\s+\w+\s*\(/m,
      /^class\s+\w+/m,
      /^struct\s+\w+/m,
    ],
  },
  scala: {
    extensions: ['.scala', '.sc'],
    contentPatterns: [
      /^package\s+[\w.]+/m,
      /^import\s+[\w.]+/m,
      /^object\s+\w+/m,
      /^class\s+\w+/m,
    ],
  },
  sql: {
    extensions: ['.sql'],
    contentPatterns: [
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/im,
    ],
  },
  yaml: {
    extensions: ['.yml', '.yaml'],
  },
  json: {
    extensions: ['.json'],
  },
  markdown: {
    extensions: ['.md', '.markdown'],
  },
  unknown: {
    extensions: [],
  },
};

export class LanguageDetector {
  private extensionMap: Map<string, SupportedLanguage> = new Map();

  constructor() {
    // Build extension lookup map
    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
      for (const ext of config.extensions) {
        this.extensionMap.set(ext, lang as SupportedLanguage);
      }
    }
  }

  /**
   * Detect language from file path and optional content.
   */
  detect(filePath: string, content?: string): SupportedLanguage {
    // Try extension first
    const ext = path.extname(filePath).toLowerCase();
    const byExt = this.extensionMap.get(ext);

    if (byExt && byExt !== 'unknown') {
      return byExt;
    }

    // Try shebang if content available
    if (content) {
      const shebangLang = this.detectByShebang(content);
      if (shebangLang !== 'unknown') {
        return shebangLang;
      }

      // Try content patterns
      const contentLang = this.detectByContent(content);
      if (contentLang !== 'unknown') {
        return contentLang;
      }
    }

    // Handle special filenames
    const basename = path.basename(filePath).toLowerCase();
    const specialLang = this.detectByFilename(basename);
    if (specialLang !== 'unknown') {
      return specialLang;
    }

    return 'unknown';
  }

  /**
   * Detect language from shebang line.
   */
  private detectByShebang(content: string): SupportedLanguage {
    const firstLine = content.split('\n')[0];
    if (!firstLine?.startsWith('#!')) {
      return 'unknown';
    }

    const shebang = firstLine.toLowerCase();

    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.shebangs) {
        for (const prog of config.shebangs) {
          if (shebang.includes(prog)) {
            return lang as SupportedLanguage;
          }
        }
      }
    }

    return 'unknown';
  }

  /**
   * Detect language from content patterns.
   */
  private detectByContent(content: string): SupportedLanguage {
    const scores: Map<SupportedLanguage, number> = new Map();

    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.contentPatterns) {
        let score = 0;
        for (const pattern of config.contentPatterns) {
          if (pattern.test(content)) {
            score++;
          }
        }
        if (score > 0) {
          scores.set(lang as SupportedLanguage, score);
        }
      }
    }

    if (scores.size === 0) {
      return 'unknown';
    }

    // Return language with highest score
    let bestLang: SupportedLanguage = 'unknown';
    let bestScore = 0;

    for (const [lang, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestLang = lang;
      }
    }

    return bestLang;
  }

  /**
   * Detect language from special filenames.
   */
  private detectByFilename(basename: string): SupportedLanguage {
    const specialFiles: Record<string, SupportedLanguage> = {
      'dockerfile': 'unknown', // Could add docker support
      'makefile': 'unknown', // Could add makefile support
      'gemfile': 'ruby',
      'rakefile': 'ruby',
      'podfile': 'ruby',
      'package.json': 'json',
      'tsconfig.json': 'json',
      'pyproject.toml': 'unknown', // Could add toml support
      'cargo.toml': 'unknown',
      'go.mod': 'go',
      'go.sum': 'go',
    };

    return specialFiles[basename] || 'unknown';
  }

  /**
   * Check if a language is supported for code extraction.
   */
  isCodeLanguage(lang: SupportedLanguage): boolean {
    const nonCodeLanguages: SupportedLanguage[] = [
      'yaml',
      'json',
      'markdown',
      'sql',
      'unknown',
    ];
    return !nonCodeLanguages.includes(lang);
  }

  /**
   * Get all supported languages.
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Object.keys(LANGUAGE_CONFIGS) as SupportedLanguage[];
  }

  /**
   * Get file extensions for a language.
   */
  getExtensions(lang: SupportedLanguage): string[] {
    return LANGUAGE_CONFIGS[lang]?.extensions || [];
  }
}
