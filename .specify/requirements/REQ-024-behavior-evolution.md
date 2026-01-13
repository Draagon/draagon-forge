# REQ-024: Behavior Evolution

**Priority:** P1
**Effort:** 8 days
**Dependencies:** REQ-023
**Blocks:** None

---

## Overview

Enable behaviors to self-improve through genetic algorithms and outcome-based learning. When a behavior is used, track outcomes and automatically evolve better prompts over time.

### The Vision

> "The migration reviewer I created last month is now 40% better at catching issues because it learned from every review."

Unlike static agents that never improve:
- **Outcome tracking** - Every invocation records success/failure
- **Prompt evolution** - Genetic algorithms breed better prompts
- **Overfitting detection** - Holdout sets prevent false improvements
- **Automatic refinement** - Behaviors improve without user intervention

### Key Differentiator

Most AI tools use fixed prompts. Draagon Forge behaviors **evolve**:

| Aspect | Static Agents | Evolving Behaviors |
|--------|---------------|-------------------|
| Prompts | Fixed at creation | Evolve with use |
| Learning | None | Outcome-based |
| Improvement | Manual updates | Automatic |
| Personalization | None | Adapts to your codebase |

---

## Requirements

### REQ-024.1: Outcome Tracking

Track every behavior invocation for learning.

```python
@dataclass
class BehaviorExecution:
    """Record of a single behavior execution."""
    execution_id: str
    behavior_id: str
    action_name: str
    behavior_version: str

    # Input/Output
    input_data: dict
    output_data: dict

    # Outcome
    success: bool
    outcome_type: str  # "correct" | "incorrect" | "partial" | "error"
    user_feedback: str | None = None

    # Performance
    execution_time: float
    token_count: int

    # Context
    timestamp: str
    session_id: str
    domain: str | None = None


class ExecutionTracker:
    """Track behavior executions for learning."""

    async def record(self, execution: BehaviorExecution) -> str:
        """Record an execution."""

    async def get_executions(
        self,
        behavior_id: str,
        outcome_type: str | None = None,
        limit: int = 100,
    ) -> list[BehaviorExecution]:
        """Get executions for a behavior."""

    async def get_success_rate(
        self,
        behavior_id: str,
        window_days: int = 30,
    ) -> float:
        """Calculate success rate over time window."""

    async def get_failure_patterns(
        self,
        behavior_id: str,
        limit: int = 10,
    ) -> list[dict]:
        """Analyze common failure patterns."""
```

**Acceptance Criteria:**
- [ ] All executions recorded
- [ ] Success rate calculation
- [ ] Failure pattern analysis
- [ ] User feedback captured

### REQ-024.2: Prompt Mutation Engine

Generate prompt variations through mutation.

```python
class PromptMutator:
    """Generate prompt variations through mutation."""

    async def mutate(
        self,
        prompt: str,
        mutation_type: str,
        context: dict | None = None,
    ) -> str:
        """Mutate a prompt using specified strategy.

        Mutation types:
        - rephrase: Reword while preserving meaning
        - elaborate: Add more detail/examples
        - simplify: Remove unnecessary complexity
        - restructure: Change organization/flow
        - specialize: Add domain-specific guidance
        - generalize: Make more broadly applicable
        """

    async def crossover(
        self,
        prompt_a: str,
        prompt_b: str,
    ) -> str:
        """Combine elements from two prompts."""


MUTATION_PROMPT = """<task>
Mutate this prompt using the {mutation_type} strategy.
</task>

<original_prompt>
{prompt}
</original_prompt>

<mutation_context>
{context}
</mutation_context>

<mutation_strategies>
- rephrase: Reword instructions while preserving exact meaning
- elaborate: Add helpful examples, edge cases, or clarifications
- simplify: Remove redundant or confusing elements
- restructure: Reorganize for better flow and clarity
- specialize: Add domain-specific guidance from context
- generalize: Make applicable to broader scenarios
</mutation_strategies>

<instructions>
Apply the {mutation_type} mutation strategy.
Preserve the core functionality and output format.
Make changes that could improve performance.
</instructions>

<output_format>
<mutated_prompt>
The mutated prompt here
</mutated_prompt>
<changes_made>
Brief description of what changed
</changes_made>
</output_format>"""
```

