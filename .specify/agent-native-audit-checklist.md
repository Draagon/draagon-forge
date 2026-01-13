# Agent-Native Compliance Audit Checklist

**Version:** 1.0.0
**Last Updated:** 2026-01-13

---

## Overview

This checklist validates that Draagon Forge components comply with the Agent-Native Design Principles defined in the constitution. Run this audit before major releases and when adding new features.

---

## 1. Parity Audit

**Principle:** Every UI action must have a corresponding MCP tool.

### VS Code Extension Actions

| UI Action | MCP Tool | Status |
|-----------|----------|--------|
| Search beliefs | `query_beliefs()` | ☐ |
| Reinforce belief | `adjust_belief(action="reinforce")` | ☐ |
| Weaken belief | `adjust_belief(action="weaken")` | ☐ |
| Modify belief | `adjust_belief(action="modify")` | ☐ |
| Delete belief | `adjust_belief(action="delete")` | ☐ |
| Add belief | `add_belief()` | ☐ |
| Create watch rule | `add_watch_rule()` | ☐ |
| Update watch rule | `update_watch_rule()` | ☐ |
| Delete watch rule | `delete_watch_rule()` | ☐ |
| List watch rules | `get_watch_rules()` | ☐ |
| View alerts | `get_recent_alerts()` | ☐ |
| Dismiss alert | `dismiss_alert()` | ☐ |
| Add exception | `add_watch_exception()` | ☐ |
| View audit results | `get_audit_results()` | ☐ |
| Run audit | `run_commit_audit()` | ☐ |
| Search context | `search_context()` | ☐ |
| Report outcome | `report_outcome()` | ☐ |

### Audit Questions

- [ ] Can an agent do everything a human can do through the UI?
- [ ] Are there any "UI-only" features that need tool exposure?
- [ ] Are tool names discoverable and intuitive?

---

## 2. Granularity Audit

**Principle:** Tools should be atomic and composable.

### Tool Decomposition Check

| Tool | Is Atomic? | Notes |
|------|------------|-------|
| `search_context()` | ☐ | Should only search, not store results |
| `add_belief()` | ☐ | Should only store, not search first |
| `check_conflicts()` | ☐ | Should only check, not resolve |
| `resolve_review()` | ☐ | Should only resolve, not check |

### Audit Questions

- [ ] Does each tool do exactly ONE thing?
- [ ] Can complex workflows be built by composing tools?
- [ ] Do tools return enough data for agents to make decisions?
- [ ] Are there "god tools" that need decomposition?

---

## 3. CRUD Completeness Audit

**Principle:** Every entity type needs Create, Read, Update, Delete.

### Entity CRUD Matrix

**Note:** Principles, patterns, and learnings are belief types in the unified belief system.
They use the same CRUD interface with `belief_type` parameter.

| Entity | Create | Read | Update | Delete | Status |
|--------|--------|------|--------|--------|--------|
| **Beliefs (all types)** | `add_belief(type=...)` | `query_beliefs(type=...)` | `adjust_belief(modify)` | `adjust_belief(delete)` | ☐ |
| **Watch Rules** | `add_watch_rule()` | `get_watch_rules()` | `update_watch_rule()` | `delete_watch_rule()` | ☐ |
| **Audit Rules** | `add_audit_rule()` | `get_audit_rules()` | `update_audit_rule()` | `delete_audit_rule()` | ☐ |

**Belief Type Verification:**

| Belief Type | Can Create? | Can Query? | Can Update? | Can Delete? | Status |
|-------------|-------------|------------|-------------|-------------|--------|
| `principle` | `add_belief(type="principle")` | `query_beliefs(type="principle")` | ✓ | ✓ | ☐ |
| `learning` | `add_belief(type="learning")` | `query_beliefs(type="learning")` | ✓ | ✓ | ☐ |
| `pattern` | `add_belief(type="pattern")` | `query_beliefs(type="pattern")` | ✓ | ✓ | ☐ |
| `insight` | `add_belief(type="insight")` | `query_beliefs(type="insight")` | ✓ | ✓ | ☐ |

### Audit Questions

- [ ] Are all CRUD operations implemented for each entity?
- [ ] Do Update operations preserve history?
- [ ] Are Delete operations soft-delete (recoverable)?
- [ ] Do operations validate before mutating?
- [ ] Does `belief_type` filtering work correctly?

---

## 4. Progress Visibility Audit

**Principle:** Long operations must stream progress.

### Long-Running Operations Check

| Operation | Duration | Streams Progress? | Status |
|-----------|----------|-------------------|--------|
| Full codebase analysis | > 30s | ☐ | |
| PR analysis | > 10s | ☐ | |
| Architectural audit | > 30s | ☐ | |
| Commit history audit | > 10s | ☐ | |
| Semantic search (large corpus) | > 2s | ☐ | |
| Pattern extraction | > 5s | ☐ | |
| Cross-agent coordination | > 5s | ☐ | |

### Progress Event Format Check

```python
# Required fields
{
    "stage": str,      # Current phase name
    "progress": float, # 0.0 to 1.0
    "item": str,       # Current item being processed (optional)
    "total": int,      # Total items (optional)
    "current": int,    # Current item index (optional)
}
```

### Audit Questions

- [ ] Do all operations > 2s stream progress?
- [ ] Can agents display meaningful progress indicators?
- [ ] Is progress percentage accurate (not fake)?
- [ ] Do progress events include enough context?

---

## 5. Explicit Completion Audit

