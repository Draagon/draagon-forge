# REQ-022: Cross-Agent Semantic Memory

**Priority:** P1
**Effort:** 5 days
**Dependencies:** REQ-014, REQ-020, REQ-021
**Blocks:** None
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific agent memory

---

## Overview

Enable multiple agents (primary agents, sub-agents, background agents) to share observations, decisions, and learnings through semantic memory rather than file-based reports. This creates a unified knowledge layer where agent expertise compounds.

### draagon-ai Foundation

This requirement wraps existing draagon-ai abstractions:

| draagon-ai Component | Location | Usage |
|---------------------|----------|-------|
| `SharedWorkingMemory` | `orchestration/shared_memory.py` | Multi-agent coordination |
| `SharedObservation` | `orchestration/shared_memory.py` | Shared observations with attention |
| `TransactiveMemory` | `orchestration/transactive_memory.py` | "Who knows what" expertise |
| `ExpertiseEntry` | `orchestration/transactive_memory.py` | Agent expertise scores |
| `Learning` | `orchestration/learning_channel.py` | Cross-agent knowledge sharing |
| `LearningChannel` | `orchestration/learning_channel.py` | Pub/sub for learnings |
| `MemoryScope` | `memory/base.py` | WORLD, CONTEXT, AGENT, SESSION |

### What This REQ Adds

| Extension | Purpose |
|-----------|---------|
| MCP tool wrappers | Expose draagon-ai to Claude Code |
| Handoff protocol | Structured agent-to-agent handoffs |
| Decision registry | Track cross-agent decisions |
| Observation→Belief reconciliation | Promote consensus to beliefs |

### Background: The File-Centric Pattern

Traditional multi-agent coordination uses files:

```
Primary Agent → writes report.md → Background Agent reads report.md
Sub-Agent → writes findings.json → Primary Agent reads findings.json
Expert Agent → updates expertise.md → Other agents load file
```

**Limitations:**
- Polling/watching required to detect updates
- No semantic understanding of what's relevant
- File conflicts with concurrent agents
- Lost context when files are overwritten
- No automatic expertise routing

### The Semantic Approach

Draagon Forge transforms this into:

```
Agent A stores finding in semantic memory →
Agent B queries by relevance (finds it automatically) →
Expertise tracked per agent →
Future queries route to most capable agent
```

**Advantages:**
- Real-time discovery (no polling)
- Semantic relevance filtering
- No file conflicts
- Findings persist and compound
- Automatic expertise routing via TransactiveMemory

---

## Requirements

### REQ-022.1: Agent Observation Publication

Agents publish observations to shared semantic memory using draagon-ai's `SharedObservation`.

```python
from draagon_ai.orchestration.shared_memory import SharedWorkingMemory, SharedObservation

@mcp.tool()
async def publish_observation(
    content: str,
    observation_type: str,  # "fact" | "belief" | "question" | "warning" | "decision"
    domain: str | None = None,
    confidence: float = 0.7,
    source_task: str | None = None,
    related_files: list[str] | None = None,
    is_belief_candidate: bool = False,
    for_agents: list[str] | None = None,
) -> dict:
    """Publish an observation to shared semantic memory.

    Wraps draagon-ai's SharedWorkingMemory.add_observation().
    Observations are stored where other agents can discover them via
    semantic search.

    Args:
        content: The observation content
        observation_type: Type from draagon-ai's model
        domain: Domain area (auth, database, api, etc.)
        confidence: Confidence in the observation
        source_task: Task/session that produced this
        related_files: Files this relates to
        is_belief_candidate: Should this become a belief?
        for_agents: Specific agents this is intended for (None = all)

    Returns:
        Published observation with ID
    """
    # Uses draagon-ai's SharedWorkingMemory
    observation = await shared_memory.add_observation(
        content=content,
        source_agent_id=current_agent_id,
        attention_weight=0.7,
        confidence=confidence,
        is_belief_candidate=is_belief_candidate,
        belief_type=observation_type,
    )
    return {"id": observation.observation_id, "content": content}
```

**Note:** We use draagon-ai's `SharedObservation` model directly:
```python
# From draagon_ai.orchestration.shared_memory
@dataclass(frozen=True)
class SharedObservation:
    observation_id: str
    content: str
    source_agent_id: str
    timestamp: datetime
    attention_weight: float      # 0-1, decays over time
    confidence: float            # 0-1
    is_belief_candidate: bool
    belief_type: str             # FACT, SKILL, PREFERENCE, etc.
    conflicts_with: list[str]    # Observation IDs that conflict
```

**Acceptance Criteria:**
- [ ] Observations stored via SharedWorkingMemory
- [ ] Observation type matches draagon-ai's model
- [ ] Related files linked
- [ ] Belief candidates flagged
- [ ] Target agents specified when needed