**Acceptance Criteria:**
- [ ] All mutation types implemented
- [ ] Crossover combines prompts effectively
- [ ] Core functionality preserved
- [ ] Changes are meaningful, not random

### REQ-024.3: Behavior Evolution Engine

Implement genetic algorithm for prompt evolution.

```python
@dataclass
class PromptCandidate:
    """A candidate prompt in the evolution pool."""
    prompt: str
    fitness: float
    generation: int
    parent_ids: list[str]
    mutations_applied: list[str]


class BehaviorEvolutionEngine:
    """Evolve behavior prompts using genetic algorithms."""

    def __init__(
        self,
        population_size: int = 10,
        mutation_rate: float = 0.3,
        crossover_rate: float = 0.2,
        elite_count: int = 2,
        train_test_split: float = 0.8,
    ):
        """Initialize evolution engine.

        Args:
            population_size: Number of candidates per generation
            mutation_rate: Probability of mutation
            crossover_rate: Probability of crossover
            elite_count: Top performers kept unchanged
            train_test_split: Ratio for train vs holdout
        """

    async def initialize_population(
        self,
        behavior_id: str,
        seed_prompt: str,
    ) -> list[PromptCandidate]:
        """Create initial population from seed prompt."""

    async def evaluate_fitness(
        self,
        candidate: PromptCandidate,
        test_cases: list[dict],
    ) -> float:
        """Evaluate candidate fitness on test cases.

        Fitness = weighted combination of:
        - Correctness rate on test cases
        - Execution time (lower is better)
        - Token efficiency (lower is better)
        - User preference (if feedback available)
        """

    async def select_parents(
        self,
        population: list[PromptCandidate],
    ) -> list[tuple[PromptCandidate, PromptCandidate]]:
        """Select parent pairs for reproduction.

        Uses tournament selection with fitness weighting.
        """

    async def evolve_generation(
        self,
        behavior_id: str,
    ) -> dict:
        """Evolve one generation.

        Returns:
            Generation results including:
            - best_candidate: Top performer
            - avg_fitness: Average fitness
            - improvement: Change from previous generation
        """

    async def run_evolution(
        self,
        behavior_id: str,
        max_generations: int = 10,
        target_fitness: float = 0.95,
        early_stop_generations: int = 3,
    ) -> dict:
        """Run full evolution process.

        Args:
            behavior_id: Behavior to evolve
            max_generations: Maximum generations to run
            target_fitness: Stop if fitness reaches this
            early_stop_generations: Stop if no improvement for N generations

        Returns:
            Evolution results with best prompt and history
        """
```

**Acceptance Criteria:**
- [ ] Population initialization
- [ ] Fitness evaluation
- [ ] Parent selection
- [ ] Generation evolution
- [ ] Early stopping
- [ ] Best prompt tracking

### REQ-024.4: Overfitting Detection

Prevent prompts from overfitting to test cases.

```python
class OverfitDetector:
    """Detect and prevent overfitting in evolved prompts."""

    async def split_test_cases(
        self,
        test_cases: list[dict],
        train_ratio: float = 0.8,
    ) -> tuple[list[dict], list[dict]]:
        """Split test cases into train and holdout sets.

        Ensures diverse coverage in both sets.
        """

    async def detect_overfit(
        self,
        candidate: PromptCandidate,
        train_fitness: float,
        holdout_fitness: float,
        threshold: float = 0.15,
    ) -> bool:
        """Detect if candidate is overfitting.

        Overfitting indicated by:
        - Train fitness >> holdout fitness
        - Declining holdout fitness over generations
        - High variance in holdout performance
        """

    async def get_overfit_report(
        self,
        behavior_id: str,
    ) -> dict:
        """Generate overfitting analysis report.

        Returns:
            - train_vs_holdout_gap: Difference in fitness
            - overfit_probability: Estimated overfit risk
            - recommendations: How to address if overfitting
        """


OVERFIT_THRESHOLDS = {
    "warning": 0.10,  # 10% gap triggers warning
    "reject": 0.20,   # 20% gap rejects candidate
}
```

