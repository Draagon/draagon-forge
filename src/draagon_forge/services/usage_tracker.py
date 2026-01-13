"""
Usage Tracker Service

Tracks token usage, model calls, and estimated costs for the current session.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# Model pricing in cents per 1M tokens (input/output)
# As of early 2026, approximate pricing
MODEL_PRICING: dict[str, dict[str, float]] = {
    # Groq (free tier)
    "llama-3.3-70b-versatile": {"input": 0, "output": 0},
    "llama-3.1-70b-versatile": {"input": 0, "output": 0},
    "llama-3.1-8b-instant": {"input": 0, "output": 0},
    "mixtral-8x7b-32768": {"input": 0, "output": 0},
    "gemma2-9b-it": {"input": 0, "output": 0},
    # Anthropic
    "claude-3-5-sonnet-20241022": {"input": 300, "output": 1500},
    "claude-3-5-sonnet-latest": {"input": 300, "output": 1500},
    "claude-3-5-haiku-20241022": {"input": 80, "output": 40},
    "claude-3-5-haiku-latest": {"input": 80, "output": 40},
    "claude-opus-4-20250514": {"input": 1500, "output": 7500},
    "claude-opus-4-latest": {"input": 1500, "output": 7500},
    "claude-sonnet-4-20250514": {"input": 300, "output": 1500},
    "claude-sonnet-4-latest": {"input": 300, "output": 1500},
    # OpenAI
    "gpt-4o": {"input": 250, "output": 1000},
    "gpt-4o-mini": {"input": 15, "output": 60},
    "gpt-4-turbo": {"input": 1000, "output": 3000},
    "o1": {"input": 1500, "output": 6000},
    "o1-mini": {"input": 300, "output": 1200},
}


@dataclass
class ModelUsage:
    """Usage statistics for a single model."""

    model_id: str
    provider: str
    call_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_cents: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "modelId": self.model_id,
            "provider": self.provider,
            "callCount": self.call_count,
            "promptTokens": self.prompt_tokens,
            "completionTokens": self.completion_tokens,
            "totalTokens": self.total_tokens,
            "estimatedCostCents": round(self.estimated_cost_cents, 2),
        }


@dataclass
class SessionUsage:
    """Usage statistics for the current session."""

    session_id: str
    user_id: str
    started_at: datetime
    models: dict[str, ModelUsage] = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        """Total tokens across all models."""
        return sum(m.total_tokens for m in self.models.values())

    @property
    def total_prompt_tokens(self) -> int:
        """Total prompt tokens across all models."""
        return sum(m.prompt_tokens for m in self.models.values())

    @property
    def total_completion_tokens(self) -> int:
        """Total completion tokens across all models."""
        return sum(m.completion_tokens for m in self.models.values())

    @property
    def total_cost_cents(self) -> float:
        """Total estimated cost in cents."""
        return sum(m.estimated_cost_cents for m in self.models.values())

    @property
    def total_calls(self) -> int:
        """Total API calls across all models."""
        return sum(m.call_count for m in self.models.values())

    def record_usage(
        self,
        model_id: str,
        provider: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> None:
        """Record usage for a model call."""
        if model_id not in self.models:
            self.models[model_id] = ModelUsage(model_id=model_id, provider=provider)

        usage = self.models[model_id]
        usage.call_count += 1
        usage.prompt_tokens += prompt_tokens
        usage.completion_tokens += completion_tokens
        usage.total_tokens += prompt_tokens + completion_tokens
        usage.estimated_cost_cents += _estimate_cost(
            model_id, prompt_tokens, completion_tokens
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "sessionId": self.session_id,
            "userId": self.user_id,
            "startedAt": self.started_at.isoformat(),
            "durationSeconds": (datetime.utcnow() - self.started_at).total_seconds(),
            "totalTokens": self.total_tokens,
            "totalPromptTokens": self.total_prompt_tokens,
            "totalCompletionTokens": self.total_completion_tokens,
            "totalCostCents": round(self.total_cost_cents, 2),
            "totalCalls": self.total_calls,
            "models": {k: v.to_dict() for k, v in self.models.items()},
        }


def _estimate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate cost in cents for a model call."""
    # Normalize model ID for lookup
    model_key = model_id.lower()

    # Check exact match
    if model_key in MODEL_PRICING:
        pricing = MODEL_PRICING[model_key]
    else:
        # Try partial match
        pricing = None
        for key, price in MODEL_PRICING.items():
            if key in model_key or model_key in key:
                pricing = price
                break

        if pricing is None:
            # Default to Sonnet-like pricing for unknown models
            pricing = {"input": 300, "output": 1500}

    # Calculate cost (pricing is per 1M tokens)
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]

    return input_cost + output_cost


class UsageTracker:
    """
    Singleton tracker for session usage.

    Usage:
        # Record usage
        await UsageTracker.record("claude-3-5-sonnet", "anthropic", 500, 200, "doug")

        # Get session data
        session = UsageTracker.get_session("doug")

        # Reset session
        UsageTracker.reset()
    """

    _current_session: SessionUsage | None = None

    @classmethod
    def get_session(cls, user_id: str) -> SessionUsage:
        """Get or create the current session."""
        if cls._current_session is None:
            cls._current_session = SessionUsage(
                session_id=str(uuid.uuid4())[:8],
                user_id=user_id,
                started_at=datetime.utcnow(),
            )
        return cls._current_session

    @classmethod
    async def record(
        cls,
        model_id: str,
        provider: str,
        prompt_tokens: int,
        completion_tokens: int,
        user_id: str,
    ) -> None:
        """Record usage for a model call."""
        session = cls.get_session(user_id)
        session.record_usage(model_id, provider, prompt_tokens, completion_tokens)

        # Emit event for Inspector
        try:
            from draagon_forge.api.events import EventType, emit_event

            await emit_event(
                EventType.SYSTEM_USAGE,
                {
                    "model": model_id,
                    "provider": provider,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                    "session_total_tokens": session.total_tokens,
                    "session_cost_cents": round(session.total_cost_cents, 2),
                },
                source="api",
                user_id=user_id,
            )
        except Exception as e:
            # Don't fail on event emission errors
            print(f"Warning: Failed to emit usage event: {e}")

    @classmethod
    def reset(cls) -> None:
        """Reset the current session."""
        cls._current_session = None

    @classmethod
    def get_summary(cls, user_id: str) -> dict[str, Any]:
        """Get a summary of session usage."""
        session = cls.get_session(user_id)
        return session.to_dict()
