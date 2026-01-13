# REQ-020: Semantic Context Bundles

**Priority:** P1
**Effort:** 5 days
**Dependencies:** REQ-014, REQ-016
**Blocks:** REQ-022
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific episodic memory

---

## Overview

Replace file-based context bundles with semantic episodic memory chains. Instead of appending operations to log files, store agent work as interconnected episodic memories that can be queried, replayed, and learned from.

### Background: The File-Centric Pattern

Traditional context bundles (as described in context engineering literature) work like this:

```
Agent executes → Hooks append to bundle.md → Next agent loads bundle.md
```

**Limitations:**
- Files grow indefinitely
- No semantic understanding of what's relevant
- Manual cleanup required
- No cross-session learning
- Can't query "what did we decide about X?"

### The Semantic Approach

Draagon Forge transforms this into:

```
Agent executes → Operations stored as episodic memories →
Next agent queries by relevance/session/task →
Patterns extracted → Beliefs strengthened
```

**Advantages:**
- Query by meaning, not filename
- Automatic relevance filtering
- Cross-session learning
- Relationships to beliefs/principles
- Natural decay of irrelevant context

---

## Requirements

### REQ-020.1: Operation Capture as Episodic Memory

Capture agent operations (reads, writes, decisions, tool calls) as episodic memories.

```python
@dataclass
class AgentOperation:
    """A single agent operation stored as episodic memory."""

    operation_type: str  # "read" | "write" | "decision" | "tool_call" | "search"
    target: str          # File path, tool name, or decision subject
    content_summary: str # Brief summary of what happened
    session_id: str      # Links operations in same session
    sequence_number: int # Order within session
    context: dict        # Additional context (query, args, result summary)

    # Relationships
    triggered_by: str | None      # Previous operation ID that led to this
    informs_belief: str | None    # Belief ID this supports/contradicts
    decision_rationale: str | None # Why this operation was performed

async def capture_operation(
    operation: AgentOperation,
) -> str:
    """Store operation as episodic memory with relationships.

    Args:
        operation: The operation to capture

    Returns:
        Memory ID for the stored operation
    """
```

**Storage Mapping:**
```python
# Map to draagon-ai memory
memory = await provider.store(
    content=f"[{operation.operation_type.upper()}] {operation.target}: {operation.content_summary}",
    memory_type=MemoryType.EPISODIC,
    scope=MemoryScope.SESSION,
    agent_id=config.agent_id,
    metadata={
        "forge_type": "agent_operation",
        "operation_type": operation.operation_type,
        "target": operation.target,
        "session_id": operation.session_id,
        "sequence_number": operation.sequence_number,
        "triggered_by": operation.triggered_by,
        "informs_belief": operation.informs_belief,
        **operation.context,
    },
)
```

**Acceptance Criteria:**
- [ ] All operation types captured
- [ ] Session ID links related operations
- [ ] Sequence numbers maintain order
- [ ] Relationships to beliefs tracked
- [ ] Non-blocking capture (fire-and-forget)

### REQ-020.2: Session Reconstruction via Semantic Query

Reconstruct agent state by querying episodic memory instead of loading files.

```python
@mcp.tool()
async def reconstruct_session(
    session_id: str | None = None,
    task_description: str | None = None,
    include_decisions: bool = True,
    include_reads: bool = True,
    include_writes: bool = False,
    max_operations: int = 50,
) -> dict:
    """Reconstruct agent context from previous session.

    Unlike file-based bundles, this queries semantic memory to find
    relevant operations, filters by importance, and reconstructs
    a coherent narrative of what happened.

    Args:
        session_id: Specific session to reconstruct (None = find relevant)
        task_description: Find sessions related to this task
        include_decisions: Include decision points
        include_reads: Include file/context reads
        include_writes: Include write operations
        max_operations: Maximum operations to include

    Returns:
        Reconstructed session context with:
        - narrative: Human-readable summary
        - operations: Key operations in order
        - decisions: Important decisions made
        - beliefs_affected: Beliefs that were reinforced/weakened
        - unfinished: Tasks that weren't completed
    """
```

