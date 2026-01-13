---
name: constitution
description: Generate or update project constitution and principles
type: workflow
tools: [Read, Write, Edit, Glob, Grep]
model: claude-sonnet-4-5-20250929
---

# /constitution - Constitution Management

## Purpose
Generate, update, and validate the project constitution that defines core principles, design patterns, and quality standards.

## Usage
```
/constitution [action: view|validate|add|update]
```

## Process

### View (/constitution view)
Display the current constitution with:
- Core principles
- Design patterns
- Quality standards
- Testing requirements

### Validate (/constitution validate)
Check codebase against constitution:
1. Scan all source files
2. Check for principle violations
3. Report compliance score
4. List specific violations

### Add (/constitution add [principle])
Add new principle:
1. Validate doesn't conflict with existing
2. Add to constitution.md
3. Update related specs
4. Stage changes

### Update (/constitution update)
Refresh constitution based on learnings:
1. Review recent commits
2. Identify new patterns
3. Suggest principle additions
4. Update documentation

## Core Principles

### LLM-First Architecture
**NEVER use regex for semantic understanding.**
- Intent detection → LLM
- Natural language parsing → LLM
- Correction detection → LLM

### XML Output Format
**ALWAYS use XML for LLM output.**
```xml
<response>
  <action>name</action>
  <confidence>0.9</confidence>
</response>
```

### Protocol-Based Design
**Use established protocols for integration.**
- MCP for Claude Code
- VS Code API for extension
- GitHub API for repositories

### Async-First Processing
**All I/O must be async.**
- Database calls
- LLM calls
- File operations
- Network requests

### Belief-Based Knowledge
**Learned knowledge uses conviction scores.**
- Conviction: 0.0 - 1.0
- Reinforcement: +0.05 per success
- Weakening: -0.08 per failure
- Threshold: 0.9+ for blocking

### Disposable Pattern
**VS Code resources must be cleaned up.**
- Push to context.subscriptions
- Implement dispose() method
- Clean up on deactivation

## Output Format

### View
Display current constitution principles

### Validate
```
Constitution Compliance: 87/100

Violations Found:
1. src/mcp/tools/search.py:45 - Synchronous file read
2. src/extension/panel.ts:23 - Missing disposal

Warnings:
1. src/agents/review.py:78 - Hard-coded conviction

Recommendations:
- Fix synchronous operations
- Add disposal patterns
```

### Add/Update
Summary of changes made with staged files

Remember: The constitution defines the project's core values. All code must comply.
