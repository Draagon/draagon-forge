"""Principles retrieval tool."""

import structlog
from draagon_forge.mcp.memory import get_memory

logger = structlog.get_logger(__name__)


async def get_principles(
    domain: str | None = None,
    min_conviction: float | None = None,
) -> list[dict]:
    """Retrieve development principles for a domain.

    Use this tool before making architectural decisions to understand
    established principles and patterns for the domain.

    Args:
        domain: Optional domain filter (architecture, testing, performance, etc.)
        min_conviction: Minimum conviction score (default: no filter)

    Returns:
        List of principles with:
        - id: Unique identifier
        - content: The principle text
        - domain: Domain this applies to
        - conviction: How strongly held (0.0-1.0)
        - examples: Code examples demonstrating the principle

    Examples:
        Get architecture principles:
        >>> principles = await get_principles(domain="architecture")

        Get high-conviction principles only:
        >>> principles = await get_principles(min_conviction=0.8)
    """
    logger.debug("Getting principles", domain=domain, min_conviction=min_conviction)

    memory = get_memory()
    principles = await memory.get_principles(
        domain=domain,
        min_conviction=min_conviction,
    )

    return [
        {
            "id": p.id,
            "content": p.content,
            "domain": p.domain,
            "conviction": p.conviction,
            "examples": p.examples,
            "created_at": p.created_at.isoformat(),
            "metadata": p.metadata,
        }
        for p in principles
    ]