**Response Format:**
```json
{
  "session_id": "session-abc123",
  "narrative": "Previous session focused on implementing repository pattern. Read 5 architecture files, made decision to use async repositories, created 3 new files.",
  "operations": [
    {
      "type": "read",
      "target": "src/architecture/patterns.md",
      "summary": "Reviewed existing patterns",
      "sequence": 1
    },
    {
      "type": "decision",
      "target": "repository_pattern",
      "summary": "Decided to use async repository with unit of work",
      "rationale": "Matches existing codebase patterns",
      "sequence": 5
    }
  ],
  "decisions": [
    {
      "subject": "repository_pattern",
      "choice": "async with unit of work",
      "rationale": "Matches existing patterns, better testability",
      "confidence": 0.85
    }
  ],
  "beliefs_affected": [
    {
      "belief_id": "belief-xyz",
      "content": "Use repository pattern for data access",
      "action": "reinforced",
      "reason": "Successfully applied in this session"
    }
  ],
  "unfinished": [
    "Unit tests for UserRepository not yet written"
  ]
}
```

**Acceptance Criteria:**
- [ ] Can reconstruct by session ID
- [ ] Can find relevant sessions by task description
- [ ] Operations filtered by type
- [ ] Narrative generated from operations
- [ ] Unfinished work identified

### REQ-020.3: Automatic Operation Hooks

Integrate with Claude Code hooks to automatically capture operations.

```python
# Hook into Claude Code events
HOOK_MAPPINGS = {
    "read_file": "read",
    "write_file": "write",
    "edit_file": "write",
    "bash": "tool_call",
    "search": "search",
    "grep": "search",
}

async def on_tool_call(
    tool_name: str,
    args: dict,
    result: Any,
    session_id: str,
) -> None:
    """Hook called after each tool execution.

    Automatically captures operation to episodic memory.
    """
    operation_type = HOOK_MAPPINGS.get(tool_name, "tool_call")

    # Extract target based on tool type
    target = extract_target(tool_name, args)

    # Summarize result (don't store full content)
    summary = summarize_result(tool_name, result)

    # Capture non-blocking
    asyncio.create_task(capture_operation(AgentOperation(
        operation_type=operation_type,
        target=target,
        content_summary=summary,
        session_id=session_id,
        sequence_number=get_next_sequence(session_id),
        context={"tool": tool_name, "args_summary": summarize_args(args)},
    )))
```

