---
name: test
description: Generate and execute tests for Draagon Forge components
type: workflow
tools: [Read, Write, Edit, Bash, Glob, Grep, TodoWrite]
model: claude-sonnet-4-5-20250929
---

# /test - Test Generator and Executor

## Purpose
Generate and execute tests for Draagon Forge components, including MCP tools, VS Code extension, agents, and integration tests.

## Usage
```
/test [area: mcp|extension|agents|integration|all] [component]
```

## Process

When this command is invoked:

1. **Identify Test Scope**
   - Parse test area and component from arguments
   - Locate relevant source files in `src/`
   - Review testing principles in `.specify/constitution.md`

2. **Analyze Component**
   - Read source code for component
   - Identify component type:
     - MCP tool
     - VS Code panel/command
     - Agent
     - Watchlist/belief system
   - Determine test categories needed

3. **Generate Tests**

   **MCP Tests** (`tests/mcp/`):
   - Tool function tests
   - Database integration tests
   - Error handling tests

   **Extension Tests** (`tests/extension/`):
   - Command handler tests
   - Panel creation tests
   - Webview message tests

   **Agent Tests** (`tests/agents/`):
   - Agent execution tests
   - GitHub API mock tests
   - Audit result tests

   **Integration Tests** (`tests/integration/`):
   - MCP → Extension flow
   - Watchlist → Alert flow
   - Belief → Audit flow

4. **Execute Tests**
   - Run pytest for Python tests
   - Run npm test for TypeScript tests
   - Collect coverage data
   - Report failures and coverage

5. **Update Documentation**
   - Add test files
   - Update test coverage tracking

6. **Stage Changes**
   - Use `git add .` to stage test files
   - DO NOT commit
   - Provide test results summary

## Test Categories

### MCP Tests (/test mcp)
```python
import pytest
from draagon_forge.mcp.tools import search_context, query_beliefs


class TestSearchContext:
    @pytest.mark.asyncio
    async def test_basic_search(self, mock_memory):
        """Test basic search works."""
        mock_memory.search.return_value = [
            {"id": "1", "content": "test", "score": 0.9}
        ]
        result = await search_context("test query")
        assert len(result) == 1
        assert result[0]["score"] == 0.9

    @pytest.mark.asyncio
    async def test_empty_query(self, mock_memory):
        """Test empty query returns empty."""
        result = await search_context("")
        assert result == []


class TestQueryBeliefs:
    @pytest.mark.asyncio
    async def test_query_by_topic(self, mock_memory):
        """Test querying beliefs by topic."""
        result = await query_beliefs("error handling")
        assert len(result) > 0
        assert all(b["conviction"] >= 0.0 for b in result)
```

### Extension Tests (/test extension)
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatPanel } from '../panel/ChatPanel';
import { MockMCPClient } from './mocks';

suite('ChatPanel Test Suite', () => {
    test('Panel opens correctly', async () => {
        const panel = new ChatPanel(new MockMCPClient());
        assert.ok(panel);
    });

    test('Send message calls MCP', async () => {
        const mockClient = new MockMCPClient();
        const panel = new ChatPanel(mockClient);

        await panel.sendMessage('test');

        assert.ok(mockClient.callToolCalled);
        assert.strictEqual(mockClient.lastToolName, 'search_context');
    });

    test('Panel disposes correctly', () => {
        const panel = new ChatPanel(new MockMCPClient());
        panel.dispose();
        // Should not throw
    });
});
```

### Agent Tests (/test agents)
```python
import pytest
from draagon_forge.agents import CodeReviewAgent, CommitAuditor


class TestCodeReviewAgent:
    @pytest.mark.asyncio
    async def test_review_finds_issues(self, mock_github, mock_beliefs):
        """Test review finds belief violations."""
        mock_github.get_commit_diff.return_value = "re.match(r'pattern', text)"
        mock_beliefs.check_violations.return_value = [
            {"belief": "No regex for semantics", "severity": "error"}
        ]

        agent = CodeReviewAgent(mock_github, mock_beliefs)
        result = await agent.review_commit("repo", "sha123")

        assert not result.passed
        assert len(result.issues) > 0


class TestCommitAuditor:
    @pytest.mark.asyncio
    async def test_audit_developer_history(self, mock_github):
        """Test auditing developer commit history."""
        mock_github.get_commits.return_value = [
            {"sha": "abc123"}, {"sha": "def456"}
        ]

        auditor = CommitAuditor(mock_github)
        report = await auditor.audit_developer_history("repo", "developer")

        assert report.commits_audited == 2
```

### Integration Tests (/test integration)
```python
import pytest


class TestMCPExtensionIntegration:
    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_search_shows_in_panel(self, mcp_server, extension_client):
        """Test MCP search results appear in VS Code panel."""
        # Store test data
        await mcp_server.call_tool('store_learning', {
            'content': 'Test principle',
            'conviction': 0.9
        })

        # Search via extension
        results = await extension_client.call_tool('search_context', {
            'query': 'principle'
        })

        assert len(results) > 0
        assert 'Test principle' in results[0]['content']


class TestWatchlistIntegration:
    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_rule_blocks_save(self, watchlist, test_file):
        """Test watch rule blocks save."""
        await watchlist.add_rule({
            'name': 'No eval',
            'pattern': 'eval\\(',
            'severity': 'block'
        })

        result = await watchlist.evaluate_code(
            'test.py',
            'eval(user_input)',
            is_save=True
        )

        assert not result.allow
        assert 'eval' in result.reason
```

## Test Fixtures

### Common Fixtures
```python
@pytest.fixture
def mock_memory():
    """Mock memory provider."""
    return MagicMock()

@pytest.fixture
def mock_github():
    """Mock GitHub client."""
    mock = MagicMock()
    mock.get_commit.return_value = {"sha": "abc123", "author": {"login": "test"}}
    return mock

@pytest.fixture
def mock_beliefs():
    """Mock belief manager."""
    mock = MagicMock()
    mock.query_beliefs.return_value = []
    return mock

@pytest.fixture
async def mcp_server():
    """Real MCP server for integration tests."""
    from draagon_forge.mcp.server import create_server
    server = await create_server()
    yield server
    await server.shutdown()
```

## Output Format
Provide:
- Test execution results
- Coverage report
- Failed tests with details
- Recommendations for additional tests

## Test Commands

```bash
# Run all Python tests
pytest tests/ -v

# Run MCP tests
pytest tests/mcp/ -v

# Run agent tests
pytest tests/agents/ -v

# Run with coverage
pytest tests/ --cov=src/draagon_forge --cov-report=html

# Run TypeScript tests
npm test

# Run specific extension test
npm test -- --grep "ChatPanel"
```

Remember: Test both MCP (Python) and Extension (TypeScript) components. Include integration tests for cross-component flows.
