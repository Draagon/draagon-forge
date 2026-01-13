# REQ-023: Behavior Architect

**Priority:** P0
**Effort:** 12 days
**Dependencies:** REQ-001, REQ-022
**Blocks:** REQ-024
**Layer:** 🔷 L2 (draagon-ai-forge) - Generic behavior creation, reusable across domains

---

## Overview

Enable Draagon Forge to create, test, and evolve new agents/behaviors through natural conversation. This is a meta-capability: the ability to teach Draagon Forge how to do new things by working with it interactively.

### The Vision

> "I want to create an agent that reviews my database migrations for performance issues."

Instead of writing code, you have a conversation:

```
User: I want to create an agent that reviews database migrations for performance issues.

Draagon: I'll help you create that. Let me first research the domain...
         [Searches beliefs, patterns, and code for migration-related knowledge]

         Based on what I found, here are common migration issues to check:
         1. Missing indexes on foreign keys
         2. Full table scans on large tables
         3. Blocking operations without timeouts
         4. Missing rollback plans

         Should I create a behavior that checks for these? Or do you want to add more criteria?

User: Add checking for N+1 query patterns in the migration too.

Draagon: Added. I've created a draft behavior "migration_reviewer".
         Let me generate some test cases...
         [Creates test migrations with known issues]

         The behavior correctly identified 4/5 test issues.
         It missed the N+1 pattern in test case 3.
         Want me to refine the detection prompt?

User: Yes, and also make it check for missing foreign key constraints.

Draagon: Updated. Now passing 5/5 tests.
         Ready to promote to staging? You can use it via:
         `draagon review-migration ./migrations/001_add_users.sql`
```

### Key Differentiator

Unlike static agent frameworks:
- **No code required** - Natural language to working agent
- **Iterative refinement** - Improve through conversation
- **Automatic testing** - Generated test cases validate behavior
- **Learning from use** - Behaviors evolve based on outcomes

---

## Requirements

### REQ-023.1: Behavior Data Model

Define the core behavior structure.

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

class BehaviorTier(Enum):
    """Tiers determine trust level and activation scope."""
    CORE = "core"           # Built-in, always available
    ADDON = "addon"         # Official extensions
    APPLICATION = "app"     # Project-specific
    GENERATED = "generated" # Created via Behavior Architect
    EXPERIMENTAL = "exp"    # Under development/testing

class BehaviorLifecycle(Enum):
    """Lifecycle stages for behaviors."""
    DRAFT = "draft"         # Being created/refined
    TESTING = "testing"     # Running test cases
    STAGING = "staging"     # Available but not default
    ACTIVE = "active"       # Fully operational
    DEPRECATED = "deprecated"  # Being phased out
    RETIRED = "retired"     # No longer available

@dataclass
class Action:
    """A single action a behavior can perform."""
    name: str
    description: str
    prompt_template: str
    input_schema: dict
    output_schema: dict
    requires_confirmation: bool = False
    timeout_seconds: int = 30

@dataclass
class Trigger:
    """When a behavior should activate."""
    trigger_type: str  # "file_pattern" | "command" | "event" | "query"
    pattern: str
    priority: int = 0

@dataclass
class Behavior:
    """A complete behavior definition."""
    behavior_id: str
    name: str
    description: str
    tier: BehaviorTier
    lifecycle: BehaviorLifecycle

    # What this behavior can do
    actions: list[Action] = field(default_factory=list)

    # When this behavior activates
    triggers: list[Trigger] = field(default_factory=list)

    # Constraints
    domains: list[str] = field(default_factory=list)
    requires_capabilities: list[str] = field(default_factory=list)

    # Metadata
    version: str = "1.0.0"
    author: str = "user"
    created_at: str = ""
    updated_at: str = ""

    # Performance tracking
    success_count: int = 0
    failure_count: int = 0
    avg_execution_time: float = 0.0

    # Evolution
    parent_behavior_id: str | None = None
    generation: int = 0
