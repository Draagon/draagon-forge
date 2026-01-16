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
import { GitTracker, ExtractionStateStore } from '../git/GitTracker';
import { MeshStore } from '../store/MeshStore';

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
  .option('--since-commit <sha>', 'Extract only files changed since this commit (git incremental)')
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
      } else if (options.sinceCommit) {
        // Use git to find changed files since a specific commit
        try {
          const gitTracker = new GitTracker(absolutePath);
          const changes = gitTracker.getChangedFiles(options.sinceCommit);
          changedFiles = [
            ...changes.added,
            ...changes.modified,
            ...changes.renamed.map((r) => r.to),
          ];
          if (options.verbose) {
            console.error(`Git incremental mode since ${options.sinceCommit}:`);
            console.error(`  Added: ${changes.added.length}, Modified: ${changes.modified.length}, Renamed: ${changes.renamed.length}, Deleted: ${changes.deleted.length}`);
          }
        } catch (error) {
          console.error(`Failed to get git changes: ${error}`);
          process.exit(1);
        }
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

// Git status command - show git context for a project
program
  .command('git-status')
  .description('Show git context for a project')
  .argument('<path>', 'Path to project directory')
  .option('--json', 'Output as JSON')
  .action(async (projectPath: string, options) => {
    try {
      const absolutePath = path.resolve(projectPath);
      const gitTracker = new GitTracker(absolutePath);
      const context = gitTracker.getContext();

      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        console.log('Git Context:');
        console.log(`  Commit: ${context.commit_sha}`);
        console.log(`  Branch: ${context.branch}`);
        console.log(`  Message: ${context.commit_message}`);
        console.log(`  Author: ${context.author}`);
        console.log(`  Date: ${context.committed_at}`);
        if (context.tags.length > 0) {
          console.log(`  Tags: ${context.tags.join(', ')}`);
        }
        console.log(`  Clean: ${context.is_clean ? 'Yes' : 'No (uncommitted changes)'}`);
        if (context.remote_url) {
          console.log(`  Remote: ${context.remote_url}`);
        }
      }
    } catch (error) {
      console.error('Failed to get git status:', error);
      process.exit(1);
    }
  });

// Git changes command - show files changed between commits
program
  .command('git-changes')
  .description('Show files changed between two commits')
  .argument('<path>', 'Path to project directory')
  .argument('<from>', 'From commit/branch/tag')
  .argument('[to]', 'To commit/branch/tag (default: HEAD)')
  .option('--json', 'Output as JSON')
  .action(async (projectPath: string, from: string, to: string | undefined, options) => {
    try {
      const absolutePath = path.resolve(projectPath);
      const gitTracker = new GitTracker(absolutePath);
      const changes = gitTracker.getChangedFiles(from, to || 'HEAD');

      if (options.json) {
        console.log(JSON.stringify(changes, null, 2));
      } else {
        console.log(`Changes from ${from} to ${to || 'HEAD'}:`);
        console.log('');
        if (changes.added.length > 0) {
          console.log('Added:');
          changes.added.forEach((f) => console.log(`  + ${f}`));
        }
        if (changes.modified.length > 0) {
          console.log('Modified:');
          changes.modified.forEach((f) => console.log(`  M ${f}`));
        }
        if (changes.deleted.length > 0) {
          console.log('Deleted:');
          changes.deleted.forEach((f) => console.log(`  - ${f}`));
        }
        if (changes.renamed.length > 0) {
          console.log('Renamed:');
          changes.renamed.forEach((r) => console.log(`  R ${r.from} -> ${r.to}`));
        }
        console.log('');
        const total = changes.added.length + changes.modified.length + changes.deleted.length + changes.renamed.length;
        console.log(`Total: ${total} files changed`);
      }
    } catch (error) {
      console.error('Failed to get git changes:', error);
      process.exit(1);
    }
  });

