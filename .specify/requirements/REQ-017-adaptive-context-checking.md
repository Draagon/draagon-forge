# REQ-017: Adaptive Context Checking

**Priority:** P1
**Effort:** 3 days
**Dependencies:** REQ-014, REQ-001
**Blocks:** None
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific context decisions

---

## Overview

Expose draagon-ai's adaptive semantic expansion capabilities through MCP, allowing Claude Code to make intelligent decisions about when deep context retrieval is necessary versus when simple responses suffice.

### Problem Statement

**Current State:**
- Every query triggers full context retrieval
- Semantic expansion runs regardless of query complexity
- Simple queries ("What time is it?") incur same overhead as complex ones
- Processing time: 2-20+ seconds per query, regardless of need

**Impact:**
- Wasted compute on simple queries
- Poor user experience with unnecessary latency
- Token overhead from irrelevant context retrieval

### Target State

- Fast classifier determines if deep context needed
- Simple queries skip expensive processing
- Complex queries get full semantic enrichment
- 80%+ of simple queries process in <500ms

### draagon-ai Foundation

**Already Implemented:** draagon-ai has adaptive checking at `orchestration/loop.py:531-589`:

```python
ADAPTIVE_CHECK_PROMPT = """Analyze this query and conversation to determine
if deep semantic expansion is needed..."""

async def _check_if_expansion_needed(statement, context) -> tuple[bool, str]:
    # LLM decides: should we do expensive semantic expansion?
    # Returns: (needs_expansion: bool, reason: str)
```

This requirement exposes this capability through MCP.

---

## Requirements

### REQ-017.1: Context Needs Assessment Tool

Implement MCP tool that quickly assesses whether a query needs deep context.

```python
@mcp.tool()
async def assess_context_needs(
    query: str,
    conversation_summary: str | None = None,
    available_context: list[str] | None = None,
) -> dict:
    """Quickly assess whether a query needs deep context retrieval.

    Use this BEFORE calling search_context or other retrieval tools.
    Simple queries (greetings, clarifications, direct questions with
    obvious answers) can skip expensive retrieval operations.

    Args:
        query: The user's query or request
        conversation_summary: Brief summary of recent conversation (optional)
        available_context: Context already available in the session

    Returns:
        Assessment with:
        - needs_deep_context: Whether to proceed with retrieval
        - confidence: Confidence in the assessment (0.0-1.0)
        - reason: Explanation of the decision
        - recommended_action: What to do next
        - estimated_savings: Tokens saved if skipping retrieval
    """
```

**Response Format:**
```json
{
  "needs_deep_context": false,
  "confidence": 0.92,
  "reason": "Query is a simple clarification that can be answered from conversation context",
  "recommended_action": "respond_directly",
  "estimated_savings": 1500,
  "query_type": "clarification"
}
```

**Query Type Classifications:**
| Type | Needs Context | Example |
|------|---------------|---------|
| `greeting` | No | "Hello", "Thanks" |
| `clarification` | No | "What do you mean by X?" |
| `direct_question` | Maybe | "What's the function name?" |
| `architectural` | Yes | "How should I structure this?" |
| `implementation` | Yes | "Write code for X" |
| `review_request` | Yes | "Review this code" |
| `debugging` | Yes | "Why is this failing?" |

**Acceptance Criteria:**
- [ ] Returns assessment in <200ms
- [ ] Correctly identifies simple queries (>90% accuracy)
- [ ] Correctly identifies complex queries (>85% accuracy)
- [ ] Provides actionable recommended_action
- [ ] Uses fast/small LLM model (not full Opus)

### REQ-017.2: Tiered Processing Configuration

Allow configuration of processing tiers based on query complexity.

```python
@dataclass
class ProcessingTier:
    """Processing tier configuration."""

    name: str
    description: str
    max_latency_ms: int
    context_retrieval: bool
    semantic_expansion: bool
    cross_reference: bool
    llm_model: str  # "fast" | "standard" | "advanced"

# Default tiers
PROCESSING_TIERS = {
    "minimal": ProcessingTier(
        name="minimal",
        description="Simple queries, greetings, clarifications",
        max_latency_ms=200,
        context_retrieval=False,
        semantic_expansion=False,
        cross_reference=False,
        llm_model="fast",
    ),
    "standard": ProcessingTier(
        name="standard",
        description="Typical queries needing some context",
        max_latency_ms=2000,
        context_retrieval=True,
        semantic_expansion=False,
        cross_reference=False,
        llm_model="standard",
    ),
    "deep": ProcessingTier(
        name="deep",
        description="Complex queries needing full analysis",
        max_latency_ms=10000,
        context_retrieval=True,
        semantic_expansion=True,
        cross_reference=True,
        llm_model="advanced",
    ),
}
```

