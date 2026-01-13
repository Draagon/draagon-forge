# REQ-028: Multi-Model Cost Optimization

**Priority:** P0
**Effort:** Medium (6 days)
**Dependencies:** REQ-001, REQ-027
**Blocks:** None

---

## Overview

Implement a tiered LLM routing system that uses fast, cheap models (Groq/Llama) for simple tasks and reserves expensive models (Claude Sonnet/Opus) for complex analysis. This achieves significant cost reduction (~90%) while maintaining quality where it matters.

### The Cost Challenge

LLM API costs can be significant at scale:

| Model | Input Cost | Output Cost | Speed | Use Case |
|-------|------------|-------------|-------|----------|
| Llama 3.3 70B (Groq) | ~$0.59/M | ~$0.79/M | 250+ tok/s | Simple classification, extraction |
| Claude Sonnet | ~$3/M | ~$15/M | ~80 tok/s | Complex analysis, code review |
| Claude Opus | ~$15/M | ~$75/M | ~40 tok/s | Critical decisions, architecture |

**Cost Difference:** Groq is ~50-100x cheaper than Claude for equivalent tasks.

### The Solution: Tiered Model Routing

Route tasks to the cheapest model capable of handling them:

| Tier | Model | % of Tasks | Use Case |
|------|-------|------------|----------|
| LOCAL | Ollama (mxbai-embed) | Embeddings | Vector embeddings only |
| FAST | Groq Llama 3.3 70B | ~80% | Simple analysis, classification |
| BALANCED | Claude Sonnet | ~15% | Complex code review, planning |
| PREMIUM | Claude Opus | ~5% | Critical architecture, security |

### Key Principle

> "Use the cheapest model that can do the job well."

Simple tasks (intent classification, simple extraction) go to Groq. Complex tasks (code review, architecture) go to Claude. Critical tasks (security, breaking changes) go to Opus.

---

## Requirements

### REQ-028.1: Model Tier System

Define the tiered model system with clear boundaries.

```python
from enum import Enum
from dataclasses import dataclass
from typing import Protocol

class ModelTier(Enum):
    """LLM model tiers by capability and cost."""
    LOCAL = "local"       # Ollama - embeddings, simple tasks
    FAST = "fast"         # Groq - cheap, fast inference
    BALANCED = "balanced" # Claude Sonnet - quality/cost balance
    PREMIUM = "premium"   # Claude Opus - maximum capability
    FLAGSHIP = "flagship" # Reserved for future models


@dataclass
class ModelConfig:
    """Configuration for a specific model."""
    tier: ModelTier
    provider: str        # "groq" | "anthropic" | "ollama"
    model_id: str        # "llama-3.3-70b-versatile" | "claude-sonnet-4-20250514"
    max_tokens: int
    supports_tools: bool
    supports_vision: bool
    cost_per_1k_input: float   # USD
    cost_per_1k_output: float  # USD
    avg_tokens_per_second: int


# Default model configurations
MODEL_CONFIGS: dict[ModelTier, ModelConfig] = {
    ModelTier.LOCAL: ModelConfig(
        tier=ModelTier.LOCAL,
        provider="ollama",
        model_id="mxbai-embed-large",
        max_tokens=512,
        supports_tools=False,
        supports_vision=False,
        cost_per_1k_input=0.0,
        cost_per_1k_output=0.0,
        avg_tokens_per_second=1000,
    ),
    ModelTier.FAST: ModelConfig(
        tier=ModelTier.FAST,
        provider="groq",
        model_id="llama-3.3-70b-versatile",
        max_tokens=8192,
        supports_tools=True,
        supports_vision=False,
        cost_per_1k_input=0.00059,
        cost_per_1k_output=0.00079,
        avg_tokens_per_second=250,
    ),
    ModelTier.BALANCED: ModelConfig(
        tier=ModelTier.BALANCED,
        provider="anthropic",
        model_id="claude-sonnet-4-20250514",
        max_tokens=8192,
        supports_tools=True,
        supports_vision=True,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        avg_tokens_per_second=80,
    ),
    ModelTier.PREMIUM: ModelConfig(
        tier=ModelTier.PREMIUM,
        provider="anthropic",
        model_id="claude-opus-4-20250514",
        max_tokens=8192,
        supports_tools=True,
        supports_vision=True,
        cost_per_1k_input=0.015,
        cost_per_1k_output=0.075,
        avg_tokens_per_second=40,
    ),
}


class LLMProvider(Protocol):
    """Protocol for LLM providers."""

    async def complete(
        self,
        messages: list[dict],
        max_tokens: int = 1024,
        temperature: float = 0.7,
        tools: list[dict] | None = None,
    ) -> dict:
        """Generate a completion."""
        ...

    @property
    def config(self) -> ModelConfig:
        """Get the model configuration."""
        ...
```

