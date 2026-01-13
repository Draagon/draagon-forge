# Draagon Forge - Project Constitution

**Version:** 1.0.0
**Last Updated:** 2026-01-13

---

## Core Principles

### 1. LLM-First Semantic Architecture

**NEVER use regex or keyword patterns for semantic understanding.**

The LLM handles ALL semantic analysis:
- Intent detection and classification
- Natural language rule parsing
- Correction pattern extraction
- Belief content analysis

**Exceptions (Non-Semantic Tasks):**
- Security blocklist patterns (fast pattern matching for watch rules)
- Structural detection (AST-based code analysis)
- URL/email validation
- Entity ID resolution

### 2. XML Output Format

**ALWAYS use XML format for LLM output, NOT JSON.**

```xml
<response>
  <action>action_name</action>
  <reasoning>Why this action was chosen</reasoning>
  <content>The extracted or generated content</content>
  <confidence>0.9</confidence>
</response>
```

### 3. Protocol-Based Design

All major components communicate through well-defined protocols:
- **MCP Protocol** - Claude Code integration
- **VS Code Extension API** - Editor integration
- **GitHub API** - Repository operations
- **Neo4j/Qdrant** - Knowledge persistence

### 4. Async-First Processing

All I/O operations MUST be async:
- LLM calls
- Database operations
- File system access
- Network requests

Keep synchronous:
- Pure computation
- Data transformation
- Configuration parsing

### 5. Belief-Based Knowledge

All learned knowledge is stored as beliefs with:
- **Conviction scores** (0.0 - 1.0)
- **Reinforcement/weakening** from outcomes
- **Source tracking**
- **Usage history**

---

## Testing Integrity Principles

### 1. NEVER Weaken Tests to Pass

**Tests exist to validate the system. The system must rise to meet the tests.**

| FORBIDDEN | REQUIRED |
|-----------|----------|
| Lower threshold from 80% to 60% | Fix the underlying bug causing 60% |
| Remove failing test case | Debug why the test case fails |
| Add "skip" without root cause | Document gap and create fix plan |
| Change expected value to match wrong output | Fix algorithm to produce correct output |

### 2. Test Outcomes, Not Implementation

Tests validate behavior, not internal details:
- Test that beliefs are persisted, not how
- Test that watch rules trigger, not internal state
- Test that agents produce correct reviews, not exact prompts

### 3. Use Real Systems in Integration Tests

**Integration tests must use REAL providers, not mocks that bypass the system.**

| FORBIDDEN | REQUIRED |
|-----------|----------|
| Mock embedding providers | Real embedding models |
| Fake LLM responses | Real LLM inference |
| In-memory databases | Real database connections |

### 4. Include Multiple Test Tiers

- **Tier 1**: Core functionality (must pass for any commit)
- **Tier 2**: Advanced scenarios (may initially fail during development)
- **Tier 3**: Edge cases and adversarial inputs

---

## Code Quality Standards

### TypeScript (VS Code Extension)

1. **Strict mode enabled** - No implicit any, strict null checks
2. **Explicit return types** - All public functions
3. **Disposable pattern** - All VS Code resources
4. **Error boundaries** - Try/catch at activation and command handlers
5. **Lazy loading** - Heavy modules loaded on-demand

### Python (MCP Server, Agents)

1. **Type hints everywhere** - All function signatures
2. **Async context managers** - All resource management
3. **Dataclasses for DTOs** - All data transfer objects
4. **Protocol-based DI** - Dependency injection via protocols
5. **Comprehensive docstrings** - All public APIs

### General

1. **No magic numbers** - All constants named and documented
2. **No silent failures** - All errors logged, propagated, or handled
3. **Minimal coupling** - Components communicate via protocols
4. **Maximum cohesion** - Related functionality grouped together

---

## Performance Requirements

### Extension Activation

- **Time to activate:** < 100ms
- **Memory baseline:** < 50MB
- **No blocking operations** during activation

### MCP Tool Response

- **Simple queries:** < 500ms
- **Complex searches:** < 2s
- **Agent analyses:** < 30s (with progress indication)

### Real-Time Monitoring

- **File change detection:** < 50ms
- **Pattern evaluation:** < 100ms per file
- **Inline hint display:** < 200ms

---

## Security Principles

### Data Privacy

- All processing local by default
- No code sent to external services without explicit opt-in
- Secrets filtered from observations and logs

### Access Control

- Project-scoped knowledge bases
- User-specific preferences
- Audit logging for all sensitive actions

### GitHub Integration

- Minimal permissions requested
- Read-only by default
- Write access explicit opt-in per repo

---

## Architectural Boundaries

### VS Code Extension

- TypeScript only
- No direct database access (goes through MCP)
- No LLM calls (goes through MCP)
- Handles UI and user interaction only

### MCP Server

- Python only
- Single source of truth for knowledge
- All LLM interactions
- All database interactions

### Autonomous Agents

- Python only
- Extend draagon-ai Agent base class
- Communicate via MCP tools
- No direct UI interaction

---

## Version Control Practices

### Commit Messages

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branch Naming

- `feature/REQ-XXX-description` - New features
- `fix/REQ-XXX-description` - Bug fixes
- `refactor/description` - Refactoring

### Pull Request Requirements

- All tests pass
- Coverage maintained or improved
- CLAUDE.md updated if architecture changes
- At least one reviewer approval

---

## Documentation Requirements

### Code Documentation

- All public APIs documented
- Complex algorithms explained
- Configuration options enumerated

### Requirements (.specify/)

- All requirements in REQ-XXX.md format
- Implementation plans before coding
- Task breakdowns for complex work

### User Documentation

- README.md with quick start
- Configuration guide
- Troubleshooting guide

---

**Document Status:** Active
**Maintainer:** Draagon Forge team