**Acceptance Criteria:**
- [ ] Three default tiers defined
- [ ] Tiers configurable via environment/config
- [ ] Assessment returns recommended tier
- [ ] Processing respects tier constraints

### REQ-017.3: Recommended Tools Suggestion

Assessment should suggest which tools are relevant for the query.

```python
@mcp.tool()
async def assess_context_needs(
    query: str,
    ...
) -> dict:
    """..."""
    return {
        "needs_deep_context": True,
        "recommended_tier": "standard",
        "recommended_tools": [
            {
                "name": "search_context",
                "reason": "Query asks about architectural patterns",
                "priority": 1,
            },
            {
                "name": "check_conflicts",
                "reason": "Proposed change may conflict with principles",
                "priority": 2,
            },
        ],
        "skip_tools": [
            {
                "name": "get_review_queue",
                "reason": "Not a review-related query",
            },
        ],
        ...
    }
```

**Acceptance Criteria:**
- [ ] Recommends relevant tools based on query analysis
- [ ] Provides reasoning for recommendations
- [ ] Prioritizes recommended tools
- [ ] Identifies tools to skip

### REQ-017.4: draagon-ai Integration

Wrap draagon-ai's existing adaptive checking.

```python
# Leverage existing draagon-ai implementation
from draagon_ai.orchestration.loop import AgentLoop

async def assess_context_needs_internal(
    query: str,
    conversation_summary: str | None,
) -> dict:
    """Use draagon-ai's adaptive checking."""

    # Build minimal context for check
    context = AgentContext(
        user_id=config.user_id,
        session_id="assessment",
        metadata={"conversation_summary": conversation_summary},
    )

    # Use draagon-ai's check (fast LLM call)
    needs_expansion, reason = await loop._check_if_expansion_needed(
        query, context
    )

    # Map to our response format
    return {
        "needs_deep_context": needs_expansion,
        "reason": reason,
        "recommended_tier": "deep" if needs_expansion else "minimal",
        ...
    }
```

**Acceptance Criteria:**
- [ ] Uses draagon-ai's existing implementation
- [ ] Maps draagon-ai response to MCP format
- [ ] Maintains <200ms response time
- [ ] Handles draagon-ai errors gracefully

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── adaptive.py          # NEW: Adaptive context checking
│   └── ...
├── config.py                # Updated with tier configuration
└── server.py                # Updated to register new tool
```

### Assessment Prompt

```python
# tools/adaptive.py

ASSESSMENT_PROMPT = """<task>
Analyze this query to determine if deep context retrieval is needed.
</task>

<query>{query}</query>

<conversation_context>
{conversation_summary}
</conversation_context>

<instructions>
Classify the query and determine processing needs:

1. Simple queries (NO deep context needed):
   - Greetings, thanks, acknowledgments
   - Clarification questions about recent conversation
   - Direct questions with obvious answers
   - Follow-up questions on just-discussed topics

2. Complex queries (YES deep context needed):
   - Architectural decisions or design questions
   - Implementation requests for new features
   - Code review or analysis requests
   - Debugging or troubleshooting
   - Questions about project patterns or principles
   - Requests that reference project-specific knowledge

Return your assessment in XML format.
</instructions>

<response_format>
<assessment>
  <needs_deep_context>true|false</needs_deep_context>
  <confidence>0.0-1.0</confidence>
  <query_type>greeting|clarification|direct_question|architectural|implementation|review_request|debugging|other</query_type>
  <reason>Brief explanation of classification</reason>
  <recommended_tier>minimal|standard|deep</recommended_tier>
  <recommended_tools>
    <tool name="tool_name" priority="1" reason="why this tool"/>
  </recommended_tools>
</assessment>
</response_format>"""
```

### Fast LLM Integration

```python
# Use fast model for assessment
from draagon_ai.llm import get_llm_provider

