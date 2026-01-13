# REQ-026: Metacognitive Reflection

**Priority:** P1
**Effort:** 5 days
**Dependencies:** REQ-001, REQ-022
**Blocks:** None

---

## Overview

Enable automatic post-task reflection that extracts learnings, updates expertise models, and improves future performance. After every significant task, Draagon Forge analyzes what worked, what didn't, and stores insights for future use.

### draagon-ai Foundation

This requirement builds on existing draagon-ai abstractions:

| draagon-ai Component | Location | Usage |
|---------------------|----------|-------|
| `Learning` | `orchestration/learning_channel.py` | **USE DIRECTLY** - Learning data model |
| `LearningType` | `orchestration/learning_channel.py` | FACT, SKILL, INSIGHT, CORRECTION, BEHAVIOR |
| `LearningScope` | `orchestration/learning_channel.py` | PRIVATE, CONTEXT, GLOBAL |
| `LearningChannel` | `orchestration/learning_channel.py` | **USE DIRECTLY** - Pub/sub for learnings |
| `TransactiveMemory` | `orchestration/transactive_memory.py` | **USE DIRECTLY** - Expertise updates |
| `MemoryType.INSIGHT` | `memory/base.py` | Store extracted insights |

### What This REQ Adds

| Extension | Purpose |
|-----------|---------|
| `ReflectionTrigger` | Determine when to reflect |
| `MetacognitiveReflectionService` | Orchestrate reflection workflow |
| `PatternRecognizer` | Find patterns across reflections |
| MCP tool wrappers | Expose reflection to Claude Code |

### The Vision

> "After completing the authentication feature, Draagon automatically noted that the integration tests caught two bugs that unit tests missed, and now prioritizes integration tests for security features."

### Key Differentiator

| Aspect | Traditional AI | Metacognitive Reflection |
|--------|---------------|-------------------------|
| After task | Forget | Reflect and learn |
| Patterns | Not tracked | Automatically extracted |
| Expertise | Static | Dynamic based on outcomes |
| Failures | Lost | Analyzed and remembered |

---

## Requirements

### REQ-026.1: Reflection Trigger

Trigger reflection after significant task completions.

```python
class ReflectionTrigger:
    """Determine when to trigger metacognitive reflection."""

    async def should_reflect(
        self,
        task_type: str,
        duration_seconds: float,
        outcome: str,
        error_count: int,
    ) -> tuple[bool, str]:
        """Determine if task warrants reflection.

        Triggers:
        - Task duration > 5 minutes
        - Task had failures/retries
        - Task type is high-value (review, architecture, etc.)
        - Explicit user request

        Returns:
            (should_reflect, reason)
        """

    async def get_reflection_depth(
        self,
        task_type: str,
        outcome: str,
    ) -> str:
        """Determine reflection depth.

        Returns:
            "quick" | "standard" | "deep"
        """


REFLECTION_TRIGGERS = {
    "min_duration_seconds": 300,  # 5 minutes
    "always_reflect_types": ["review", "architecture", "security"],
    "reflect_on_failure": True,
    "reflect_on_retry": True,
}
```

**Acceptance Criteria:**
- [ ] Duration-based triggering
- [ ] Task type triggering
- [ ] Failure/retry triggering
- [ ] Depth determination

### REQ-026.2: Metacognitive Reflection Service

Core reflection service that analyzes completed tasks.

