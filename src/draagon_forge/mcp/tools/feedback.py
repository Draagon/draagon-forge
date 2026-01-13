"""Feedback loop tool for reinforcement learning."""

from datetime import datetime
import structlog
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.config import config

logger = structlog.get_logger(__name__)


async def report_outcome(
    context_ids: list[str],
    outcome: str,  # "helpful" | "not_helpful" | "misleading" | "outdated"
    reason: str | None = None,
) -> dict:
    """Report how helpful retrieved context was.

    This is the core feedback loop that adjusts conviction scores based
    on whether context was useful. Always call this after using context
    from search_context or other retrieval tools.

    Args:
        context_ids: List of context IDs that were used
        outcome: How helpful the context was
        reason: Optional explanation of the outcome

    Returns:
        Summary of conviction updates

    Examples:
        Report helpful context:
        >>> result = await report_outcome(
        ...     context_ids=["belief-001", "principle-042"],
        ...     outcome="helpful",
        ...     reason="Helped avoid a common pitfall"
        ... )

        Report misleading context:
        >>> result = await report_outcome(
        ...     context_ids=["belief-003"],
        ...     outcome="misleading",
        ...     reason="Principle is outdated after library upgrade"
        ... )
    """
    logger.info(
        "Reporting outcome",
        context_ids=context_ids,
        outcome=outcome,
        reason=reason,
    )

    memory = get_memory()
    updates = []

    # Determine conviction delta based on outcome
    delta_map = {
        "helpful": config.feedback_helpful_delta,
        "not_helpful": config.feedback_not_helpful_delta,
        "misleading": config.feedback_misleading_delta,
        "outdated": config.feedback_outdated_delta,
    }

    delta = delta_map.get(outcome, 0.0)

    for context_id in context_ids:
        # Try to get as belief first
        belief = await memory.get_belief(context_id)

        if belief:
            old_conviction = belief.conviction
            belief.conviction = max(0.0, min(1.0, belief.conviction + delta))
            belief.usage_count += 1
            belief.updated_at = datetime.now()

            await memory.update_belief(belief)

            updates.append(
                {
                    "id": context_id,
                    "type": "belief",
                    "old_conviction": old_conviction,
                    "new_conviction": belief.conviction,
                    "delta": delta,
                }
            )

            # Flag for review if conviction drops below threshold or is misleading
            if outcome == "misleading" or belief.conviction < config.min_conviction_threshold:
                from draagon_forge.mcp.models import ReviewItem
                import uuid

                review_item = ReviewItem(
                    id=f"review-{uuid.uuid4().hex[:8]}",
                    type="misleading" if outcome == "misleading" else "low_conviction",
                    content=belief.content,
                    reason=reason or f"Conviction dropped to {belief.conviction:.2f}",
                    flagged_at=datetime.now(),
                )
                await memory.store_review_item(review_item)
                updates[-1]["flagged_for_review"] = True

    return {
        "outcome": outcome,
        "updates": updates,
        "total_updated": len(updates),
        "reason": reason,
    }
