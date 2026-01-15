"""
GitSync - Clone and synchronize git repositories for mesh extraction.

Provides:
- Clone repositories from remote URLs
- Pull updates for existing clones
- Track sync status and last updated commits
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class GitSyncResult:
    """Result of a git sync operation."""

    success: bool
    action: str  # "clone", "pull", "noop"
    commit: Optional[str] = None
    changed_files: list[str] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.changed_files is None:
            self.changed_files = []


class GitSync:
    """
    Synchronize git repositories for mesh extraction.

    Features:
    - Clone new repositories
    - Pull updates for existing clones
    - Track changed files between syncs
    - Support for specific branches
    """

    def __init__(self, clone_dir: str | Path = "~/.draagon-forge/repos"):
        """
        Initialize GitSync.

        Args:
            clone_dir: Directory to clone repositories into
        """
        self.clone_dir = Path(clone_dir).expanduser()
        self.clone_dir.mkdir(parents=True, exist_ok=True)

    def _get_repo_path(self, repo_url: str) -> Path:
        """Get local path for a repository."""
        # Extract repo name from URL
        # git@github.com:user/repo.git -> repo
        # https://github.com/user/repo.git -> repo
        repo_name = repo_url.rstrip("/").split("/")[-1]
        if repo_name.endswith(".git"):
            repo_name = repo_name[:-4]

        return self.clone_dir / repo_name

    def clone(
        self,
        repo_url: str,
        branch: str = "main",
        target_path: Optional[str | Path] = None,
    ) -> GitSyncResult:
        """
        Clone a repository.

        Args:
            repo_url: Git repository URL
            branch: Branch to checkout
            target_path: Custom path (uses clone_dir if not provided)

        Returns:
            GitSyncResult with clone status
        """
        path = Path(target_path) if target_path else self._get_repo_path(repo_url)

        if path.exists():
            logger.info("Repository already exists, pulling instead", path=str(path))
            return self.pull(path, branch)

        try:
            logger.info("Cloning repository", url=repo_url, branch=branch, path=str(path))

            result = subprocess.run(
                ["git", "clone", "--branch", branch, "--single-branch", repo_url, str(path)],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                return GitSyncResult(
                    success=False,
                    action="clone",
                    error=result.stderr,
                )

            # Get HEAD commit
            commit = self._get_head_commit(path)

            logger.info("Clone successful", path=str(path), commit=commit)
            return GitSyncResult(
                success=True,
                action="clone",
                commit=commit,
            )

        except subprocess.TimeoutExpired:
            return GitSyncResult(
                success=False,
                action="clone",
                error="Clone timed out",
            )

        except Exception as e:
            return GitSyncResult(
                success=False,
                action="clone",
                error=str(e),
            )

    def pull(
        self,
        path: str | Path,
        branch: str = "main",
        from_commit: Optional[str] = None,
    ) -> GitSyncResult:
        """
        Pull updates for a repository.

        Args:
            path: Local repository path
            branch: Branch to pull
            from_commit: Previous commit to diff against (for changed files)

        Returns:
            GitSyncResult with pull status
        """
        path = Path(path)

        if not path.exists():
            return GitSyncResult(
                success=False,
                action="pull",
                error=f"Repository not found: {path}",
            )

        try:
            # Get current commit before pull
            old_commit = from_commit or self._get_head_commit(path)

            # Checkout branch and pull
            logger.info("Pulling repository", path=str(path), branch=branch)

            # Fetch first
            fetch_result = subprocess.run(
                ["git", "-C", str(path), "fetch", "origin", branch],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if fetch_result.returncode != 0:
                return GitSyncResult(
                    success=False,
                    action="pull",
                    error=f"Fetch failed: {fetch_result.stderr}",
                )

            # Reset to origin branch
            reset_result = subprocess.run(
                ["git", "-C", str(path), "reset", "--hard", f"origin/{branch}"],
                capture_output=True,
                text=True,
            )

            if reset_result.returncode != 0:
                return GitSyncResult(
                    success=False,
                    action="pull",
                    error=f"Reset failed: {reset_result.stderr}",
                )

            # Get new commit
            new_commit = self._get_head_commit(path)

            # Check if there were changes
            if old_commit == new_commit:
                logger.info("No changes", path=str(path), commit=new_commit)
                return GitSyncResult(
                    success=True,
                    action="noop",
                    commit=new_commit,
                )

            # Get changed files
            changed_files = self._get_changed_files(path, old_commit, new_commit)

            logger.info(
                "Pull successful",
                path=str(path),
                commit=new_commit,
                changed=len(changed_files),
            )

            return GitSyncResult(
                success=True,
                action="pull",
                commit=new_commit,
                changed_files=changed_files,
            )

        except subprocess.TimeoutExpired:
            return GitSyncResult(
                success=False,
                action="pull",
                error="Pull timed out",
            )

        except Exception as e:
            return GitSyncResult(
                success=False,
                action="pull",
                error=str(e),
            )

    def sync(
        self,
        repo_url: str,
        branch: str = "main",
        from_commit: Optional[str] = None,
    ) -> GitSyncResult:
        """
        Sync a repository (clone if needed, pull if exists).

        Args:
            repo_url: Git repository URL
            branch: Branch to sync
            from_commit: Previous commit (for changed files)

        Returns:
            GitSyncResult with sync status
        """
        path = self._get_repo_path(repo_url)

        if path.exists():
            return self.pull(path, branch, from_commit)
        else:
            return self.clone(repo_url, branch)

    def _get_head_commit(self, path: Path) -> Optional[str]:
        """Get HEAD commit hash."""
        try:
            result = subprocess.run(
                ["git", "-C", str(path), "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        return None

    def _get_changed_files(
        self,
        path: Path,
        from_commit: str,
        to_commit: str,
    ) -> list[str]:
        """Get list of changed files between commits."""
        try:
            result = subprocess.run(
                ["git", "-C", str(path), "diff", "--name-only", from_commit, to_commit],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return [f for f in result.stdout.strip().split("\n") if f]
        except Exception:
            pass
        return []

    def get_repo_path(self, repo_url: str) -> Path:
        """Get the local path for a repository URL."""
        return self._get_repo_path(repo_url)