```python
@dataclass
class ReflectionResult:
    """Result of metacognitive reflection."""
    reflection_id: str
    task_id: str
    timestamp: str

    # Analysis
    what_worked: list[str]
    what_didnt_work: list[str]
    key_insights: list[str]
    patterns_identified: list[str]

    # Learnings
    learnings_extracted: list[dict]
    beliefs_to_update: list[dict]

    # Expertise
    expertise_updates: list[dict]

    # Recommendations
    future_recommendations: list[str]


class MetacognitiveReflectionService:
    """Service for post-task metacognitive reflection."""

    async def reflect_on_task(
        self,
        task_id: str,
        depth: str = "standard",
    ) -> ReflectionResult:
        """Perform metacognitive reflection on a completed task.

        Phases:
        1. Gather task context (inputs, outputs, timeline)
        2. Analyze what happened (successes, failures, pivots)
        3. Extract learnings (what to remember)
        4. Update expertise (who was good at what)
        5. Generate recommendations (what to do differently)
        """

    async def gather_task_context(
        self,
        task_id: str,
    ) -> dict:
        """Gather all context about a task.

        Returns:
            - task_description
            - inputs
            - outputs
            - timeline (key events)
            - agents_involved
            - tools_used
            - errors_encountered
        """

    async def analyze_execution(
        self,
        context: dict,
    ) -> dict:
        """Analyze how the task was executed.

        Returns:
            - successes: What went well
            - failures: What went wrong
            - pivots: Where approach changed
            - bottlenecks: What slowed things down
        """

    async def extract_learnings(
        self,
        context: dict,
        analysis: dict,
    ) -> list[dict]:
        """Extract learnings from task analysis.

        Returns:
            List of learnings with:
            - content
            - confidence
            - domain
            - scope (private/context/global)
        """

    async def update_expertise_models(
        self,
        context: dict,
        analysis: dict,
    ) -> list[dict]:
        """Update agent expertise based on performance.

        Returns:
            List of expertise updates with:
            - agent_id
            - domain
            - performance_delta
        """


REFLECTION_PROMPT = """<task>
Perform metacognitive reflection on this completed task.
</task>

<task_context>
Description: {description}
Duration: {duration}
Outcome: {outcome}

<timeline>
{timeline}
</timeline>

<errors>
{errors}
</errors>
</task_context>

<instructions>
Analyze this task execution to extract learnings:

1. What worked well? What approaches/tools/patterns were effective?
2. What didn't work? What caused issues or delays?
3. What key insights emerged? What wasn't obvious before starting?
4. What patterns do you see? Have you seen similar things before?
5. What would you do differently next time?
</instructions>

<output_format>
<reflection>
  <what_worked>
    <item>Description of something that worked</item>
  </what_worked>
  <what_didnt_work>
    <item>Description of something that didn't work</item>
  </what_didnt_work>
  <key_insights>
    <insight confidence="0.0-1.0">Insight description</insight>
  </key_insights>
  <patterns>
    <pattern>Pattern description</pattern>
  </patterns>
  <recommendations>
    <recommendation>What to do differently</recommendation>
  </recommendations>
</reflection>
</output_format>"""
```

**Acceptance Criteria:**
- [ ] Context gathering
- [ ] Execution analysis
- [ ] Learning extraction
- [ ] Expertise updates
- [ ] Recommendation generation

### REQ-026.3: Learning Persistence

Store and retrieve learnings from reflections.

```python
class ReflectionStore:
    """Store and retrieve reflection learnings."""

    async def save_reflection(
        self,
        result: ReflectionResult,
    ) -> str:
        """Save reflection result.

        Stores in:
        - Neo4j: Reflection node with relationships
        - Qdrant: Embeddings for semantic search
        - Memory: Learnings as episodic memories
        """

    async def get_reflection(
        self,
        reflection_id: str,
    ) -> ReflectionResult | None:
        """Retrieve a reflection by ID."""

    async def search_reflections(
        self,
        query: str,
        task_type: str | None = None,
        limit: int = 10,
    ) -> list[ReflectionResult]:
        """Search past reflections semantically."""

    async def get_learnings_for_task_type(
        self,
        task_type: str,
        limit: int = 5,
    ) -> list[dict]:
        """Get relevant learnings for a task type.

        Used to inform new tasks with past learnings.
        """

    async def propagate_high_confidence_learnings(
        self,
        threshold: float = 0.85,
    ) -> int:
        """Propagate high-confidence learnings to beliefs.

        Returns:
            Number of learnings propagated
        """
```

**Acceptance Criteria:**
- [ ] Reflection storage (Neo4j + Qdrant)
- [ ] Semantic search
- [ ] Task type retrieval
- [ ] Belief propagation

### REQ-026.4: Pattern Recognition

Identify recurring patterns across reflections.

