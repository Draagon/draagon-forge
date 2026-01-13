# REQ-016: Conversation History Search

**Priority:** P1
**Effort:** 3 days
**Dependencies:** REQ-014, REQ-001
**Blocks:** None

---

## Overview

Expose draagon-ai's episodic memory capabilities through MCP tools, enabling Claude Code to search through past conversation turns when context windows fill or information needs recovery.

### Problem Statement

**Current State:**
- Conversation history is limited to a sliding window (last 5 turns)
- When context fills, Claude Code triggers summarization
- Summarization loses specific details and nuances
- No way to recover lost information from earlier in the session

**Impact:**
- Lost context leads to repeated questions
- Nuanced decisions made early in session forgotten
- Complex multi-step tasks lose coherence over long sessions

### Target State

- Full conversation history persisted as searchable episodic memories
- Agents can query past turns by semantic similarity
- Specific details recoverable even after summarization
- Cross-session memory for recurring topics

---

## Requirements

### REQ-016.1: Store Conversation Turns

Automatically persist conversation turns as episodic memories in draagon-ai.

```python
async def store_conversation_turn(
    role: str,  # "user" | "assistant"
    content: str,
    session_id: str,
    turn_number: int,
    metadata: dict | None = None,
) -> str:
    """Store a conversation turn as episodic memory.

    Called automatically by the extension or MCP server when
    conversation turns occur.

    Args:
        role: Who sent this message (user or assistant)
        content: The message content
        session_id: Unique session identifier
        turn_number: Sequential turn number in session
        metadata: Optional metadata (tool calls, file refs, etc.)

    Returns:
        Memory ID for the stored turn
    """
```

**Storage Mapping:**
| Forge Concept | draagon-ai Mapping |
|---------------|-------------------|
| Conversation turn | `MemoryType.EPISODIC` |
| Session scope | `MemoryScope.SESSION` |
| User identity | `user_id` parameter |
| Turn metadata | `memory.metadata` |

**Acceptance Criteria:**
- [ ] Turns stored automatically during conversation
- [ ] Session ID links related turns
- [ ] Turn numbers maintain ordering
- [ ] Metadata includes tool invocations and file references
- [ ] Storage is non-blocking (async fire-and-forget)

### REQ-016.2: Search Conversation History

Implement MCP tool for semantic search across conversation history.

```python
@mcp.tool()
async def search_conversation_history(
    query: str,
    session_id: str | None = None,
    role: str | None = None,
    limit: int = 10,
    include_context: bool = True,
) -> list[dict]:
    """Search through past conversation turns for relevant context.

    Use this when you need to recall information from earlier in the
    conversation that may have been summarized away, or to find
    related discussions from previous sessions.

    Args:
        query: Semantic search query
        session_id: Limit to specific session (None = all sessions)
        role: Filter by role ("user" | "assistant" | None for both)
        limit: Maximum results to return
        include_context: Include surrounding turns for context

    Returns:
        List of matching conversation turns with:
        - turn_id: Unique identifier
        - session_id: Session this turn belongs to
        - role: Who sent this message
        - content: The message content
        - turn_number: Position in conversation
        - score: Semantic similarity score
        - context: Surrounding turns (if requested)
        - timestamp: When this turn occurred
    """
```

**Response Format:**
```json
{
  "results": [
    {
      "turn_id": "turn-abc123",
      "session_id": "session-xyz789",
      "role": "user",
      "content": "I want to use the repository pattern for data access",
      "turn_number": 5,
      "score": 0.87,
      "context": {
        "before": [
          {"role": "assistant", "content": "What data access pattern would you prefer?", "turn_number": 4}
        ],
        "after": [
          {"role": "assistant", "content": "Great choice! The repository pattern will...", "turn_number": 6}
        ]
      },
      "timestamp": "2026-01-13T10:30:00Z"
    }
  ],
  "total_matches": 3,
  "sessions_searched": 1
}
```