```

**Acceptance Criteria:**
- [ ] Behavior dataclass defined with all fields
- [ ] BehaviorTier and BehaviorLifecycle enums implemented
- [ ] Action and Trigger dataclasses defined
- [ ] Serialization to/from JSON works
- [ ] Stored in Neo4j as nodes with relationships

### REQ-023.2: Behavior Registry

Manage behaviors across tiers.

```python
class BehaviorRegistry:
    """Central registry for all behaviors."""

    async def register(self, behavior: Behavior) -> str:
        """Register a new behavior.

        Returns:
            behavior_id of registered behavior
        """

    async def get(self, behavior_id: str) -> Behavior | None:
        """Get a behavior by ID."""

    async def list_behaviors(
        self,
        tier: BehaviorTier | None = None,
        lifecycle: BehaviorLifecycle | None = None,
        domain: str | None = None,
    ) -> list[Behavior]:
        """List behaviors with optional filters."""

    async def find_by_trigger(
        self,
        trigger_type: str,
        context: str,
    ) -> list[Behavior]:
        """Find behaviors that match a trigger context."""

    async def update_stats(
        self,
        behavior_id: str,
        success: bool,
        execution_time: float,
    ) -> None:
        """Update behavior performance statistics."""

    async def promote(
        self,
        behavior_id: str,
        target_lifecycle: BehaviorLifecycle,
    ) -> bool:
        """Promote a behavior to a new lifecycle stage."""
```

**Acceptance Criteria:**
- [ ] CRUD operations for behaviors
- [ ] Tier and lifecycle filtering
- [ ] Trigger matching
- [ ] Statistics tracking
- [ ] Promotion workflow

### REQ-023.3: Behavior Architect MCP Tools

Expose behavior creation via MCP.

```python
@mcp.tool()
async def research_behavior_domain(
    domain: str,
    task_description: str,
) -> dict:
    """Research a domain to inform behavior creation.

    Searches beliefs, patterns, code examples, and past sessions
    to understand how this domain works in the codebase.

    Args:
        domain: The domain to research (e.g., "database migrations")
        task_description: What the behavior should do

    Returns:
        Research findings including:
        - relevant_beliefs: Principles and patterns for this domain
        - code_examples: Real code demonstrating patterns
        - past_sessions: Similar past work
        - suggested_actions: Recommended actions for the behavior
    """

@mcp.tool()
async def create_behavior(
    name: str,
    description: str,
    actions: list[dict],
    triggers: list[dict] | None = None,
    domain: str | None = None,
) -> dict:
    """Create a new behavior from specification.

    Args:
        name: Human-readable behavior name
        description: What this behavior does
        actions: List of actions with prompts and schemas
        triggers: Optional activation triggers
        domain: Optional domain classification

    Returns:
        Created behavior with ID, ready for testing
    """

@mcp.tool()
async def generate_behavior_tests(
    behavior_id: str,
    num_tests: int = 5,
) -> dict:
    """Generate test cases for a behavior.

    Uses LLM to generate diverse test inputs that cover:
    - Happy path scenarios
    - Edge cases
    - Error conditions
    - Domain-specific challenges

    Args:
        behavior_id: ID of behavior to test
        num_tests: Number of test cases to generate

    Returns:
        Generated test cases with expected outcomes
    """

@mcp.tool()
async def run_behavior_tests(
    behavior_id: str,
    test_ids: list[str] | None = None,
) -> dict:
    """Run tests against a behavior.

    Args:
        behavior_id: ID of behavior to test
        test_ids: Specific tests to run (all if None)

    Returns:
        Test results with pass/fail, outputs, and analysis
    """

@mcp.tool()
async def refine_behavior(
    behavior_id: str,
    feedback: str,
    failed_test_ids: list[str] | None = None,
) -> dict:
    """Refine a behavior based on feedback or failed tests.

    Uses LLM to analyze failures and improve prompts.

    Args:
        behavior_id: ID of behavior to refine
        feedback: Natural language feedback
        failed_test_ids: Specific failed tests to address

    Returns:
        Updated behavior with changelog
    """

@mcp.tool()
async def promote_behavior(
    behavior_id: str,
    target_lifecycle: str,  # "staging" | "active"
) -> dict:
    """Promote a behavior to a higher lifecycle stage.

    Requires:
    - staging: All tests passing
    - active: Successful staging period

    Args:
        behavior_id: ID of behavior to promote
        target_lifecycle: Target lifecycle stage

    Returns:
        Promotion result with new status
    """

@mcp.tool()
async def invoke_behavior(
    behavior_id: str,
    action_name: str,
    input_data: dict,
) -> dict:
    """Invoke a behavior action.

    Args:
        behavior_id: ID of behavior to invoke
        action_name: Name of action to execute
        input_data: Input data matching action schema

    Returns:
        Action result with output and metadata
    """
