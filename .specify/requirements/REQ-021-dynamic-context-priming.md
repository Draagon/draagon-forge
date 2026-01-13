# REQ-021: Dynamic Context Priming

**Priority:** P1
**Effort:** 4 days
**Dependencies:** REQ-014, REQ-018
**Blocks:** None

---

## Overview

Replace static priming files with semantic query-based context injection. Instead of maintaining multiple `/prime-*` command files, dynamically assemble context based on task type, domain, and relevance.

### Background: The File-Centric Pattern

Traditional context priming works like this:

```
/prime-feature  → loads feature-development.md
/prime-bugfix   → loads debugging-workflow.md
/prime-review   → loads code-review-checklist.md
```

**Limitations:**
- Must create and maintain separate prime files
- Static content doesn't evolve with learnings
- No personalization based on past success
- Duplicated content across prime files
- Manual updates when practices change

### The Semantic Approach

Draagon Forge transforms this into:

```
prime(task_type="feature", domain="authentication") →
  Query beliefs by domain →
  Query patterns by task type →
  Query recent successful sessions →
  Assemble dynamic, relevant context
```

**Advantages:**
- Context evolves as beliefs strengthen/weaken
- Personalized based on what worked before
- No file maintenance
- Cross-domain knowledge surfaces when relevant
- Learns from outcomes

---

## Requirements

### REQ-021.1: Task-Aware Context Assembly

Dynamically assemble context based on task characteristics.

```python
@mcp.tool()
async def prime_context(
    task_type: str,
    domain: str | None = None,
    description: str | None = None,
    include_patterns: bool = True,
    include_principles: bool = True,
    include_past_sessions: bool = True,
    include_warnings: bool = True,
    max_tokens: int = 2000,
) -> dict:
    """Dynamically assemble context for a task.

    Unlike static prime files, this queries semantic memory to
    assemble the most relevant context for the specific task,
    personalized based on past outcomes.

    Args:
        task_type: Type of task (feature, bugfix, refactor, review, etc.)
        domain: Domain area (auth, database, api, ui, etc.)
        description: Brief task description for relevance matching
        include_patterns: Include relevant design patterns
        include_principles: Include relevant principles/beliefs
        include_past_sessions: Include learnings from similar past work
        include_warnings: Include "watch out for" items
        max_tokens: Maximum context tokens to assemble

    Returns:
        Assembled context with:
        - principles: Relevant principles for this task
        - patterns: Applicable patterns with examples
        - learnings: What worked/didn't in similar past tasks
        - warnings: Common pitfalls to avoid
        - suggested_approach: Recommended approach based on history
    """
```

**Response Format:**
```json
{
  "task_context": {
    "task_type": "feature",
    "domain": "authentication",
    "relevance_score": 0.89
  },
  "principles": [
    {
      "content": "Always validate tokens at API boundaries",
      "conviction": 0.92,
      "source": "security-review-2024",
      "relevance": 0.95
    },
    {
      "content": "Use dependency injection for auth services",
      "conviction": 0.85,
      "source": "architecture-decisions",
      "relevance": 0.88
    }
  ],
  "patterns": [
    {
      "name": "Token Refresh Pattern",
      "description": "How we handle JWT refresh in this codebase",
      "example_file": "src/auth/token_service.py",
      "relevance": 0.91
    }
  ],
  "learnings": [
    {
      "session": "session-xyz",
      "task": "Added OAuth2 support",
      "outcome": "successful",
      "key_insight": "Start with integration tests to verify flow",
      "relevance": 0.87
    }
  ],
  "warnings": [
    {
      "content": "Token expiry edge case caused issues in session-abc",
      "severity": "medium",
      "mitigation": "Always check token expiry before and after async operations"
    }
  ],
  "suggested_approach": "Based on 3 similar past tasks, recommend: 1) Write integration test first, 2) Use existing TokenService pattern, 3) Add explicit expiry handling",
  "token_count": 1847
}
```

**Acceptance Criteria:**
- [ ] Assembles context by task type
- [ ] Filters by domain relevance
- [ ] Respects max_tokens limit
- [ ] Includes past session learnings
- [ ] Generates suggested approach