**Acceptance Criteria:**
- [ ] Semantic search finds relevant turns
- [ ] Session filtering works correctly
- [ ] Role filtering works correctly
- [ ] Context window includes surrounding turns
- [ ] Results sorted by relevance score
- [ ] Response time <500ms for typical queries

### REQ-016.3: Get Session Summary

Provide summaries of past sessions for quick orientation.

```python
@mcp.tool()
async def get_session_summary(
    session_id: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """Get summaries of recent conversation sessions.

    Useful for understanding what was discussed in previous sessions
    or getting an overview of the current session's key points.

    Args:
        session_id: Get summary for specific session (None = recent sessions)
        limit: Number of sessions to summarize

    Returns:
        List of session summaries with:
        - session_id: Session identifier
        - started_at: When session began
        - turn_count: Number of turns in session
        - key_topics: Main topics discussed
        - key_decisions: Important decisions made
        - unresolved: Open questions or tasks
    """
```

**Response Format:**
```json
{
  "sessions": [
    {
      "session_id": "session-xyz789",
      "started_at": "2026-01-13T10:00:00Z",
      "ended_at": "2026-01-13T11:30:00Z",
      "turn_count": 42,
      "key_topics": [
        "Repository pattern implementation",
        "Database migration strategy",
        "Error handling approach"
      ],
      "key_decisions": [
        "Use repository pattern for data access",
        "Implement soft deletes for audit trail"
      ],
      "unresolved": [
        "Decide on caching strategy"
      ]
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] Summaries generated from stored turns
- [ ] Key topics extracted accurately
- [ ] Decisions identified correctly
- [ ] Unresolved items tracked
- [ ] Summary generation uses LLM (not keyword extraction)

### REQ-016.4: draagon-ai Integration

Map conversation storage to draagon-ai's memory system.

**Memory Type Mapping:**
```python
from draagon_ai.memory.base import MemoryType, MemoryScope

# Conversation turns stored as episodic memories
memory_type = MemoryType.EPISODIC
scope = MemoryScope.SESSION

# Metadata structure
metadata = {
    "forge_type": "conversation_turn",
    "session_id": session_id,
    "turn_number": turn_number,
    "role": role,
    "tool_calls": [...],  # If assistant made tool calls
    "file_refs": [...],   # If files were referenced
}
```

**Search Integration:**
```python
# Use draagon-ai's search with episodic filter
results = await memory_provider.search(
    query=query,
    agent_id=config.agent_id,
    user_id=config.user_id,
    memory_types=[MemoryType.EPISODIC],
    limit=limit * 2,  # Over-fetch for filtering
    min_score=0.5,
)

# Filter by session_id and role from metadata
filtered = [
    r for r in results
    if (session_id is None or r.memory.metadata.get("session_id") == session_id)
    and (role is None or r.memory.metadata.get("role") == role)
]
```

**Acceptance Criteria:**
- [ ] Uses draagon-ai MemoryProvider interface
- [ ] Correct memory type and scope
- [ ] Metadata structure consistent
- [ ] Search uses semantic capabilities

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── conversation.py      # NEW: Conversation history tools
│   └── ...
├── memory/
│   └── conversation.py      # NEW: Conversation storage logic
└── server.py                # Updated to register new tools
```

### Automatic Turn Storage

```python
# memory/conversation.py

from draagon_ai.memory.base import MemoryType, MemoryScope
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.config import config
import structlog

logger = structlog.get_logger(__name__)

async def store_turn(
    role: str,
    content: str,
    session_id: str,
    turn_number: int,
    metadata: dict | None = None,
) -> str:
    """Store a conversation turn."""
    memory = get_memory()

    # Build content for embedding
    turn_content = f"[{role.upper()}] {content}"

    # Store via draagon-ai adapter
    memory_id = await memory.provider.store(
        content=turn_content,
        memory_type=MemoryType.EPISODIC,
        scope=MemoryScope.SESSION,
        agent_id=config.agent_id,
        user_id=config.user_id,
        metadata={
            "forge_type": "conversation_turn",
            "session_id": session_id,
            "turn_number": turn_number,
            "role": role,
            **(metadata or {}),
        },
    )

    logger.debug(
        "Stored conversation turn",
        memory_id=memory_id,
        session_id=session_id,
        turn_number=turn_number,
    )

    return memory_id
```

