# REQ-001: MCP Context Server

**Priority:** P0
**Effort:** High (10 days)
**Dependencies:** None
**Blocks:** REQ-002, REQ-005, REQ-008, REQ-009
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific MCP tools and context

---

## Overview

Build a FastMCP server that exposes draagon-ai's semantic memory to Claude Code, providing dynamic, searchable, evolving context for AI-assisted development.

### Purpose

The MCP Context Server is the central knowledge hub for Draagon Forge. It wraps **draagon-ai's existing memory and belief systems** and exposes them via MCP tools to Claude Code.

### draagon-ai Foundation

This requirement builds on existing draagon-ai abstractions:

| draagon-ai Component | Location | Usage |
|---------------------|----------|-------|
| `Memory` | `memory/base.py` | Base storage unit |
| `MemoryType` | `memory/base.py` | FACT, BELIEF, OBSERVATION, INSIGHT, SKILL |
| `MemoryScope` | `memory/base.py` | WORLD, CONTEXT, AGENT, USER, SESSION |
| `AgentBelief` | `core/types.py` | Reconciled belief with confidence |
| `BeliefType` | `core/types.py` | household_fact, verified_fact, inferred, etc. |
| `UserObservation` | `core/types.py` | Raw input before reconciliation |
| `MemoryProvider` | `memory/providers/` | Storage backend (Neo4j recommended) |

### Draagon Forge Extensions

We extend draagon-ai with:

| Extension | Purpose |
|-----------|---------|
| `conviction: float` | Reinforcement score (separate from confidence) |
| `PRINCIPLE` belief type | Architectural rules |
| `PATTERN` belief type | Code examples with references |
| MCP tool wrappers | Expose draagon-ai to Claude Code |

---

## Requirements

### REQ-001.1: Core MCP Tools

Implement the following MCP tools:

| Tool | Purpose | Invocation Context |
|------|---------|-------------------|
| `search_context` | Semantic search across all beliefs | Before any implementation |
| `query_beliefs` | Query beliefs with filters (type, domain, conviction) | Architecture decisions, learning |
| `check_conflicts` | Detect belief violations | Before proposing changes |
| `find_examples` | Real code from codebase | "How do we do X?" |
| `report_outcome` | Feedback for reinforcement | After task completion |
| `get_review_queue` | Flagged items for review | Maintenance |
| `resolve_review` | Human decision on flagged item | Maintenance |

#### Belief CRUD Tools (Wrapping draagon-ai)

These tools wrap draagon-ai's `AgentBelief` and `MemoryProvider`:

```python
from draagon_ai.core.types import AgentBelief, BeliefType
from draagon_ai.memory.base import Memory, MemoryType, MemoryScope
from draagon_ai.memory.providers.neo4j import Neo4jMemoryProvider

# Extended BeliefType for Draagon Forge
class ForgeBeliefType(str, Enum):
    # Inherited from draagon-ai
    HOUSEHOLD_FACT = "household_fact"
    VERIFIED_FACT = "verified_fact"
    UNVERIFIED_CLAIM = "unverified_claim"
    INFERRED = "inferred"
    USER_PREFERENCE = "user_preference"
    # Draagon Forge extensions
    PRINCIPLE = "principle"      # Architectural rules
    PATTERN = "pattern"          # Code examples
    LEARNING = "learning"        # Extracted insights

@mcp.tool
async def add_belief(
    content: str,
    belief_type: str,  # ForgeBeliefType value
    domain: str | None = None,
    conviction: float = 0.7,  # Draagon Forge extension
    confidence: float = 0.8,  # draagon-ai's AgentBelief.confidence
    source: str = "user",
    rationale: str | None = None,
) -> dict:
    """Add a new belief, stored via draagon-ai's MemoryProvider."""

@mcp.tool
async def adjust_belief(
    belief_id: str,
    action: str,  # "reinforce" | "weaken" | "modify" | "delete"
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust an existing belief's conviction or content."""
```

