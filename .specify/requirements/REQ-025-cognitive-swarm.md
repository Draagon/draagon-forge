# REQ-025: Cognitive Swarm Orchestration

**Priority:** P1
**Effort:** 10 days
**Dependencies:** REQ-022, REQ-023
**Blocks:** None
**Layer:** 🔷 L2 (draagon-ai-forge) - Generic swarm coordination, reusable across domains

---

## Overview

Enable multiple agents to work together with shared cognitive working memory, parallel execution, and belief reconciliation. Unlike simple multi-agent systems that pass messages, cognitive swarms share attention, coordinate beliefs, and learn collectively.

### draagon-ai Foundation

This requirement builds on existing draagon-ai abstractions:

| draagon-ai Component | Location | Usage |
|---------------------|----------|-------|
| `SharedWorkingMemory` | `orchestration/shared_memory.py` | **USE DIRECTLY** - Multi-agent coordination |
| `SharedObservation` | `orchestration/shared_memory.py` | **USE DIRECTLY** - Shared observations |
| `TransactiveMemory` | `orchestration/transactive_memory.py` | **USE DIRECTLY** - Expertise routing |
| `LearningChannel` | `orchestration/learning_channel.py` | **USE DIRECTLY** - Cross-agent learning |
| `cognition/beliefs.py` | `cognition/beliefs.py` | Belief reconciliation prompts |

### What This REQ Adds

| Extension | Purpose |
|-----------|---------|
| `ParallelCognitiveOrchestrator` | Coordinate parallel agent execution |
| Credibility-weighted reconciliation | Extend belief reconciliation with expertise |
| MCP tool wrappers | Expose swarm capabilities to Claude Code |

### The Vision

> "Three agents analyzed the PR simultaneously - the security reviewer, the performance analyst, and the architecture checker - and they coordinated their findings without duplicating work."

### Key Differentiator

| Aspect | Simple Multi-Agent | Cognitive Swarm |
|--------|-------------------|-----------------|
| Memory | Private per agent | Shared working memory |
| Coordination | Sequential handoffs | Parallel with attention |
| Conflicts | Last write wins | Credibility-weighted |
| Learning | Individual | Collective |

---

## Requirements

### REQ-025.1: Shared Working Memory (Use draagon-ai)

Use draagon-ai's existing `SharedWorkingMemory` and `SharedObservation`.

```python
# Import directly from draagon-ai - DO NOT REINVENT
from draagon_ai.orchestration.shared_memory import (
    SharedWorkingMemory,
    SharedObservation,
)

# draagon-ai already defines SharedObservation:
@dataclass(frozen=True)
class SharedObservation:
    """From draagon-ai - use directly."""
    observation_id: str
    content: str
    source_agent_id: str
    timestamp: datetime
    attention_weight: float         # 0-1, decays over time
    confidence: float               # 0-1
    is_belief_candidate: bool
    belief_type: str                # FACT, SKILL, PREFERENCE, etc.
    conflicts_with: list[str]       # Observation IDs that conflict
    accessed_by: set[str]           # Agent IDs that read this
    access_count: int

# draagon-ai already defines SharedWorkingMemory:
class SharedWorkingMemory:
    """From draagon-ai - use directly."""

    async def add_observation(
        content: str,
        source_agent_id: str,
        attention_weight: float,
        is_belief_candidate: bool = False,
        belief_type: str | None = None,
    ) -> SharedObservation

    async def get_context_for_agent(
        agent_id: str,
        role: AgentRole,
        max_items: int = 7,  # Miller's Law
    ) -> list[SharedObservation]

    async def apply_attention_decay() -> None
    async def get_conflicts() -> list[tuple[SharedObservation, SharedObservation]]
```

