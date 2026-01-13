---
name: specify
description: Transform high-level feature ideas into comprehensive specifications
type: workflow
tools: [Read, Write, Edit, Glob, Grep]
model: claude-sonnet-4-5-20250929
---

# /specify - Feature Specification Generator

## Purpose
Transform a high-level feature description into a comprehensive specification document following Draagon Forge's established patterns and AI Development Companion architecture.

## Usage
```
/specify [feature description]
```

## Process

When this command is invoked:

1. **Parse User Input**
   - Extract feature description from command arguments
   - If empty: ERROR "No feature description provided"
   - Identify: components (MCP, Extension, Agents), integration points

2. **Read Existing Context**
   - Read `.specify/constitution.md` to understand project principles
   - Review existing specifications in `.specify/requirements/`
   - Check `CLAUDE.md` for architecture patterns

3. **Validate Against Constitution**
   - Ensure feature uses LLM-first architecture (no regex for semantics)
   - Verify XML output format for any LLM prompts
   - Check protocol-based design patterns
   - Confirm async-first processing where appropriate
   - Verify belief-based knowledge storage

4. **Analyze the Request**
   - Break down feature into core requirements
   - Identify which components are involved:
     - MCP Server (tools, resources, prompts)
     - VS Code Extension (panels, commands, watchers)
     - Autonomous Agents (code review, PR analyzer, auditor)
     - Belief/Watchlist systems
   - Consider how it fits with existing architecture
   - For unclear aspects:
     - Make informed guesses based on architecture patterns
     - Mark with [NEEDS CLARIFICATION: specific question] if ambiguous
     - **LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total**

5. **Generate Specification**
   - Create detailed requirements following REQ-XXX pattern
   - Each requirement must be testable
   - Define data structures and protocols needed
   - Write usage examples with TypeScript (extension) or Python (MCP/agents)
   - Define success criteria:
     - Quantitative metrics (latency, accuracy, adoption)
     - User experience metrics
   - Identify implementation tasks and complexity

6. **Validate Completeness**
   - Ensure all requirements are testable
   - Verify MCP tools are well-defined
   - Check extension UI mockups are clear

7. **Update Documentation**
   - Create new REQ-XXX file in `.specify/requirements/`
   - Update README.md in requirements folder
   - Add dependencies to existing requirements if needed

8. **Stage Changes**
   - Use `git add .` to stage all changes
   - DO NOT commit (follow manual commit preference)
   - Provide summary of what was specified
   - Return: SUCCESS (spec ready for planning)

## Output Format
Provide a concise summary of:
- What requirement was added (REQ-XXX)
- Key components defined (MCP tools, VS Code panels, agents)
- Integration points with existing features
- Implementation complexity assessment

## Constitution Checks

Before finalizing, verify:

1. **No Semantic Regex**: Feature doesn't rely on pattern matching for meaning
2. **XML Output**: Any LLM prompts use XML format
3. **Protocol-Based**: New integrations use MCP or VS Code API
4. **Async-First**: Non-critical operations are async
5. **Belief-Based**: Learned knowledge uses conviction scores
6. **Watch Rule Compatible**: Violations can be detected

## Components Reference

### MCP Server
- `src/mcp/tools/` - MCP tool implementations
- `src/mcp/resources/` - MCP resources
- `src/mcp/memory/` - Neo4j/Qdrant integration

### VS Code Extension
- `src/extension/panel/` - UI panels
- `src/extension/watcher/` - File/terminal observation
- `src/extension/monitor/` - Real-time monitoring

### Autonomous Agents
- `src/agents/` - Agent implementations
- Uses draagon-ai Agent base class

Remember: This is for the Draagon Forge AI Development Companion. All specifications should consider the MCP server architecture, belief system, watchlist monitoring, and VS Code integration.