### REQ-022.2: Observation Discovery

Agents discover relevant observations from other agents.

```python
@mcp.tool()
async def discover_observations(
    query: str | None = None,
    observation_type: str | None = None,
    domain: str | None = None,
    from_agents: list[str] | None = None,
    belief_candidates_only: bool = False,
    min_attention: float = 0.0,
    limit: int = 10,
) -> list[dict]:
    """Discover observations from other agents.

    Wraps draagon-ai's SharedWorkingMemory.get_context_for_agent().
    Queries shared semantic memory for relevant observations.

    Args:
        query: Semantic search query (None = recent observations)
        observation_type: Filter by type (fact, belief, warning, etc.)
        domain: Filter by domain
        from_agents: Only observations from specific agents
        belief_candidates_only: Only belief candidates
        min_attention: Minimum attention weight
        limit: Maximum observations to return

    Returns:
        List of relevant observations with source agent info
    """
    # Uses draagon-ai's SharedWorkingMemory
    observations = await shared_memory.get_context_for_agent(
        agent_id=current_agent_id,
        max_items=limit,
    )
    # Filter and format...
```

**Response Format:**
```json
{
  "observations": [
    {
      "id": "obs-abc123",
      "content": "OAuth token refresh has a race condition in concurrent requests",
      "observation_type": "warning",
      "domain": "authentication",
      "confidence": 0.85,
      "attention_weight": 0.72,
      "source_agent": "security-analyzer",
      "is_belief_candidate": true,
      "conflicts_with": [],
      "timestamp": "2026-01-13T10:30:00Z"
    }
  ],
  "total_found": 3,
  "agents_reporting": ["security-analyzer", "code-reviewer"]
}
```

**Acceptance Criteria:**
- [ ] Semantic search finds relevant observations
- [ ] Type/domain filtering works
- [ ] Agent filtering works
- [ ] Attention weight filtering works
- [ ] Belief candidate flagging works

### REQ-022.3: Expertise Tracking with TransactiveMemory

Track which agents succeed at which tasks using draagon-ai's `TransactiveMemory`.

```python
from draagon_ai.orchestration.transactive_memory import TransactiveMemory, ExpertiseEntry

# draagon-ai already defines:
# SUCCESS_BOOST = 0.1
# FAILURE_PENALTY = 0.15
# DEFAULT_CONFIDENCE = 0.5

async def record_agent_success(
    agent_id: str,
    topic: str,
    success: bool,
) -> ExpertiseEntry:
    """Record agent success/failure for expertise tracking.

    Wraps draagon-ai's TransactiveMemory.update_expertise().

    Args:
        agent_id: Agent that performed the task
        topic: Topic/domain area
        success: Whether task succeeded

    Returns:
        Updated ExpertiseEntry from draagon-ai
    """
    # Use draagon-ai TransactiveMemory directly
    return await transactive_memory.update_expertise(
        agent_id=agent_id,
        topic=topic,
        success=success,
    )
```

**Expertise Query:**
```python
@mcp.tool()
async def find_expert_agent(
    topic: str,
    min_confidence: float = 0.6,
) -> dict:
    """Find the best agent for a topic based on expertise.

    Wraps draagon-ai's TransactiveMemory.get_experts().

    Args:
        topic: Topic to find expert for
        min_confidence: Minimum confidence threshold

    Returns:
        Recommended agent with expertise score
    """
    # Use draagon-ai's existing expertise routing
    experts = await transactive_memory.get_experts(
        topic=topic,
        min_confidence=min_confidence,
    )

    if not experts:
        return {"agent": None, "reason": "No expertise data available"}

    best_agent, score = experts[0]
    return {
        "agent": best_agent,
        "expertise_score": score,
        "all_experts": [(a, s) for a, s in experts],
    }
```

**Note:** draagon-ai's `ExpertiseEntry` already tracks:
```python
@dataclass
class ExpertiseEntry:
    topic: str
    confidence: float = 0.5
    success_count: int = 0
    failure_count: int = 0
    last_updated: datetime

    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return self.success_count / total if total > 0 else 0.5
```

**Acceptance Criteria:**
- [ ] Success/failure recorded per agent
- [ ] Expertise scores calculated
- [ ] Best agent queryable
- [ ] Scores update with new outcomes

### REQ-022.4: Agent Handoff Protocol

Structured handoff between agents via semantic memory.

```python
@mcp.tool()
async def initiate_handoff(
    to_agent: str,
    task: str,
    context_summary: str,
    findings_to_include: list[str] | None = None,
    decisions_made: list[dict] | None = None,
    blockers: list[str] | None = None,
    expected_output: str | None = None,
) -> dict:
    """Initiate a task handoff to another agent.

    Creates a structured handoff record in semantic memory
    that the receiving agent can query to understand context.

    Args:
        to_agent: Target agent ID
        task: Task description
        context_summary: Summary of relevant context
        findings_to_include: Finding IDs to pass along
        decisions_made: Decisions made that constrain the work
        blockers: Known blockers to be aware of
        expected_output: What the originating agent expects back

    Returns:
        Handoff record with ID
    """
```