### REQ-021.2: Task Type Classification

Automatically classify tasks to determine priming strategy.

```python
TASK_TYPE_PROFILES = {
    "feature": {
        "memory_types": [MemoryType.KNOWLEDGE, MemoryType.SKILL],
        "priority_categories": ["architecture", "patterns", "testing"],
        "include_examples": True,
        "include_warnings": True,
    },
    "bugfix": {
        "memory_types": [MemoryType.INSIGHT, MemoryType.EPISODIC],
        "priority_categories": ["debugging", "testing", "edge-cases"],
        "include_examples": False,
        "include_warnings": True,
        "prioritize_recent": True,
    },
    "refactor": {
        "memory_types": [MemoryType.KNOWLEDGE, MemoryType.BELIEF],
        "priority_categories": ["architecture", "patterns", "clean-code"],
        "include_examples": True,
        "include_warnings": True,
    },
    "review": {
        "memory_types": [MemoryType.BELIEF, MemoryType.INSTRUCTION],
        "priority_categories": ["security", "testing", "standards"],
        "include_examples": False,
        "include_warnings": True,
    },
    "explore": {
        "memory_types": [MemoryType.EPISODIC, MemoryType.KNOWLEDGE],
        "priority_categories": ["architecture", "documentation"],
        "include_examples": False,
        "include_warnings": False,
        "prioritize_recent": True,
    },
}

async def classify_task(
    description: str,
) -> tuple[str, float]:
    """Classify task type from description.

    Uses LLM to classify the task and determine priming strategy.

    Returns:
        Tuple of (task_type, confidence)
    """
```

**Acceptance Criteria:**
- [ ] Classifies common task types accurately
- [ ] Returns confidence score
- [ ] Falls back to "general" for ambiguous tasks
- [ ] Classification cached for session

### REQ-021.3: Domain-Specific Memory Retrieval

Query memories filtered by domain relevance.

```python
async def retrieve_domain_context(
    domain: str,
    task_type: str,
    limit: int = 10,
) -> list[dict]:
    """Retrieve domain-specific context.

    Queries beliefs, patterns, and learnings filtered by domain,
    weighted by conviction and recent success.

    Args:
        domain: Domain area (auth, database, api, etc.)
        task_type: Task type for memory type filtering
        limit: Maximum items to return

    Returns:
        Ranked list of relevant context items
    """
    profile = TASK_TYPE_PROFILES.get(task_type, TASK_TYPE_PROFILES["feature"])

    # Query with domain filter
    results = await memory.search(
        query=f"{domain} {task_type}",
        memory_types=profile["memory_types"],
        limit=limit * 2,  # Over-fetch for filtering
    )

    # Score by domain match + conviction + recency
    scored = []
    for result in results:
        domain_score = calculate_domain_relevance(result, domain)
        conviction_score = result.memory.confidence
        recency_score = calculate_recency_score(result.memory.created_at)

        total_score = (
            domain_score * 0.4 +
            conviction_score * 0.4 +
            recency_score * 0.2
        )

        scored.append((result, total_score))

    # Return top items
    scored.sort(key=lambda x: x[1], reverse=True)
    return [item for item, score in scored[:limit]]
```

**Acceptance Criteria:**
- [ ] Filters by domain
- [ ] Weights by conviction score
- [ ] Considers recency for relevant task types
- [ ] Returns ranked results

### REQ-021.4: Success-Weighted Context

Prioritize context from successful past sessions.