**What we add:** Task-scoped initialization wrapper:
```python
class TaskScopedWorkingMemory(SharedWorkingMemory):
    """Extend draagon-ai's SharedWorkingMemory with task scoping."""

    def __init__(self, task_id: str, max_active_items: int = 9):
        super().__init__()
        self.task_id = task_id
        self.max_active_items = max_active_items  # Miller's Law: 7±2

        Returns:
            observation_id
        """

    async def get_active_observations(
        self,
        agent_id: str | None = None,
        observation_type: ObservationType | None = None,
        min_attention: float = 0.0,
    ) -> list[SharedObservation]:
        """Get observations currently in active memory.

        Sorted by attention weight descending.
        """

    async def update_attention(
        self,
        observation_id: str,
        delta: float,
        reason: str,
    ) -> float:
        """Update attention weight for observation.

        Returns:
            New attention weight
        """

    async def mark_conflict(
        self,
        observation_a_id: str,
        observation_b_id: str,
        conflict_type: str,
    ) -> None:
        """Mark two observations as conflicting."""

    async def get_conflicts(self) -> list[tuple[str, str, str]]:
        """Get all current conflicts.

        Returns:
            List of (obs_a_id, obs_b_id, conflict_type)
        """

    async def evict_low_attention(self) -> list[str]:
        """Evict observations below attention threshold.

        Called automatically when over capacity.

        Returns:
            List of evicted observation IDs
        """
```

**Acceptance Criteria:**
- [ ] Observations added with attention weights
- [ ] Miller's Law capacity enforced (7±2)
- [ ] Automatic conflict detection
- [ ] Attention decay over time
- [ ] Low-attention eviction

### REQ-025.2: Parallel Cognitive Orchestrator

Coordinate multiple agents working in parallel.

```python
@dataclass
class AgentTask:
    """A task assigned to an agent."""
    task_id: str
    agent_id: str
    description: str
    input_data: dict
    priority: int = 0
    dependencies: list[str] = field(default_factory=list)


@dataclass
class AgentResult:
    """Result from an agent's work."""
    task_id: str
    agent_id: str
    observations: list[SharedObservation]
    output: dict
    success: bool
    execution_time: float


class ParallelCognitiveOrchestrator:
    """Orchestrate multiple agents with shared cognition."""

    def __init__(
        self,
        working_memory: SharedWorkingMemory,
    ):
        """Initialize orchestrator with shared memory."""

    async def plan_parallel_execution(
        self,
        task: str,
        available_agents: list[str],
    ) -> list[AgentTask]:
        """Plan which agents should work on what.

        Uses LLM to:
        - Decompose task into subtasks
        - Match subtasks to agent capabilities
        - Identify dependencies and parallelism

        Returns:
            List of agent tasks, some parallelizable
        """

    async def execute_parallel(
        self,
        agent_tasks: list[AgentTask],
        timeout: float = 60.0,
    ) -> list[AgentResult]:
        """Execute agent tasks with parallelism.

        Agents can:
        - Read from shared working memory
        - Write observations to shared memory
        - See each other's observations in real-time

        Returns:
            Results from all agents
        """

    async def coordinate_attention(
        self,
        agents: list[str],
    ) -> None:
        """Coordinate attention across agents.

        Ensures agents focus on different aspects
        rather than duplicating effort.
        """

    async def synthesize_results(
        self,
        results: list[AgentResult],
    ) -> dict:
        """Synthesize results from multiple agents.

        Uses shared working memory to:
        - Merge non-conflicting observations
        - Flag conflicts for resolution
        - Generate unified summary
        """


PLANNING_PROMPT = """<task>
Plan parallel agent execution for this task.
</task>

<overall_task>
{task}
</overall_task>

<available_agents>
{agents}
</available_agents>

<instructions>
1. Decompose the task into independent subtasks
2. Assign subtasks to appropriate agents based on expertise
3. Identify which subtasks can run in parallel
4. Note any dependencies between subtasks
</instructions>

<output_format>
<execution_plan>
  <subtask id="1" agent="{agent_id}" parallel_group="1">
    <description>What this agent should do</description>
    <focus>What to pay attention to</focus>
    <dependencies>None or subtask IDs</dependencies>
  </subtask>
  ...
</execution_plan>
</output_format>"""
```

**Acceptance Criteria:**
- [ ] Task decomposition
- [ ] Agent assignment by capability
- [ ] Parallel execution
- [ ] Real-time memory sharing
- [ ] Result synthesis

### REQ-025.3: Multi-Agent Belief Reconciliation

Resolve conflicting observations using credibility weighting.