**Handoff Query (receiving agent):**
```python
@mcp.tool()
async def receive_handoff(
    handoff_id: str | None = None,
    for_agent: str | None = None,
) -> dict:
    """Receive a task handoff from another agent.

    Queries for pending handoffs and retrieves full context.

    Args:
        handoff_id: Specific handoff to receive
        for_agent: Find handoffs intended for this agent

    Returns:
        Handoff details with full context
    """
```

**Response Format:**
```json
{
  "handoff_id": "handoff-xyz",
  "from_agent": "code-reviewer",
  "to_agent": "security-analyzer",
  "task": "Deep security analysis of OAuth implementation",
  "context_summary": "PR #42 adds OAuth2 support. Initial review found potential race condition.",
  "findings": [
    {
      "content": "Token refresh has race condition",
      "relevance": "critical"
    }
  ],
  "decisions": [
    {
      "subject": "OAuth provider",
      "choice": "Auth0",
      "rationale": "Team familiarity"
    }
  ],
  "blockers": [
    "Need to verify thread safety of token cache"
  ],
  "expected_output": "Security assessment with severity ratings",
  "created_at": "2026-01-13T10:30:00Z"
}
```

**Acceptance Criteria:**
- [ ] Handoff creates structured record
- [ ] Receiving agent can query handoffs
- [ ] Context summary included
- [ ] Related findings linked
- [ ] Expected output specified

### REQ-022.5: Shared Decision Registry

Track decisions made by any agent for consistency.

```python
@mcp.tool()
async def register_decision(
    subject: str,
    decision: str,
    rationale: str,
    scope: str = "session",  # "session" | "project" | "permanent"
    constraints: list[str] | None = None,
    made_by: str | None = None,
) -> dict:
    """Register a decision to the shared decision registry.

    Decisions are stored in semantic memory where other agents
    can discover them to maintain consistency.

    Args:
        subject: What the decision is about
        decision: The decision made
        rationale: Why this decision was made
        scope: How long this decision should persist
        constraints: What this decision constrains
        made_by: Agent that made the decision

    Returns:
        Registered decision with ID
    """

@mcp.tool()
async def check_decisions(
    subject: str | None = None,
    query: str | None = None,
    scope: str | None = None,
) -> list[dict]:
    """Check existing decisions before making new ones.

    Query the decision registry to find relevant past decisions
    that may constrain or inform current work.

    Args:
        subject: Specific subject to check
        query: Semantic search for related decisions
        scope: Filter by decision scope

    Returns:
        Relevant decisions with their constraints
    """
```

**Acceptance Criteria:**
- [ ] Decisions registered with scope
- [ ] Decisions queryable by subject
- [ ] Semantic search for related decisions
- [ ] Constraints tracked

### REQ-022.6: Finding Reconciliation to Beliefs

Reconcile agent findings into permanent beliefs.

```python
async def reconcile_findings(
    domain: str | None = None,
    min_confidence: float = 0.7,
    min_confirmations: int = 2,
) -> list[dict]:
    """Reconcile findings into beliefs.

    Analyzes findings from multiple agents, identifies consensus,
    and promotes consistent findings to beliefs.

    Similar findings from multiple agents with high confidence
    become beliefs. Conflicting findings are flagged for review.

    Args:
        domain: Optional domain filter
        min_confidence: Minimum average confidence
        min_confirmations: Minimum agents confirming

    Returns:
        Reconciliation results with new/strengthened beliefs
    """
```

**Acceptance Criteria:**
- [ ] Groups similar findings
- [ ] Identifies consensus
- [ ] Creates beliefs from consensus
- [ ] Flags conflicts for review
- [ ] Updates conviction scores

---

## Technical Design

### Memory Scope Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY SCOPE HIERARCHY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  WORLD Scope (MemoryScope.WORLD)                        │   │
│  │  - Universal knowledge                                   │   │
│  │  - Shared across all agents, all projects               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CONTEXT Scope (MemoryScope.CONTEXT) ← CROSS-AGENT      │   │
│  │  - Agent findings, handoffs, shared decisions            │   │
│  │  - Visible to all agents in same context/project        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  AGENT Scope (MemoryScope.AGENT)                        │   │
│  │  - Agent-specific learnings                              │   │
│  │  - Private to each agent                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SESSION Scope (MemoryScope.SESSION)                    │   │
│  │  - Operations, temporary context                         │   │
│  │  - Expires with session                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── findings.py          # NEW: publish_finding, discover_findings
│   ├── expertise.py         # NEW: record_success, find_expert
│   ├── handoff.py           # NEW: initiate_handoff, receive_handoff
│   ├── decisions.py         # NEW: register_decision, check_decisions
│   └── ...
├── coordination/
│   ├── __init__.py
│   ├── reconciliation.py    # Finding → Belief reconciliation
│   └── routing.py           # Expertise-based routing
└── server.py                # Updated with new tools
```

### Integration with draagon-ai TransactiveMemory

```python
# draagon-ai already has TransactiveMemory for expertise tracking
from draagon_ai.orchestration.agent import TransactiveMemory