// Extraction history command - show extraction runs for a project
program
  .command('history')
  .description('Show extraction history for a project')
  .argument('<project-id>', 'Project identifier')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--branch <branch>', 'Filter by branch')
  .option('--json', 'Output as JSON')
  .action(async (projectId: string, options) => {
    try {
      const store = new ExtractionStateStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      await store.connect();
      const extractions = await store.getProjectExtractions(projectId);
      await store.close();

      // Filter by branch if specified
      const filtered = options.branch
        ? extractions.filter((e) => e.branch === options.branch)
        : extractions;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.log(`Extraction History for: ${projectId}`);
        console.log('');
        if (filtered.length === 0) {
          console.log('No extractions found.');
        } else {
          for (const ext of filtered) {
            const tags = ext.tags.length > 0 ? ` (${ext.tags.join(', ')})` : '';
            console.log(`  ${ext.commit_short} [${ext.branch}]${tags}`);
            console.log(`    ${ext.commit_message}`);
            console.log(`    ${ext.author} - ${ext.committed_at}`);
            console.log('');
          }
          console.log(`Total: ${filtered.length} extractions`);
        }
      }
    } catch (error) {
      console.error('Failed to get extraction history:', error);
      process.exit(1);
    }
  });

// Record extraction command - record an extraction run in Neo4j
program
  .command('record-extraction')
  .description('Record an extraction run in Neo4j for tracking')
  .argument('<mesh-file>', 'Path to extracted mesh JSON file')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .action(async (meshFile: string, options) => {
    try {
      // Load mesh
      const meshContent = await fs.readFile(meshFile, 'utf-8');
      const mesh = JSON.parse(meshContent);

      if (!mesh.git) {
        console.error('Mesh file does not contain git context. Extract with a git-tracked project.');
        process.exit(1);
      }

      const store = new ExtractionStateStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      await store.connect();
      await store.initialize();

      const id = await store.recordExtraction(
        mesh.project_id,
        mesh.git,
        {
          files: mesh.statistics.files_processed,
          nodes: mesh.statistics.total_nodes,
          edges: mesh.statistics.total_edges,
        }
      );

      await store.close();

      console.log(`Recorded extraction: ${id}`);
      console.log(`  Project: ${mesh.project_id}`);
      console.log(`  Branch: ${mesh.git.branch}`);
      console.log(`  Commit: ${mesh.git.commit_short} - ${mesh.git.commit_message}`);
      console.log(`  Nodes: ${mesh.statistics.total_nodes}, Edges: ${mesh.statistics.total_edges}`);
    } catch (error) {
      console.error('Failed to record extraction:', error);
      process.exit(1);
    }
  });

// Store mesh command - store full extraction in Neo4j
program
  .command('store')
  .description('Store extraction result in Neo4j mesh database')
  .argument('<mesh-file>', 'Path to extracted mesh JSON file')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--incremental', 'Merge incrementally (only update changed files)', false)
  .option('--deleted-files <files>', 'Comma-separated list of deleted files to remove')
  .action(async (meshFile: string, options) => {
    try {
      // Load mesh
      const meshContent = await fs.readFile(meshFile, 'utf-8');
      const mesh = JSON.parse(meshContent);

      const store = new MeshStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      console.error('Connecting to Neo4j...');
      await store.connect();
      await store.initialize();

      const branch = mesh.git?.branch || 'unknown';
      console.error(`Storing mesh for project: ${mesh.project_id}, branch: ${branch}`);
      console.error(`  Files: ${mesh.results?.length || 0}`);
      console.error(`  Nodes: ${mesh.statistics?.total_nodes || 0}`);
      console.error(`  Edges: ${mesh.statistics?.total_edges || 0}`);

      let result;
      if (options.incremental) {
        const deletedFiles = options.deletedFiles
          ? options.deletedFiles.split(',').map((f: string) => f.trim())
          : [];
        console.error(`\nMerging incrementally...`);
        if (deletedFiles.length > 0) {
          console.error(`  Deleted files to remove: ${deletedFiles.length}`);
        }
        result = await store.mergeIncrementalExtraction(mesh, deletedFiles);
      } else {
        console.error(`\nStoring full extraction (replacing existing)...`);
        result = await store.storeFullExtraction(mesh);
      }

      await store.close();

      console.error('\n--- Store Result ---');
      console.error(`Files removed: ${result.files_deleted.length}`);
      console.error(`Files inserted: ${result.files_inserted.length}`);
      console.error(`Nodes: -${result.nodes_removed} / +${result.nodes_inserted}`);
      console.error(`Edges: -${result.edges_removed} / +${result.edges_inserted}`);
    } catch (error) {
      console.error('Store failed:', error);
      process.exit(1);
    }
  });