```python
@dataclass
class BeliefConflict:
    """A conflict between agent beliefs."""
    conflict_id: str
    observation_a: SharedObservation
    observation_b: SharedObservation
    conflict_type: str  # "contradiction" | "inconsistency" | "different_interpretation"
    resolution: str | None = None
    resolved_by: str | None = None


class MultiAgentBeliefReconciliation:
    """Reconcile conflicting beliefs from multiple agents."""

    async def detect_conflicts(
        self,
        observations: list[SharedObservation],
    ) -> list[BeliefConflict]:
        """Detect conflicts between observations.

        Uses semantic similarity + LLM to detect:
        - Direct contradictions
        - Logical inconsistencies
        - Different interpretations of same evidence
        """

    async def calculate_credibility(
        self,
        agent_id: str,
        domain: str,
    ) -> float:
        """Calculate agent credibility for domain.

        Based on:
        - Historical accuracy in domain
        - Expertise tracking (TransactiveMemory)
        - Recent performance
        """

    async def resolve_conflict(
        self,
        conflict: BeliefConflict,
    ) -> SharedObservation:
        """Resolve a belief conflict.

        Resolution strategies:
        1. Credibility-weighted: Higher credibility wins
        2. Evidence-based: More supporting evidence wins
        3. Synthesis: Combine both perspectives
        4. Escalate: Flag for human review
        """

    async def reconcile_all(
        self,
        working_memory: SharedWorkingMemory,
    ) -> dict:
        """Reconcile all conflicts in working memory.

        Returns:
            Reconciliation report with:
            - conflicts_found
            - conflicts_resolved
            - conflicts_escalated
            - final_observations
        """


CONFLICT_RESOLUTION_PROMPT = """<task>
Resolve this conflict between two agent observations.
</task>

<observation_a>
Agent: {agent_a}
Credibility: {credibility_a}
Content: {content_a}
Evidence: {evidence_a}
</observation_a>

<observation_b>
Agent: {agent_b}
Credibility: {credibility_b}
Content: {content_b}
Evidence: {evidence_b}
</observation_b>

<conflict_type>
{conflict_type}
</conflict_type>

<instructions>
Analyze both observations and determine:
1. Can they be synthesized into a unified view?
2. If not, which is more likely correct based on evidence?
3. Should this be escalated for human review?
</instructions>

<output_format>
<resolution>
  <strategy>synthesis | credibility | evidence | escalate</strategy>
  <result>The resolved observation</result>
  <reasoning>Why this resolution was chosen</reasoning>
  <confidence>0.0-1.0</confidence>
</resolution>
</output_format>"""
```

**Acceptance Criteria:**
- [ ] Conflict detection (semantic + LLM)
- [ ] Credibility calculation
- [ ] Multiple resolution strategies
- [ ] Escalation path
- [ ] Reconciliation report

### REQ-025.4: Transactive Memory Enhancement

Enhance REQ-022's transactive memory with swarm capabilities.

```python
class SwarmTransactiveMemory:
    """Track who knows what across agent swarm."""

    async def record_expertise(
        self,
        agent_id: str,
        domain: str,
        task_type: str,
        success: bool,
        quality_score: float,
    ) -> None:
        """Record agent performance for expertise tracking."""

    async def get_expert_for_task(
        self,
        task_description: str,
        exclude_agents: list[str] | None = None,
    ) -> tuple[str, float]:
        """Find best agent for a task.

        Returns:
            (agent_id, confidence)
        """

    async def get_agent_profile(
        self,
        agent_id: str,
    ) -> dict:
        """Get expertise profile for an agent.

        Returns:
            Profile with:
            - domains: List of domains with scores
            - strengths: What agent is good at
            - weaknesses: Where agent struggles
            - recent_performance: Recent success rate
        """

    async def recommend_team(
        self,
        task: str,
        team_size: int = 3,
    ) -> list[dict]:
        """Recommend agent team for complex task.

        Optimizes for:
        - Coverage of required domains
        - Complementary strengths
        - Historical collaboration success
        """
```

**Acceptance Criteria:**
- [ ] Expertise recording
- [ ] Expert matching
- [ ] Agent profiles
- [ ] Team recommendations

### REQ-025.5: Collective Learning Channel

Implement pub/sub for cross-agent learning.