**Acceptance Criteria:**
- [ ] Train/holdout splitting
- [ ] Overfit detection
- [ ] Gap threshold enforcement
- [ ] Reporting and recommendations

### REQ-024.5: Automatic Evolution Triggers

Trigger evolution based on behavior performance.

```python
class EvolutionTrigger:
    """Determine when to trigger behavior evolution."""

    async def should_evolve(
        self,
        behavior_id: str,
    ) -> tuple[bool, str]:
        """Check if behavior should evolve.

        Triggers:
        - Success rate drops below threshold (0.8)
        - Significant execution count since last evolution (50+)
        - User feedback indicates issues
        - New test cases added

        Returns:
            (should_evolve, reason)
        """

    async def schedule_evolution(
        self,
        behavior_id: str,
        priority: str = "normal",
    ) -> str:
        """Schedule behavior for evolution.

        Returns:
            evolution_job_id
        """


EVOLUTION_TRIGGERS = {
    "success_rate_threshold": 0.80,
    "min_executions_since_evolution": 50,
    "max_days_without_evolution": 30,
    "negative_feedback_threshold": 3,
}
```

**Acceptance Criteria:**
- [ ] Success rate monitoring
- [ ] Execution count tracking
- [ ] User feedback integration
- [ ] Scheduled evolution jobs

### REQ-024.6: Evolution MCP Tools

Expose evolution capabilities via MCP.

```python
@mcp.tool()
async def evolve_behavior(
    behavior_id: str,
    max_generations: int = 10,
    target_fitness: float = 0.95,
) -> dict:
    """Manually trigger behavior evolution.

    Args:
        behavior_id: Behavior to evolve
        max_generations: Maximum evolution generations
        target_fitness: Target fitness score

    Returns:
        Evolution results with:
        - improved: Whether behavior improved
        - best_fitness: Final fitness score
        - generations_run: Number of generations
        - prompt_diff: Changes to prompt
    """

@mcp.tool()
async def get_evolution_history(
    behavior_id: str,
    limit: int = 10,
) -> dict:
    """Get evolution history for a behavior.

    Returns:
        List of evolution runs with:
        - timestamp
        - generations
        - fitness_improvement
        - prompt_changes
    """

@mcp.tool()
async def compare_prompt_versions(
    behavior_id: str,
    version_a: str,
    version_b: str,
) -> dict:
    """Compare two prompt versions.

    Returns:
        Comparison with:
        - diff: Text differences
        - fitness_comparison: Fitness scores
        - recommendation: Which version to use
    """

@mcp.tool()
async def get_evolution_status(
    behavior_id: str | None = None,
) -> dict:
    """Get status of evolution jobs.

    Args:
        behavior_id: Specific behavior, or all if None

    Returns:
        Status of pending/running evolution jobs
    """
```

**Acceptance Criteria:**
- [ ] Manual evolution trigger
- [ ] Evolution history access
- [ ] Version comparison
- [ ] Status monitoring

---

## Technical Design

### File Structure

```
src/draagon_forge/behaviors/
├── evolution/
│   ├── __init__.py
│   ├── engine.py         # BehaviorEvolutionEngine
│   ├── mutator.py        # PromptMutator
│   ├── fitness.py        # Fitness evaluation
│   ├── overfit.py        # OverfitDetector
│   └── triggers.py       # EvolutionTrigger
├── tracking/
│   ├── __init__.py
│   └── executions.py     # ExecutionTracker
└── ...
```

### Evolution Flow

```
Behavior Execution
        ↓
ExecutionTracker.record()
        ↓
EvolutionTrigger.should_evolve()
        ↓
    ┌───┴───┐
    No      Yes
    ↓        ↓
  Done   BehaviorEvolutionEngine.run_evolution()
                    ↓
            Generate Population
                    ↓
            ┌───────┴───────┐
            ↓               ↓
        Train Set      Holdout Set
            ↓               ↓
        Evaluate        Evaluate
            ↓               ↓
            └───────┬───────┘
                    ↓
            OverfitDetector.detect_overfit()
                    ↓
                ┌───┴───┐
             Overfit    OK
                ↓        ↓
             Reject   Select Best
                        ↓
                  Update Behavior
```

