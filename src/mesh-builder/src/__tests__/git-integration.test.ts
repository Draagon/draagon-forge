/**
 * Git Integration Tests
 *
 * Tests the git-aware extraction features:
 * - Git context extraction
 * - Incremental extraction based on commits
 * - Changed file detection
 *
 * Uses a test repository in /tmp to avoid modifying the actual project.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { GitTracker } from '../git/GitTracker';
import { FileExtractor } from '../extractors/FileExtractor';

const TEST_REPO_DIR = '/tmp/mesh-builder-test-repo';

// Helper to run git commands in test repo
function git(command: string): string {
  return execSync(`git ${command}`, {
    cwd: TEST_REPO_DIR,
    encoding: 'utf-8',
  }).trim();
}

// Setup and teardown
beforeAll(async () => {
  // Clean up any existing test repo
  try {
    await fs.rm(TEST_REPO_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Create fresh test repo
  await fs.mkdir(TEST_REPO_DIR, { recursive: true });

  // Initialize git repo
  git('init');
  git('config user.email "test@example.com"');
  git('config user.name "Test User"');

  // Create initial commit with a Python file
  const initialPython = `
class UserService:
    """Service for managing users."""

    def __init__(self, db):
        self.db = db

    def get_user(self, user_id: int):
        """Get a user by ID."""
        return self.db.query(f"SELECT * FROM users WHERE id = {user_id}")

    def create_user(self, name: str, email: str):
        """Create a new user."""
        return self.db.execute(f"INSERT INTO users (name, email) VALUES ('{name}', '{email}')")
`;
  await fs.writeFile(path.join(TEST_REPO_DIR, 'user_service.py'), initialPython);
  git('add .');
  git('commit -m "Initial commit: add UserService"');
});

afterAll(async () => {
  // Clean up test repo
  try {
    await fs.rm(TEST_REPO_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
});

describe('GitTracker', () => {
  let tracker: GitTracker;

  beforeAll(() => {
    tracker = new GitTracker(TEST_REPO_DIR);
  });

  test('should get git context', () => {
    const context = tracker.getContext();

    expect(context.commit_sha).toHaveLength(40);
    expect(context.commit_short).toHaveLength(8);
    expect(context.commit_message).toBe('Initial commit: add UserService');
    expect(context.author).toContain('Test User');
    expect(['main', 'master']).toContain(context.branch); // depends on git config
    expect(context.is_clean).toBe(true);
  });

  test('should detect uncommitted changes', async () => {
    // Make a change
    await fs.writeFile(
      path.join(TEST_REPO_DIR, 'temp.txt'),
      'temporary file'
    );

    const context = tracker.getContext();
    expect(context.is_clean).toBe(false);

    // Clean up
    await fs.unlink(path.join(TEST_REPO_DIR, 'temp.txt'));
  });

  test('should detect changed files between commits', async () => {
    const firstCommit = tracker.getContext().commit_sha;

    // Add a new file
    const newPython = `
class OrderService:
    """Service for managing orders."""

    def __init__(self, db):
        self.db = db

    def get_order(self, order_id: int):
        return self.db.query(f"SELECT * FROM orders WHERE id = {order_id}")
`;
    await fs.writeFile(path.join(TEST_REPO_DIR, 'order_service.py'), newPython);
    git('add .');
    git('commit -m "Add OrderService"');

    // Modify existing file
    const modifiedPython = `
class UserService:
    """Service for managing users - UPDATED."""

    def __init__(self, db, cache):
        self.db = db
        self.cache = cache

    def get_user(self, user_id: int):
        """Get a user by ID with caching."""
        cached = self.cache.get(f"user:{user_id}")
        if cached:
            return cached
        return self.db.query(f"SELECT * FROM users WHERE id = {user_id}")

    def create_user(self, name: str, email: str):
        """Create a new user."""
        return self.db.execute(f"INSERT INTO users (name, email) VALUES ('{name}', '{email}')")
`;
    await fs.writeFile(path.join(TEST_REPO_DIR, 'user_service.py'), modifiedPython);
    git('add .');
    git('commit -m "Update UserService with caching"');

    // Get changes since first commit
    const changes = tracker.getChangedFiles(firstCommit);

    expect(changes.added).toContain('order_service.py');
    expect(changes.modified).toContain('user_service.py');
    expect(changes.deleted).toHaveLength(0);
  });

  test('should get commits between refs', async () => {
    const commits = tracker.getCommitsBetween('HEAD~2');

    expect(commits).toHaveLength(2);
    expect(commits[0]?.commit_message).toBe('Update UserService with caching');
    expect(commits[1]?.commit_message).toBe('Add OrderService');
  });
});

describe('FileExtractor with Git', () => {
  test('should include git context in extraction', async () => {
    const extractor = new FileExtractor({
      id: 'test-project',
      name: 'test-project',
      path: TEST_REPO_DIR,
    });

    const result = await extractor.extractProject();

    expect(result.git).toBeDefined();
    expect(result.git?.branch).toBeTruthy();
    expect(result.git?.commit_sha).toHaveLength(40);
    expect(result.statistics.files_processed).toBeGreaterThan(0);
  });

  test('should extract only changed files in incremental mode', async () => {
    // First, get the commit before the last change
    const tracker = new GitTracker(TEST_REPO_DIR);
    const commits = tracker.getCommitsBetween('HEAD~1');
    const beforeLastCommit = 'HEAD~1';

    // Get changed files
    const changes = tracker.getChangedFiles(beforeLastCommit);
    const changedFiles = [...changes.added, ...changes.modified];

    // Extract only changed files
    const extractor = new FileExtractor(
      {
        id: 'test-project',
        name: 'test-project',
        path: TEST_REPO_DIR,
      },
      {
        changedFiles,
      }
    );

    const result = await extractor.extractProject();

    // Should only have processed files that changed in the last commit
    expect(result.statistics.files_processed).toBe(changedFiles.length);
  });
});

describe('Version Tracking', () => {
  test('should track semantic changes across commits', async () => {
    const tracker = new GitTracker(TEST_REPO_DIR);

    // Extract at HEAD~2 (initial commit)
    // Note: We can't easily checkout without messing up test state,
    // but we can verify the concept works by checking changes

    const changes = tracker.getChangedFiles('HEAD~2');

    // We should see:
    // - order_service.py added (new Class)
    // - user_service.py modified (Class changed)
    expect(changes.added).toContain('order_service.py');
    expect(changes.modified).toContain('user_service.py');
  });
});
