# REQ-005: Belief Manager

**Priority:** P1
**Effort:** Medium (5 days)
**Dependencies:** REQ-001, REQ-002
**Blocks:** REQ-006, REQ-011
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific belief UI

---

## Overview

Build a Belief Manager that allows users to query, view, and adjust Draagon's beliefs through both a dedicated UI panel and natural language conversation.

### Purpose

The Belief Manager provides transparency and control over what Draagon "believes" about the codebase. It's the **UI layer** on top of REQ-001's MCP tools, which in turn wrap draagon-ai's `AgentBelief` model.

### draagon-ai Foundation

This requirement builds on:

| draagon-ai Component | Usage |
|---------------------|-------|
| `AgentBelief` | Core belief model with confidence |
| `BeliefType` | household_fact, verified_fact, inferred, etc. |
| `cognition/beliefs.py` | Belief formation and conflict resolution prompts |

### Draagon Forge Extensions

| Extension | Purpose |
|-----------|---------|
| `conviction: float` | Reinforcement score (separate from confidence) |
| `ForgeBeliefType.PRINCIPLE` | Architectural rules |
| `ForgeBeliefType.PATTERN` | Code examples |
| `ForgeBeliefType.LEARNING` | Extracted insights |

This allows developers to:
- Query beliefs by topic, type, or domain
- View belief details (conviction, type, source, usage)
- Reinforce or weaken beliefs
- Modify belief content
- Add new beliefs of any type (principle, learning, pattern, insight)

---

## Requirements

### REQ-005.1: Belief Query UI

```
┌─────────────────────────────────────────────────────────────────┐
│  🧠 Belief Manager                                              │
├─────────────────────────────────────────────────────────────────┤
│  Search: [async context managers________________] [🔍]          │
│  Type: [All ▼] Domain: [All ▼] Min Conviction: [0.5___]        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PRINCIPLE: "Always use async context managers for DB"  │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Conviction: ████████░░ 0.85                            │   │
│  │  Type: principle  Domain: database                       │   │
│  │  Source: claude_md                                       │   │
│  │  Last Used: 2 hours ago  Usage Count: 23                 │   │
│  │                                                          │   │
│  │  [👍 Reinforce] [👎 Weaken] [✏️ Modify] [🗑️ Delete]     │   │
│  │                                                          │   │
│  │  Related Beliefs:                                        │   │
│  │  • "Use Protocol for dependency injection" (0.78)       │   │
│  │  • "Prefer composition over inheritance" (0.92)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LEARNING: "Connection pooling improves DB performance" │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Conviction: ██████░░░░ 0.65                            │   │
│  │  Type: learning  Domain: database                        │   │
│  │  Source: observation                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Search field filters beliefs by content
- [ ] Type filter dropdown (principle, learning, pattern, insight, all)
- [ ] Domain filter dropdown (dynamically populated)
- [ ] Conviction displayed as progress bar with type-appropriate coloring
- [ ] Related beliefs linked and clickable
- [ ] Action buttons functional

### REQ-005.2: Belief Query MCP Tools

```python
@mcp.tool
async def query_beliefs(
    query: str,
    belief_type: str | None = None,  # "principle" | "learning" | "pattern" | "insight"
    domain: str | None = None,
    category: str | None = None,
    min_conviction: float = 0.0,
    limit: int = 10,
) -> list[BeliefInfo]:
    """Query and explore stored beliefs of any type."""
```

**Acceptance Criteria:**
- [ ] Semantic search by query string
- [ ] Filter by belief_type
- [ ] Filter by domain
- [ ] Filter by minimum conviction
- [ ] Returns structured BeliefInfo objects with type information
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
    belief_type: str,  # "principle" | "learning" | "pattern" | "insight"
    domain: str | None = None,
    category: str | None = None,
    conviction: float | None = None,  # Defaults by type: principle=0.85, learning=0.7
    source: str = "user",
    rationale: str | None = None,
) -> dict:
    """Add a new belief of any type."""
```

**Type-specific defaults:**

| Type | Default Conviction | Typical Source |
|------|-------------------|----------------|
| principle | 0.85 | claude_md, user |
| learning | 0.7 | observation, correction |
| pattern | 0.8 | codebase, user |
| insight | 0.75 | correction, observation |

**Acceptance Criteria:**
- [ ] Creates belief with specified type and content
- [ ] Applies type-appropriate default conviction if not specified
- [ ] Sets source appropriately
- [ ] Stores rationale if provided
- [ ] Checks for duplicate beliefs
- [ ] Returns explicit status with belief ID

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
# src/draagon_forge/mcp/tools/beliefs.py

from draagon_ai.core.types import AgentBelief, BeliefType
from draagon_forge.core.extensions import ForgeBeliefType

@dataclass
class BeliefInfo:
    """Extended belief info for UI display.

    Wraps draagon-ai's AgentBelief with Forge-specific fields.
    """
    id: str
    content: str
    belief_type: str  # ForgeBeliefType value (PRINCIPLE, PATTERN, LEARNING, etc.)
    conviction: float  # Forge extension: reinforcement score
    confidence: float  # draagon-ai: certainty score
    domain: str | None
    source: str | None
    usage_count: int
    last_used: datetime | None
    related: list[RelatedBelief]

    # From draagon-ai's AgentBelief
    supporting_observations: list[str]
    needs_clarification: bool

@mcp.tool
async def query_beliefs(
    query: str,
    belief_type: str | None = None,
    domain: str | None = None,
    category: str | None = None,
    min_conviction: float = 0.0,
    limit: int = 10,
) -> list[BeliefInfo]:
    filters = {}
    if belief_type:
        filters["belief_type"] = belief_type
    if domain:
        filters["domain"] = domain
    if category:
        filters["category"] = category

    results = await memory.search(
        query=query,
        filters=filters,
        limit=limit,
    )

    return [
        BeliefInfo(
            id=r.id,
            content=r.content,
            belief_type=r.metadata.get("belief_type", "learning"),
            conviction=r.metadata.get("conviction", 0.5),
            domain=r.metadata.get("domain"),
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