# Record outcomes
await transactive_memory.record_outcome(
    agent_id="security-analyzer",
    task_type="security-review",
    domain="authentication",
    success=True,
)

# Query expertise
score = await transactive_memory.get_expertise_score(
    agent_id="security-analyzer",
    query="OAuth security analysis",
)
```

---

## Testing

### Unit Tests

```python
class TestFindingPublication:
    """Test finding publication."""

    async def test_publish_finding_stores_correctly(self):
        """Findings stored with correct scope and metadata."""

    async def test_actionable_flag_works(self):
        """Actionable findings flagged correctly."""


class TestFindingDiscovery:
    """Test finding discovery."""

    async def test_discover_by_relevance(self):
        """Semantic search finds relevant findings."""

    async def test_filter_by_agent(self):
        """Agent filter works correctly."""

    async def test_recency_filter(self):
        """Time-based filter works."""


class TestExpertiseTracking:
    """Test expertise tracking."""

    async def test_success_updates_expertise(self):
        """Success increases expertise score."""

    async def test_failure_decreases_expertise(self):
        """Failure decreases expertise score."""

    async def test_find_best_agent(self):
        """Correct agent identified for task."""
```

### Integration Tests

```python
class TestCrossAgentIntegration:
    """Integration tests for cross-agent memory."""

    async def test_publish_discover_flow(self):
        """Agent A publishes, Agent B discovers."""

    async def test_handoff_flow(self):
        """Full handoff from one agent to another."""

    async def test_decision_consistency(self):
        """Decisions visible to all agents."""

    async def test_finding_reconciliation(self):
        """Multiple findings become belief."""
```

---

## Usage Examples

### Agent Publishing a Finding

```python
# Security analyzer finds an issue
await mcp.call_tool("publish_finding", {
    "finding": "OAuth token refresh has race condition under concurrent requests",
    "category": "warning",
    "domain": "authentication",
    "confidence": 0.85,
    "related_files": ["src/auth/token_service.py:45-67"],
    "actionable": True,
})
```

### Another Agent Discovering It

```python
# Feature developer checks for relevant warnings
findings = await mcp.call_tool("discover_findings", {
    "domain": "authentication",
    "category": "warning",
    "actionable_only": True,
})

# Finds the race condition warning automatically
```

### Expertise-Based Routing

```python
# Need security review, find best agent
expert = await mcp.call_tool("find_expert_agent", {
    "task_type": "security-review",
    "domain": "authentication",
})

# Returns: {"agent": "security-analyzer", "expertise_score": 0.89}

# Handoff to expert
await mcp.call_tool("initiate_handoff", {
    "to_agent": expert["agent"],
    "task": "Review OAuth implementation for security issues",
    "context_summary": "PR #42 adds OAuth2, need security sign-off",
})
```

### Decision Consistency

```python
# Before making a decision, check existing decisions
existing = await mcp.call_tool("check_decisions", {
    "subject": "oauth_provider",
})

# If decision exists, respect it
if existing:
    print(f"Already decided: {existing[0]['decision']}")
else:
    # Make and register new decision
    await mcp.call_tool("register_decision", {
        "subject": "oauth_provider",
        "decision": "Use Auth0",
        "rationale": "Team familiarity, good documentation",
        "scope": "project",
    })
```

---

## Acceptance Checklist

- [ ] `publish_finding` implemented
- [ ] `discover_findings` implemented
- [ ] Expertise tracking with TransactiveMemory
- [ ] `find_expert_agent` implemented
- [ ] `initiate_handoff` / `receive_handoff` implemented
- [ ] `register_decision` / `check_decisions` implemented
- [ ] Finding reconciliation to beliefs
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Reconciliation uses LLM |
| XML Output Format | ✅ | Prompts use XML |
| Protocol-Based Design | ✅ | Uses draagon-ai protocols |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Tests validate cross-agent flows |

---

## References

- [Context Engineering: Agent Delegation](transcript source)
- [draagon-ai: TransactiveMemory](../draagon-ai/orchestration/agent.py)
- [draagon-ai: Memory Scopes](../draagon-ai/memory/base.py)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