**Acceptance Criteria:**
- [ ] `ModelTier` enum defines all tiers
- [ ] `ModelConfig` captures all relevant model properties
- [ ] Default configs cover Groq, Claude Sonnet, Claude Opus
- [ ] `LLMProvider` protocol allows swappable implementations

### REQ-028.2: Task Complexity Classification

Classify tasks by complexity to route to appropriate model.

```python
from dataclasses import dataclass

@dataclass
class TaskClassification:
    """Classification result for routing."""
    task_type: str           # "classification" | "extraction" | "analysis" | "generation" | "decision"
    complexity: float        # 0.0 - 1.0
    requires_reasoning: bool # Deep chain-of-thought needed
    requires_tools: bool     # Tool use required
    requires_vision: bool    # Image analysis required
    domain_specificity: float  # 0.0 = general, 1.0 = highly specialized
    risk_level: str          # "low" | "medium" | "high" | "critical"
    recommended_tier: ModelTier


class TaskClassifier:
    """Classifies tasks for model routing."""

    # Task type patterns and their base complexity
    TASK_PATTERNS: dict[str, tuple[float, bool]] = {
        # (base_complexity, requires_reasoning)
        "classify": (0.2, False),
        "extract": (0.3, False),
        "summarize": (0.4, False),
        "analyze": (0.6, True),
        "review": (0.7, True),
        "plan": (0.8, True),
        "architect": (0.9, True),
        "security": (0.85, True),  # Always higher due to risk
    }

    # Domain risk levels
    DOMAIN_RISK: dict[str, str] = {
        "general": "low",
        "testing": "low",
        "documentation": "low",
        "refactoring": "medium",
        "performance": "medium",
        "code-review": "medium",
        "architecture": "high",
        "security": "critical",
        "production": "critical",
    }

    async def classify(
        self,
        task: str,
        context: dict | None = None,
    ) -> TaskClassification:
        """Classify a task for model routing.

        Uses heuristics first, then LLM validation if uncertain.

        Args:
            task: The task description
            context: Additional context (domain, files, etc.)

        Returns:
            Classification with recommended tier
        """
        # 1. Extract task type from keywords
        task_lower = task.lower()
        task_type = "analysis"  # default
        base_complexity = 0.5
        requires_reasoning = True

        for pattern, (complexity, reasoning) in self.TASK_PATTERNS.items():
            if pattern in task_lower:
                task_type = pattern
                base_complexity = complexity
                requires_reasoning = reasoning
                break

        # 2. Adjust for domain
        domain = context.get("domain", "general") if context else "general"
        risk_level = self.DOMAIN_RISK.get(domain, "medium")

        # Risk escalates complexity
        risk_multiplier = {
            "low": 1.0,
            "medium": 1.1,
            "high": 1.3,
            "critical": 1.5,
        }
        complexity = min(1.0, base_complexity * risk_multiplier[risk_level])

        # 3. Check for special requirements
        requires_tools = any(word in task_lower for word in ["run", "execute", "test", "build"])
        requires_vision = any(word in task_lower for word in ["image", "screenshot", "diagram", "visual"])

        # 4. Determine recommended tier
        if requires_vision:
            recommended_tier = ModelTier.BALANCED  # Only Claude supports vision
        elif risk_level == "critical":
            recommended_tier = ModelTier.PREMIUM
        elif complexity >= 0.7 or requires_reasoning:
            recommended_tier = ModelTier.BALANCED
        elif complexity >= 0.4:
            recommended_tier = ModelTier.FAST
        else:
            recommended_tier = ModelTier.FAST

        return TaskClassification(
            task_type=task_type,
            complexity=complexity,
            requires_reasoning=requires_reasoning,
            requires_tools=requires_tools,
            requires_vision=requires_vision,
            domain_specificity=0.5,  # Could be refined with domain analysis
            risk_level=risk_level,
            recommended_tier=recommended_tier,
        )
```

**Acceptance Criteria:**
- [ ] `TaskClassifier` assigns complexity scores
- [ ] Security/critical tasks always route to higher tiers
- [ ] Vision requirements route to Claude (not Groq)
- [ ] Simple classification/extraction routes to FAST tier

