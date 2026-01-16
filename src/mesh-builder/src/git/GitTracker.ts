/**
 * GitTracker - Version-aware extraction tracking with git integration.
 *
 * Key capabilities:
 * 1. Tag extractions with git context (commit, branch, tag)
 * 2. Track extraction state per project/branch
 * 3. Incremental extraction - only process files changed since last run
 * 4. Semantic diff between commits/branches
 * 5. Cross-project version tracking (which version depends on which)
 *
 * This enables:
 * - "When did this function signature change?"
 * - "What commits modified the API between these services?"
 * - "Show me the structural diff between v1.2 and v2.0"
 */

import { execSync } from 'child_process';
import * as path from 'path';

// ============================================================================
// Git Context Types
// ============================================================================

/** Git context for a specific point in time */
export interface GitContext {
  /** Full commit SHA */
  commit_sha: string;
  /** Short commit SHA (first 8 chars) */
  commit_short: string;
  /** Commit message (first line) */
  commit_message: string;
  /** Commit author */
  author: string;
  /** Commit timestamp (ISO) */
  committed_at: string;
  /** Current branch name */
  branch: string;
  /** Git tags on this commit */
  tags: string[];
  /** Is the working directory clean? */
  is_clean: boolean;
  /** Remote origin URL (if available) */
  remote_url?: string;
}

/** State of extraction for a project/branch combination */
export interface ExtractionState {
  /** Project identifier */
  project_id: string;
  /** Branch name */
  branch: string;
  /** Last extracted commit SHA */
  last_commit: string;
  /** When the extraction happened */
  extracted_at: string;
  /** Number of files extracted */
  files_extracted: number;
  /** Number of nodes in the mesh */
  total_nodes: number;
  /** Number of edges in the mesh */
  total_edges: number;
}

/** Files changed between two commits */
export interface ChangedFiles {
  /** Commit range (from..to) */
  from_commit: string;
  to_commit: string;
  /** Added files */
  added: string[];
  /** Modified files */
  modified: string[];
  /** Deleted files */
  deleted: string[];
  /** Renamed files (old -> new) */
  renamed: Array<{ from: string; to: string }>;
}

/** Semantic diff between two extraction states */
export interface SemanticDiff {
  /** Git context for 'from' state */
  from_context: GitContext;
  /** Git context for 'to' state */
  to_context: GitContext;
  /** Added nodes */
  added_nodes: NodeDiff[];
  /** Removed nodes */
  removed_nodes: NodeDiff[];
  /** Modified nodes (signature/type changed) */
  modified_nodes: NodeModification[];
  /** Added edges */
  added_edges: EdgeDiff[];
  /** Removed edges */
  removed_edges: EdgeDiff[];
}

/** A node in a diff */
export interface NodeDiff {
  type: string;
  name: string;
  file: string;
  line: number;
}

/** A modified node showing before/after */
export interface NodeModification {
  type: string;
  name: string;
  file: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changed_properties: string[];
}

/** An edge in a diff */
export interface EdgeDiff {
  type: string;
  from: string;
  to: string;
}

/** Cross-project dependency with version info */
export interface VersionedDependency {
  /** Source project */
  from_project: string;
  from_project_commit: string;
  from_project_branch: string;
  /** Target project */
  to_project: string;
  /** Version constraint (if known from package.json, requirements.txt, etc.) */
  version_constraint?: string;
  /** Resolved version (if we can determine it) */
  resolved_version?: string;
  /** Type of dependency */
  dependency_type: 'api' | 'queue' | 'database' | 'library' | 'config';
  /** Confidence in this link */
  confidence: number;
}

// ============================================================================
// GitTracker Implementation
// ============================================================================