// Query mesh command - query the stored mesh
program
  .command('query')
  .description('Query the stored mesh in Neo4j')
  .argument('<project-id>', 'Project identifier')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--branch <branch>', 'Branch to query')
  .option('--file <path>', 'Filter by file path')
  .option('--type <type>', 'Filter by node type (e.g., Function, Class)')
  .option('--stats', 'Show statistics only')
  .option('--json', 'Output as JSON')
  .action(async (projectId: string, options) => {
    try {
      const store = new MeshStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      await store.connect();

      if (options.stats) {
        const stats = await store.getStatistics(projectId, options.branch);
        await store.close();

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(`Mesh Statistics for: ${projectId}${options.branch ? ` (${options.branch})` : ''}`);
          console.log('');
          console.log(`  Total nodes: ${stats.total_nodes}`);
          console.log(`  Total edges: ${stats.total_edges}`);
          console.log(`  Files: ${stats.files}`);
          if (stats.last_commit) {
            console.log(`  Last commit: ${stats.last_commit.substring(0, 8)}`);
          }
          console.log('');
          console.log('  Node types:');
          for (const [type, count] of Object.entries(stats.node_types).sort((a, b) => b[1] - a[1])) {
            console.log(`    ${type}: ${count}`);
          }
        }
      } else {
        const nodes = await store.getNodes({
          project_id: projectId,
          branch: options.branch,
          file_path: options.file,
          node_type: options.type,
        });
        await store.close();

        if (options.json) {
          console.log(JSON.stringify(nodes, null, 2));
        } else {
          console.log(`Nodes for: ${projectId}${options.branch ? ` (${options.branch})` : ''}`);
          console.log('');
          for (const node of nodes) {
            console.log(`  ${node.type} "${node.name}" @ ${node.source.file}:${node.source.line_start}`);
          }
          console.log('');
          console.log(`Total: ${nodes.length} nodes`);
        }
      }
    } catch (error) {
      console.error('Query failed:', error);
      process.exit(1);
    }
  });

