"""
Shared fixtures for Code Review Agent tests.

This module provides reusable fixtures for unit, integration, and E2E tests.
"""

import subprocess
from pathlib import Path
from typing import Any, AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest


# =============================================================================
# GIT REPOSITORY FIXTURES
# =============================================================================

@pytest.fixture
def temp_git_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """
    Create a minimal temporary git repository.

    Yields:
        Path to the initialized git repository
    """
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
        ["git", "config", "user.name", "Test User"],
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

    yield repo_path


@pytest.fixture
def realistic_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """
    Create a realistic repository with typical project structure.

    Yields:
        Path to the initialized git repository with common file types
    """
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
        ["git", "config", "user.name", "Test User"],
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
        "src/main.py": "# Main entry point\ndef main(): pass\n",
        "src/api/users.py": "# Users API\ndef get_user(id): pass\n",
        "src/auth/login.py": "# Login handler\ndef login(u, p): pass\n",
        "tests/test_main.py": "# Tests\ndef test_main(): assert True\n",
        "docs/README.md": "# Project Documentation\n",
        "package.json": '{"name": "project", "version": "1.0.0"}\n',
        ".env.example": "# Example environment\nAPI_KEY=your_key\n",
    }

    for path, content in files.items():
        file_path = repo_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)

    subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial project structure"],
        cwd=repo_path,
        check=True,
        capture_output=True,
    )

    yield repo_path


# =============================================================================
# MOCK LLM FIXTURES
# =============================================================================

@pytest.fixture
def mock_llm() -> MagicMock:
    """
    Mock LLM that returns a generic review response.

    Returns:
        Mock LLM with generate method that returns valid XML response
    """
    llm = AsyncMock()
    llm.generate.return_value = """
<issues>
  <issue severity='warning'>
    <message>Consider adding error handling</message>
    <line>5</line>
    <suggestion>Wrap in try/except block</suggestion>
  </issue>
</issues>
<summary>Found one minor issue.</summary>
"""
    return llm


@pytest.fixture
def mock_llm_blocking_issue() -> MagicMock:
    """
    Mock LLM that returns a blocking security issue.

    Returns:
        Mock LLM that always finds a blocking issue
    """
    llm = AsyncMock()
    llm.generate.return_value = """
<issues>
  <issue severity='blocking'>
    <message>SQL injection vulnerability detected</message>
    <line>10</line>
    <suggestion>Use parameterized queries instead of string formatting</suggestion>
  </issue>
</issues>
<summary>Critical security issue found that must be addressed.</summary>
"""
    return llm


@pytest.fixture
def mock_llm_no_issues() -> MagicMock:
    """
    Mock LLM that finds no issues.

    Returns:
        Mock LLM that approves all code
    """
    llm = AsyncMock()
    llm.generate.return_value = """
<issues>
</issues>
<summary>Code looks good, no issues found.</summary>
"""
    return llm


@pytest.fixture
def mock_llm_contextual() -> MagicMock:
    """
    Mock LLM that returns different responses based on file content.

    Returns:
        Mock LLM that analyzes prompt content
    """
    async def contextual_generate(prompt: str) -> str:
        prompt_lower = prompt.lower()

        if "auth" in prompt_lower or "login" in prompt_lower:
            return """
<issues>
  <issue severity='warning'>
    <message>Use constant-time comparison for passwords</message>
    <line>5</line>
    <suggestion>Use secrets.compare_digest()</suggestion>
  </issue>
</issues>
<summary>Security consideration in auth code.</summary>
"""
        elif "api" in prompt_lower:
            return """
<issues>
  <issue severity='suggestion'>
    <message>Consider adding input validation</message>
    <line>3</line>
    <suggestion>Add type hints and validation</suggestion>
  </issue>
</issues>
<summary>API could use input validation.</summary>
"""
        elif ".env" in prompt_lower and "example" not in prompt_lower:
            return """
<issues>
  <issue severity='blocking'>
    <message>Sensitive config should not be committed</message>
    <line>1</line>
    <suggestion>Add to .gitignore</suggestion>
  </issue>
</issues>
<summary>Critical: secrets exposed.</summary>
"""
        else:
            return """
<issues>
</issues>
<summary>No issues found.</summary>
"""

    llm = MagicMock()
    llm.generate = contextual_generate
    return llm


# =============================================================================
# MOCK MEMORY FIXTURES
# =============================================================================

@pytest.fixture
def mock_memory() -> MagicMock:
    """
    Mock memory backend with sample principles and watch rules.

    Returns:
        Mock memory that returns typical project principles
    """
    memory = MagicMock()
    memory.get_principles = AsyncMock(return_value=[
        {"content": "Always handle errors gracefully", "conviction": 0.9},
        {"content": "Use parameterized SQL queries", "conviction": 0.95},
        {"content": "Follow REST API conventions", "conviction": 0.85},
    ])
    memory.get_watch_rules = AsyncMock(return_value=[
        {"description": "Block SQL injection patterns", "severity": "blocking"},
        {"description": "Warn on hardcoded credentials", "severity": "warning"},
    ])
    memory.search = AsyncMock(return_value=[])
    return memory


@pytest.fixture
def mock_memory_empty() -> MagicMock:
    """
    Mock memory backend with no stored data.

    Returns:
        Mock memory that returns empty results
    """
    memory = MagicMock()
    memory.get_principles = AsyncMock(return_value=[])
    memory.get_watch_rules = AsyncMock(return_value=[])
    memory.search = AsyncMock(return_value=[])
    return memory


# =============================================================================
# HELPER FIXTURES
# =============================================================================

@pytest.fixture
def sample_diff_simple() -> str:
    """Simple single-file diff."""
    return """\
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


@pytest.fixture
def sample_diff_multi_file() -> str:
    """Multi-file diff."""
    return """\
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
@@ -0,0 +1,5 @@
+import pytest
+from src.auth import authenticate
+
+def test_authenticate():
+    assert authenticate("user") == True
"""


# =============================================================================
# SKIP MARKERS
# =============================================================================

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers",
        "integration: Integration tests requiring external resources"
    )
    config.addinivalue_line(
        "markers",
        "e2e: End-to-end tests for full pipeline"
    )
    config.addinivalue_line(
        "markers",
        "slow: Tests that take longer than 5 seconds"
    )
