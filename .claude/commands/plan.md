---
name: plan
description: Generate detailed technical implementation plans from specifications
type: workflow
tools: [Read, Write, Edit, Glob, Grep]
model: claude-sonnet-4-5-20250929
---

# /plan - Technical Implementation Planner

## Purpose
Create detailed technical implementation plans based on existing specifications, considering Draagon Forge's dual-language architecture (TypeScript/Python) and MCP integration.

## Usage
```
/plan [specification reference or feature area]
```

## Process

When this command is invoked:

1. **Read Architecture Context**
   - Read `.specify/constitution.md` for design patterns
   - Review existing architecture in `src/`
   - Check related specifications and requirements
   - Review `CLAUDE.md` for component organization

2. **Analyze Implementation Scope**
   - Identify requirements to implement
   - Map to existing module structure:
     - `src/extension/` - VS Code extension (TypeScript)
     - `src/mcp/` - MCP server (Python)
     - `src/agents/` - Autonomous agents (Python)
     - `src/webview/` - Extension webview UI
   - Consider integration with existing protocols

3. **Generate Implementation Plan**
   - Break down into module components
   - Define TypeScript interfaces for extension
   - Define Python dataclasses for MCP/agents
   - Plan MCP tool designs
   - Identify LLM prompt designs (XML format)
   - Consider error handling and edge cases
   - Plan test coverage approach

4. **Validate Against Principles**
   - **LLM-First**: No semantic regex patterns
   - **XML Output**: All LLM prompts use XML
   - **Protocol-Based**: Use MCP and VS Code APIs
   - **Async-First**: Non-blocking where possible
   - **Belief-Based**: Knowledge uses conviction scores
   - **Disposable Pattern**: VS Code resources cleaned up

5. **Update Planning Documents**
   - Add to `.specify/plans/` directory
   - Update implementation strategy if needed
   - Define testing approach for new components

6. **Stage Changes**
   - Use `git add .` to stage planning updates
   - DO NOT commit (follow manual commit preference)
   - Provide implementation roadmap summary

## Output Format
Provide:
- High-level implementation approach
- Key modules and classes to build
- MCP tools required
- VS Code panels/commands required
- LLM prompt designs (XML)
- Testing strategy overview
- Estimated complexity

## Architecture Patterns

### Module Organization
```
src/
├── extension/              # TypeScript
│   ├── extension.ts        # Entry point
│   ├── watcher/            # Observation
│   ├── learner/            # Pattern extraction
│   ├── panel/              # UI panels
│   ├── monitor/            # Real-time monitoring
│   └── mcp/                # MCP client
├── mcp/                    # Python
│   ├── server.py           # FastMCP entry
│   ├── tools/              # MCP tools
│   └── memory/             # Neo4j/Qdrant
├── agents/                 # Python
│   ├── code_review.py
│   └── commit_auditor.py
└── webview/                # HTML/CSS/JS
```

### MCP Tool Pattern
```python
@mcp.tool
async def my_tool(
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Tool description.

    Args:
        query: The search query
        limit: Maximum results

    Returns:
        List of results
    """
    return await memory.search(query, limit=limit)
```

### VS Code Panel Pattern
```typescript
class MyPanel {
    private panel: vscode.WebviewPanel;

    constructor(private mcpClient: MCPClient) {}

    async refresh(): Promise<void> {
        const data = await this.mcpClient.callTool('my_tool', { query: 'test' });
        this.updateWebview(data);
    }
}
```

### LLM Prompt Pattern
```python
prompt = f"""Analyze this context:

{context}

Respond in XML:
<response>
    <result>...</result>
    <confidence>0.0-1.0</confidence>
</response>
"""
```

Remember: Plan for the dual-language architecture. TypeScript for VS Code extension, Python for MCP server and agents. All components communicate via MCP protocol.