export class GitTracker {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  /**
   * Get the current git context for the project.
   */
  getContext(): GitContext {
    const commit_sha = this.exec('git rev-parse HEAD');
    const commit_short = commit_sha.substring(0, 8);
    const commit_message = this.exec('git log -1 --pretty=%s');
    // Use format string without special shell characters
    const authorName = this.exec('git log -1 --pretty=%an');
    const authorEmail = this.exec('git log -1 --pretty=%ae');
    const author = `${authorName} <${authorEmail}>`;
    const committed_at = this.exec('git log -1 --pretty=%ci');
    const branch = this.getCurrentBranch();
    const tags = this.getTagsForCommit(commit_sha);
    const is_clean = this.isWorkingTreeClean();
    const remote_url = this.getRemoteUrl();

    return {
      commit_sha,
      commit_short,
      commit_message,
      author,
      committed_at,
      branch,
      tags,
      is_clean,
      remote_url,
    };
  }

  /**
   * Get current branch name.
   */
  getCurrentBranch(): string {
    try {
      return this.exec('git rev-parse --abbrev-ref HEAD');
    } catch {
      // Detached HEAD - return commit SHA
      return this.exec('git rev-parse --short HEAD');
    }
  }

  /**
   * Get tags pointing to a specific commit.
   */
  getTagsForCommit(commitSha: string): string[] {
    try {
      const output = this.exec(`git tag --points-at ${commitSha}`);
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /**
   * Check if working tree is clean (no uncommitted changes).
   */
  isWorkingTreeClean(): boolean {
    try {
      const status = this.exec('git status --porcelain');
      return status.trim() === '';
    } catch {
      return false;
    }
  }

  /**
   * Get remote origin URL.
   */
  getRemoteUrl(): string | undefined {
    try {
      return this.exec('git remote get-url origin') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get files changed between two commits.
   */
  getChangedFiles(fromCommit: string, toCommit: string = 'HEAD'): ChangedFiles {
    const result: ChangedFiles = {
      from_commit: fromCommit,
      to_commit: toCommit,
      added: [],
      modified: [],
      deleted: [],
      renamed: [],
    };

    try {
      // Get diff with status codes
      const output = this.exec(
        `git diff --name-status ${fromCommit}..${toCommit}`
      );

      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        const status = parts[0];
        const file = parts[1];
        const newFile = parts[2]; // For renames

        if (!status || !file) continue;

        if (status === 'A') {
          result.added.push(file);
        } else if (status === 'M') {
          result.modified.push(file);
        } else if (status === 'D') {
          result.deleted.push(file);
        } else if (status.startsWith('R')) {
          // R100 = 100% rename, R090 = 90% rename (some modification)
          result.renamed.push({ from: file, to: newFile || file });
        }
      }
    } catch (error) {
      // Return empty result if git command fails
    }

    return result;
  }

  /**
   * Get files changed in the last N commits.
   */
  getFilesChangedInLastCommits(count: number): string[] {
    try {
      const output = this.exec(
        `git diff --name-only HEAD~${count}..HEAD`
      );
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get all commits between two refs.
   */
  getCommitsBetween(fromRef: string, toRef: string = 'HEAD'): GitContext[] {
    // Using tab as separator to avoid issues with | in commit messages
    const output = this.exec(
      `git log --pretty=format:"%H\t%h\t%s\t%an\t%ae\t%ci" ${fromRef}..${toRef}`
    );

    return output.split('\n').filter(Boolean).map((line) => {
      const [sha, short, message, authorName, authorEmail, date] = line.split('\t');
      return {
        commit_sha: sha || '',
        commit_short: short || '',
        commit_message: message || '',
        author: `${authorName || ''} <${authorEmail || ''}>`,
        committed_at: date || '',
        branch: this.getCurrentBranch(),
        tags: this.getTagsForCommit(sha || ''),
        is_clean: true, // Historical commits are always "clean"
        remote_url: this.getRemoteUrl(),
      };
    });
  }

  /**
   * Get list of all local branches.
   */
  getAllBranches(): string[] {
    const output = this.exec('git branch --format="%(refname:short)"');
    return output.split('\n').filter(Boolean);
  }

  /**
   * Get list of all tags.
   */
  getAllTags(): string[] {
    const output = this.exec('git tag --list');
    return output.split('\n').filter(Boolean);
  }

  /**
   * Checkout a specific commit/branch/tag.
   * WARNING: This modifies the working directory!
   */
  checkout(ref: string): void {
    this.exec(`git checkout ${ref}`);
  }

  /**
   * Stash current changes (useful before checkout).
   */
  stash(): void {
    this.exec('git stash');
  }

  /**
   * Pop stashed changes.
   */
  stashPop(): void {
    this.exec('git stash pop');
  }

  /**
   * Check if a ref exists.
   */
  refExists(ref: string): boolean {
    try {
      this.exec(`git rev-parse --verify ${ref}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the merge base between two branches.
   */
  getMergeBase(branch1: string, branch2: string): string {
    return this.exec(`git merge-base ${branch1} ${branch2}`);
  }

  /**
   * Clone a repository to a specific directory.
   * Static method - doesn't require an instance.
   */
  static clone(repoUrl: string, targetDir: string, branch?: string): GitTracker {
    const branchArg = branch ? `-b ${branch}` : '';
    execSync(`git clone ${branchArg} ${repoUrl} ${targetDir}`, {
      encoding: 'utf-8',
    });
    return new GitTracker(targetDir);
  }

  /**
   * Pull latest changes.
   */
  pull(): void {
    this.exec('git pull');
  }

  /**
   * Fetch all remotes.
   */
  fetch(): void {
    this.exec('git fetch --all');
  }

  private exec(command: string): string {
    return execSync(command, {
      cwd: this.projectPath,
      encoding: 'utf-8',
    }).trim();
  }
}

// ============================================================================
// Extraction State Storage
// ============================================================================

/**
 * ExtractionStateStore - Tracks extraction state in Neo4j.
 *
 * Node structure:
 * (:ExtractionRun {
 *   id: uuid,
 *   project_id: string,
 *   branch: string,
 *   commit_sha: string,
 *   commit_short: string,
 *   commit_message: string,
 *   author: string,
 *   committed_at: datetime,
 *   extracted_at: datetime,
 *   files_extracted: int,
 *   total_nodes: int,
 *   total_edges: int,
 *   tags: [string],
 *   is_clean: boolean,
 *   remote_url: string
 * })
 *
 * Relationships:
 * (:ExtractionRun)-[:NEXT]->(:ExtractionRun)  // Chronological order per branch
 * (:ExtractionRun)-[:EXTRACTED]->(:MeshNode)  // Links to extracted nodes
 * (:Project)-[:HAS_EXTRACTION]->(:ExtractionRun)
 */
export class ExtractionStateStore {
  private driver: any;
  private config: { uri: string; user: string; password: string };

  constructor(config: { uri: string; user: string; password: string }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const neo4j = await import('neo4j-driver');
    this.driver = neo4j.default.driver(
      this.config.uri,
      neo4j.default.auth.basic(this.config.user, this.config.password)
    );
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  /**
   * Initialize indexes and constraints.
   */
  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE CONSTRAINT extraction_run_id IF NOT EXISTS
        FOR (e:ExtractionRun) REQUIRE e.id IS UNIQUE
      `);
      await session.run(`
        CREATE INDEX extraction_project_branch IF NOT EXISTS
        FOR (e:ExtractionRun) ON (e.project_id, e.branch)
      `);
      await session.run(`
        CREATE INDEX extraction_commit IF NOT EXISTS
        FOR (e:ExtractionRun) ON (e.commit_sha)
      `);
    } finally {
      await session.close();
    }
  }

  /**
   * Record a new extraction run.
   */
  async recordExtraction(
    projectId: string,
    context: GitContext,
    stats: { files: number; nodes: number; edges: number }
  ): Promise<string> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        // Create extraction run
        CREATE (e:ExtractionRun {
          id: randomUUID(),
          project_id: $project_id,
          branch: $branch,
          commit_sha: $commit_sha,
          commit_short: $commit_short,
          commit_message: $commit_message,
          author: $author,
          committed_at: datetime($committed_at),
          extracted_at: datetime(),
          files_extracted: $files,
          total_nodes: $nodes,
          total_edges: $edges,
          tags: $tags,
          is_clean: $is_clean,
          remote_url: $remote_url
        })

        // Link to previous extraction for this branch
        WITH e
        OPTIONAL MATCH (prev:ExtractionRun {project_id: $project_id, branch: $branch})
        WHERE prev.id <> e.id
        WITH e, prev
        ORDER BY prev.extracted_at DESC
        LIMIT 1
        FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
          CREATE (prev)-[:NEXT]->(e)
        )

        RETURN e.id AS id
        `,
        {
          project_id: projectId,
          branch: context.branch,
          commit_sha: context.commit_sha,
          commit_short: context.commit_short,
          commit_message: context.commit_message,
          author: context.author,
          committed_at: context.committed_at,
          files: stats.files,
          nodes: stats.nodes,
          edges: stats.edges,
          tags: context.tags,
          is_clean: context.is_clean,
          remote_url: context.remote_url || null,
        }
      );

      const record = result.records[0];
      return record ? record.get('id') : '';
    } finally {
      await session.close();
    }
  }

  /**
   * Get the last extraction for a project/branch.
   */
  async getLastExtraction(
    projectId: string,
    branch: string
  ): Promise<ExtractionState | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (e:ExtractionRun {project_id: $project_id, branch: $branch})
        RETURN e
        ORDER BY e.extracted_at DESC
        LIMIT 1
        `,
        { project_id: projectId, branch }
      );

      const record = result.records[0];
      if (!record) return null;

      const e = record.get('e').properties;
      return {
        project_id: e.project_id,
        branch: e.branch,
        last_commit: e.commit_sha,
        extracted_at: e.extracted_at.toString(),
        files_extracted: e.files_extracted.toNumber(),
        total_nodes: e.total_nodes.toNumber(),
        total_edges: e.total_edges.toNumber(),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get all extractions for a project (across all branches).
   */
  async getProjectExtractions(projectId: string): Promise<GitContext[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (e:ExtractionRun {project_id: $project_id})
        RETURN e
        ORDER BY e.extracted_at DESC
        `,
        { project_id: projectId }
      );

      return result.records.map((r: any) => {
        const e = r.get('e').properties;
        return {
          commit_sha: e.commit_sha,
          commit_short: e.commit_short,
          commit_message: e.commit_message,
          author: e.author,
          committed_at: e.committed_at.toString(),
          branch: e.branch,
          tags: e.tags || [],
          is_clean: e.is_clean,
          remote_url: e.remote_url || undefined,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get extraction for a specific commit.
   */
  async getExtractionByCommit(
    projectId: string,
    commitSha: string
  ): Promise<ExtractionState | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (e:ExtractionRun {project_id: $project_id})
        WHERE e.commit_sha = $commit OR e.commit_short = $commit
        RETURN e
        LIMIT 1
        `,
        { project_id: projectId, commit: commitSha }
      );

      const record = result.records[0];
      if (!record) return null;

      const e = record.get('e').properties;
      return {
        project_id: e.project_id,
        branch: e.branch,
        last_commit: e.commit_sha,
        extracted_at: e.extracted_at.toString(),
        files_extracted: e.files_extracted.toNumber(),
        total_nodes: e.total_nodes.toNumber(),
        total_edges: e.total_edges.toNumber(),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Check if a commit has already been extracted.
   */
  async isCommitExtracted(projectId: string, commitSha: string): Promise<boolean> {
    const extraction = await this.getExtractionByCommit(projectId, commitSha);
    return extraction !== null;
  }
}
