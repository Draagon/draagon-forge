"""Pattern retrieval tools."""

import structlog
from draagon_forge.mcp.memory import get_memory

logger = structlog.get_logger(__name__)


async def get_patterns(domain: str | None = None) -> list[dict]:
    """Get design patterns for a domain.

    Use this to learn established patterns and idioms in the codebase.

    Args:
        domain: Optional domain filter

    Returns:
        List of patterns with:
        - id: Unique identifier
        - name: Pattern name
        - description: What the pattern does
        - domain: Domain it applies to
        - code_examples: Example implementations
        - conviction: How established (0.0-1.0)
        - usage_count: How often used

    Examples:
        Get architecture patterns:
        >>> patterns = await get_patterns(domain="architecture")
    """
    logger.debug("Getting patterns", domain=domain)

    memory = get_memory()
    patterns = await memory.get_patterns(domain=domain)

    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "domain": p.domain,
            "code_examples": p.code_examples,
            "conviction": p.conviction,
            "usage_count": p.usage_count,
            "created_at": p.created_at.isoformat(),
            "metadata": p.metadata,
        }
        for p in patterns
    ]


async def find_examples(pattern: str, limit: int = 5) -> list[dict]:
    """Find real code examples matching a pattern.

    Args:
        pattern: Pattern name or description
        limit: Maximum examples to return

    Returns:
        List of code examples from the codebase

    Examples:
        >>> examples = await find_examples("dependency injection", limit=3)
    """
    logger.debug("Finding examples", pattern=pattern, limit=limit)

    memory = get_memory()

    # Search for patterns matching the query
    search_results = await memory.search(query=pattern, limit=limit)

    # Filter to pattern types with examples
    patterns_with_examples = []
    for result in search_results:
        if result.type == "pattern":
            # Get the full pattern
            patterns = await memory.get_patterns()
            for p in patterns:
                if p.id == result.id and p.code_examples:
                    patterns_with_examples.extend(p.code_examples[:limit])
                    break

    return [
        {"example": example, "pattern": pattern} for example in patterns_with_examples
    ][:limit]
