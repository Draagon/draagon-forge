"""
Integration tests for CodeReviewAgent.

These tests verify the agent works correctly with all components together.
Uses a real git repository but mocks the LLM to avoid costs.
"""

import asyncio
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from draagon_forge.agents.code_review.agent import CodeReviewAgent
from draagon_forge.agents.code_review.models import (
    IssueSeverity,
    ReviewMode,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def mock_llm():
    """Mock LLM that returns predictable review responses."""
    llm = AsyncMock()

    # Return a well-formed XML response
    llm.generate.return_value = """
<issues>
  <issue severity='warning'>
    <message>Consider adding error handling</message>
    <line>5</line>
    <suggestion>Wrap in try/except block</suggestion>
  </issue>
</issues>
<summary>Found one minor issue with error handling.</summary>
"""
    return llm


@pytest.fixture
def mock_llm_blocking_issue():
    """Mock LLM that returns a blocking issue."""
    llm = AsyncMock()
    llm.generate.return_value = """
<issues>
  <issue severity='blocking'>
    <message>SQL injection vulnerability detected</message>
    <line>10</line>
    <suggestion>Use parameterized queries</suggestion>
  </issue>
</issues>
<summary>Critical security issue found.</summary>
"""
    return llm


@pytest.fixture
def mock_llm_no_issues():
    """Mock LLM that returns no issues."""
    llm = AsyncMock()
    llm.generate.return_value = """
<issues>
</issues>
<summary>Code looks good, no issues found.</summary>
"""
    return llm


@pytest.fixture
def mock_memory():
    """Mock memory backend."""
    memory = MagicMock()
    memory.get_principles = AsyncMock(return_value=[
        {"content": "Always handle errors gracefully", "conviction": 0.9},
        {"content": "Use parameterized SQL queries", "conviction": 0.95},
    ])
    memory.get_watch_rules = AsyncMock(return_value=[
        {"description": "Block SQL injection patterns", "severity": "blocking"},
    ])
    return memory


@pytest.fixture
def temp_git_repo(tmp_path):
    """Create a temporary git repository with some files."""
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


# =============================================================================
# INTEGRATION TESTS: Full Pipeline
# =============================================================================

@pytest.mark.integration
class TestCodeReviewAgentIntegration:
    """Integration tests for the full review pipeline."""

    @pytest.mark.asyncio
    async def test_review_staged_changes(self, temp_git_repo, mock_llm, mock_memory):
        """Review staged changes end-to-end."""
        # Create and stage a file
        (temp_git_repo / "new_feature.py").write_text("""
def new_function():
    print("hello")
    return True
""")
        subprocess.run(
            ["git", "add", "new_feature.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
            memory_backend=mock_memory,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # Verify result structure
        assert result.mode == ReviewMode.STAGED
        assert result.files_reviewed >= 1
        assert result.overall_assessment in ["approve", "request_changes", "needs_discussion"]
        assert result.summary is not None

    @pytest.mark.asyncio
    async def test_review_auto_mode_detects_staged(self, temp_git_repo, mock_llm):
        """Auto mode should detect staged changes."""
        # Create and stage a file
        (temp_git_repo / "staged_file.py").write_text("# Staged\n")
        subprocess.run(
            ["git", "add", "staged_file.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.AUTO)

        assert result.mode == ReviewMode.STAGED

    @pytest.mark.asyncio
    async def test_review_auto_mode_detects_unstaged(self, temp_git_repo, mock_llm):
        """Auto mode should detect unstaged changes when no staged."""
        # Modify existing file without staging
        (temp_git_repo / "initial.py").write_text("# Modified\nprint('hello')\n")

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.AUTO)

        assert result.mode == ReviewMode.UNSTAGED

    @pytest.mark.asyncio
    async def test_review_with_no_changes(self, temp_git_repo, mock_llm):
        """Review with no changes should return approve."""
        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        assert result.overall_assessment == "approve"
        assert "No changes" in result.summary or result.files_reviewed == 0

    @pytest.mark.asyncio
    async def test_review_respects_max_files(self, temp_git_repo, mock_llm):
        """Review should respect max_files limit."""
        # Create many files
        for i in range(25):
            (temp_git_repo / f"file_{i}.py").write_text(f"# File {i}\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            max_files=5,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        assert result.files_reviewed <= 5
        assert result.files_skipped >= 20

    @pytest.mark.asyncio
    async def test_review_critical_files_always_included(self, temp_git_repo, mock_llm):
        """Critical files should always be reviewed."""
        # Create critical and non-critical files
        (temp_git_repo / ".env").write_text("SECRET=abc123\n")
        for i in range(20):
            (temp_git_repo / f"regular_{i}.py").write_text(f"# Regular {i}\n")

        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            max_files=5,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # .env should be in reviewed files
        reviewed_paths = [fr.file_path for fr in result.file_results]
        assert ".env" in reviewed_paths

    @pytest.mark.asyncio
    async def test_review_blocking_issue_returns_request_changes(
        self, temp_git_repo, mock_llm_blocking_issue, mock_memory
    ):
        """Blocking issues should result in request_changes."""
        (temp_git_repo / "vulnerable.py").write_text("""
def query_user(user_id):
    return f"SELECT * FROM users WHERE id = {user_id}"
""")
        subprocess.run(
            ["git", "add", "vulnerable.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm_blocking_issue,
            memory_backend=mock_memory,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        assert result.overall_assessment == "request_changes"
        assert len(result.blocking_issues) > 0

    @pytest.mark.asyncio
    async def test_review_no_issues_returns_approve(
        self, temp_git_repo, mock_llm_no_issues
    ):
        """No issues should result in approve."""
        (temp_git_repo / "good_code.py").write_text("""
def safe_function():
    return "Hello, World!"
""")
        subprocess.run(
            ["git", "add", "good_code.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm_no_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        assert result.overall_assessment == "approve"
        assert len(result.blocking_issues) == 0

    @pytest.mark.asyncio
    async def test_review_skips_noise_files(self, temp_git_repo, mock_llm):
        """Noise files like lock files should be skipped."""
        (temp_git_repo / "package-lock.json").write_text('{"lockfileVersion": 2}')
        (temp_git_repo / "main.py").write_text("print('hello')\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        reviewed_paths = [fr.file_path for fr in result.file_results]
        assert "package-lock.json" not in reviewed_paths
        assert "main.py" in reviewed_paths

    @pytest.mark.asyncio
    async def test_review_without_llm_provider(self, temp_git_repo):
        """Review without LLM provider should work (but find no issues)."""
        (temp_git_repo / "code.py").write_text("print('hello')\n")
        subprocess.run(
            ["git", "add", "code.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=None,  # No LLM
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # Should still return a valid result
        assert result.overall_assessment == "approve"
        assert result.files_reviewed >= 1


# =============================================================================
# INTEGRATION TESTS: Memory Integration
# =============================================================================

@pytest.mark.integration
class TestMemoryIntegration:
    """Tests for memory backend integration."""

    @pytest.mark.asyncio
    async def test_loads_principles_from_memory(self, temp_git_repo, mock_llm, mock_memory):
        """Review should load principles from memory."""
        (temp_git_repo / "code.py").write_text("print('hello')\n")
        subprocess.run(
            ["git", "add", "code.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
            memory_backend=mock_memory,
        )

        await agent.review(mode=ReviewMode.STAGED)

        # Verify memory was queried
        mock_memory.get_principles.assert_called()

    @pytest.mark.asyncio
    async def test_loads_watch_rules_from_memory(self, temp_git_repo, mock_llm, mock_memory):
        """Review should load watch rules from memory."""
        (temp_git_repo / "code.py").write_text("print('hello')\n")
        subprocess.run(
            ["git", "add", "code.py"],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            llm_provider=mock_llm,
            memory_backend=mock_memory,
        )

        await agent.review(mode=ReviewMode.STAGED)

        # Verify watch rules were queried
        mock_memory.get_watch_rules.assert_called()


# =============================================================================
# INTEGRATION TESTS: Parallel Processing
# =============================================================================

@pytest.mark.integration
class TestParallelProcessing:
    """Tests for parallel file processing."""

    @pytest.mark.asyncio
    async def test_parallel_reviews_complete(self, temp_git_repo, mock_llm):
        """Multiple files should be reviewed in parallel."""
        # Create multiple files
        for i in range(10):
            (temp_git_repo / f"file_{i}.py").write_text(f"# File {i}\nprint({i})\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            parallel_reviews=5,
            llm_provider=mock_llm,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        assert result.files_reviewed == 10
        # LLM should have been called for each file
        assert mock_llm.generate.call_count >= 10

    @pytest.mark.asyncio
    async def test_parallel_reviews_respect_concurrency(self, temp_git_repo):
        """Parallel reviews should respect concurrency limit."""
        # Create files
        for i in range(10):
            (temp_git_repo / f"file_{i}.py").write_text(f"print({i})\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            check=True,
            capture_output=True,
        )

        concurrent_calls = []
        max_concurrent = 0

        async def slow_llm(prompt: str) -> str:
            nonlocal max_concurrent
            concurrent_calls.append(1)
            current = sum(concurrent_calls)
            max_concurrent = max(max_concurrent, current)
            await asyncio.sleep(0.1)  # Simulate slow LLM
            concurrent_calls.pop()
            return "<issues></issues><summary>OK</summary>"

        mock_llm = MagicMock()
        mock_llm.generate = slow_llm

        agent = CodeReviewAgent(
            repo_path=temp_git_repo,
            parallel_reviews=3,  # Limit to 3 concurrent
            llm_provider=mock_llm,
        )

        await agent.review(mode=ReviewMode.STAGED)

        # Should never exceed 3 concurrent
        assert max_concurrent <= 3