### Search Implementation

```python
# tools/conversation.py

from draagon_ai.memory.base import MemoryType
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.config import config

async def search_conversation_history(
    query: str,
    session_id: str | None = None,
    role: str | None = None,
    limit: int = 10,
    include_context: bool = True,
) -> list[dict]:
    """Search conversation history."""
    memory = get_memory()

    # Search episodic memories
    results = await memory.provider.search(
        query=query,
        agent_id=config.agent_id,
        user_id=config.user_id,
        memory_types=[MemoryType.EPISODIC],
        limit=limit * 3,  # Over-fetch for filtering
        min_score=0.5,
    )

    # Filter to conversation turns
    turns = []
    for result in results:
        meta = result.memory.metadata
        if meta.get("forge_type") != "conversation_turn":
            continue
        if session_id and meta.get("session_id") != session_id:
            continue
        if role and meta.get("role") != role:
            continue

        turn = {
            "turn_id": result.memory.id,
            "session_id": meta.get("session_id"),
            "role": meta.get("role"),
            "content": result.memory.content,
            "turn_number": meta.get("turn_number"),
            "score": result.score,
            "timestamp": result.memory.created_at.isoformat(),
        }

        if include_context:
            turn["context"] = await _get_surrounding_turns(
                session_id=meta.get("session_id"),
                turn_number=meta.get("turn_number"),
            )

        turns.append(turn)

    return turns[:limit]
```

---

## Testing

### Unit Tests

```python
# tests/mcp/unit/test_conversation.py

class TestConversationStorage:
    """Test conversation turn storage."""

    async def test_store_turn_user(self):
        """User turns stored with correct metadata."""

    async def test_store_turn_assistant(self):
        """Assistant turns stored with correct metadata."""

    async def test_store_turn_with_tool_calls(self):
        """Tool call metadata preserved."""


class TestConversationSearch:
    """Test conversation history search."""

    async def test_search_finds_relevant_turns(self):
        """Semantic search finds relevant past turns."""

    async def test_search_session_filter(self):
        """Session filter limits results correctly."""

    async def test_search_role_filter(self):
        """Role filter limits results correctly."""

    async def test_search_includes_context(self):
        """Context window includes surrounding turns."""
```

### Integration Tests

```python
# tests/mcp/integration/test_conversation_history.py

class TestConversationHistoryIntegration:
    """Integration tests with draagon-ai memory."""

    async def test_full_conversation_flow(self):
        """Store turns, search, verify results."""

    async def test_cross_session_search(self):
        """Search finds turns from multiple sessions."""

    async def test_session_summary_generation(self):
        """Session summaries accurately reflect content."""
```

---

## Acceptance Checklist

- [ ] `store_conversation_turn` implemented
- [ ] `search_conversation_history` MCP tool implemented
- [ ] `get_session_summary` MCP tool implemented
- [ ] draagon-ai memory integration working
- [ ] Context window retrieval working
- [ ] Session filtering working
- [ ] Role filtering working
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Session summaries use LLM extraction |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | Uses draagon-ai MemoryProvider protocol |
| Async-First Processing | ✅ | All storage and search async |
| Test Outcomes | ✅ | Tests validate retrieval accuracy |

---

## References

- [Cursor: Chat History as Files](https://cursor.com/blog/dynamic-context-discovery)
- [draagon-ai: Episodic Memory](../draagon-ai/memory/base.py)
- [Memory Scope Documentation](../draagon-ai/docs/memory-scopes.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
