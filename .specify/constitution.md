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

### 5. Unified Belief System

**All knowledge is stored as beliefs.** Principles, learnings, and insights are all belief types - not separate entities.

```python
@dataclass
class Belief:
    content: str           # The belief statement
    conviction: float      # 0.0 - 1.0, how strongly held
    belief_type: str       # "principle" | "learning" | "insight" | "pattern"
    source: str            # "claude_md" | "correction" | "observation" | "user"
    domain: str | None     # "auth", "testing", "architecture", etc.
    category: str | None   # Additional classification
    usage_count: int       # How often referenced
    last_used: datetime    # For relevance decay
```

**Belief Types:**

| Type | Source | Initial Conviction | Mutability |
|------|--------|-------------------|------------|
| `principle` | CLAUDE.md, architecture docs | 0.85+ | Rarely changed |
| `learning` | External research, experiments | 0.5-0.7 | Evolves with evidence |
| `insight` | Corrections, observations | 0.6-0.8 | Reinforced/weakened |
| `pattern` | Code examples, idioms | 0.7 | Updated with codebase |

**Why unified:**
- One CRUD interface for all knowledge
- Conviction-based retrieval works uniformly
- Principles can be challenged (lower conviction) if evidence contradicts
- Learnings can become principles (raise conviction) when validated

---

## Agent-Native Design Principles

Building software that treats AI agents as first-class citizens, not afterthoughts.

### 1. Parity Principle

**Every action available in the UI MUST be available via MCP tools.**

Agents should have equal access to functionality as human users:

| UI Action | MCP Tool Required |
|-----------|-------------------|
| Create watch rule via form | `add_watch_rule()` |
| Edit/delete watch rule | `update_watch_rule()`, `delete_watch_rule()` |
| View belief details | `query_beliefs()` |
| Adjust conviction | `adjust_belief()` |
| View commit audit | `get_audit_results()` |

### 2. Granularity Principle

**Tools should be atomic and composable, not monolithic.**

- One tool = one action
- Complex workflows built by composing simple tools
- Tools return sufficient data for next-step decisions

| WRONG | RIGHT |
|-------|-------|
| `review_and_fix_code()` | `review_code()` + `apply_fix()` |
| `search_and_store()` | `search_context()` + `store_learning()` |

### 3. CRUD Completeness Principle

**Every entity type requires Create, Read, Update, Delete operations.**

Before shipping any entity, verify:

| Entity | Create | Read | Update | Delete |
|--------|--------|------|--------|--------|
| Beliefs (all types) | ✅ | ✅ | ✅ | ✅ |
| Watch Rules | ✅ | ✅ | ✅ | ✅ |

**Note:** Principles, patterns, and learnings are belief types (see Unified Belief System).
They share the same CRUD operations via `add_belief(type=...)`, `query_beliefs()`, `adjust_belief()`, etc.

### 4. Progress Visibility Principle

**Long-running operations MUST stream progress updates.**

- Operations > 2s should emit progress events
- Agents need visibility into what's happening
- Progress should include: stage, percentage, current item

```python
# Pattern for long operations
async def long_operation():
    yield {"stage": "analyzing", "progress": 0.2, "item": "file1.py"}
    # ... work ...
    yield {"stage": "complete", "progress": 1.0, "result": {...}}
```

### 5. Explicit Completion Principle

**All operations MUST return explicit success/failure status.**

- Never return empty responses for mutations
- Include what changed and confirmation of persistence
- Failed operations return error details, not empty results

```python
# WRONG
async def add_belief(content: str):
    await store(content)  # Returns nothing

# RIGHT
async def add_belief(content: str) -> dict:
    result = await store(content)
    return {"status": "created", "id": result.id, "persisted": True}
```

### 6. Discoverability Principle

**Agents must be able to discover available capabilities dynamically.**

- List available domains/categories
- Describe what each tool does
- Enumerate valid parameter values

```python
# Enable discovery
await mcp.call_tool("list_domains")  # → ["auth", "testing", "api"]
await mcp.call_tool("list_categories")  # → ["architecture", "patterns"]
await mcp.call_tool("describe_tool", {"name": "search_context"})
```

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
