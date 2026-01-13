"""Review queue management tools."""

from datetime import datetime
import structlog
from draagon_forge.mcp.memory import get_memory

logger = structlog.get_logger(__name__)


async def get_review_queue() -> list[dict]:
    """Get items flagged for human review.

    Items are flagged when:
    - Context is marked as misleading
    - Conviction drops below minimum threshold
    - Conflicts are detected between principles

    Returns:
        List of review items with:
        - id: Unique identifier
        - type: misleading | outdated | conflict | low_conviction
        - content: The content to review
        - reason: Why it was flagged
        - flagged_at: When it was flagged

    Examples:
        >>> queue = await get_review_queue()
        >>> print(f"Found {len(queue)} items needing review")
    """
    logger.debug("Getting review queue")

    memory = get_memory()
    items = await memory.get_review_queue()

    return [
        {
            "id": item.id,
            "type": item.type,
            "content": item.content,
            "reason": item.reason,
            "flagged_at": item.flagged_at.isoformat(),
            "resolved": item.resolved,
        }
        for item in items
    ]


async def resolve_review(
    item_id: str,
    decision: str,  # "keep" | "remove" | "update"
    reason: str | None = None,
) -> dict:
    """Resolve a flagged review item.

    Args:
        item_id: ID of the review item
        decision: Decision made (keep, remove, update)
        reason: Optional reason for the decision

    Returns:
        Resolution confirmation

    Examples:
        Keep a flagged item:
        >>> result = await resolve_review(
        ...     item_id="review-001",
        ...     decision="keep",
        ...     reason="Still valid, just low usage"
        ... )

        Remove misleading content:
        >>> result = await resolve_review(
        ...     item_id="review-002",
        ...     decision="remove",
        ...     reason="Outdated after library upgrade"
        ... )
    """
    logger.info("Resolving review item", item_id=item_id, decision=decision)

    memory = get_memory()
    item = await memory.resolve_review_item(item_id, f"{decision}: {reason or 'No reason provided'}")

    if not item:
        return {"status": "error", "message": f"Review item {item_id} not found"}

    # If decision is to remove, delete the underlying belief
    if decision == "remove":
        # Extract belief ID from content or metadata
        # For now, just mark as resolved
        pass

    return {
        "status": "resolved",
        "item_id": item_id,
        "decision": decision,
        "reason": reason,
        "resolved_at": item.resolved_at.isoformat() if item.resolved_at else None,
    }