**Principle:** All mutations must return explicit status.

### Mutation Response Check

| Operation | Returns Status? | Returns ID? | Returns Persisted? | Status |
|-----------|-----------------|-------------|-------------------|--------|
| `add_belief()` | ☐ | ☐ | ☐ | |
| `adjust_belief()` | ☐ | ☐ | ☐ | |
| `add_watch_rule()` | ☐ | ☐ | ☐ | |
| `store_learning()` | ☐ | ☐ | ☐ | |
| `report_outcome()` | ☐ | ☐ | ☐ | |
| `record_decision()` | ☐ | ☐ | ☐ | |
| `publish_finding()` | ☐ | ☐ | ☐ | |

### Required Response Fields for Mutations

```python
{
    "status": "created" | "updated" | "deleted" | "error",
    "id": str,          # ID of affected entity
    "persisted": bool,  # Whether change is durable
    "previous": {...},  # Previous state (for updates)
    "error": str,       # Error message (if status="error")
}
```

### Audit Questions

- [ ] Do all mutations return explicit success/failure?
- [ ] Can agents verify persistence from the response?
- [ ] Are error responses informative and actionable?
- [ ] Do responses include enough data for undo?

---

## 6. Discoverability Audit

**Principle:** Agents must discover capabilities dynamically.

### Discovery Tools Check

| Discovery Need | Tool Available? | Status |
|----------------|-----------------|--------|
| List all domains | `list_domains()` | ☐ |
| List all categories | `list_categories()` | ☐ |
| List belief types | `list_belief_types()` | ☐ |
| List available tools | `list_available_tools()` | ☐ |
| Get tool description | `get_tool_description()` | ☐ |
| List severity levels | `list_severity_levels()` | ☐ |
| List action types | `list_action_types()` | ☐ |

### Tool Metadata Check

Each tool should have:
- [ ] Clear description
- [ ] Parameter documentation
- [ ] Return type documentation
- [ ] Example usage
- [ ] Related tools listed

### Audit Questions

- [ ] Can an agent discover all available capabilities?
- [ ] Are valid parameter values enumerable?
- [ ] Is there a "help" or "describe" mechanism?
- [ ] Are tool relationships documented?

---

## 7. Cross-Agent Coordination Audit

**Principle:** Multiple agents must be able to collaborate.

### Shared Memory Check

| Capability | Implemented? | Status |
|------------|--------------|--------|
| Publish findings to shared memory | ☐ | |
| Discover findings from other agents | ☐ | |
| Record agent expertise | ☐ | |
| Route tasks to expert agent | ☐ | |
| Handoff between agents | ☐ | |
| Shared decision registry | ☐ | |
| Conflict detection across agents | ☐ | |

### Audit Questions

- [ ] Can Agent A's findings inform Agent B?
- [ ] Is there a mechanism for expertise routing?
- [ ] Can agents avoid duplicating work?
- [ ] Are conflicting findings detected?

---

## 8. Session Continuity Audit

**Principle:** Sessions can be reconstructed from memory.

### Session Reconstruction Check

| Capability | Implemented? | Status |
|------------|--------------|--------|
| Capture operations to memory | ☐ | |
| Reconstruct session by ID | ☐ | |
| Find relevant past sessions | ☐ | |
| Extract patterns from sessions | ☐ | |
| Track unfinished work | ☐ | |

### Audit Questions

- [ ] Can a new agent continue a previous session?
- [ ] Is context lost when sessions overflow?
- [ ] Are important decisions captured durably?
- [ ] Can patterns be learned from session history?

---

## Summary Scoring

| Category | Score | Max | % |
|----------|-------|-----|---|
| Parity | /17 | 17 | |
| Granularity | /4 | 4 | |
| CRUD Completeness (Entities) | /3 | 3 | |
| CRUD Completeness (Belief Types) | /4 | 4 | |
| Progress Visibility | /7 | 7 | |
| Explicit Completion | /7 | 7 | |
| Discoverability | /7 | 7 | |
| Cross-Agent | /7 | 7 | |
| Session Continuity | /5 | 5 | |
| **Total** | **/61** | **61** | |

### Scoring Guide

- **90-100%**: Excellent agent-native compliance
- **70-89%**: Good, but some gaps to address
- **50-69%**: Significant gaps affecting agent autonomy
- **< 50%**: Major rework needed for agent-native design

---

## Remediation Priority

When gaps are identified, prioritize fixes by:

1. **P0 - Critical**: Blocks agent workflows entirely
2. **P1 - High**: Significantly limits agent capabilities
3. **P2 - Medium**: Inconvenient but workaround exists
4. **P3 - Low**: Polish and optimization

### Current Known Gaps

| Gap | Category | Priority | Target REQ | Notes |
|-----|----------|----------|------------|-------|
| Progress streaming | Visibility | P1 | REQ-001 | Long operations need progress |
| Domain/Category discovery | Discovery | P2 | REQ-001 | `list_domains()`, `list_categories()` |
| Belief type discovery | Discovery | P2 | REQ-001 | `list_belief_types()` |

**Resolved Gaps (via Unified Belief System):**
- ~~Pattern Create/Update/Delete~~ → Use `add_belief(type="pattern")`
- ~~Principle Create/Update/Delete~~ → Use `add_belief(type="principle")`
- ~~Watch rule Update/Delete~~ → Added to REQ-006

---

**Document Status:** Active
**Maintainer:** Draagon Forge team
**Review Frequency:** Before each major release
