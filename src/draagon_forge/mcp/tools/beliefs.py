"""Belief management tools."""

from datetime import datetime
import uuid
import structlog
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.models import Belief
from draagon_forge.mcp.config import config

logger = structlog.get_logger(__name__)


async def query_beliefs(
    query: str,
    category: str | None = None,
    min_conviction: float | None = None,
    limit: int = 10,
) -> list[dict]:
    """Query stored beliefs.

    Args:
        query: Search query
        category: Optional category filter
        min_conviction: Minimum conviction threshold
        limit: Maximum results

    Returns:
        List of matching beliefs

    Examples:
        >>> beliefs = await query_beliefs("error handling", min_conviction=0.7)
    """
    logger.debug(
        "Querying beliefs",
        query=query,
        category=category,
        min_conviction=min_conviction,
    )

    memory = get_memory()
    results = await memory.search(
        query=query,
        limit=limit,
        min_conviction=min_conviction,
    )

    # Filter to beliefs only
    beliefs = [r for r in results if r.type == "belief"]

    # Apply category filter if provided
    if category:
        belief_ids = [b.id for b in beliefs]
        filtered_beliefs = []
        for belief_id in belief_ids:
            belief = await memory.get_belief(belief_id)
            if belief and belief.category == category:
                filtered_beliefs.append(belief)
        return [
            {
                "id": b.id,
                "content": b.content,
                "conviction": b.conviction,
                "category": b.category,
                "domain": b.domain,
                "source": b.source,
                "usage_count": b.usage_count,
                "created_at": b.created_at.isoformat(),
                "updated_at": b.updated_at.isoformat(),
                "metadata": b.metadata,
            }
            for b in filtered_beliefs
        ]

    return [
        {
            "id": b.id,
            "content": b.content,
            "score": b.score,
            "conviction": b.conviction,
            "source": b.source,
            "metadata": b.metadata,
        }
        for b in beliefs
    ]


async def adjust_belief(
    belief_id: str,
    action: str,  # "reinforce" | "weaken" | "modify" | "delete"
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust a belief based on user feedback.

    Args:
        belief_id: ID of the belief to adjust
        action: Action to take (reinforce, weaken, modify, delete)
        new_content: New content if modifying
        reason: Reason for the adjustment

    Returns:
        Updated belief or deletion confirmation

    Examples:
        Reinforce a helpful belief:
        >>> result = await adjust_belief(
        ...     belief_id="belief-001",
        ...     action="reinforce",
        ...     reason="Helped avoid a bug"
        ... )

        Modify outdated belief:
        >>> result = await adjust_belief(
        ...     belief_id="belief-002",
        ...     action="modify",
        ...     new_content="Updated approach after library upgrade"
        ... )
    """
    logger.info("Adjusting belief", belief_id=belief_id, action=action)

    memory = get_memory()
    belief = await memory.get_belief(belief_id)

    if not belief:
        return {"status": "error", "message": f"Belief {belief_id} not found"}

    if action == "delete":
        await memory.delete_belief(belief_id)
        return {"status": "deleted", "belief_id": belief_id, "reason": reason}

    elif action == "reinforce":
        belief.conviction = min(1.0, belief.conviction + config.adjust_reinforce_delta)
        belief.updated_at = datetime.now()

    elif action == "weaken":
        belief.conviction = max(0.0, belief.conviction + config.adjust_weaken_delta)
        belief.updated_at = datetime.now()

    elif action == "modify":
        if new_content:
            belief.content = new_content
            belief.updated_at = datetime.now()
        else:
            return {"status": "error", "message": "new_content required for modify"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}

    await memory.update_belief(belief)

    return {
        "status": "updated",
        "belief_id": belief.id,
        "conviction": belief.conviction,
        "action": action,
        "reason": reason,
    }


async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
    source: str = "manual",
    rationale: str | None = None,
) -> dict:
    """Add a new belief to memory.

    Args:
        content: The belief content
        category: Category (architecture, testing, patterns, etc.)
        domain: Domain it applies to
        conviction: Initial conviction (default 0.7)
        source: Where this came from
        rationale: Why this is a belief

    Returns:
        Created belief

    Examples:
        >>> result = await add_belief(
        ...     content="Always validate user input at API boundaries",
        ...     category="security",
        ...     conviction=0.9,
        ...     rationale="Prevents injection attacks"
        ... )
    """
    logger.info("Adding belief", content=content[:50], category=category)

    belief = Belief(
        id=f"belief-{uuid.uuid4().hex[:8]}",
        content=content,
        conviction=conviction,
        category=category,
        domain=domain,
        source=source,
        usage_count=0,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        metadata={"rationale": rationale} if rationale else {},
    )

    memory = get_memory()
    await memory.store_belief(belief)

    return {
        "status": "created",
        "id": belief.id,
        "conviction": belief.conviction,
        "category": belief.category,
    }