```

**Acceptance Criteria:**
- [ ] `research_behavior_domain` searches semantic memory
- [ ] `create_behavior` creates valid behavior with ID
- [ ] `generate_behavior_tests` creates meaningful tests
- [ ] `run_behavior_tests` executes and reports results
- [ ] `refine_behavior` improves based on feedback
- [ ] `promote_behavior` enforces lifecycle rules
- [ ] `invoke_behavior` executes actions safely

### REQ-023.4: Behavior Creation Workflow

Implement the conversational workflow for creating behaviors.

```python
BEHAVIOR_ARCHITECT_PROMPT = """<task>
You are the Behavior Architect, a meta-behavior that helps users create
new behaviors through conversation.
</task>

<current_state>
Phase: {phase}
Behavior Draft: {behavior_draft}
Test Results: {test_results}
</current_state>

<workflow>
1. RESEARCH: Understand the domain by searching beliefs and patterns
2. DESIGN: Propose behavior structure with actions and triggers
3. CREATE: Generate the behavior with prompts
4. TEST: Create and run test cases
5. REFINE: Iterate based on feedback and failures
6. PROMOTE: Move to staging/active when ready
</workflow>

<guidelines>
- Ask clarifying questions to understand requirements
- Show the user what you're creating at each step
- Explain tradeoffs and design decisions
- Generate diverse test cases automatically
- Learn from refinements to improve future behaviors
</guidelines>

<user_message>
{user_message}
</user_message>

<instructions>
Based on the current state and user message, determine the next action.
If creating/refining prompts, use XML format for LLM outputs.
Always validate against relevant beliefs and patterns.
</instructions>"""
```

**Acceptance Criteria:**
- [ ] Multi-turn conversation support
- [ ] State tracking across messages
- [ ] Automatic test generation
- [ ] Iterative refinement loop
- [ ] Clear user feedback at each step

### REQ-023.5: Behavior Persistence

Store behaviors in semantic memory.

```python
class BehaviorStore:
    """Persist behaviors to Neo4j and Qdrant."""

    async def save(self, behavior: Behavior) -> str:
        """Save behavior to graph and vector stores.

        Creates:
        - Neo4j node with behavior metadata
        - Qdrant embedding for semantic search
        - Relationships to domain beliefs
        """

    async def load(self, behavior_id: str) -> Behavior | None:
        """Load behavior from store."""

    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[Behavior]:
        """Semantic search for behaviors."""

    async def get_related_beliefs(
        self,
        behavior_id: str,
    ) -> list[dict]:
        """Get beliefs related to a behavior's domain."""

    async def record_execution(
        self,
        behavior_id: str,
        action_name: str,
        input_data: dict,
        output_data: dict,
        success: bool,
        execution_time: float,
    ) -> None:
        """Record behavior execution for learning."""
```

**Acceptance Criteria:**
- [ ] Behaviors stored in Neo4j
- [ ] Semantic search via Qdrant
- [ ] Execution history tracked
- [ ] Domain relationships maintained

---

## Technical Design

### File Structure

```
src/draagon_forge/
├── mcp/
│   ├── tools/
│   │   └── behaviors.py      # MCP tools for behavior management
│   └── ...
├── behaviors/
│   ├── __init__.py
│   ├── models.py             # Behavior, Action, Trigger dataclasses
│   ├── registry.py           # BehaviorRegistry
│   ├── store.py              # BehaviorStore (Neo4j + Qdrant)
│   ├── architect.py          # Behavior Architect workflow
│   ├── executor.py           # BehaviorExecutor
│   └── testing.py            # BehaviorTestRunner
└── ...
```

### Behavior Execution Flow

```
User invokes behavior
        ↓
BehaviorRegistry.find_by_trigger()
        ↓
BehaviorActivationEngine.should_activate()
        ↓
BehaviorExecutor.execute(behavior, action, input)
        ↓
    ┌───┴───┐
    ↓       ↓
Success   Failure
    ↓       ↓
Record    Record + Learn
    ↓       ↓
Return    Retry or Report
```

### Integration with Existing Components

| Component | Integration |
|-----------|-------------|
| REQ-001 MCP Server | Hosts behavior tools |
| REQ-005 Belief Manager | Behaviors reference beliefs |
| REQ-021 Dynamic Priming | Behaviors use priming |
| REQ-022 Cross-Agent Memory | Behaviors share learnings |

---

## Example: Creating a Migration Reviewer

### Step 1: Research Domain

```python
# User: "I want to create an agent that reviews database migrations"

research = await mcp.call_tool("research_behavior_domain", {
    "domain": "database migrations",
    "task_description": "Review migrations for performance issues"
})