```python
class PatternRecognizer:
    """Recognize patterns across multiple reflections."""

    async def find_recurring_patterns(
        self,
        domain: str | None = None,
        min_occurrences: int = 3,
    ) -> list[dict]:
        """Find patterns that occur across multiple reflections.

        Returns:
            Patterns with:
            - pattern_description
            - occurrences
            - confidence
            - related_reflections
        """

    async def detect_failure_patterns(
        self,
        task_type: str | None = None,
    ) -> list[dict]:
        """Detect recurring failure patterns.

        Returns:
            Failure patterns with:
            - pattern
            - frequency
            - common_causes
            - suggested_mitigations
        """

    async def analyze_success_factors(
        self,
        task_type: str,
    ) -> list[dict]:
        """Analyze what factors correlate with success.

        Returns:
            Success factors with:
            - factor
            - correlation_strength
            - examples
        """

    async def generate_pattern_report(
        self,
        time_range_days: int = 30,
    ) -> dict:
        """Generate comprehensive pattern analysis report."""


PATTERN_ANALYSIS_PROMPT = """<task>
Analyze these reflections to identify recurring patterns.
</task>

<reflections>
{reflections}
</reflections>

<instructions>
Look for:
1. Recurring success patterns - What consistently works?
2. Recurring failure patterns - What consistently causes issues?
3. Domain-specific patterns - Patterns unique to certain domains
4. Cross-cutting patterns - Patterns that apply broadly
</instructions>

<output_format>
<pattern_analysis>
  <success_patterns>
    <pattern occurrences="{n}" confidence="{0-1}">Description</pattern>
  </success_patterns>
  <failure_patterns>
    <pattern occurrences="{n}" severity="high|medium|low">
      <description>Pattern description</description>
      <common_causes>Why this happens</common_causes>
      <mitigation>How to prevent</mitigation>
    </pattern>
  </failure_patterns>
</pattern_analysis>
</output_format>"""
```

**Acceptance Criteria:**
- [ ] Recurring pattern detection
- [ ] Failure pattern analysis
- [ ] Success factor identification
- [ ] Pattern reports

### REQ-026.5: Reflection MCP Tools

Expose reflection capabilities via MCP.

```python
@mcp.tool()
async def trigger_reflection(
    task_id: str | None = None,
    depth: str = "standard",
) -> dict:
    """Manually trigger metacognitive reflection.

    Args:
        task_id: Specific task, or most recent if None
        depth: "quick" | "standard" | "deep"

    Returns:
        Reflection result with learnings and recommendations
    """

@mcp.tool()
async def get_learnings(
    task_type: str | None = None,
    domain: str | None = None,
    limit: int = 10,
) -> dict:
    """Get learnings from past reflections.

    Args:
        task_type: Filter by task type
        domain: Filter by domain
        limit: Maximum learnings to return

    Returns:
        Relevant learnings with context
    """

@mcp.tool()
async def get_failure_patterns(
    task_type: str | None = None,
    domain: str | None = None,
) -> dict:
    """Get known failure patterns.

    Returns:
        Failure patterns with mitigations
    """

@mcp.tool()
async def get_success_factors(
    task_type: str,
) -> dict:
    """Get success factors for a task type.

    Returns:
        Factors that correlate with success
    """

@mcp.tool()
async def get_reflection_summary(
    time_range_days: int = 30,
) -> dict:
    """Get summary of recent reflections.

    Returns:
        Summary with:
        - total_reflections
        - key_learnings
        - top_patterns
        - expertise_changes
    """
```

**Acceptance Criteria:**
- [ ] Manual reflection trigger
- [ ] Learning retrieval
- [ ] Failure pattern access
- [ ] Success factor access
- [ ] Summary generation

---

## Technical Design

### File Structure

```
src/draagon_forge/
├── reflection/
│   ├── __init__.py
│   ├── service.py          # MetacognitiveReflectionService
│   ├── triggers.py         # ReflectionTrigger
│   ├── store.py            # ReflectionStore
│   └── patterns.py         # PatternRecognizer
├── mcp/
│   └── tools/
│       └── reflection.py   # Reflection MCP tools
└── ...
```

### Reflection Flow

```
Task Completes
       ↓
ReflectionTrigger.should_reflect()
       ↓
   ┌───┴───┐
   No      Yes
   ↓        ↓
 Done   MetacognitiveReflectionService.reflect_on_task()
                    ↓
            gather_task_context()
                    ↓
            analyze_execution()
                    ↓
            extract_learnings()
                    ↓
            update_expertise_models()
                    ↓
            ReflectionStore.save_reflection()
                    ↓
            PatternRecognizer (async)
                    ↓
            propagate_high_confidence_learnings()
```

### Integration with Other Components

| Component | Integration |
|-----------|-------------|
| REQ-021 Dynamic Priming | Learnings inform priming |
| REQ-022 Cross-Agent Memory | Learnings shared across agents |
| REQ-024 Behavior Evolution | Reflection data feeds evolution |
| REQ-025 Cognitive Swarm | Reflection updates expertise |

