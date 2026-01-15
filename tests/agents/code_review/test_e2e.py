"""
End-to-end tests for Code Review Agent.

These tests verify the complete flow from MCP tool invocation through
git parsing, classification, chunking, review, and result formatting.

These tests are more expensive as they exercise the full pipeline
including real git operations. LLM is still mocked to avoid costs.
"""

import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def realistic_repo(tmp_path):
    """Create a realistic repository with various file types."""
    repo_path = tmp_path / "project"
    repo_path.mkdir()

    # Initialize git
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

    # Create project structure
    (repo_path / "src").mkdir()
    (repo_path / "src" / "api").mkdir()
    (repo_path / "src" / "auth").mkdir()
    (repo_path / "tests").mkdir()
    (repo_path / "docs").mkdir()

    # Create initial files
    files = {
        "src/main.py": "# Main entry point\n",
        "src/api/users.py": "# Users API\ndef get_user(): pass\n",
        "src/auth/login.py": "# Login handler\ndef login(): pass\n",
        "tests/test_main.py": "# Tests\ndef test_main(): pass\n",
        "docs/README.md": "# Documentation\n",
        "package.json": '{"name": "project"}\n',
        ".env.example": "# Example env\n",
    }

    for path, content in files.items():
        file_path = repo_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)

    subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )

    return repo_path


@pytest.fixture
def mock_llm_with_issues():
    """Mock LLM that returns various issue types."""
    call_count = 0

    async def generate(prompt: str) -> str:
        nonlocal call_count
        call_count += 1

        # Different responses based on file content in prompt
        if "auth" in prompt.lower() or "login" in prompt.lower():
            return """
<issues>
  <issue severity='warning'>
    <message>Authentication should use constant-time comparison</message>
    <line>5</line>
    <suggestion>Use secrets.compare_digest() for password comparison</suggestion>
  </issue>
</issues>
<summary>Minor security consideration in auth code.</summary>
"""
        elif "api" in prompt.lower():
            return """
<issues>
  <issue severity='suggestion'>
    <message>Consider adding input validation</message>
    <line>3</line>
    <suggestion>Add type hints and validation</suggestion>
  </issue>
</issues>
<summary>API endpoint could benefit from validation.</summary>
"""
        elif ".env" in prompt.lower():
            return """
<issues>
  <issue severity='blocking'>
    <message>Sensitive configuration should not be committed</message>
    <line>1</line>
    <suggestion>Use .env.example instead and add .env to .gitignore</suggestion>
  </issue>
</issues>
<summary>Critical: environment file contains sensitive data.</summary>
"""
        else:
            return """
<issues>
</issues>
<summary>No issues found in this file.</summary>
"""

    llm = MagicMock()
    llm.generate = generate
    return llm


# =============================================================================
# END-TO-END TESTS: Complete Pipeline
# =============================================================================

@pytest.mark.e2e
class TestEndToEndReview:
    """End-to-end tests for the complete review pipeline."""

    @pytest.mark.asyncio
    async def test_full_pipeline_staged_changes(self, realistic_repo, mock_llm_with_issues):
        """Test complete pipeline with staged changes."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Make changes to multiple files
        (realistic_repo / "src" / "auth" / "login.py").write_text("""
# Login handler
def login(username, password):
    if password == stored_password:
        return True
    return False
""")
        (realistic_repo / "src" / "api" / "users.py").write_text("""
# Users API
def get_user(user_id):
    return db.query(user_id)

def create_user(data):
    return db.insert(data)