// Sync command - full workflow: extract + store, with incremental support
program
  .command('sync')
  .description('Extract and store mesh (supports incremental updates)')
  .argument('<path>', 'Path to project directory')
  .option('--uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
  .option('--user <user>', 'Neo4j user', 'neo4j')
  .option('--password <pass>', 'Neo4j password', 'password')
  .option('--project-id <id>', 'Project identifier')
  .option('--full', 'Force full extraction (ignore last sync)', false)
  .option('--verbose', 'Verbose output')
  .action(async (projectPath: string, options) => {
    try {
      const absolutePath = path.resolve(projectPath);
      const projectId = options.projectId || path.basename(absolutePath);

      // Check if git repo
      let gitTracker: GitTracker | null = null;
      try {
        gitTracker = new GitTracker(absolutePath);
        gitTracker.getContext(); // Verify it works
      } catch {
        gitTracker = null;
      }

      const meshStore = new MeshStore({
        uri: options.uri,
        user: options.user,
        password: options.password,
      });

      await meshStore.connect();
      await meshStore.initialize();

      // Determine if we should do incremental
      let changedFiles: string[] | undefined;
      let deletedFiles: string[] = [];
      let isIncremental = false;

      if (gitTracker && !options.full) {
        const context = gitTracker.getContext();
        const stats = await meshStore.getStatistics(projectId, context.branch);

        if (stats.last_commit && stats.total_nodes > 0) {
          // We have a previous extraction - check if we can do incremental
          const changes = gitTracker.getChangedFiles(stats.last_commit);

          if (changes.added.length + changes.modified.length + changes.deleted.length > 0) {
            isIncremental = true;
            changedFiles = [
              ...changes.added,
              ...changes.modified,
              ...changes.renamed.map((r) => r.to),
            ];
            deletedFiles = changes.deleted;

            if (options.verbose) {
              console.error(`Incremental sync since ${stats.last_commit.substring(0, 8)}:`);
              console.error(`  Added: ${changes.added.length}`);
              console.error(`  Modified: ${changes.modified.length}`);
              console.error(`  Deleted: ${changes.deleted.length}`);
              console.error(`  Renamed: ${changes.renamed.length}`);
            }
          } else {
            console.error('No changes since last sync.');
            await meshStore.close();
            return;
          }
        }
      }

      // Extract
      if (options.verbose) {
        console.error(isIncremental ? '\nExtracting changed files...' : '\nExtracting full project...');
      }

      const extractor = new FileExtractor(
        {
          id: projectId,
          name: projectId,
          path: absolutePath,
        },
        { changedFiles }
      );
      const result = await extractor.extractProject();

      if (options.verbose) {
        console.error(`Extracted: ${result.statistics.files_processed} files, ${result.statistics.total_nodes} nodes`);
      }

      // Store
      if (options.verbose) {
        console.error('\nStoring in Neo4j...');
      }

      let storeResult;
      if (isIncremental) {
        storeResult = await meshStore.mergeIncrementalExtraction(result, deletedFiles);
      } else {
        storeResult = await meshStore.storeFullExtraction(result);
      }

      await meshStore.close();

      // Summary
      console.error('\n--- Sync Complete ---');
      console.error(`Project: ${projectId}`);
      console.error(`Branch: ${result.git?.branch || 'unknown'}`);
      console.error(`Commit: ${result.git?.commit_short || 'unknown'}`);
      console.error(`Mode: ${isIncremental ? 'incremental' : 'full'}`);
      console.error(`Nodes: -${storeResult.nodes_removed} / +${storeResult.nodes_inserted}`);
      console.error(`Edges: -${storeResult.edges_removed} / +${storeResult.edges_inserted}`);
    } catch (error) {
      console.error('Sync failed:', error);
      process.exit(1);
    }
  });

// Link command - create cross-project links
program
  .command('link')
  .description('Create cross-project links from multiple extraction results')
  .argument('<mesh-files...>', 'Paths to extracted mesh JSON files from different projects')
  .option('-o, --output <file>', 'Output file for links (default: stdout)')
  .option('--min-confidence <n>', 'Minimum confidence for links', '0.5')
  .option('--verbose', 'Verbose output')
  .action(async (meshFiles: string[], options) => {
    try {
      if (meshFiles.length < 2) {
        console.error('Error: Cross-project linking requires at least 2 project extraction results');
        process.exit(1);
      }

      // Load all mesh files
      const projectResults = [];
      for (const meshFile of meshFiles) {
        const content = await fs.readFile(meshFile, 'utf-8');
        projectResults.push(JSON.parse(content));
      }

      if (options.verbose) {
        console.error(`Linking ${projectResults.length} projects:`);
        for (const result of projectResults) {
          const refCount = result.external_references?.length || 0;
          console.error(`  ${result.project_id}: ${refCount} external references`);
        }
      }

      // Create a FileExtractor just for the linking functionality
      const extractor = new FileExtractor({
        id: 'linker',
        name: 'linker',
        path: process.cwd(),
      }, { enableAI: false });

      // Perform cross-project linking
      const linkingResult = await extractor.linkAcrossProjects(projectResults);

      if (options.verbose) {
        console.error('\n--- Linking Results ---');
        console.error(`Matches found: ${linkingResult.stats.totalMatches}`);
        console.error(`Links created: ${linkingResult.stats.linksCreated}`);
        console.error(`Edges created: ${linkingResult.stats.edgesCreated}`);
        console.error('By type:');
        for (const [type, count] of Object.entries(linkingResult.stats.byType)) {
          console.error(`  ${type}: ${count}`);
        }
      }

      // Output result
      const output = JSON.stringify({
        links: linkingResult.links,
        edges: linkingResult.edges,
        stats: linkingResult.stats,
      }, null, 2);

      if (options.output) {
        await fs.writeFile(options.output, output);
        if (options.verbose) {
          console.error(`\nOutput written to: ${options.output}`);
        }
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error('Cross-project linking failed:', error);
      process.exit(1);
    }
  });

program.parse();
