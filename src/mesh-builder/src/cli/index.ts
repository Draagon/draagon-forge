#!/usr/bin/env node
/**
 * mesh-builder CLI - Extract code knowledge mesh from source projects.
 *
 * Commands:
 *   extract <path>    Extract mesh from a project
 *   schemas           List available schemas
 *   analyze <file>    Analyze a single file
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileExtractor, ExtractorOptions } from '../extractors/FileExtractor';
import { SchemaRegistry } from '../core/SchemaRegistry';
import { LanguageDetector } from '../core/LanguageDetector';
import { ProjectConfig } from '../types';
import {
  Tier2Verifier,
  TrustScoringEngine,
  formatTrustReport,
  applyCorrections,
} from '../verifier';
import { SchemaStore, SchemaExport } from '../schema-graph/SchemaStore';

const program = new Command();

program
  .name('mesh-builder')
  .description('Agentic code mesh extraction tool')
  .version('0.1.0');

// Extract command
program
  .command('extract')
  .description('Extract code knowledge mesh from a project')
  .argument('<path>', 'Path to project directory')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('-f, --format <format>', 'Output format: json, jsonl', 'json')
  .option('--no-ai', 'Disable AI-assisted extraction')
  .option('--schemas <dir>', 'Custom schemas directory')
  .option('--include <patterns...>', 'Include patterns (glob)')
  .option('--exclude <patterns...>', 'Exclude patterns (glob)')
  .option('--project-id <id>', 'Project identifier')
  .option('--changed-files <files>', 'Comma-separated list of changed files for incremental extraction')
  .option('--changed-files-from <file>', 'File containing list of changed files (one per line)')
  .option('--verbose', 'Verbose output')
  .action(async (projectPath: string, options) => {
    try {
      const absolutePath = path.resolve(projectPath);

      // Verify path exists
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        console.error(`Error: ${absolutePath} is not a directory`);
        process.exit(1);
      }

      const projectConfig: ProjectConfig = {
        id: options.projectId || path.basename(absolutePath),
        name: path.basename(absolutePath),
        path: absolutePath,
        includePaths: options.include,
        excludePaths: options.exclude,
      };

      // Parse changed files for incremental extraction
      let changedFiles: string[] | undefined;
      if (options.changedFiles) {
        changedFiles = options.changedFiles.split(',').map((f: string) => f.trim());
      } else if (options.changedFilesFrom) {
        const changedFilesContent = await fs.readFile(options.changedFilesFrom, 'utf-8');
        changedFiles = changedFilesContent
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
      }

      const extractorOptions: Partial<ExtractorOptions> = {
        enableAI: options.ai !== false,
        schemasDir: options.schemas,
        changedFiles,
      };

      if (options.verbose) {
        console.error(`Extracting project: ${projectConfig.name}`);
        console.error(`Path: ${absolutePath}`);
        console.error(`AI enabled: ${extractorOptions.enableAI}`);
        if (changedFiles) {
          console.error(`Incremental mode: ${changedFiles.length} changed files`);
        }
      }

      const extractor = new FileExtractor(projectConfig, extractorOptions);
      const result = await extractor.extractProject();

      // Format output
      let output: string;
      if (options.format === 'jsonl') {
        // Output each file result as a separate JSON line
        const lines: string[] = [];
        lines.push(JSON.stringify({ type: 'project', data: {
          project_id: result.project_id,
          project_path: result.project_path,
          timestamp: result.timestamp,
          statistics: result.statistics,
        }}));
        for (const fileResult of result.results) {
          lines.push(JSON.stringify({ type: 'file', data: fileResult }));
        }
        output = lines.join('\n');
      } else {
        output = JSON.stringify(result, null, 2);
      }

      // Write output
      if (options.output) {
        await fs.writeFile(options.output, output);
        if (options.verbose) {
          console.error(`Output written to: ${options.output}`);
        }
      } else {
        console.log(output);
      }

      // Print summary to stderr if verbose
      if (options.verbose) {
        console.error('\n--- Summary ---');
        console.error(`Files processed: ${result.statistics.files_processed}`);
        console.error(`Files skipped: ${result.statistics.files_skipped}`);
        console.error(`Total nodes: ${result.statistics.total_nodes}`);
        console.error(`Total edges: ${result.statistics.total_edges}`);
        console.error(`Extraction time: ${result.statistics.extraction_time_ms}ms`);
      }
    } catch (error) {
      console.error('Extraction failed:', error);
      process.exit(1);
    }
  });

// Schemas command
program
  .command('schemas')
  .description('List available extraction schemas')
  .option('--dir <path>', 'Schemas directory')
  .option('--language <lang>', 'Filter by language')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const schemasDir =
        options.dir || path.join(__dirname, '..', '..', 'schemas');
      const registry = new SchemaRegistry(schemasDir);
      await registry.loadSchemas();

      let schemas = registry.listSchemas();

      // Filter by language if specified
      if (options.language) {
        schemas = schemas.filter((s) => s.language === options.language);
      }

      if (options.json) {
        console.log(JSON.stringify(schemas, null, 2));
      } else {
        console.log('Available schemas:');
        console.log('');
        for (const schema of schemas) {
          const customTag = schema.isCustom ? ' [custom]' : '';
          console.log(`  ${schema.name} (${schema.language}) v${schema.version}${customTag}`);
        }
        console.log('');
        console.log(`Total: ${schemas.length} schemas`);
      }
    } catch (error) {
      console.error('Failed to list schemas:', error);
      process.exit(1);
    }
  });

// Analyze command (single file)
program
  .command('analyze')
  .description('Analyze a single source file')
  .argument('<file>', 'Path to source file')
  .option('--schemas <dir>', 'Custom schemas directory')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show detailed matching info')
  .action(async (filePath: string, options) => {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Detect language
      const detector = new LanguageDetector();
      const language = detector.detect(absolutePath, content);

      console.log(`File: ${absolutePath}`);
      console.log(`Language: ${language}`);
      console.log('');

      // Find matching schemas
      const schemasDir =
        options.schemas || path.join(__dirname, '..', '..', 'schemas');
      const registry = new SchemaRegistry(schemasDir);
      await registry.loadSchemas();

      const sourceFile = {
        path: absolutePath,
        relativePath: path.basename(absolutePath),
        content,
        language,
        size: content.length,
        lastModified: new Date(),
      };

      const matches = await registry.findMatchingSchemas(sourceFile);

      if (options.json) {
        console.log(JSON.stringify({
          file: absolutePath,
          language,
          schemas: matches.map((m) => ({
            name: m.schema.name,
            score: m.score,
            matchedBy: m.matchedBy,
          })),
        }, null, 2));
      } else {
        if (matches.length === 0) {
          console.log('No matching schemas found.');
        } else {
          console.log('Matching schemas:');
          for (const match of matches) {
            console.log(`  ${match.schema.name}: score=${match.score.toFixed(2)}, matched by: ${match.matchedBy.join(', ')}`);
          }
        }
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      process.exit(1);
    }
  });

// Languages command
program
  .command('languages')
  .description('List supported languages')
  .action(() => {
    const detector = new LanguageDetector();
    const languages = detector.getSupportedLanguages();

    console.log('Supported languages:');
    console.log('');
    for (const lang of languages) {
      if (lang !== 'unknown') {
        const extensions = detector.getExtensions(lang);
        const isCode = detector.isCodeLanguage(lang);
        const typeLabel = isCode ? 'code' : 'data';
        console.log(`  ${lang} [${typeLabel}]: ${extensions.join(', ')}`);
      }
    }
  });

// Verify command - run Tier 2 verification on extracted mesh
program
  .command('verify')
  .description('Verify extracted mesh with LLM (Tier 2)')
  .argument('<mesh-file>', 'Path to extracted mesh JSON file')
  .argument('<project-path>', 'Path to source project')
  .option('-o, --output <file>', 'Output corrected mesh to file')
  .option('--provider <provider>', 'LLM provider: ollama, groq', 'ollama')
  .option('--model <model>', 'LLM model to use', 'llama3.3:70b')
  .option('--sample <rate>', 'Sample rate (0.0-1.0)', '1.0')
  .option('--max-nodes <n>', 'Maximum nodes to verify', '100')
  .option('--verbose', 'Show verification details')
  .action(async (meshFile: string, projectPath: string, options) => {
    try {
      // Load mesh
      const meshContent = await fs.readFile(meshFile, 'utf-8');
      const mesh = JSON.parse(meshContent);

      // Load trust scores
      const trustEngine = new TrustScoringEngine();

      // Create verifier
      const verifier = new Tier2Verifier({
        provider: options.provider,
        model: options.model,
      });

      const sampleRate = parseFloat(options.sample);
      const maxNodes = parseInt(options.maxNodes, 10);

      console.error(`Verifying mesh from: ${meshFile}`);
      console.error(`Provider: ${options.provider}, Model: ${options.model}`);
      console.error(`Sample rate: ${(sampleRate * 100).toFixed(0)}%`);
      console.error('');

      let totalVerified = 0;
      let totalCorrected = 0;
      let totalRejected = 0;
      let processedNodes = 0;

      // Process each file result
      for (const fileResult of mesh.results || []) {
        const filePath = path.join(projectPath, fileResult.file);

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          if (options.verbose) {
            console.error(`Skipping ${fileResult.file}: file not found`);
          }
          continue;
        }

        // Load source content
        const sourceContent = await fs.readFile(filePath, 'utf-8');
        const sourceFile = {
          path: filePath,
          relativePath: fileResult.file,
          content: sourceContent,
          language: fileResult.language || 'unknown',
          size: sourceContent.length,
          lastModified: new Date(),
        };

        // Filter nodes to verify (respect sample rate and max)
        const nodesToVerify = (fileResult.nodes || []).filter(() => {
          if (processedNodes >= maxNodes) return false;
          if (Math.random() > sampleRate) return false;
          processedNodes++;
          return true;
        });

        if (nodesToVerify.length === 0) continue;

        // Create verification requests
        const requests = verifier.createRequests(
          nodesToVerify,
          sourceFile,
          fileResult.schema || 'unknown',
          'unknown'
        );

        if (options.verbose) {
          console.error(`Verifying ${requests.length} nodes from ${fileResult.file}...`);
        }

        // Run verification
        for (const request of requests) {
          try {
            const result = await verifier.verify(request);

            // Record in trust engine
            trustEngine.recordVerification(
              fileResult.schema || 'unknown',
              'pattern',
              sourceFile.language,
              result.status
            );

            if (result.status === 'verified') totalVerified++;
            else if (result.status === 'corrected') totalCorrected++;
            else if (result.status === 'rejected') totalRejected++;

            if (options.verbose) {
              console.error(
                `  ${request.node.type} "${request.node.name}": ${result.status} (${result.confidence.toFixed(2)})`
              );
              if (result.corrections) {
                console.error(`    Corrections: ${JSON.stringify(result.corrections)}`);
              }
            }
          } catch (error) {
            console.error(`  Error verifying ${request.node.name}: ${error}`);
          }
        }
      }

      // Save trust scores
      trustEngine.saveToLocal();

      // Print summary
      console.error('\n--- Verification Summary ---');
      console.error(`Verified: ${totalVerified}`);
      console.error(`Corrected: ${totalCorrected}`);
      console.error(`Rejected: ${totalRejected}`);
      console.error(
        `Accuracy: ${((totalVerified / (totalVerified + totalCorrected + totalRejected)) * 100).toFixed(1)}%`
      );

      // Output corrected mesh if requested
      if (options.output) {
        // TODO: Apply corrections and write
        console.error(`\nCorrected mesh would be written to: ${options.output}`);
      }
    } catch (error) {
      console.error('Verification failed:', error);
      process.exit(1);
    }
  });

// Trust command - show trust scores
program
  .command('trust')
  .description('Show extraction trust scores')
  .option('--json', 'Output as JSON')
  .option('--language <lang>', 'Filter by language')
  .action(async (options) => {
    const trustEngine = new TrustScoringEngine();

    if (options.json) {
      const scores = options.language
        ? trustEngine.getScoresByLanguage(options.language)
        : trustEngine.getAllScores();
      console.log(JSON.stringify(scores, null, 2));
    } else {
      console.log(formatTrustReport(trustEngine));
    }
  });

// Schema export command
program
  .command('schema-export')
  .description('Export schemas from Neo4j to JSON file')
  .argument('<output-file>', 'Path to output JSON file')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--pretty', 'Pretty-print JSON output', true)
  .action(async (outputFile: string, options) => {
    try {
      const store = new SchemaStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      console.error('Connecting to Neo4j...');
      await store.connect();

      console.error('Exporting schemas...');
      const data = await store.exportToJSON();

      const json = options.pretty
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);

      await fs.writeFile(outputFile, json);

      console.error(`\nExported to: ${outputFile}`);
      console.error(`  Schemas: ${data.schemas.length}`);
      console.error(`  Patterns: ${data.patterns.length}`);

      await store.close();
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    }
  });

// Schema import command
program
  .command('schema-import')
  .description('Import schemas from JSON file to Neo4j')
  .argument('<input-file>', 'Path to input JSON file')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--overwrite', 'Overwrite existing schemas/patterns', false)
  .option('--skip-existing', 'Skip existing items without error', false)
  .option('--clear', 'Clear all existing data before import (DANGEROUS)', false)
  .action(async (inputFile: string, options) => {
    try {
      const store = new SchemaStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      console.error('Connecting to Neo4j...');
      await store.connect();
      await store.initialize();

      // Load JSON
      const json = await fs.readFile(inputFile, 'utf-8');
      const data: SchemaExport = JSON.parse(json);

      console.error(`Importing from: ${inputFile}`);
      console.error(`  Version: ${data.version}`);
      console.error(`  Exported: ${data.exported_at}`);
      console.error(`  Schemas: ${data.schemas.length}`);
      console.error(`  Patterns: ${data.patterns.length}`);

      // Clear if requested
      if (options.clear) {
        console.error('\nClearing existing data...');
        await store.clearAll();
      }

      // Import
      console.error('\nImporting...');
      const result = await store.importFromJSON(data, {
        overwrite: options.overwrite,
        skipExisting: options.skipExisting,
      });

      console.error('\n--- Import Summary ---');
      console.error(`Schemas:  ${result.schemas.created} created, ${result.schemas.updated} updated, ${result.schemas.skipped} skipped`);
      console.error(`Patterns: ${result.patterns.created} created, ${result.patterns.updated} updated, ${result.patterns.skipped} skipped`);
      console.error(`Prompts:  ${result.prompts.created} created`);

      await store.close();
    } catch (error) {
      console.error('Import failed:', error);
      process.exit(1);
    }
  });

// Schema init command - initialize Neo4j with base schemas
program
  .command('schema-init')
  .description('Initialize Neo4j with base schema structure')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .action(async (options) => {
    try {
      const store = new SchemaStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      console.error('Connecting to Neo4j...');
      await store.connect();

      console.error('Creating indexes and constraints...');
      await store.initialize();

      const hasSchemas = await store.hasSchemas();
      if (hasSchemas) {
        console.error('\nSchemas already exist in database.');
      } else {
        console.error('\nDatabase initialized. No schemas loaded yet.');
        console.error('Use "mesh-builder schema-import" to load schemas.');
      }

      await store.close();
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  });

program.parse();