# Returns:
{
    "relevant_beliefs": [
        {"content": "Always add indexes for foreign keys", "conviction": 0.92},
        {"content": "Avoid full table scans on tables > 100k rows", "conviction": 0.88},
    ],
    "code_examples": [
        {"file": "migrations/003_add_user_index.sql", "pattern": "CREATE INDEX CONCURRENTLY"},
    ],
    "past_sessions": [
        {"task": "Fixed slow migration on orders table", "outcome": "successful"},
    ],
    "suggested_actions": [
        "analyze_indexes", "check_table_sizes", "detect_blocking_ops"
    ]
}
```

### Step 2: Create Behavior

```python
behavior = await mcp.call_tool("create_behavior", {
    "name": "migration_reviewer",
    "description": "Reviews database migrations for performance issues",
    "actions": [
        {
            "name": "review_migration",
            "description": "Analyze a migration file for issues",
            "prompt_template": """<task>Review this database migration for performance issues.</task>
<migration>{migration_content}</migration>
<checks>
- Missing indexes on foreign keys
- Full table scans on large tables
- Blocking operations without timeouts
- Missing rollback plans
</checks>
<output_format>
<review>
  <issues>
    <issue severity="high|medium|low">Description</issue>
  </issues>
  <recommendations>
    <recommendation>Suggestion</recommendation>
  </recommendations>
</review>
</output_format>""",
            "input_schema": {"migration_content": "string"},
            "output_schema": {"issues": "array", "recommendations": "array"},
        }
    ],
    "triggers": [
        {"trigger_type": "command", "pattern": "review-migration *"},
        {"trigger_type": "file_pattern", "pattern": "migrations/*.sql"},
    ],
    "domain": "database"
})
```

### Step 3: Generate and Run Tests

```python
tests = await mcp.call_tool("generate_behavior_tests", {
    "behavior_id": behavior["behavior_id"],
    "num_tests": 5,
})

results = await mcp.call_tool("run_behavior_tests", {
    "behavior_id": behavior["behavior_id"],
})

# Results show 4/5 passing, 1 failure on N+1 detection
```

### Step 4: Refine

```python
refined = await mcp.call_tool("refine_behavior", {
    "behavior_id": behavior["behavior_id"],
    "feedback": "Add checking for N+1 query patterns and missing foreign key constraints",
    "failed_test_ids": ["test_003"],
})
```

### Step 5: Promote

```python
await mcp.call_tool("promote_behavior", {
    "behavior_id": behavior["behavior_id"],
    "target_lifecycle": "active",
})
```

---

## Testing

### Unit Tests

```python
class TestBehaviorModels:
    """Test behavior data models."""

    def test_behavior_serialization(self):
        """Behaviors serialize to/from JSON."""

    def test_behavior_validation(self):
        """Invalid behaviors are rejected."""


class TestBehaviorRegistry:
    """Test behavior registry."""

    async def test_register_and_retrieve(self):
        """Can register and retrieve behaviors."""

    async def test_trigger_matching(self):
        """Correct behaviors found by trigger."""

    async def test_lifecycle_promotion(self):
        """Promotion follows rules."""


class TestBehaviorArchitect:
    """Test behavior creation workflow."""

    async def test_research_finds_relevant_context(self):
        """Research returns useful domain info."""

    async def test_create_generates_valid_behavior(self):
        """Created behaviors are valid and executable."""

    async def test_refinement_improves_behavior(self):
        """Refinement addresses identified issues."""
```

### Integration Tests

```python
class TestBehaviorArchitectIntegration:
    """Integration tests for full workflow."""

    async def test_end_to_end_behavior_creation(self):
        """Create behavior from research to active."""

    async def test_behavior_invocation(self):
        """Created behavior can be invoked."""

    async def test_learning_from_execution(self):
        """Execution outcomes improve behavior."""
```

---

## Acceptance Checklist

- [ ] Behavior data model implemented
- [ ] BehaviorRegistry with CRUD operations
- [ ] All 7 MCP tools implemented
- [ ] Behavior creation workflow working
- [ ] Test generation and execution
- [ ] Refinement based on feedback
- [ ] Promotion lifecycle enforced
- [ ] Persistence to Neo4j + Qdrant
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Can create working behavior via conversation

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | All semantic analysis via LLM |
| XML Output Format | ✅ | Behavior prompts use XML |
| Protocol-Based Design | ✅ | Uses MCP protocol |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Behaviors validated by tests |

---

## References

- [draagon-ai: BEHAVIOR_SYSTEM_DESIGN.md](../../draagon-ai/docs/design/BEHAVIOR_SYSTEM_DESIGN.md)
- [REQ-021: Dynamic Context Priming](./REQ-021-dynamic-context-priming.md)
- [REQ-022: Cross-Agent Semantic Memory](./REQ-022-cross-agent-semantic-memory.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