### REQ-028.3: Cost-Optimized Router

Route tasks to the appropriate model based on classification.

```python
from dataclasses import dataclass, field
from typing import Callable
import asyncio

@dataclass
class RoutingDecision:
    """Result of routing decision."""
    tier: ModelTier
    model_config: ModelConfig
    reason: str
    estimated_cost: float
    fallback_tier: ModelTier | None = None


@dataclass
class RoutingMetrics:
    """Track routing statistics."""
    total_requests: int = 0
    requests_by_tier: dict[ModelTier, int] = field(default_factory=dict)
    escalations: int = 0
    total_cost: float = 0.0
    cost_by_tier: dict[ModelTier, float] = field(default_factory=dict)


class CostOptimizedRouter:
    """Routes tasks to the most cost-effective model."""

    def __init__(
        self,
        classifier: TaskClassifier,
        providers: dict[ModelTier, LLMProvider],
        metrics: RoutingMetrics | None = None,
    ):
        self.classifier = classifier
        self.providers = providers
        self.metrics = metrics or RoutingMetrics()

    async def route(
        self,
        task: str,
        context: dict | None = None,
        min_tier: ModelTier | None = None,
        max_tier: ModelTier | None = None,
    ) -> RoutingDecision:
        """Route a task to the appropriate model.

        Args:
            task: The task to route
            context: Additional context
            min_tier: Minimum tier to use (override)
            max_tier: Maximum tier to use (cost control)

        Returns:
            Routing decision with selected model
        """
        # 1. Classify the task
        classification = await self.classifier.classify(task, context)

        # 2. Determine tier
        tier = classification.recommended_tier

        # Apply constraints
        if min_tier and tier.value < min_tier.value:
            tier = min_tier
        if max_tier and tier.value > max_tier.value:
            tier = max_tier

        # 3. Get model config
        config = MODEL_CONFIGS[tier]

        # 4. Calculate estimated cost (rough, based on task length)
        estimated_tokens = len(task.split()) * 2  # rough estimate
        estimated_cost = (
            estimated_tokens * config.cost_per_1k_input / 1000 +
            estimated_tokens * config.cost_per_1k_output / 1000
        )

        # 5. Determine fallback
        fallback = None
        if tier != ModelTier.PREMIUM:
            tier_order = [ModelTier.FAST, ModelTier.BALANCED, ModelTier.PREMIUM]
            current_idx = tier_order.index(tier) if tier in tier_order else 0
            if current_idx < len(tier_order) - 1:
                fallback = tier_order[current_idx + 1]

        # 6. Update metrics
        self.metrics.total_requests += 1
        self.metrics.requests_by_tier[tier] = self.metrics.requests_by_tier.get(tier, 0) + 1

        return RoutingDecision(
            tier=tier,
            model_config=config,
            reason=f"Task type '{classification.task_type}' with complexity {classification.complexity:.2f}, risk '{classification.risk_level}'",
            estimated_cost=estimated_cost,
            fallback_tier=fallback,
        )

    async def execute(
        self,
        task: str,
        messages: list[dict],
        context: dict | None = None,
        **kwargs,
    ) -> dict:
        """Route and execute a task.

        Includes automatic escalation on low-confidence responses.

        Args:
            task: The task description
            messages: The messages to send
            context: Additional context
            **kwargs: Additional completion kwargs

        Returns:
            Completion result
        """
        # 1. Route
        decision = await self.route(task, context)
        provider = self.providers[decision.tier]

        # 2. Execute
        result = await provider.complete(messages, **kwargs)

        # 3. Check for escalation needs
        confidence = self._extract_confidence(result)
        if confidence < 0.6 and decision.fallback_tier:
            self.metrics.escalations += 1
            fallback_provider = self.providers[decision.fallback_tier]
            result = await fallback_provider.complete(messages, **kwargs)
            decision.tier = decision.fallback_tier

        # 4. Track cost
        actual_cost = self._calculate_cost(result, decision.model_config)
        self.metrics.total_cost += actual_cost
        self.metrics.cost_by_tier[decision.tier] = (
            self.metrics.cost_by_tier.get(decision.tier, 0) + actual_cost
        )

        return result

    def _extract_confidence(self, result: dict) -> float:
        """Extract confidence from result (model-specific)."""
        # Check for explicit confidence in response
        content = result.get("content", "")
        if "uncertain" in content.lower() or "not sure" in content.lower():
            return 0.4
        if "confident" in content.lower() or "certain" in content.lower():
            return 0.9
        return 0.7  # default

    def _calculate_cost(self, result: dict, config: ModelConfig) -> float:
        """Calculate actual cost from usage."""
        usage = result.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        return (
            input_tokens * config.cost_per_1k_input / 1000 +
            output_tokens * config.cost_per_1k_output / 1000
        )

    def get_cost_report(self) -> dict:
        """Get cost optimization report."""
        return {
            "total_requests": self.metrics.total_requests,
            "requests_by_tier": {
                tier.value: count
                for tier, count in self.metrics.requests_by_tier.items()
            },
            "escalations": self.metrics.escalations,
            "escalation_rate": (
                self.metrics.escalations / self.metrics.total_requests
                if self.metrics.total_requests > 0 else 0
            ),
            "total_cost": self.metrics.total_cost,
            "cost_by_tier": {
                tier.value: cost
                for tier, cost in self.metrics.cost_by_tier.items()
            },
            "estimated_savings": self._estimate_savings(),
        }

    def _estimate_savings(self) -> dict:
        """Estimate savings vs using premium for everything."""
        premium_config = MODEL_CONFIGS[ModelTier.PREMIUM]
        fast_config = MODEL_CONFIGS[ModelTier.FAST]

        # If all requests went to premium
        if_all_premium = self.metrics.total_cost * (
            premium_config.cost_per_1k_output / fast_config.cost_per_1k_output
        )

        return {
            "if_all_premium": if_all_premium,
            "actual_cost": self.metrics.total_cost,
            "savings": if_all_premium - self.metrics.total_cost,
            "savings_percent": (
                (if_all_premium - self.metrics.total_cost) / if_all_premium * 100
                if if_all_premium > 0 else 0
            ),
        }
```