```python
async def get_success_weighted_learnings(
    task_type: str,
    domain: str | None,
    limit: int = 5,
) -> list[dict]:
    """Get learnings weighted by past success.

    Queries episodic memory for similar past tasks, weights by
    outcome (success/failure), and extracts key insights.

    Args:
        task_type: Type of task
        domain: Optional domain filter
        limit: Maximum learnings to return

    Returns:
        Learnings with success weighting
    """
    # Find similar past sessions
    sessions = await memory.search(
        query=f"{task_type} {domain or ''}",
        memory_types=[MemoryType.EPISODIC],
        limit=limit * 3,
    )

    # Weight by outcome
    weighted = []
    for session in sessions:
        outcome = session.memory.metadata.get("outcome", "unknown")
        weight = {
            "successful": 1.0,
            "partial": 0.6,
            "failed": 0.3,  # Still learn from failures, but lower weight
            "unknown": 0.5,
        }.get(outcome, 0.5)

        weighted.append({
            "session_id": session.memory.metadata.get("session_id"),
            "task": session.memory.content,
            "outcome": outcome,
            "key_insight": session.memory.metadata.get("key_insight"),
            "weight": weight,
            "relevance": session.score * weight,
        })

    weighted.sort(key=lambda x: x["relevance"], reverse=True)
    return weighted[:limit]
```

**Acceptance Criteria:**
- [ ] Finds similar past sessions
- [ ] Weights by outcome
- [ ] Extracts key insights
- [ ] Learns from failures too (lower weight)

### REQ-021.5: Warning Extraction

Extract warnings from past failures and near-misses.

```python
async def get_relevant_warnings(
    task_type: str,
    domain: str | None,
    limit: int = 3,
) -> list[dict]:
    """Get warnings relevant to the task.

    Extracts warnings from:
    - Past session failures in similar domains
    - Beliefs with "warning" or "avoid" category
    - Patterns that were misapplied

    Args:
        task_type: Type of task
        domain: Optional domain filter
        limit: Maximum warnings

    Returns:
        Warnings with severity and mitigation
    """
    warnings = []

    # 1. Past failures in domain
    failures = await memory.search(
        query=f"{task_type} {domain} failed error problem",
        memory_types=[MemoryType.EPISODIC, MemoryType.INSIGHT],
        limit=10,
    )

    for failure in failures:
        if failure.memory.metadata.get("outcome") in ["failed", "partial"]:
            warnings.append({
                "content": f"Past issue: {failure.memory.content}",
                "severity": "medium",
                "source": failure.memory.metadata.get("session_id"),
                "mitigation": failure.memory.metadata.get("lesson_learned"),
            })

    # 2. Warning-category beliefs
    warning_beliefs = await memory.search(
        query=f"{domain} warning avoid pitfall mistake",
        memory_types=[MemoryType.BELIEF],
        limit=5,
    )

    for belief in warning_beliefs:
        if belief.score > 0.7:  # Only high-relevance warnings
            warnings.append({
                "content": belief.memory.content,
                "severity": "high" if belief.memory.confidence > 0.8 else "medium",
                "source": "belief",
                "mitigation": None,
            })

    return warnings[:limit]
```

**Acceptance Criteria:**
- [ ] Extracts from past failures
- [ ] Includes high-conviction warning beliefs
- [ ] Provides mitigation when available
- [ ] Severity levels assigned

### REQ-021.6: Suggested Approach Generation

Generate a suggested approach based on assembled context.

```python
APPROACH_PROMPT = """<task>
Generate a suggested approach for this task based on context.
</task>

<task_info>
Type: {task_type}
Domain: {domain}
Description: {description}
</task_info>

<relevant_principles>
{principles}
</relevant_principles>

<past_successes>
{learnings}
</past_successes>

<warnings>
{warnings}
</warnings>

<instructions>
Based on the principles, past successes, and warnings:
1. Suggest a step-by-step approach
2. Highlight which principles apply at each step
3. Note any warnings to watch for
4. Keep it concise (3-5 steps)
</instructions>

<response_format>
<approach>
  <step number="1">Step description</step>
  <step number="2">Step description</step>
  ...
</approach>
</response_format>"""

async def generate_suggested_approach(
    task_type: str,
    domain: str,
    description: str,
    principles: list[dict],
    learnings: list[dict],
    warnings: list[dict],
) -> str:
    """Generate suggested approach from assembled context."""
```

**Acceptance Criteria:**
- [ ] Generates actionable steps
- [ ] References relevant principles
- [ ] Incorporates past learnings
- [ ] Warns about pitfalls
- [ ] Concise output (not overwhelming)

---

## Technical Design

### Comparison: Static vs Dynamic Priming

