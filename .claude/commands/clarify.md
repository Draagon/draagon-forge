---
name: clarify
description: Refine and improve existing specifications
type: workflow
tools: [Read, Write, Edit, Glob, Grep]
model: claude-sonnet-4-5-20250929
---

# /clarify - Specification Refinement

## Purpose
Refine and improve existing specifications by resolving ambiguities, adding missing details, and ensuring completeness.

## Usage
```
/clarify [REQ-XXX or specification area]
```

## Process

When this command is invoked:

1. **Read Specification**
   - Load the specified requirement from `.specify/requirements/`
   - Identify [NEEDS CLARIFICATION] markers
   - Check for incomplete sections
   - Review acceptance criteria completeness

2. **Analyze Gaps**
   - Identify ambiguous requirements
   - Find missing technical details
   - Check for undefined terms
   - Verify MCP tool specs are complete
   - Verify VS Code panel specs are complete

3. **Generate Clarification Questions**
   - Create targeted questions for each gap
   - Prioritize by implementation impact
   - Suggest reasonable defaults where possible

4. **Update Specification**
   - Resolve clarifications with user input or defaults
   - Add missing technical details
   - Enhance acceptance criteria
   - Add code examples where helpful

5. **Stage Changes**
   - Use `git add .` to stage updates
   - DO NOT commit
   - Provide summary of clarifications made

## Common Clarification Areas

### MCP Tools
- What parameters are required vs optional?
- What data format is returned?
- What errors can occur?
- What permissions are needed?

### VS Code Extension
- What trigger activates the feature?
- What UI feedback is shown?
- What keyboard shortcuts are used?
- What settings are configurable?

### Agents
- What triggers agent execution?
- What data sources are used?
- What outputs are generated?
- What notifications are sent?

### Watch Rules
- What default severity?
- What file patterns affected?
- What action on violation?
- What exceptions allowed?

## Output Format
Provide:
- Clarifications resolved
- Questions requiring user input
- Suggested defaults applied
- Updated specification summary

Remember: Resolve ambiguities to enable implementation. Suggest reasonable defaults based on Draagon Forge architecture.