**Acceptance Criteria:**
- [ ] Router classifies and routes tasks
- [ ] Automatic escalation on low confidence
- [ ] Cost tracking per tier
- [ ] Savings report calculation

### REQ-028.4: MCP Integration

Expose model routing via MCP tools.

```python
@mcp.tool()
async def select_model(
    task: str,
    domain: str | None = None,
    min_tier: str | None = None,  # "fast" | "balanced" | "premium"
    max_tier: str | None = None,
) -> dict:
    """Select the optimal model for a task.

    Uses cost-optimized routing to choose the cheapest
    model capable of handling the task well.

    Args:
        task: Description of the task
        domain: Domain hint (security, testing, etc.)
        min_tier: Minimum model tier to use
        max_tier: Maximum model tier (for cost control)

    Returns:
        Recommended model with reasoning
    """
    context = {"domain": domain} if domain else None

    decision = await router.route(
        task=task,
        context=context,
        min_tier=ModelTier[min_tier.upper()] if min_tier else None,
        max_tier=ModelTier[max_tier.upper()] if max_tier else None,
    )

    return {
        "tier": decision.tier.value,
        "provider": decision.model_config.provider,
        "model_id": decision.model_config.model_id,
        "reason": decision.reason,
        "estimated_cost": decision.estimated_cost,
        "fallback_tier": decision.fallback_tier.value if decision.fallback_tier else None,
    }


@mcp.tool()
async def analyze_with_routing(
    content: str,
    task: str,
    domain: str | None = None,
) -> dict:
    """Analyze content using cost-optimized model routing.

    Automatically selects the appropriate model tier
    based on task complexity and domain.

    Args:
        content: The content to analyze
        task: What analysis to perform
        domain: Domain hint

    Returns:
        Analysis result with model info
    """
    # 1. Route to appropriate model
    decision = await router.route(task, {"domain": domain})

    # 2. Build messages
    messages = [
        {"role": "system", "content": f"You are an expert at {task}. Analyze the following content."},
        {"role": "user", "content": content},
    ]

    # 3. Execute with routing
    result = await router.execute(task, messages, {"domain": domain})

    return {
        "analysis": result.get("content", ""),
        "model_used": {
            "tier": decision.tier.value,
            "model_id": decision.model_config.model_id,
        },
        "cost": router.metrics.cost_by_tier.get(decision.tier, 0),
    }


@mcp.tool()
async def get_routing_stats() -> dict:
    """Get cost optimization statistics.

    Shows how requests are being routed and estimated savings.

    Returns:
        Routing statistics and cost report
    """
    return router.get_cost_report()


@mcp.tool()
async def set_tier_preference(
    default_min_tier: str | None = None,
    default_max_tier: str | None = None,
    domain_overrides: dict[str, str] | None = None,
) -> dict:
    """Configure tier preferences for routing.

    Allows setting defaults and per-domain overrides.

    Args:
        default_min_tier: Default minimum tier
        default_max_tier: Default maximum tier
        domain_overrides: Domain-specific tier overrides

    Returns:
        Updated configuration
    """
    config = {
        "default_min_tier": default_min_tier,
        "default_max_tier": default_max_tier,
        "domain_overrides": domain_overrides or {},
    }

    # Store in memory for future routing decisions
    await memory.store_config("tier_preferences", config)

    return {
        "updated": True,
        "config": config,
    }
```