| Aspect | Static `/prime-*` Files | Dynamic `prime_context()` |
|--------|------------------------|---------------------------|
| Maintenance | Manual file updates | Self-updating from memory |
| Personalization | None | Based on past success |
| Domain coverage | One file per domain | Cross-domain relevance |
| Evolution | Stale over time | Improves with use |
| Warnings | Static checklist | From actual failures |
| Token efficiency | Fixed size | Respects max_tokens |

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── priming.py           # NEW: Dynamic priming tools
│   └── ...
├── priming/
│   ├── __init__.py
│   ├── classifier.py        # Task type classification
│   ├── retrieval.py         # Domain-specific retrieval
│   ├── warnings.py          # Warning extraction
│   └── approach.py          # Approach generation
└── config.py                # Task type profiles
```

### Integration with draagon-ai

```python
# Uses draagon-ai memory search with metadata filtering
from draagon_ai.memory.base import MemoryType, MemoryScope

# Domain relevance via semantic search
results = await memory.search(
    query=domain_query,
    memory_types=[MemoryType.KNOWLEDGE, MemoryType.BELIEF],
    limit=limit,
    min_score=0.5,
)

# Success weighting via metadata
for result in results:
    outcome = result.memory.metadata.get("outcome")
    # Weight by outcome...
```

---

## Testing

### Unit Tests

```python
class TestTaskClassification:
    """Test task type classification."""

    async def test_classify_feature_task(self):
        """Feature-like descriptions classified correctly."""

    async def test_classify_bugfix_task(self):
        """Bug fix descriptions classified correctly."""

    async def test_ambiguous_falls_back(self):
        """Ambiguous tasks fall back to general."""


class TestDynamicPriming:
    """Test dynamic context assembly."""

    async def test_respects_max_tokens(self):
        """Assembled context under max_tokens."""

    async def test_domain_filtering(self):
        """Results filtered by domain relevance."""

    async def test_success_weighting(self):
        """Successful sessions weighted higher."""
```

### Integration Tests

```python
class TestPrimingIntegration:
    """Integration tests for dynamic priming."""

    async def test_full_priming_flow(self):
        """Complete priming with all components."""

    async def test_approach_generation_quality(self):
        """Generated approach is actionable."""

    async def test_warnings_from_failures(self):
        """Past failures surface as warnings."""
```

---

## Usage Examples

### Basic Priming

```python
# Prime for a feature task
context = await mcp.call_tool("prime_context", {
    "task_type": "feature",
    "domain": "authentication",
    "description": "Add OAuth2 support",
})

# Agent receives:
# - Auth principles (token validation, etc.)
# - OAuth patterns from codebase
# - Learnings from past auth work
# - Warnings about token expiry issues
# - Suggested approach
```

### Auto-Classified Priming

```python
# Let the system classify the task
context = await mcp.call_tool("prime_context", {
    "description": "Fix the bug where users can't log in after password reset",
})

# System classifies as "bugfix" + "authentication"
# Retrieves debugging-focused context
# Includes past similar bugs
```

### Token-Constrained Priming

```python
# Limited context window, get essentials only
context = await mcp.call_tool("prime_context", {
    "task_type": "review",
    "domain": "security",
    "max_tokens": 500,
})

# Returns only highest-conviction security beliefs
# Most critical warnings
# No examples (saves tokens)
```

---

## Acceptance Checklist

- [ ] `prime_context` MCP tool implemented
- [ ] Task type classification working
- [ ] Domain-specific retrieval working
- [ ] Success-weighted learnings
- [ ] Warning extraction from failures
- [ ] Suggested approach generation
- [ ] Token limit respected
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Classification and approach use LLM |
| XML Output Format | ✅ | Prompts use XML |
| Protocol-Based Design | ✅ | Uses draagon-ai MemoryProvider |
| Async-First Processing | ✅ | All retrieval async |
| Test Outcomes | ✅ | Tests validate priming quality |

---

## References

- [Context Engineering: Priming vs Static Memory](transcript source)
- [draagon-ai: Memory Types](../draagon-ai/memory/base.py)
- [REQ-018: Quality-Aware Retrieval](./REQ-018-quality-aware-retrieval.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
