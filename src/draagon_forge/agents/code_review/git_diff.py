"""
Git Diff Parser

Parses git diff output into structured data for review.
"""

import asyncio
import re
from pathlib import Path

from .models import DiffHunk, DiffStats, FileDiff, ReviewMode


class GitDiffParser:
    """Parse git diff output into structured data."""

    # Regex patterns for parsing diff output
    FILE_HEADER = re.compile(r"^diff --git a/(.+) b/(.+)$")
    HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")
    STAT_LINE = re.compile(r"^\s*(.+?)\s+\|\s+(\d+)\s+(\+*)(-*)$")
    RENAME_FROM = re.compile(r"^rename from (.+)$")
    RENAME_TO = re.compile(r"^rename to (.+)$")
    NEW_FILE = re.compile(r"^new file mode")
    DELETED_FILE = re.compile(r"^deleted file mode")
    BINARY_FILE = re.compile(r"^Binary files")

    def __init__(self, repo_path: str | Path | None = None):
        """Initialize parser with optional repo path."""
        self.repo_path = Path(repo_path) if repo_path else Path.cwd()

    async def get_diff(self, mode: ReviewMode, base_branch: str = "main") -> str:
        """Get raw diff based on mode."""
        if mode == ReviewMode.AUTO:
            mode = await self._detect_mode()

        cmd = self._build_diff_command(mode, base_branch)
        return await self._run_git(cmd)

    async def get_stats(self, mode: ReviewMode, base_branch: str = "main") -> DiffStats:
        """Get diff statistics (fast, no full diff content)."""
        if mode == ReviewMode.AUTO:
            mode = await self._detect_mode()

        cmd = self._build_diff_command(mode, base_branch) + ["--stat"]
        output = await self._run_git(cmd)
        return self._parse_stats(output)

    async def get_file_list(
        self, mode: ReviewMode, base_branch: str = "main"
    ) -> list[str]:
        """Get list of changed files only."""
        if mode == ReviewMode.AUTO:
            mode = await self._detect_mode()

        cmd = self._build_diff_command(mode, base_branch) + ["--name-only"]
        output = await self._run_git(cmd)
        return [f.strip() for f in output.split("\n") if f.strip()]

    async def get_file_diff(
        self, file_path: str, mode: ReviewMode, base_branch: str = "main"
    ) -> FileDiff:
        """Get diff for a single file."""
        if mode == ReviewMode.AUTO:
            mode = await self._detect_mode()

        cmd = self._build_diff_command(mode, base_branch) + ["--", file_path]
        output = await self._run_git(cmd)
        diffs = self.parse_diff(output)
        return diffs[0] if diffs else FileDiff(path=file_path)

    def parse_diff(self, diff_output: str) -> list[FileDiff]:
        """Parse full diff output into structured FileDiff objects."""
        files: list[FileDiff] = []
        current_file: FileDiff | None = None
        current_hunk: DiffHunk | None = None
        hunk_content: list[str] = []

        for line in diff_output.split("\n"):
            # Check for new file header
            file_match = self.FILE_HEADER.match(line)
            if file_match:
                # Save previous file
                if current_file:
                    if current_hunk:
                        current_hunk.content = "\n".join(hunk_content)
                        current_file.hunks.append(current_hunk)
                    files.append(current_file)

                # Start new file
                old_path, new_path = file_match.groups()
                current_file = FileDiff(
                    path=new_path,
                    old_path=old_path if old_path != new_path else None,
                    raw_diff=line + "\n",
                )
                current_hunk = None
                hunk_content = []
                continue

            if current_file:
                current_file.raw_diff += line + "\n"

            # Check file status markers
            if self.NEW_FILE.match(line):
                if current_file:
                    current_file.status = "added"
                continue

            if self.DELETED_FILE.match(line):
                if current_file:
                    current_file.status = "deleted"
                continue

            if self.BINARY_FILE.match(line):
                if current_file:
                    current_file.is_binary = True
                continue

            rename_from = self.RENAME_FROM.match(line)
            if rename_from:
                if current_file:
                    current_file.status = "renamed"
                    current_file.old_path = rename_from.group(1)
                continue

            # Check for hunk header
            hunk_match = self.HUNK_HEADER.match(line)
            if hunk_match:
                # Save previous hunk
                if current_hunk and current_file:
                    current_hunk.content = "\n".join(hunk_content)
                    current_file.hunks.append(current_hunk)

                # Start new hunk
                old_start = int(hunk_match.group(1))
                old_count = int(hunk_match.group(2) or "1")
                new_start = int(hunk_match.group(3))
                new_count = int(hunk_match.group(4) or "1")
                header_context = hunk_match.group(5).strip()

                current_hunk = DiffHunk(
                    old_start=old_start,
                    old_count=old_count,
                    new_start=new_start,
                    new_count=new_count,
                    content="",
                    header=header_context,
                )
                hunk_content = [line]
                continue

            # Accumulate hunk content
            if current_hunk:
                hunk_content.append(line)

                # Count additions/deletions
                if current_file:
                    if line.startswith("+") and not line.startswith("+++"):
                        current_file.lines_added += 1
                    elif line.startswith("-") and not line.startswith("---"):
                        current_file.lines_deleted += 1

        # Save final file
        if current_file:
            if current_hunk:
                current_hunk.content = "\n".join(hunk_content)
                current_file.hunks.append(current_hunk)
            files.append(current_file)

        return files

    async def _detect_mode(self) -> ReviewMode:
        """Auto-detect the most appropriate review mode."""
        # Check for staged changes first
        staged = await self._run_git(["diff", "--cached", "--name-only"])
        if staged.strip():
            return ReviewMode.STAGED

        # Check for unstaged changes
        unstaged = await self._run_git(["diff", "--name-only"])
        if unstaged.strip():
            return ReviewMode.UNSTAGED

        # Fall back to branch comparison
        return ReviewMode.BRANCH

    def _build_diff_command(
        self, mode: ReviewMode, base_branch: str = "main"
    ) -> list[str]:
        """Build git diff command for mode."""
        if mode == ReviewMode.STAGED:
            return ["diff", "--cached"]
        elif mode == ReviewMode.UNSTAGED:
            return ["diff"]
        elif mode == ReviewMode.BRANCH:
            return ["diff", f"{base_branch}..HEAD"]
        else:
            # AUTO should have been resolved before this
            return ["diff"]

    def _parse_stats(self, stats_output: str) -> DiffStats:
        """Parse git diff --stat output."""
        stats = DiffStats()
        files: list[tuple[str, int, int]] = []

        for line in stats_output.split("\n"):
            match = self.STAT_LINE.match(line)
            if match:
                path = match.group(1).strip()
                additions = len(match.group(3) or "")
                deletions = len(match.group(4) or "")
                files.append((path, additions, deletions))
                stats.total_additions += additions
                stats.total_deletions += deletions

        stats.files = files
        stats.files_changed = len(files)
        return stats

    async def _run_git(self, args: list[str]) -> str:
        """Run git command and return output."""
        cmd = ["git", "-C", str(self.repo_path)] + args

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode().strip()
            # Don't raise for empty diffs
            if "fatal" not in error_msg.lower():
                return ""
            raise RuntimeError(f"Git command failed: {error_msg}")

        return stdout.decode()