**Key distinction:**
- `confidence` (draagon-ai): How certain we are the belief is correct
- `conviction` (Draagon Forge): How strongly held after reinforcement/weakening

| Operation | Tool | Notes |
|-----------|------|-------|
| Create | `add_belief(type="principle")` | Use type parameter |
| Read | `query_beliefs(type="principle")` | Filter by type |
| Update | `adjust_belief(action="modify")` | Works for all types |
| Delete | `adjust_belief(action="delete")` | Soft delete with reason |

#### Convenience Aliases (Optional)

For backward compatibility and discoverability:

| Alias | Equivalent |
|-------|------------|
| `get_principles(domain)` | `query_beliefs(type="principle", domain=domain)` |
| `get_patterns(domain)` | `query_beliefs(type="pattern", domain=domain)` |
| `store_learning(content)` | `add_belief(content, type="learning")` |

#### Discovery Tools (Agent-Native Compliance)

| Tool | Purpose |
|------|---------|
| `list_domains` | Enumerate available domains |
| `list_categories` | Enumerate available categories |
| `list_belief_types` | Enumerate belief types ("principle", "learning", etc.) |

**Acceptance Criteria:**
- [ ] Each tool is callable via Claude Code MCP integration
- [ ] Tools return structured responses with scores/confidence
- [ ] Error handling returns meaningful error messages
- [ ] All tools are async and non-blocking
- [ ] Unified belief CRUD works for all knowledge types
- [ ] Discovery tools enumerate available options
- [ ] Mutation responses include explicit status, ID, and persistence confirmation

### REQ-001.2: Knowledge Base Integration (via draagon-ai)

**Use draagon-ai's MemoryProvider:**

```python
from draagon_ai.memory.providers.neo4j import Neo4jMemoryProvider

# Recommended: Neo4j with native vector search
memory_provider = Neo4jMemoryProvider(
    uri=os.environ["NEO4J_URI"],
    user=os.environ.get("NEO4J_USER", "neo4j"),
    password=os.environ["NEO4J_PASSWORD"],
)

# Store beliefs using draagon-ai's Memory model
await memory_provider.store(
    content="Never use regex for semantic understanding",
    memory_type=MemoryType.BELIEF,
    scope=MemoryScope.CONTEXT,
    importance=0.9,
    confidence=0.95,
    entities=["regex", "semantic", "llm"],
)
```

**draagon-ai handles:**
- Neo4j graph storage with relationships
- Vector embeddings for semantic search
- Bi-temporal tracking (event_time vs ingestion_time)
- Scope-based access control

**Draagon Forge adds:**
- `conviction` field tracking (reinforcement over time)
- `ForgeBeliefType` enum extension
- MCP tool wrappers

**Acceptance Criteria:**
- [ ] Uses `Neo4jMemoryProvider` from draagon-ai
- [ ] Beliefs stored with conviction scores (Forge extension)
- [ ] Pattern-type beliefs include code example references
- [ ] All beliefs have source tracking
- [ ] Vector search returns relevant results (>0.7 similarity)
- [ ] Graph queries traverse relationships correctly

### REQ-001.3: CLAUDE.md Seeding

Parse and seed beliefs from CLAUDE.md files:

```bash
python -m draagon_forge.mcp.seed \
    --claude-md ~/project/CLAUDE.md \
    --index-codebase ~/project/src
```

**Seeding creates beliefs with appropriate types:**
- "Core Principles" section → `belief_type="principle"`, `conviction=0.9`
- "Guidelines" section → `belief_type="principle"`, `conviction=0.85`
- Code examples → `belief_type="pattern"`, `conviction=0.8`
- Notes/tips → `belief_type="learning"`, `conviction=0.7`

**Acceptance Criteria:**
- [ ] Extracts content as beliefs with correct type
- [ ] Sets source="claude_md" for all seeded beliefs
- [ ] Handles multiple CLAUDE.md files
- [ ] Idempotent seeding (no duplicates)
- [ ] Reports seeding statistics by belief type