```python
class LearningScope(Enum):
    """Scope for shared learnings."""
    PRIVATE = "private"   # Only this agent
    CONTEXT = "context"   # This task/session
    GLOBAL = "global"     # All agents, all contexts

@dataclass
class Learning:
    """A learning to be shared."""
    learning_id: str
    content: str
    source_agent_id: str
    scope: LearningScope
    domain: str
    confidence: float
    supporting_observations: list[str]


class LearningChannel:
    """Pub/sub channel for cross-agent learning."""

    async def publish(
        self,
        learning: Learning,
    ) -> str:
        """Publish a learning to the channel.

        Notifies subscribed agents based on scope.
        """

    async def subscribe(
        self,
        agent_id: str,
        domains: list[str] | None = None,
        min_confidence: float = 0.5,
    ) -> str:
        """Subscribe agent to learning channel.

        Returns:
            subscription_id
        """

    async def get_learnings(
        self,
        agent_id: str,
        since: str | None = None,
    ) -> list[Learning]:
        """Get learnings for an agent.

        Returns learnings matching agent's subscriptions.
        """

    async def propagate_to_beliefs(
        self,
        learning: Learning,
    ) -> dict:
        """Propagate high-confidence learning to belief system.

        Global learnings with high confidence become beliefs.
        """
```

**Acceptance Criteria:**
- [ ] Learning publication
- [ ] Subscription management
- [ ] Scope-based filtering
- [ ] Belief propagation

### REQ-025.6: Swarm MCP Tools

Expose cognitive swarm via MCP.

```python
@mcp.tool()
async def create_swarm_task(
    task: str,
    agent_types: list[str] | None = None,
    parallel: bool = True,
) -> dict:
    """Create a cognitive swarm task.

    Args:
        task: Task description
        agent_types: Specific agent types, or auto-select
        parallel: Whether to run agents in parallel

    Returns:
        Task plan with assigned agents
    """

@mcp.tool()
async def execute_swarm_task(
    task_id: str,
    timeout: float = 120.0,
) -> dict:
    """Execute a planned swarm task.

    Returns:
        Synthesized results from all agents
    """

@mcp.tool()
async def get_swarm_working_memory(
    task_id: str,
) -> dict:
    """Get current state of swarm working memory.

    Returns:
        Active observations with attention weights
    """

@mcp.tool()
async def get_swarm_conflicts(
    task_id: str,
) -> dict:
    """Get unresolved conflicts in swarm task.

    Returns:
        List of conflicts needing resolution
    """

@mcp.tool()
async def resolve_swarm_conflict(
    conflict_id: str,
    resolution: str | None = None,
) -> dict:
    """Resolve a conflict, optionally with human input.

    Args:
        conflict_id: ID of conflict to resolve
        resolution: Human-provided resolution, or auto-resolve

    Returns:
        Resolution result
    """

@mcp.tool()
async def get_agent_expertise(
    agent_id: str | None = None,
) -> dict:
    """Get expertise profiles for agents.

    Returns:
        Expertise profiles with domain scores
    """
```

**Acceptance Criteria:**
- [ ] Swarm task creation
- [ ] Parallel execution
- [ ] Working memory access
- [ ] Conflict visibility
- [ ] Human-in-loop resolution
- [ ] Expertise querying

---

## Technical Design

### File Structure

```
src/draagon_forge/
├── swarm/
│   ├── __init__.py
│   ├── memory.py           # SharedWorkingMemory
│   ├── orchestrator.py     # ParallelCognitiveOrchestrator
│   ├── reconciliation.py   # MultiAgentBeliefReconciliation
│   ├── transactive.py      # SwarmTransactiveMemory
│   └── learning.py         # LearningChannel
├── mcp/
│   └── tools/
│       └── swarm.py        # Swarm MCP tools
└── ...
```

### Swarm Execution Flow

```
Task Submitted
       ↓
ParallelCognitiveOrchestrator.plan_parallel_execution()
       ↓
   ┌───┴───┬───────┬───────┐
   ↓       ↓       ↓       ↓
Agent A  Agent B  Agent C  Agent D
   ↓       ↓       ↓       ↓
   └───────┴───────┴───────┘
           ↓
   SharedWorkingMemory
   (observations merge)
           ↓
   MultiAgentBeliefReconciliation.reconcile_all()
           ↓
       ┌───┴───┐
       ↓       ↓
   Resolved  Escalated
       ↓       ↓
   synthesize  Human Review
       ↓       ↓
       └───────┘
           ↓
   LearningChannel.publish()
           ↓
   Final Result
```

### Attention Decay Model