**Acceptance Criteria:**
- [ ] `select_model` returns optimal tier for task
- [ ] `analyze_with_routing` uses automatic routing
- [ ] `get_routing_stats` shows cost savings
- [ ] `set_tier_preference` allows configuration

### REQ-028.5: Escalation Patterns

Implement smart escalation for uncertain responses.

```python
@dataclass
class EscalationConfig:
    """Configuration for escalation behavior."""
    confidence_threshold: float = 0.6  # Below this, escalate
    max_escalations: int = 2           # Don't escalate more than this
    escalation_path: list[ModelTier] = field(
        default_factory=lambda: [ModelTier.FAST, ModelTier.BALANCED, ModelTier.PREMIUM]
    )


class EscalationManager:
    """Manages model escalation for uncertain responses."""

    def __init__(self, config: EscalationConfig, providers: dict[ModelTier, LLMProvider]):
        self.config = config
        self.providers = providers

    async def execute_with_escalation(
        self,
        messages: list[dict],
        starting_tier: ModelTier,
        require_confidence: float | None = None,
    ) -> dict:
        """Execute with automatic escalation.

        Tries cheaper model first, escalates if response
        confidence is below threshold.

        Args:
            messages: Messages to send
            starting_tier: Initial tier to try
            require_confidence: Override confidence threshold

        Returns:
            Final result with escalation info
        """
        threshold = require_confidence or self.config.confidence_threshold
        current_tier = starting_tier
        escalations = 0
        attempts = []

        while True:
            provider = self.providers[current_tier]
            result = await provider.complete(messages)

            confidence = self._assess_confidence(result)
            attempts.append({
                "tier": current_tier.value,
                "confidence": confidence,
            })

            # Check if good enough
            if confidence >= threshold:
                return {
                    **result,
                    "final_tier": current_tier.value,
                    "escalations": escalations,
                    "attempts": attempts,
                }

            # Check if can escalate
            if escalations >= self.config.max_escalations:
                return {
                    **result,
                    "final_tier": current_tier.value,
                    "escalations": escalations,
                    "attempts": attempts,
                    "warning": "Max escalations reached, confidence still low",
                }

            # Escalate
            next_tier = self._get_next_tier(current_tier)
            if next_tier is None:
                return {
                    **result,
                    "final_tier": current_tier.value,
                    "escalations": escalations,
                    "attempts": attempts,
                    "warning": "No higher tier available",
                }

            current_tier = next_tier
            escalations += 1

    def _assess_confidence(self, result: dict) -> float:
        """Assess response confidence.

        Uses multiple signals:
        - Explicit confidence markers in text
        - Response coherence
        - Hedging language detection
        """
        content = result.get("content", "").lower()

        # Check for low confidence signals
        low_confidence_markers = [
            "i'm not sure",
            "uncertain",
            "might be",
            "possibly",
            "i think",
            "could be",
            "maybe",
        ]

        high_confidence_markers = [
            "definitely",
            "certainly",
            "clearly",
            "the answer is",
            "i'm confident",
        ]

        low_count = sum(1 for m in low_confidence_markers if m in content)
        high_count = sum(1 for m in high_confidence_markers if m in content)

        # Base confidence with adjustments
        base = 0.7
        confidence = base - (low_count * 0.1) + (high_count * 0.1)

        return max(0.1, min(1.0, confidence))

    def _get_next_tier(self, current: ModelTier) -> ModelTier | None:
        """Get the next tier in escalation path."""
        path = self.config.escalation_path
        try:
            idx = path.index(current)
            if idx < len(path) - 1:
                return path[idx + 1]
        except ValueError:
            pass
        return None
```

**Acceptance Criteria:**
- [ ] Escalation triggers on low confidence
- [ ] Max escalation limit respected
- [ ] Confidence assessment uses multiple signals
- [ ] Escalation path is configurable

---