### REQ-001.4: Feedback Loop Integration

```python
@mcp.tool
async def report_outcome(
    context_ids: list[str],
    outcome: str,  # "helpful" | "not_helpful" | "misleading" | "outdated"
    reason: str | None = None,
) -> dict:
```

**Acceptance Criteria:**
- [ ] Reinforces helpful context (+0.05 conviction)
- [ ] Weakens unhelpful context (-0.03 conviction)
- [ ] Flags misleading content for review (-0.1 conviction)
- [ ] Marks outdated content appropriately
- [ ] Logs all feedback for analysis

---

## Technical Design

### File Structure

```
src/draagon_forge/
├── mcp/
│   ├── __init__.py
│   ├── server.py             # FastMCP entry point
│   ├── config.py             # Configuration
│   └── tools/
│       ├── __init__.py
│       ├── search.py         # search_context (wraps MemoryProvider.search)
│       ├── beliefs.py        # add_belief, query_beliefs, adjust_belief
│       ├── conflicts.py      # check_conflicts (wraps cognition/beliefs.py)
│       ├── examples.py       # find_examples
│       ├── feedback.py       # report_outcome
│       ├── discovery.py      # list_domains, list_categories, list_belief_types
│       └── review.py         # get_review_queue, resolve_review
├── core/
│   ├── __init__.py           # Re-exports from draagon-ai
│   ├── extensions.py         # ForgeBeliefType, conviction field
│   └── provider.py           # Configured MemoryProvider instance
└── seed/
    ├── __init__.py
    └── claude_md.py          # CLAUDE.md parser
```

**Note:** We import from draagon-ai, not reimplement:
```python
# src/draagon_forge/core/__init__.py
from draagon_ai.memory.base import Memory, MemoryType, MemoryScope
from draagon_ai.core.types import AgentBelief, BeliefType, UserObservation
from draagon_ai.memory.providers.neo4j import Neo4jMemoryProvider
```

### Configuration

```json
// ~/.config/claude-code/mcp.json
{
    "mcpServers": {
        "draagon-forge": {
            "command": "python",
            "args": ["-m", "draagon_forge.mcp.server"],
            "env": {
                "NEO4J_URI": "bolt://localhost:7687",
                "QDRANT_URL": "http://localhost:6333",
                "DRAAGON_PROJECT": "my-project"
            }
        }
    }
}
```

---

## Testing

### Unit Tests

- Test each tool function in isolation
- Mock database responses for edge cases
- Test error handling paths

### Integration Tests

- Test with real Neo4j/Qdrant instances
- Test full search → retrieval → feedback cycle
- Test CLAUDE.md seeding with sample files

### Acceptance Tests

- Claude Code can invoke all tools
- Search returns semantically relevant results
- Feedback affects future search rankings

---

## Acceptance Checklist

- [ ] All 7 core tools implemented and tested
- [ ] Unified belief CRUD (add_belief, query_beliefs, adjust_belief) working
- [ ] All 3 discovery tools implemented
- [ ] Convenience aliases (get_principles, get_patterns, store_learning) working
- [ ] Neo4j integration working
- [ ] Qdrant integration working
- [ ] CLAUDE.md seeding functional (creates beliefs with correct types)
- [ ] Feedback loop updating conviction scores
- [ ] Documentation complete
- [ ] Integration tests passing
- [ ] Agent-native audit checklist passed for this component

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | All semantic analysis via LLM |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol standard |
| Async-First Processing | ✅ | All I/O is async |
| Test Outcomes | ✅ | Tests validate behavior |

---

## References

- [MCP Specification](https://modelcontextprotocol.io/docs)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)
- [Neo4j Python Driver](https://neo4j.com/docs/python-manual/)
- [Qdrant Client](https://qdrant.tech/documentation/)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