### Fitness Calculation

```python
def calculate_fitness(
    correctness: float,      # 0-1, primary metric
    execution_time: float,   # seconds
    token_count: int,        # total tokens used
    user_preference: float,  # -1 to 1 from feedback
) -> float:
    """Calculate overall fitness score.

    Weights:
    - Correctness: 0.6 (most important)
    - Efficiency: 0.2 (time + tokens)
    - User preference: 0.2 (when available)
    """
    efficiency = 1.0 - min(execution_time / 30.0, 1.0)  # Normalize to 30s max
    token_efficiency = 1.0 - min(token_count / 4000, 1.0)  # Normalize to 4k max

    fitness = (
        correctness * 0.6 +
        ((efficiency + token_efficiency) / 2) * 0.2 +
        ((user_preference + 1) / 2) * 0.2  # Normalize -1..1 to 0..1
    )

    return fitness
```

---

## Example: Migration Reviewer Evolution

### Initial State

```python
behavior = await mcp.call_tool("get_behavior", {"behavior_id": "migration_reviewer"})
# Fitness: 0.75 (catches 75% of issues)
```

### After 100 Executions

```python
# EvolutionTrigger fires: success_rate = 0.72 < 0.80 threshold

evolution_result = await mcp.call_tool("evolve_behavior", {
    "behavior_id": "migration_reviewer",
    "max_generations": 10,
})

# Result:
{
    "improved": True,
    "initial_fitness": 0.72,
    "best_fitness": 0.89,
    "generations_run": 7,
    "prompt_changes": [
        "Added explicit check for composite index ordering",
        "Clarified timeout threshold (5s → 10s for batch operations)",
        "Added example of problematic N+1 pattern",
    ],
    "holdout_fitness": 0.87,  # Close to train, no overfit
}
```

### Evolution History

```python
history = await mcp.call_tool("get_evolution_history", {
    "behavior_id": "migration_reviewer",
})

# Shows fitness improvement over time:
# v1.0: 0.75 → v1.1: 0.82 → v1.2: 0.89
```

---

## Testing

### Unit Tests

```python
class TestPromptMutator:
    """Test prompt mutation."""

    async def test_rephrase_preserves_meaning(self):
        """Rephrased prompts have same semantics."""

    async def test_elaborate_adds_detail(self):
        """Elaborated prompts are longer with examples."""

    async def test_crossover_combines_elements(self):
        """Crossover takes from both parents."""


class TestEvolutionEngine:
    """Test evolution algorithm."""

    async def test_fitness_improves_over_generations(self):
        """Fitness trends upward over evolution."""

    async def test_elite_preserved(self):
        """Top performers kept in next generation."""

    async def test_early_stopping(self):
        """Stops when no improvement."""


class TestOverfitDetection:
    """Test overfitting detection."""

    async def test_detects_train_holdout_gap(self):
        """Flags large train/holdout fitness gap."""

    async def test_rejects_overfit_candidate(self):
        """Overfit candidates not selected."""
```

### Integration Tests

```python
class TestEvolutionIntegration:
    """Integration tests for full evolution."""

    async def test_end_to_end_evolution(self):
        """Full evolution cycle produces improvement."""

    async def test_evolution_persisted(self):
        """Evolved prompts saved correctly."""

    async def test_automatic_trigger(self):
        """Evolution triggered by performance drop."""
```

---

## Acceptance Checklist

- [ ] Outcome tracking implemented
- [ ] Prompt mutation engine working
- [ ] Evolution engine with genetic algorithm
- [ ] Overfitting detection
- [ ] Automatic evolution triggers
- [ ] All 4 MCP tools implemented
- [ ] Evolution history tracked
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Demonstrated improvement on real behavior

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Mutations via LLM |
| XML Output Format | ✅ | Mutation prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Fitness tested on outcomes |

---

## References

- [draagon-ai: BEHAVIOR_SYSTEM_DESIGN.md](../../draagon-ai/docs/design/BEHAVIOR_SYSTEM_DESIGN.md)
- [REQ-023: Behavior Architect](./REQ-023-behavior-architect.md)
- [Promptbreeder Paper](https://arxiv.org/abs/2309.16797)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