**Acceptance Criteria:**
- [ ] File reads captured automatically
- [ ] File writes captured automatically
- [ ] Tool calls captured with summaries
- [ ] Non-blocking (doesn't slow agent)
- [ ] Session ID tracked across operations

### REQ-020.4: Decision Point Capture

Explicitly capture important decisions with rationale.

```python
@mcp.tool()
async def record_decision(
    subject: str,
    choice: str,
    rationale: str,
    alternatives_considered: list[str] | None = None,
    confidence: float = 0.7,
    affects_beliefs: list[str] | None = None,
) -> dict:
    """Record an important decision point.

    Decisions are higher-weight episodic memories that inform
    future context reconstruction and belief updates.

    Args:
        subject: What the decision is about
        choice: The decision made
        rationale: Why this choice was made
        alternatives_considered: Other options that were rejected
        confidence: Confidence in the decision
        affects_beliefs: Belief IDs this decision supports/contradicts

    Returns:
        Recorded decision with ID
    """
```

**Acceptance Criteria:**
- [ ] Decisions stored with high importance
- [ ] Rationale captured for future reference
- [ ] Links to affected beliefs
- [ ] Queryable by subject
- [ ] Influences belief conviction scores

### REQ-020.5: Pattern Extraction from Sessions

Extract patterns from completed sessions to strengthen beliefs.

```python
async def extract_session_patterns(
    session_id: str,
) -> list[dict]:
    """Extract patterns from a completed session.

    Analyzes the session's operations and decisions to identify
    patterns that should become or strengthen beliefs.

    Returns:
        List of extracted patterns with:
        - pattern: The pattern identified
        - evidence: Operations that demonstrate it
        - suggested_belief: Belief to create or strengthen
        - confidence: Confidence in the pattern
    """
```

**Example Output:**
```json
{
  "patterns": [
    {
      "pattern": "Always read existing patterns before implementing new ones",
      "evidence": [
        "Read architecture/patterns.md before creating UserRepository",
        "Read existing repositories before designing interface"
      ],
      "suggested_belief": {
        "content": "Review existing patterns before implementing new code",
        "category": "workflow",
        "conviction": 0.7
      },
      "confidence": 0.8
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] Patterns extracted using LLM analysis
- [ ] Evidence linked to specific operations
- [ ] Suggested beliefs generated
- [ ] Can auto-create beliefs with approval
- [ ] Feeds into belief reinforcement

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── bundles.py           # NEW: Semantic bundle tools
│   └── ...
├── memory/
│   ├── operations.py        # NEW: Operation capture
│   └── sessions.py          # NEW: Session management
├── hooks/
│   └── capture.py           # NEW: Hook integration
└── analysis/
    └── patterns.py          # NEW: Pattern extraction
```

### Memory Schema for Operations

```python
# Neo4j relationship model
"""
(Operation)-[:FOLLOWS]->(Operation)        # Sequence
(Operation)-[:TRIGGERED_BY]->(Operation)   # Causation
(Operation)-[:INFORMS]->(Belief)           # Evidence
(Operation)-[:PART_OF]->(Session)          # Grouping
(Decision)-[:CHOSE]->(Option)              # Decisions
(Decision)-[:REJECTED]->(Option)           # Alternatives
"""
```

### Comparison: File vs Semantic Bundles

| Aspect | File Bundle | Semantic Bundle |
|--------|-------------|-----------------|
| Storage | Append to .md file | Episodic memory + relationships |
| Query | Load entire file | Query by relevance/session/task |
| Size | Grows indefinitely | Auto-filtered by importance |
| Learning | None | Patterns → Beliefs |
| Cross-session | Manual copy | Automatic via memory |
| Decay | Manual cleanup | Natural relevance decay |

---

## Testing

### Unit Tests

```python
class TestOperationCapture:
    """Test operation capture to episodic memory."""

    async def test_capture_read_operation(self):
        """Read operations captured with correct metadata."""

    async def test_capture_decision(self):
        """Decisions captured with rationale and links."""

    async def test_sequence_numbers_increment(self):
        """Sequence numbers maintain order within session."""


class TestSessionReconstruction:
    """Test semantic session reconstruction."""

    async def test_reconstruct_by_session_id(self):
        """Can reconstruct specific session."""

    async def test_reconstruct_by_task_description(self):
        """Finds relevant sessions by semantic search."""

    async def test_narrative_generation(self):
        """Generates coherent narrative from operations."""

    async def test_identifies_unfinished_work(self):
        """Correctly identifies incomplete tasks."""
```

### Integration Tests

```python
class TestSemanticBundleIntegration:
    """Integration tests for semantic bundles."""

    async def test_full_session_capture_and_replay(self):
        """Capture session, reconstruct, verify accuracy."""

    async def test_pattern_extraction_creates_beliefs(self):
        """Patterns extracted and converted to beliefs."""

    async def test_cross_session_context(self):
        """New session can access relevant past sessions."""
```

---

## Usage Examples

### Automatic Capture During Work

```python
# Agent works normally - hooks capture everything
await agent.read_file("src/models/user.py")    # Captured
await agent.search("repository pattern")        # Captured
await agent.record_decision(                    # Explicit decision
    subject="data_access",
    choice="repository_pattern",
    rationale="Matches existing codebase"
)
await agent.write_file("src/repos/user.py")    # Captured
```

### Reconstructing After Context Overflow

```python
# Context window filled, need to continue in new session
reconstruction = await mcp.call_tool("reconstruct_session", {
    "session_id": "session-abc123",
    "include_decisions": True,
})

# Agent now has:
# - Narrative of what happened
# - Key decisions made
# - Unfinished work to continue
```

### Finding Relevant Past Work

```python
# Starting new task, find relevant past sessions
reconstruction = await mcp.call_tool("reconstruct_session", {
    "task_description": "implement caching layer",
    "include_decisions": True,
})

# Returns sessions where caching was discussed/implemented
# Decisions made about caching in past
# Patterns that emerged
```

---

## Acceptance Checklist

- [ ] Operation capture implemented
- [ ] Session reconstruction via semantic query
- [ ] Automatic hooks integration
- [ ] Decision point capture
- [ ] Pattern extraction from sessions
- [ ] Narrative generation
- [ ] Unfinished work identification
- [ ] Cross-session relevance search
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Pattern extraction uses LLM |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | Uses draagon-ai MemoryProvider |
| Async-First Processing | ✅ | All capture non-blocking async |
| Test Outcomes | ✅ | Tests validate reconstruction accuracy |

---

## References

- [Context Engineering: R&D Framework](transcript source)
- [draagon-ai: Episodic Memory](../draagon-ai/memory/base.py)
- [REQ-016: Conversation History Search](./REQ-016-conversation-history-search.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
