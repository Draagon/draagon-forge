"""
Unit tests for GitDiffParser.

Tests parsing of git diff output without requiring a real git repository.
Uses fixture data that represents real git diff output formats.
"""

import pytest

from draagon_forge.agents.code_review.git_diff import GitDiffParser
from draagon_forge.agents.code_review.models import ReviewMode


# =============================================================================
# FIXTURES: Sample git diff outputs
# =============================================================================

SIMPLE_DIFF = """\
diff --git a/src/utils.py b/src/utils.py
index 1234567..abcdefg 100644
--- a/src/utils.py
+++ b/src/utils.py
@@ -10,6 +10,8 @@ def helper():
     pass

 def new_function():
+    # Added a comment
+    print("hello")
     return True
"""

MULTI_FILE_DIFF = """\
diff --git a/src/auth.py b/src/auth.py
index 1234567..abcdefg 100644
--- a/src/auth.py
+++ b/src/auth.py
@@ -1,5 +1,7 @@
 def authenticate(user):
+    # Security check
+    validate(user)
     return True

diff --git a/tests/test_auth.py b/tests/test_auth.py
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/tests/test_auth.py
@@ -0,0 +1,10 @@
+import pytest
+from src.auth import authenticate
+
+def test_authenticate():
+    assert authenticate("user") == True
+
+def test_authenticate_invalid():
+    with pytest.raises(ValueError):
+        authenticate(None)
"""

RENAMED_FILE_DIFF = """\
diff --git a/old_name.py b/new_name.py
similarity index 95%
rename from old_name.py
rename to new_name.py
index 1234567..abcdefg 100644
--- a/old_name.py
+++ b/new_name.py
@@ -1,3 +1,4 @@
 def foo():
+    # Added
     pass
"""

DELETED_FILE_DIFF = """\
diff --git a/removed.py b/removed.py
deleted file mode 100644
index 1234567..0000000
--- a/removed.py
+++ /dev/null
@@ -1,5 +0,0 @@
-def old_function():
-    pass
-
-def another_old():
-    return None
"""

BINARY_FILE_DIFF = """\
diff --git a/image.png b/image.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/image.png differ
"""

LARGE_HUNK_DIFF = """\
diff --git a/large_file.py b/large_file.py
index 1234567..abcdefg 100644
--- a/large_file.py
+++ b/large_file.py
@@ -1,100 +1,150 @@ class BigClass:
+    # Line 1
+    # Line 2
+    # Line 3
+    # Line 4
+    # Line 5
+    # Line 6
+    # Line 7
+    # Line 8
+    # Line 9
+    # Line 10
+    # Line 11
+    # Line 12
+    # Line 13
+    # Line 14
+    # Line 15
+    # Line 16
+    # Line 17
+    # Line 18
+    # Line 19
+    # Line 20
+    # Line 21
+    # Line 22
+    # Line 23
+    # Line 24
+    # Line 25
+    # Line 26
+    # Line 27
+    # Line 28
+    # Line 29
+    # Line 30
+    # Line 31
+    # Line 32
+    # Line 33
+    # Line 34
+    # Line 35
+    # Line 36
+    # Line 37
+    # Line 38
+    # Line 39
+    # Line 40
+    # Line 41
+    # Line 42
+    # Line 43
+    # Line 44
+    # Line 45
+    # Line 46
+    # Line 47
+    # Line 48
+    # Line 49
+    # Line 50
     def method(self):
         pass
"""


# =============================================================================
# UNIT TESTS: parse_diff()
# =============================================================================

class TestParseDiff:
    """Tests for GitDiffParser.parse_diff()."""

    def test_parse_simple_diff(self):
        """Parse a basic single-file diff."""
        parser = GitDiffParser()
        files = parser.parse_diff(SIMPLE_DIFF)

        assert len(files) == 1
        assert files[0].path == "src/utils.py"
        assert files[0].status == "modified"
        assert files[0].lines_added == 2
        assert files[0].lines_deleted == 0
        assert len(files[0].hunks) == 1

    def test_parse_multi_file_diff(self):
        """Parse diff with multiple files."""
        parser = GitDiffParser()
        files = parser.parse_diff(MULTI_FILE_DIFF)

        assert len(files) == 2

        # First file - modified
        assert files[0].path == "src/auth.py"
        assert files[0].status == "modified"
        assert files[0].lines_added == 2

        # Second file - new
        assert files[1].path == "tests/test_auth.py"
        assert files[1].status == "added"
        assert files[1].lines_added == 10

    def test_parse_renamed_file(self):
        """Parse diff with renamed file."""
        parser = GitDiffParser()
        files = parser.parse_diff(RENAMED_FILE_DIFF)

        assert len(files) == 1
        assert files[0].path == "new_name.py"
        assert files[0].old_path == "old_name.py"
        assert files[0].status == "renamed"

    def test_parse_deleted_file(self):
        """Parse diff with deleted file."""
        parser = GitDiffParser()
        files = parser.parse_diff(DELETED_FILE_DIFF)

        assert len(files) == 1
        assert files[0].path == "removed.py"
        assert files[0].status == "deleted"
        assert files[0].lines_deleted == 5
        assert files[0].lines_added == 0

    def test_parse_binary_file(self):
        """Parse diff with binary file."""
        parser = GitDiffParser()
        files = parser.parse_diff(BINARY_FILE_DIFF)

        assert len(files) == 1
        assert files[0].path == "image.png"
        assert files[0].is_binary is True

    def test_parse_empty_diff(self):
        """Parse empty diff returns empty list."""
        parser = GitDiffParser()
        files = parser.parse_diff("")

        assert files == []

    def test_parse_preserves_raw_diff(self):
        """Raw diff content is preserved."""
        parser = GitDiffParser()
        files = parser.parse_diff(SIMPLE_DIFF)

        assert "def new_function" in files[0].raw_diff

    def test_hunk_header_context_preserved(self):
        """Hunk headers preserve function context."""
        parser = GitDiffParser()
        files = parser.parse_diff(LARGE_HUNK_DIFF)

        assert len(files[0].hunks) == 1
        # The "class BigClass:" context should be in header
        assert "BigClass" in files[0].hunks[0].header

    def test_total_lines_changed_property(self):
        """total_lines_changed sums additions and deletions."""
        parser = GitDiffParser()
        files = parser.parse_diff(DELETED_FILE_DIFF)

        assert files[0].total_lines_changed == 5  # 0 added + 5 deleted