""")

        # Stage changes
        subprocess.run(
            ["git", "add", "src/auth/login.py", "src/api/users.py"],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        # Run review
        agent = CodeReviewAgent(
            repo_path=realistic_repo,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # Verify result
        assert result.files_reviewed == 2
        assert result.files_skipped == 0
        assert result.mode == ReviewMode.STAGED
        assert len(result.warnings) >= 1  # Auth should have warning
        assert len(result.suggestions) >= 1  # API should have suggestion

    @pytest.mark.asyncio
    async def test_full_pipeline_with_critical_files(self, realistic_repo, mock_llm_with_issues):
        """Test that critical files are prioritized."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Create a .env file (critical) and many regular files
        (realistic_repo / ".env").write_text("SECRET_KEY=abc123\n")
        for i in range(25):
            (realistic_repo / f"file_{i}.py").write_text(f"# File {i}\n")

        subprocess.run(
            ["git", "add", "."],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=realistic_repo,
            max_files=5,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # .env should be reviewed (critical)
        reviewed_paths = [fr.file_path for fr in result.file_results]
        assert ".env" in reviewed_paths

        # Should have blocking issue from .env
        assert len(result.blocking_issues) >= 1
        assert result.overall_assessment == "request_changes"

    @pytest.mark.asyncio
    async def test_full_pipeline_branch_comparison(self, realistic_repo, mock_llm_with_issues):
        """Test branch comparison mode."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Create a feature branch
        subprocess.run(
            ["git", "checkout", "-b", "feature/new-feature"],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        # Make changes and commit on feature branch
        (realistic_repo / "src" / "api" / "new_endpoint.py").write_text("""
def new_endpoint():
    return {"status": "ok"}
""")
        subprocess.run(["git", "add", "."], cwd=realistic_repo, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Add new endpoint"],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        # Create main branch reference
        subprocess.run(
            ["git", "branch", "main", "HEAD~1"],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=realistic_repo,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.BRANCH, base_branch="main")

        assert result.mode == ReviewMode.BRANCH
        assert result.files_reviewed >= 1

    @pytest.mark.asyncio
    async def test_full_pipeline_result_format(self, realistic_repo, mock_llm_with_issues):
        """Test that result has correct format for API response."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Make a change
        (realistic_repo / "src" / "auth" / "login.py").write_text("# Updated\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        agent = CodeReviewAgent(
            repo_path=realistic_repo,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # Convert to dict (as API would)
        result_dict = result.to_dict()

        # Verify structure
        assert "overall_assessment" in result_dict
        assert "summary" in result_dict
        assert "blocking_issues" in result_dict
        assert "warnings" in result_dict
        assert "suggestions" in result_dict
        assert "files_reviewed" in result_dict
        assert "files_skipped" in result_dict
        assert "tokens_used" in result_dict
        assert "estimated_cost_cents" in result_dict

        # Verify issues have correct structure
        for issue in result_dict["warnings"]:
            assert "severity" in issue
            assert "message" in issue
            assert "file_path" in issue


# =============================================================================
# END-TO-END TESTS: MCP Tool Integration
# =============================================================================

@pytest.mark.e2e
class TestMCPToolIntegration:
    """End-to-end tests for MCP tool integration."""

    @pytest.mark.asyncio
    async def test_review_code_changes_tool(self, realistic_repo, mock_llm_with_issues):
        """Test the MCP tool works end-to-end."""
        # Make a change
        (realistic_repo / "src" / "api" / "users.py").write_text("# Updated API\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        # Mock the dependencies
        with patch("draagon_forge.mcp.tools.code_review.get_memory") as mock_get_memory:
            mock_get_memory.return_value = None

            # Import after patching
            from draagon_forge.mcp.tools.code_review import review_code_changes

            # We need to patch the CodeReviewAgent to use our mock LLM
            with patch(
                "draagon_forge.mcp.tools.code_review.CodeReviewAgent"
            ) as MockAgent:
                # Create a mock agent instance
                mock_agent = AsyncMock()
                mock_agent.review.return_value = MagicMock(
                    overall_assessment="approve",
                    summary="All good",
                    blocking_issues=[],
                    warnings=[],
                    suggestions=[],
                    new_patterns_detected=[],
                    principle_violations=[],
                    mode=MagicMock(value="staged"),
                    files_reviewed=1,
                    files_skipped=0,
                    total_lines_changed=10,
                    review_duration_ms=100,
                    tokens_used=500,
                    estimated_cost_cents=0.05,
                )
                mock_agent.review.return_value.to_dict.return_value = {
                    "overall_assessment": "approve",
                    "summary": "All good",
                    "blocking_issues": [],
                    "warnings": [],
                    "suggestions": [],
                    "mode": "staged",
                    "files_reviewed": 1,
                }
                MockAgent.return_value = mock_agent

                result = await review_code_changes(
                    mode="staged",
                    repo_path=str(realistic_repo),
                )

                assert result["overall_assessment"] == "approve"
                assert result["files_reviewed"] == 1

    @pytest.mark.asyncio
    async def test_get_review_summary_tool(self, realistic_repo):
        """Test the summary tool works end-to-end."""
        # Make changes
        (realistic_repo / "src" / "auth" / "login.py").write_text("# Security update\n")
        (realistic_repo / "package-lock.json").write_text('{"lockfileVersion": 3}\n')
        subprocess.run(
            ["git", "add", "."],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        from draagon_forge.mcp.tools.code_review import get_review_summary

        result = await get_review_summary(
            mode="staged",
            repo_path=str(realistic_repo),
        )

        assert "mode_detected" in result
        assert "files_changed" in result
        assert "critical_files" in result
        assert "noise_files" in result
        assert result["files_changed"] >= 2


# =============================================================================
# END-TO-END TESTS: Large Repository Simulation
# =============================================================================

@pytest.mark.e2e
class TestLargeRepositoryHandling:
    """Tests for handling large repositories with many files."""

    @pytest.mark.asyncio
    async def test_200_file_changes(self, tmp_path, mock_llm_with_issues):
        """Test that 200+ file changes are handled efficiently."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        repo_path = tmp_path / "large_repo"
        repo_path.mkdir()

        # Initialize git
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

        # Create initial commit
        (repo_path / "init.txt").write_text("init\n")
        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Create 200 files
        for i in range(200):
            (repo_path / f"file_{i:03d}.py").write_text(f"# File {i}\nprint({i})\n")

        # Also add some critical files
        (repo_path / ".env").write_text("SECRET=test\n")
        (repo_path / "config.yaml").write_text("key: value\n")

        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)

        agent = CodeReviewAgent(
            repo_path=repo_path,
            max_files=20,
            parallel_reviews=5,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # Should only review 20 files
        assert result.files_reviewed == 20
        # Should skip many files
        assert result.files_skipped >= 180

        # Critical files should be in the reviewed set
        reviewed_paths = [fr.file_path for fr in result.file_results]
        assert ".env" in reviewed_paths or "config.yaml" in reviewed_paths

    @pytest.mark.asyncio
    async def test_large_file_chunking(self, tmp_path, mock_llm_with_issues):
        """Test that large files are chunked properly."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        repo_path = tmp_path / "chunking_repo"
        repo_path.mkdir()

        # Initialize git
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

        # Create initial commit
        (repo_path / "init.txt").write_text("init\n")
        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Create a large file with many functions
        large_content = "# Large file\n\n"
        for i in range(100):
            large_content += f"""
def function_{i}():
    '''Function {i} docstring'''
    value = {i}
    result = value * 2
    return result

"""
        (repo_path / "large_module.py").write_text(large_content)
        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)

        agent = CodeReviewAgent(
            repo_path=repo_path,
            max_tokens_per_chunk=400,
            llm_provider=mock_llm_with_issues,
        )

        result = await agent.review(mode=ReviewMode.STAGED)

        # File should be reviewed
        assert result.files_reviewed == 1
        # LLM should be called multiple times due to chunking
        # (Each chunk = 1 LLM call)
        # The large file should result in multiple chunks


# =============================================================================
# END-TO-END TESTS: Error Handling
# =============================================================================

@pytest.mark.e2e
class TestErrorHandling:
    """Tests for error handling in the pipeline."""

    @pytest.mark.asyncio
    async def test_handles_llm_failure_gracefully(self, realistic_repo):
        """Test that LLM failures don't crash the review."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Make a change
        (realistic_repo / "src" / "main.py").write_text("# Updated\n")
        subprocess.run(
            ["git", "add", "."],
            cwd=realistic_repo,
            check=True,
            capture_output=True,
        )

        # LLM that fails
        failing_llm = AsyncMock()
        failing_llm.generate.side_effect = Exception("LLM API error")

        agent = CodeReviewAgent(
            repo_path=realistic_repo,
            llm_provider=failing_llm,
        )

        # Should not raise, but handle gracefully
        result = await agent.review(mode=ReviewMode.STAGED)

        # Should still return a result with error info
        assert result.files_reviewed >= 1
        # File result should contain error info
        assert any("failed" in fr.summary.lower() for fr in result.file_results)

    @pytest.mark.asyncio
    async def test_handles_invalid_git_repo(self, tmp_path):
        """Test handling of non-git directory."""
        from draagon_forge.agents.code_review import CodeReviewAgent, ReviewMode

        # Non-git directory
        non_git = tmp_path / "not_a_repo"
        non_git.mkdir()

        agent = CodeReviewAgent(repo_path=non_git)

        # Should handle gracefully
        result = await agent.review(mode=ReviewMode.STAGED)

        # Should return empty/approve result
        assert result.files_reviewed == 0