## Technical Design

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TASK ROUTING FLOW                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    1. Task Classification                            │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │    │
│  │  │ Extract Type │→│ Assess Risk  │→│ Calculate Complexity      │   │    │
│  │  │ (classify,   │  │ (domain,     │  │ (base + risk multiplier) │   │    │
│  │  │  analyze...) │  │  critical?)  │  │                          │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    2. Tier Selection                                 │    │
│  │  complexity < 0.4 ──────────→ FAST (Groq Llama)                     │    │
│  │  complexity 0.4-0.7 ────────→ FAST with fallback                    │    │
│  │  complexity 0.7-0.9 ────────→ BALANCED (Claude Sonnet)              │    │
│  │  risk == "critical" ────────→ PREMIUM (Claude Opus)                 │    │
│  │  requires_vision ───────────→ BALANCED+ (Claude only)               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    3. Execute with Escalation                        │    │
│  │  ┌───────────┐      ┌─────────────────┐      ┌──────────────────┐   │    │
│  │  │ Execute   │─────→│ Assess Response │─────→│ Escalate if      │   │    │
│  │  │ at Tier   │      │ Confidence      │      │ confidence < 0.6 │   │    │
│  │  └───────────┘      └─────────────────┘      └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    4. Track & Report                                 │    │
│  │  • Requests by tier     • Cost by tier      • Escalation rate       │    │
│  │  • Total cost           • Estimated savings vs all-premium          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/draagon_forge/llm/
├── __init__.py
├── models.py           # REQ-028.1: ModelTier, ModelConfig, LLMProvider
├── classifier.py       # REQ-028.2: TaskClassifier, TaskClassification
├── router.py           # REQ-028.3: CostOptimizedRouter, RoutingMetrics
├── escalation.py       # REQ-028.5: EscalationManager, EscalationConfig
└── providers/
    ├── __init__.py
    ├── groq.py         # Groq provider implementation
    ├── anthropic.py    # Claude provider implementation
    └── ollama.py       # Ollama provider implementation

src/draagon_forge/mcp/tools/
├── routing.py          # REQ-028.4: select_model, analyze_with_routing
```

### Expected Cost Distribution

| Tier | % Requests | Avg Cost/Request | Use Cases |
|------|------------|------------------|-----------|
| FAST | 80% | $0.0001 | Classification, extraction, simple analysis |
| BALANCED | 15% | $0.002 | Code review, planning, complex analysis |
| PREMIUM | 5% | $0.01 | Security review, architecture decisions |

**Total Cost Reduction:** ~90% vs using Claude for everything.

---

## Testing

### Unit Tests

- Test task classification accuracy
- Test tier selection logic
- Test escalation triggers
- Test cost calculation

### Integration Tests

- Test Groq provider
- Test Claude provider
- Test full routing flow
- Test escalation path

### Acceptance Tests

- Simple tasks route to FAST tier
- Security tasks route to PREMIUM tier
- Low confidence triggers escalation
- Cost tracking is accurate

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cost reduction vs baseline | >80% | Compare to all-Claude costs |
| FAST tier usage | >70% | Requests routed to Groq |
| Escalation rate | <20% | Requests needing escalation |
| Quality maintenance | >95% | Tasks completed successfully |
| Routing latency | <50ms | Time to route decision |

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Task classification uses LLM intelligence |
| Protocol-Based Design | ✅ | LLMProvider protocol for swappable backends |
| Async-First Processing | ✅ | All I/O async |
| Test Outcomes | ✅ | Quality validation after routing |

---

## Configuration

### Environment Variables

```bash
# Groq (FAST tier)
GROQ_API_KEY=gsk_...

# Anthropic (BALANCED/PREMIUM tiers)
ANTHROPIC_API_KEY=sk-ant-...

# Tier preferences
DRAAGON_DEFAULT_MIN_TIER=fast
DRAAGON_DEFAULT_MAX_TIER=premium
DRAAGON_SECURITY_MIN_TIER=balanced  # Security always uses at least Sonnet
```

### VS Code Settings

```json
{
    "draagon-forge.llm.defaultMinTier": "fast",
    "draagon-forge.llm.defaultMaxTier": "premium",
    "draagon-forge.llm.domainOverrides": {
        "security": "balanced",
        "architecture": "balanced"
    },
    "draagon-forge.llm.escalationThreshold": 0.6
}
```

---

## References

- [Groq API Documentation](https://console.groq.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [LLM Cost Comparison](https://artificialanalysis.ai/)
- [REQ-027: Claude Code Integration](./REQ-027-claude-code-integration.md)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
