---
name: implement
description: Execute implementation tasks systematically with proper testing
type: workflow
tools: [Read, Write, Edit, MultiEdit, Bash, TodoWrite, Grep, Glob]
model: claude-sonnet-4-5-20250929
---

# /implement - Task Implementation Executor

## Purpose
Execute specific implementation tasks from the task breakdown, following established patterns, architecture principles, and testing requirements.

## Usage
```
/implement [TASK-XXX or specific task description]
```

## Process

When this command is invoked:

1. **Read Implementation Context**
   - Read specified task from `.specify/tasks/task-*.md`
   - Review related requirements
   - Understand existing codebase patterns in `src/`
   - Check task dependencies and prerequisites

2. **Validate Against Constitution**
   - No semantic regex patterns
   - XML format for LLM prompts
   - Protocol-based integrations (MCP, VS Code API)
   - Async-first for non-critical operations
   - Belief-based knowledge storage

3. **Plan Implementation Approach**
   - Use TodoWrite to break task into sub-steps
   - Identify files to create/modify
   - Plan testing approach:
     - Unit tests
     - Integration tests
     - E2E tests

4. **Execute Implementation**

   **For MCP Tools (Python):**
   - Follow FastMCP patterns
   - Use dataclasses for data structures
   - Use async functions for I/O
   - Add comprehensive docstrings
   - Include logging

   **For VS Code Extension (TypeScript):**
   - Follow VS Code API patterns
   - Use disposable pattern for resources
   - Implement proper error handling
   - Add JSDoc comments

   **For Agents (Python):**
   - Extend draagon-ai patterns if available
   - Implement GitHub API integration
   - Add proper error handling

5. **Implement Tests**
   - MCP tests in `tests/mcp/`
   - Extension tests in `tests/extension/`
   - Agent tests in `tests/agents/`

6. **Verify Implementation**
   - Run Python tests: `pytest tests/ -v`
   - Run TypeScript tests: `npm test`
   - Check type hints: `mypy src/mcp`

7. **Update Task Completion Status**
   - Mark acceptance criteria as completed [x]
   - Add implementation summary to task file
   - Update related documentation

8. **Stage Changes (DO NOT COMMIT)**
   - Use `git add .` to stage all files
   - **NEVER use `git commit`**
   - Inform user changes are staged for review

## Implementation Standards

### Python (MCP/Agents)
```python
from dataclasses import dataclass, field
from typing import Protocol, Any
import asyncio
import logging

logger = logging.getLogger(__name__)


@dataclass
class MyDataClass:
    """Clear docstring explaining purpose."""

    field: str
    optional_field: int = 0


@mcp.tool
async def my_tool(
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Search for something.

    Args:
        query: The search query
        limit: Maximum results

    Returns:
        List of matching items
    """
    logger.debug(f"Searching: {query}")
    return await memory.search(query, limit=limit)
```

### TypeScript (Extension)
```typescript
import * as vscode from 'vscode';

/**
 * Manages the Draagon Forge panel.
 */
class MyPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    constructor(private mcpClient: MCPClient) {
        // Initialize panel
    }

    /**
     * Refreshes the panel content.
     */
    async refresh(): Promise<void> {
        const data = await this.mcpClient.callTool('my_tool', {});
        this.updateWebview(data);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
```

### LLM Prompt Style
```python
prompt = f"""Analyze this context:

{context}

Respond in XML:
<response>
    <action>action_name</action>
    <reasoning>Why this action</reasoning>
    <confidence>0.0-1.0</confidence>
</response>
"""
```

### Test Style (Python)
```python
import pytest
from draagon_forge.mcp.tools import my_tool


class TestMyTool:
    """Tests for my_tool."""

    @pytest.mark.asyncio
    async def test_basic_query(self, mock_memory):
        """Test basic query works."""
        result = await my_tool("test query")
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_empty_query(self):
        """Test empty query returns empty."""
        result = await my_tool("")
        assert result == []
```

### Test Style (TypeScript)
```typescript
import * as assert from 'assert';
import { MyPanel } from '../panel/MyPanel';

suite('MyPanel Test Suite', () => {
    test('Panel opens correctly', async () => {
        const panel = new MyPanel(mockMcpClient);
        assert.ok(panel);
    });
});
```

## Implementation Checklist

### MCP Tools
- [ ] Tool function defined with @mcp.tool
- [ ] Proper type hints on all parameters
- [ ] Docstring with Args and Returns
- [ ] Error handling for edge cases
- [ ] Logging at appropriate levels
- [ ] Unit tests written

### VS Code Extension
- [ ] Command registered in package.json
- [ ] Handler implemented
- [ ] Disposables managed correctly
- [ ] Error handling with user feedback
- [ ] Tests written

### Agents
- [ ] Agent class implemented
- [ ] GitHub API calls working
- [ ] Results properly formatted
- [ ] Notifications delivered
- [ ] Integration tests written

## Git Workflow (CRITICAL)

**NEVER COMMIT AUTOMATICALLY**
- Always stage changes: `git add .`
- NEVER run: `git commit`
- User reviews changes before committing
- End with: "Changes staged for review. Ready for commit when approved."

## Output Format
Provide:
- Task completion summary
- Files created/modified
- Testing results
- Any issues encountered
- Git status showing staged changes
- "Changes staged for review" confirmation
- Next recommended task

Remember: Implement for the dual-language architecture. Follow LLM-first principles, XML output format, and MCP/VS Code API patterns.
