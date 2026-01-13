---
name: tasks
description: Break down implementation plans into actionable development tasks
type: workflow
tools: [Read, Write, Edit, TodoWrite]
model: claude-sonnet-4-5-20250929
---

# /tasks - Implementation Task Breakdown

## Purpose
Convert implementation plans into specific, actionable development tasks with clear acceptance criteria, dependencies, and testing requirements.

## Usage
```
/tasks [plan reference or feature area]
```

## Process

When this command is invoked:

1. **Read Planning Context**
   - Review relevant implementation plan from `.specify/plans/`
   - Read existing tasks in `.specify/tasks/`
   - Understand current phase objectives and constraints
   - Check architecture requirements

2. **Create Task Breakdown**
   - Generate TASK-XXX entries following established pattern
   - Define clear acceptance criteria for each task
   - Estimate effort (1-3 day tasks preferred)
   - Identify dependencies between tasks
   - Include testing requirements:
     - MCP tool tests
     - VS Code extension tests
     - Agent behavior tests

3. **Task Categories**
   - **MCP**: Tools, resources, memory integration
   - **Extension**: Panels, commands, watchers
   - **Agents**: Code review, PR analysis, auditing
   - **Webview**: UI components, styling
   - **Testing**: Unit, integration, E2E
   - **Documentation**: API docs, examples

4. **Update Task Documentation**
   - Create task file in `.specify/tasks/task-XXX-*.md`
   - Ensure tasks follow TASK-XXX numbering pattern
   - Include all technical details and acceptance criteria

5. **Create Todo List**
   - Use TodoWrite tool to create actionable todo items
   - Map specification tasks to implementation todos
   - Set appropriate priorities and dependencies

6. **Stage Changes**
   - Use `git add .` to stage task updates
   - DO NOT commit (follow manual commit preference)
   - Provide task summary and next steps

## Task Format

Each task file should include:

```markdown
# TASK-XXX: [Clear Title]

**Priority**: P0/P1/P2
**Effort**: 1-3 days
**Status**: Pending | In Progress | Completed
**Dependencies**: TASK-YYY, TASK-ZZZ
**Component**: mcp | extension | agents | webview

## Description
Clear description of what needs to be built.

## Acceptance Criteria
- [ ] Criterion 1 (testable)
- [ ] Criterion 2 (testable)
- [ ] MCP tool callable and returns correct data
- [ ] VS Code panel displays correctly

## Technical Notes
- Implementation details
- Key classes/modules
- Integration points

## Testing Requirements
- Unit tests for core logic
- Integration tests for MCP tools
- VS Code extension tests

## Files to Create/Modify
- `src/mcp/tools/my_tool.py`
- `src/extension/panel/MyPanel.ts`
- `tests/mcp/test_my_tool.py`
```

## Component-Specific Testing

### MCP Tasks
- [ ] Tool registered and callable
- [ ] Returns correct data format
- [ ] Error handling works
- [ ] Database integration correct

### Extension Tasks
- [ ] Command registered
- [ ] Panel opens correctly
- [ ] Webview renders properly
- [ ] MCP client calls work

### Agent Tasks
- [ ] Agent executes correctly
- [ ] GitHub API integration works
- [ ] Audit results are accurate
- [ ] Notifications delivered

### Watchlist Tasks
- [ ] Rules evaluated correctly
- [ ] Blocking works
- [ ] Inline hints displayed
- [ ] Natural language parsing works

## Output Format
Provide:
- Number of tasks created
- Task dependency graph
- Implementation sequence recommendation
- Testing strategy per task
- Ready-to-implement task prioritization

Remember: Tasks should target the dual-language architecture. Include TypeScript tasks for extension, Python tasks for MCP/agents.