# =============================================================================
# UNIT TESTS: _build_diff_command()
# =============================================================================

class TestBuildDiffCommand:
    """Tests for command building."""

    def test_staged_mode_command(self):
        """Staged mode uses --cached flag."""
        parser = GitDiffParser()
        cmd = parser._build_diff_command(ReviewMode.STAGED)

        assert cmd == ["diff", "--cached"]

    def test_unstaged_mode_command(self):
        """Unstaged mode uses plain diff."""
        parser = GitDiffParser()
        cmd = parser._build_diff_command(ReviewMode.UNSTAGED)

        assert cmd == ["diff"]

    def test_branch_mode_command(self):
        """Branch mode compares to base branch."""
        parser = GitDiffParser()
        cmd = parser._build_diff_command(ReviewMode.BRANCH, "develop")

        assert cmd == ["diff", "develop..HEAD"]

    def test_branch_mode_default_main(self):
        """Branch mode defaults to main."""
        parser = GitDiffParser()
        cmd = parser._build_diff_command(ReviewMode.BRANCH)

        assert cmd == ["diff", "main..HEAD"]


# =============================================================================
# UNIT TESTS: _parse_stats()
# =============================================================================

class TestParseStats:
    """Tests for stats parsing."""

    def test_parse_stats_output(self):
        """Parse git diff --stat output."""
        stats_output = """\
 src/auth.py       | 10 +++++++---
 src/utils.py      |  5 +++++
 tests/test_auth.py| 20 ++++++++++++++++++++
 3 files changed, 32 insertions(+), 3 deletions(-)
"""
        parser = GitDiffParser()
        stats = parser._parse_stats(stats_output)

        assert stats.files_changed == 3
        assert stats.total_additions > 0
        assert stats.total_deletions > 0


# =============================================================================
# INTEGRATION TESTS: With real git repo (marked for skip if no git)
# =============================================================================

@pytest.mark.integration
class TestGitDiffIntegration:
    """Integration tests that require a real git repository."""

    @pytest.fixture
    def temp_git_repo(self, tmp_path):
        """Create a temporary git repository."""
        import subprocess

        repo_path = tmp_path / "test_repo"
        repo_path.mkdir()

        # Initialize git repo
        subprocess.run(["git", "init"], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.email", "test@test.com"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Create initial file and commit
        (repo_path / "initial.py").write_text("# Initial file\n")
        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        return repo_path

    @pytest.mark.asyncio
    async def test_detect_mode_with_staged_changes(self, temp_git_repo):
        """Auto-detect mode returns STAGED when there are staged changes."""
        import subprocess

        # Create and stage a new file
        (temp_git_repo / "new_file.py").write_text("# New file\n")
        subprocess.run(
            ["git", "add", "new_file.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        parser = GitDiffParser(temp_git_repo)
        mode = await parser._detect_mode()

        assert mode == ReviewMode.STAGED

    @pytest.mark.asyncio
    async def test_detect_mode_with_unstaged_changes(self, temp_git_repo):
        """Auto-detect mode returns UNSTAGED when there are only unstaged changes."""
        # Modify existing file without staging
        (temp_git_repo / "initial.py").write_text("# Modified\nprint('hello')\n")

        parser = GitDiffParser(temp_git_repo)
        mode = await parser._detect_mode()

        assert mode == ReviewMode.UNSTAGED

    @pytest.mark.asyncio
    async def test_detect_mode_no_changes(self, temp_git_repo):
        """Auto-detect mode returns BRANCH when no local changes."""
        parser = GitDiffParser(temp_git_repo)
        mode = await parser._detect_mode()

        # No staged or unstaged, falls back to branch
        assert mode == ReviewMode.BRANCH

    @pytest.mark.asyncio
    async def test_get_file_list_staged(self, temp_git_repo):
        """Get list of staged files."""
        import subprocess

        # Create and stage files
        (temp_git_repo / "file1.py").write_text("# File 1\n")
        (temp_git_repo / "file2.py").write_text("# File 2\n")
        subprocess.run(
            ["git", "add", "file1.py", "file2.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        parser = GitDiffParser(temp_git_repo)
        files = await parser.get_file_list(ReviewMode.STAGED)

        assert "file1.py" in files
        assert "file2.py" in files
        assert len(files) == 2

    @pytest.mark.asyncio
    async def test_get_diff_returns_parseable_output(self, temp_git_repo):
        """get_diff returns output that can be parsed."""
        import subprocess

        # Create and stage a file with content
        (temp_git_repo / "code.py").write_text("def hello():\n    print('hello')\n")
        subprocess.run(
            ["git", "add", "code.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        parser = GitDiffParser(temp_git_repo)
        raw_diff = await parser.get_diff(ReviewMode.STAGED)
        files = parser.parse_diff(raw_diff)

        assert len(files) == 1
        assert files[0].path == "code.py"
        assert files[0].lines_added == 2