async def assess_with_fast_llm(prompt: str) -> str:
    """Use fast/cheap model for quick assessment."""
    provider = get_llm_provider()

    response = await provider.generate(
        prompt=prompt,
        model_tier="fast",  # Use Haiku/similar
        max_tokens=500,
        temperature=0.1,  # Low temperature for consistency
    )

    return response.content
```

---

## Testing

### Unit Tests

```python
# tests/mcp/unit/test_adaptive.py

class TestAdaptiveAssessment:
    """Test adaptive context checking."""

    async def test_greeting_no_context(self):
        """Greetings classified as not needing context."""
        result = await assess_context_needs("Hello!")
        assert result["needs_deep_context"] is False
        assert result["query_type"] == "greeting"

    async def test_architectural_needs_context(self):
        """Architectural questions need context."""
        result = await assess_context_needs(
            "How should I structure the repository layer?"
        )
        assert result["needs_deep_context"] is True
        assert result["query_type"] == "architectural"

    async def test_clarification_no_context(self):
        """Clarifications don't need new context."""
        result = await assess_context_needs(
            "What do you mean by that?",
            conversation_summary="Discussing error handling patterns",
        )
        assert result["needs_deep_context"] is False

    async def test_implementation_needs_context(self):
        """Implementation requests need context."""
        result = await assess_context_needs(
            "Write a function to validate user input"
        )
        assert result["needs_deep_context"] is True
        assert "search_context" in [t["name"] for t in result["recommended_tools"]]


class TestProcessingTiers:
    """Test tier configuration."""

    def test_minimal_tier_fast(self):
        """Minimal tier has fast latency."""
        assert PROCESSING_TIERS["minimal"].max_latency_ms <= 200

    def test_deep_tier_full_processing(self):
        """Deep tier enables all processing."""
        tier = PROCESSING_TIERS["deep"]
        assert tier.context_retrieval is True
        assert tier.semantic_expansion is True
        assert tier.cross_reference is True
```

### Performance Tests

```python
# tests/mcp/performance/test_adaptive_latency.py

class TestAdaptiveLatency:
    """Verify assessment latency targets."""

    async def test_assessment_under_200ms(self):
        """Assessment completes in <200ms."""
        import time

        start = time.monotonic()
        await assess_context_needs("Hello!")
        elapsed = (time.monotonic() - start) * 1000

        assert elapsed < 200, f"Assessment took {elapsed}ms, target <200ms"

    async def test_batch_assessment_performance(self):
        """Batch of 10 assessments under 2s total."""
        queries = [
            "Hello!",
            "Thanks for the help",
            "What do you mean?",
            "How should I structure this?",
            "Write a function for X",
            "Review this code",
            "Why is this failing?",
            "Got it",
            "Can you explain more?",
            "Implement user authentication",
        ]

        import time
        start = time.monotonic()

        for query in queries:
            await assess_context_needs(query)

        elapsed = (time.monotonic() - start) * 1000
        assert elapsed < 2000, f"Batch took {elapsed}ms, target <2000ms"
```

---

## Acceptance Checklist

- [ ] `assess_context_needs` MCP tool implemented
- [ ] Processing tiers defined and configurable
- [ ] Recommended tools included in response
- [ ] draagon-ai integration working
- [ ] Fast LLM model used for assessment
- [ ] Assessment latency <200ms
- [ ] Query classification accuracy >85%
- [ ] Unit tests passing
- [ ] Performance tests passing

---

## Usage Example

```python
# Claude Code workflow with adaptive checking

# Step 1: Assess context needs
assessment = await mcp.call_tool("assess_context_needs", {
    "query": user_query,
    "conversation_summary": recent_context,
})

# Step 2: Branch based on assessment
if assessment["needs_deep_context"]:
    # Use recommended tools
    for tool in assessment["recommended_tools"]:
        context = await mcp.call_tool(tool["name"], {...})

    # Process with full context
    response = await process_with_context(user_query, context)
else:
    # Skip retrieval, respond directly
    response = await respond_directly(user_query)
```

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Uses LLM for classification, not regex |
| XML Output Format | ✅ | Assessment prompt uses XML |
| Protocol-Based Design | ✅ | MCP protocol standard |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Tests validate classification accuracy |

---

## References

- [Cursor: Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)
- [draagon-ai: Adaptive Semantic Expansion](../draagon-ai/orchestration/loop.py#L531-L589)
- [LLM Model Tiering](../draagon-ai/docs/model-tiers.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
