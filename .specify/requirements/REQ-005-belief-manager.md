# REQ-005: Belief Manager

**Priority:** P1
**Effort:** Medium (5 days)
**Dependencies:** REQ-001, REQ-002
**Blocks:** REQ-006, REQ-011

---

## Overview

Build a Belief Manager that allows users to query, view, and adjust Draagon's beliefs through both a dedicated UI panel and natural language conversation.

### Purpose

The Belief Manager provides transparency and control over what Draagon "believes" about the codebase, allowing developers to:
- Query beliefs by topic
- View belief details (conviction, source, usage)
- Reinforce or weaken beliefs
- Modify belief content
- Add new beliefs from instructions

---

## Requirements

### REQ-005.1: Belief Query UI

```
┌─────────────────────────────────────────────────────────────────┐
│  🧠 Belief Manager                                              │
├─────────────────────────────────────────────────────────────────┤
│  Search: [async context managers________________] [🔍]          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  BELIEF: "Always use async context managers for DB"     │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Conviction: ████████░░ 0.85                            │   │
│  │  Category: architecture                                  │   │
│  │  Source: developer_correction (×7)                       │   │
│  │  Last Used: 2 hours ago                                  │   │
│  │  Usage Count: 23                                         │   │
│  │                                                          │   │
│  │  [👍 Reinforce] [👎 Weaken] [✏️ Modify] [🗑️ Delete]     │   │
│  │                                                          │   │
│  │  Related Beliefs:                                        │   │
│  │  • "Use Protocol for dependency injection" (0.78)       │   │
│  │  • "Prefer composition over inheritance" (0.92)         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Search field filters beliefs by content
- [ ] Belief cards show all metadata
- [ ] Conviction displayed as progress bar
- [ ] Related beliefs linked and clickable
- [ ] Action buttons functional

### REQ-005.2: Belief Query MCP Tools

```python
@mcp.tool
async def query_beliefs(
    query: str,
    category: str | None = None,
    min_conviction: float = 0.0,
    limit: int = 10,
) -> list[BeliefInfo]:
    """Query and explore stored beliefs."""
```

**Acceptance Criteria:**
- [ ] Semantic search by query string
- [ ] Filter by category
- [ ] Filter by minimum conviction
- [ ] Returns structured BeliefInfo objects
- [ ] Includes related beliefs

### REQ-005.3: Belief Adjustment MCP Tools

```python
@mcp.tool
async def adjust_belief(
    belief_id: str,
    action: str,  # "reinforce" | "weaken" | "modify" | "delete"
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust a belief based on user feedback."""
```

**Actions:**

| Action | Effect |
|--------|--------|
| `reinforce` | +0.1 conviction (max 1.0) |
| `weaken` | -0.15 conviction (min 0.1) |
| `modify` | Create new, deprecate old |
| `delete` | Soft delete with reason |

**Acceptance Criteria:**
- [ ] Reinforce increases conviction
- [ ] Weaken decreases conviction
- [ ] Modify maintains history
- [ ] Delete is reversible (soft delete)
- [ ] All changes logged with reason

### REQ-005.4: Add Belief MCP Tool

```python
@mcp.tool
async def add_belief(
    content: str,
    category: str,
    conviction: float = 0.7,
    rationale: str | None = None,
) -> dict:
    """Add a new belief from user instruction."""
```

**Acceptance Criteria:**
- [ ] Creates belief with specified content
- [ ] Sets source as "user_instruction"
- [ ] Initial conviction from parameter
- [ ] Stores rationale if provided
- [ ] Checks for duplicate beliefs

### REQ-005.5: Natural Language Belief Adjustment

Handle natural language requests about beliefs:

```
User: "What do you believe about error handling?"
Draagon: "I have 3 beliefs about error handling:
  1. 'Never silence exceptions without logging' (conviction: 0.95)
  2. 'Use specific exception types, not bare except' (conviction: 0.88)
  3. 'Errors at boundaries should be user-friendly' (conviction: 0.72)
  Would you like to adjust any of these?"

User: "The first one should be even stronger - that's critical"
Draagon: "Reinforced 'Never silence exceptions without logging' from 0.95 → 0.99.
  I'll flag any violations as critical severity now."
```

**Acceptance Criteria:**
- [ ] Understands belief queries in natural language
- [ ] Understands reinforce/weaken requests
- [ ] Understands add belief requests
- [ ] Confirms changes made
- [ ] Links conviction to enforcement severity

---

## Technical Design

### MCP Tools (Python)

```python
# src/mcp/tools/beliefs.py

@dataclass
class BeliefInfo:
    id: str
    content: str
    conviction: float
    category: str | None
    source: str | None
    usage_count: int
    last_used: datetime | None
    related: list[RelatedBelief]

@mcp.tool
async def query_beliefs(
    query: str,
    category: str | None = None,
    min_conviction: float = 0.0,
    limit: int = 10,
) -> list[BeliefInfo]:
    results = await memory.search(
        query=query,
        filters={
            "memory_type": {"$in": ["PRINCIPLE", "BELIEF", "LEARNING"]},
            **({"category": category} if category else {}),
        },
        limit=limit,
    )

    return [
        BeliefInfo(
            id=r.id,
            content=r.content,
            conviction=r.metadata.get("conviction", 0.5),
            category=r.metadata.get("category"),
            source=r.metadata.get("source"),
            usage_count=r.metadata.get("usage_count", 0),
            last_used=r.metadata.get("last_used"),
            related=await find_related_beliefs(r.id),
        )
        for r in results
        if r.metadata.get("conviction", 0) >= min_conviction
    ]
```

### VS Code Panel (TypeScript)

```typescript
// src/extension/panel/BeliefPanel.ts

class BeliefPanel {
    private panel: vscode.WebviewPanel;
    private beliefs: BeliefInfo[] = [];

    async search(query: string): Promise<void> {
        this.beliefs = await this.mcpClient.callTool('query_beliefs', { query });
        this.updateWebview();
    }

    async adjustBelief(id: string, action: string, reason?: string): Promise<void> {
        const result = await this.mcpClient.callTool('adjust_belief', {
            belief_id: id,
            action,
            reason,
        });
        await this.search(this.lastQuery); // Refresh
    }
}
```

### Natural Language Handler

```python
class BeliefConversationHandler:
    """Handle natural language belief queries and adjustments."""

    async def handle_message(self, message: str) -> str:
        intent = await self.detect_intent(message)

        if intent.type == "query":
            beliefs = await query_beliefs(intent.target)
            return self.format_beliefs_response(beliefs)

        elif intent.type == "reinforce":
            beliefs = await query_beliefs(intent.target, limit=1)
            if beliefs:
                result = await adjust_belief(beliefs[0].id, "reinforce", reason=message)
                return f"Reinforced. New conviction: {result['new_conviction']}"

        # ... other intents
```

---

## Testing

### Unit Tests

- Test belief query filtering
- Test conviction adjustments
- Test soft delete
- Test related belief finding

### Integration Tests

- Test MCP tool invocations
- Test UI actions → MCP → database flow
- Test natural language understanding

### Acceptance Tests

- User can search beliefs
- User can reinforce beliefs
- User can weaken beliefs
- User can add new beliefs
- Changes persist across sessions

---

## Acceptance Checklist

- [ ] Belief query UI functional
- [ ] All MCP tools implemented
- [ ] Natural language handler working
- [ ] Conviction adjustments correct
- [ ] History maintained
- [ ] Tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Intent detection via LLM |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | MCP tools |
| Async-First Processing | ✅ | All I/O async |

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