```python
def decay_attention(
    current_attention: float,
    age_seconds: float,
    relevance: float,
) -> float:
    """Calculate attention decay over time.

    Attention decays exponentially but is preserved by relevance.
    """
    base_decay = 0.95 ** (age_seconds / 60)  # 5% per minute
    relevance_boost = relevance * 0.5  # Relevance slows decay

    return current_attention * (base_decay + relevance_boost * (1 - base_decay))
```

---

## Example: Multi-Agent PR Review

### Task Setup

```python
# Create swarm task for PR review
plan = await mcp.call_tool("create_swarm_task", {
    "task": "Review PR #123: Add user authentication",
    "agent_types": ["security_reviewer", "performance_analyst", "architecture_checker"],
    "parallel": True,
})

# Plan shows:
# - security_reviewer: Check auth implementation
# - performance_analyst: Check query performance
# - architecture_checker: Verify architectural patterns
```

### Parallel Execution

```python
result = await mcp.call_tool("execute_swarm_task", {
    "task_id": plan["task_id"],
})

# During execution, agents share observations:
# - security_reviewer: "Found SQL injection risk in login query"
# - performance_analyst: "Login query missing index on email"
# - architecture_checker: "Auth service doesn't follow repository pattern"

# Conflict detected:
# - security_reviewer: "Token expiry set to 24h"
# - architecture_checker: "Token expiry should be 1h per security policy"
```

### Conflict Resolution

```python
conflicts = await mcp.call_tool("get_swarm_conflicts", {
    "task_id": plan["task_id"],
})

# Conflict: Token expiry recommendation
# - security_reviewer (credibility 0.9 in security): 24h
# - architecture_checker (credibility 0.7 in security): 1h

# Auto-resolution favors security_reviewer but escalates
# because architecture_checker cites explicit policy
```

### Final Result

```python
# Synthesized findings:
{
    "high_priority": [
        "SQL injection risk in login query (security)",
    ],
    "medium_priority": [
        "Missing index on email column (performance)",
        "Token expiry needs policy review (escalated conflict)",
    ],
    "suggestions": [
        "Consider repository pattern for auth service",
    ],
    "learnings_published": 2,  # Shared to other agents
}
```

---

## Testing

### Unit Tests

```python
class TestSharedWorkingMemory:
    """Test shared working memory."""

    async def test_capacity_enforcement(self):
        """Miller's Law capacity enforced."""

    async def test_attention_decay(self):
        """Attention decays over time."""

    async def test_conflict_detection(self):
        """Conflicts automatically detected."""


class TestBeliefReconciliation:
    """Test belief reconciliation."""

    async def test_credibility_resolution(self):
        """Higher credibility wins conflicts."""

    async def test_synthesis_when_possible(self):
        """Compatible observations synthesized."""

    async def test_escalation_for_policy(self):
        """Policy conflicts escalated."""
```

### Integration Tests

```python
class TestCognitiveSwarm:
    """Integration tests for cognitive swarm."""

    async def test_parallel_execution(self):
        """Multiple agents execute in parallel."""

    async def test_memory_sharing(self):
        """Agents see each other's observations."""

    async def test_end_to_end_reconciliation(self):
        """Full task with conflicts resolved."""
```

---

## Acceptance Checklist

- [ ] SharedWorkingMemory implemented
- [ ] Miller's Law capacity (7±2 items)
- [ ] ParallelCognitiveOrchestrator working
- [ ] Belief reconciliation with credibility
- [ ] TransactiveMemory enhanced
- [ ] LearningChannel with scopes
- [ ] All 6 MCP tools implemented
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Demo with 3+ agents on real task

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Planning and reconciliation via LLM |
| XML Output Format | ✅ | Prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol |
| Async-First Processing | ✅ | Parallel execution |
| Test Outcomes | ✅ | Swarm validated by outcomes |

---

## References

- [draagon-ai: COGNITIVE_SWARM_ARCHITECTURE.md](../../draagon-ai/docs/specs/COGNITIVE_SWARM_ARCHITECTURE.md)
- [REQ-022: Cross-Agent Semantic Memory](./REQ-022-cross-agent-semantic-memory.md)
- [Miller's Law](https://en.wikipedia.org/wiki/The_Magical_Number_Seven,_Plus_or_Minus_Two)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