---

## Example: Post-Task Reflection

### Task Completion

```python
# After completing "Add OAuth2 authentication" task
# Duration: 45 minutes
# Outcome: Successful with 2 retries
```

### Automatic Reflection

```python
# Reflection triggered due to:
# - Duration > 5 minutes
# - Task type = "security" (always reflect)
# - Had retries

result = await mcp.call_tool("trigger_reflection", {
    "task_id": "task-oauth2-impl",
    "depth": "standard",
})

# Result:
{
    "reflection_id": "ref-xyz",
    "what_worked": [
        "Starting with integration tests caught auth flow issues early",
        "Using existing TokenService pattern reduced complexity",
    ],
    "what_didnt_work": [
        "Initial approach didn't handle token refresh - required retry",
        "Missing edge case for expired refresh tokens",
    ],
    "key_insights": [
        {
            "content": "OAuth2 flows need explicit handling of all token states",
            "confidence": 0.88,
        },
    ],
    "patterns_identified": [
        "Authentication features benefit from integration-first testing",
    ],
    "learnings_extracted": [
        {
            "content": "For OAuth2: test full flow before unit tests",
            "domain": "authentication",
            "scope": "global",
            "confidence": 0.85,
        },
    ],
    "expertise_updates": [
        {
            "agent_id": "code_review_agent",
            "domain": "authentication",
            "performance_delta": +0.1,
        },
    ],
    "future_recommendations": [
        "Create integration test template for auth flows",
        "Add explicit token state machine to auth patterns",
    ],
}
```

### Using Learnings

```python
# Next time someone works on authentication:
learnings = await mcp.call_tool("get_learnings", {
    "task_type": "feature",
    "domain": "authentication",
})

# Returns:
{
    "learnings": [
        {
            "content": "For OAuth2: test full flow before unit tests",
            "source_task": "Add OAuth2 authentication",
            "confidence": 0.85,
        },
        {
            "content": "Token refresh edge cases need explicit handling",
            "source_task": "Add OAuth2 authentication",
            "confidence": 0.88,
        },
    ],
}
```

---

## Testing

### Unit Tests

```python
class TestReflectionTrigger:
    """Test reflection triggering."""

    async def test_duration_trigger(self):
        """Long tasks trigger reflection."""

    async def test_task_type_trigger(self):
        """High-value task types always trigger."""

    async def test_failure_trigger(self):
        """Failed tasks trigger reflection."""


class TestReflectionService:
    """Test reflection service."""

    async def test_context_gathering(self):
        """All relevant context gathered."""

    async def test_learning_extraction(self):
        """Learnings extracted with confidence."""

    async def test_expertise_updates(self):
        """Expertise models updated correctly."""


class TestPatternRecognizer:
    """Test pattern recognition."""

    async def test_recurring_pattern_detection(self):
        """Finds patterns across reflections."""

    async def test_failure_pattern_analysis(self):
        """Identifies failure patterns with causes."""
```

### Integration Tests

```python
class TestReflectionIntegration:
    """Integration tests for reflection."""

    async def test_end_to_end_reflection(self):
        """Full reflection cycle."""

    async def test_learning_propagation(self):
        """High-confidence learnings become beliefs."""

    async def test_learning_retrieval_for_priming(self):
        """Learnings retrieved for task priming."""
```

---

## Acceptance Checklist

- [ ] ReflectionTrigger implemented
- [ ] MetacognitiveReflectionService working
- [ ] Learning extraction with confidence
- [ ] Expertise model updates
- [ ] ReflectionStore persistence
- [ ] PatternRecognizer detecting patterns
- [ ] All 5 MCP tools implemented
- [ ] Belief propagation for high-confidence learnings
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Reflection analysis via LLM |
| XML Output Format | ✅ | Prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol |
| Async-First Processing | ✅ | Background reflection |
| Test Outcomes | ✅ | Tests validate learning |

---

## References

- [draagon-ai: COGNITIVE_SWARM_ARCHITECTURE.md](../../draagon-ai/docs/specs/COGNITIVE_SWARM_ARCHITECTURE.md)
- [REQ-022: Cross-Agent Semantic Memory](./REQ-022-cross-agent-semantic-memory.md)
- [REQ-021: Dynamic Context Priming](./REQ-021-dynamic-context-priming.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
