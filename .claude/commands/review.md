---
name: review
description: Comprehensive review of project specifications and documentation
type: analysis
tools: [Read, Grep, Glob, Task]
model: claude-sonnet-4-5-20250929
---

# /review - Specification Review and Validation

## Purpose
Perform comprehensive analysis of project specifications, code, and documentation to ensure completeness, consistency, and alignment with Draagon Forge architecture.

## Usage
```
/review [area: specs|code|constitution|mcp|extension|all]
```

## Process

When this command is invoked:

1. **Scan Documentation Landscape**
   - Read all files in `.specify/` directory
   - Map relationships between specifications
   - Identify reference patterns and dependencies
   - Check for orphaned or incomplete documents

2. **Validate Constitution Compliance**
   - Check for semantic regex patterns (FORBIDDEN)
   - Verify LLM prompts use XML format
   - Ensure MCP/VS Code API integration patterns
   - Validate async-first processing patterns
   - Check belief-based knowledge storage

3. **Assess Architecture**
   - Verify MCP tool implementations
   - Check VS Code extension patterns
   - Validate agent implementations
   - Review watchlist/belief integration

4. **Technical Architecture Review**
   - Validate module organization
   - Check TypeScript interfaces
   - Verify Python dataclasses
   - Assess async patterns

5. **Quality Assessment**
   - Check specification clarity and testability
   - Verify acceptance criteria are measurable
   - Assess implementation feasibility
   - Identify potential technical risks

6. **Generate Report**
   - Provide comprehensive analysis summary
   - List constitution violations found
   - Identify architecture gaps
   - Suggest priority improvements

## Review Areas

### Specifications (/review specs)
- Requirements completeness
- Component coverage
- MCP tool definitions
- VS Code command definitions

### Code (/review code)
- Constitution compliance
- Pattern consistency
- Test coverage
- Error handling

### Constitution (/review constitution)
- Principle violations in code
- Semantic regex patterns
- JSON LLM outputs
- Synchronous blocking

### MCP (/review mcp)
- Tool implementation completeness
- Resource definitions
- Memory integration
- Error handling

### Extension (/review extension)
- Command registration
- Panel implementations
- Disposable patterns
- Webview security

### Complete (/review all)
- Full ecosystem analysis
- Cross-document consistency
- Code-spec alignment
- Overall project health

## Constitution Violation Checks

### Critical Violations (Must Fix)
```python
# VIOLATION: Semantic regex
if re.match(r"actually|no,|wrong", text):
    # MUST use LLM semantic analysis

# VIOLATION: JSON LLM output
prompt = "Return JSON: {...}"
    # MUST use XML format
```

```typescript
// VIOLATION: Missing disposal
vscode.workspace.onDidSaveTextDocument(handler);
    // MUST push to context.subscriptions
```

### Warnings (Should Review)
```python
# WARNING: Hard-coded conviction scores
conviction = 0.8
    # SHOULD allow configuration

# WARNING: Missing async
def blocking_operation():
    # SHOULD use async
```

## Architecture Checklist

### MCP Server
- [ ] All tools registered with FastMCP
- [ ] Tools have proper type hints
- [ ] Tools have docstrings with Args/Returns
- [ ] Error handling returns meaningful messages
- [ ] Database connections are async

### VS Code Extension
- [ ] Commands registered in package.json
- [ ] All resources pushed to subscriptions
- [ ] Webview has proper CSP
- [ ] Error messages shown to user
- [ ] Settings schema defined

### Agents
- [ ] Agents follow base class pattern
- [ ] GitHub API calls are async
- [ ] Results properly structured
- [ ] Notifications implemented

### Belief System
- [ ] Beliefs have conviction scores
- [ ] Reinforcement logic correct
- [ ] Query API implemented
- [ ] Adjustment API implemented

### Watchlist
- [ ] Rules stored and retrieved
- [ ] Pattern detection works
- [ ] Semantic detection uses LLM
- [ ] Save blocking implemented

## Output Format
Provide:

### Health Score
```
Overall: A/B/C/D/F
- Constitution Compliance: X/100
- MCP Implementation: X/100
- Extension Implementation: X/100
- Test Coverage: X/100
- Documentation: X/100
```

### Critical Issues
- Constitution violations requiring immediate fix
- Architecture gaps

### Recommendations
- Priority improvements
- Next steps

Remember: Review against Draagon Forge architecture. Check LLM-first patterns, MCP integration, VS Code API usage, and belief-based knowledge.
