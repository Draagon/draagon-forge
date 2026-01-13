"""Search context tool for semantic memory search."""

import structlog
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.models import SearchResult

logger = structlog.get_logger(__name__)


async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
    min_conviction: float | None = None,
) -> list[dict]:
    """Search semantic memory for relevant context.

    This is the primary tool for retrieving relevant principles, patterns,
    and learnings before any implementation task. Claude Code should invoke
    this before making architectural decisions or proposing code changes.

    Args:
        query: The search query (natural language)
        limit: Maximum results to return (default 10)
        domain: Optional domain filter (architecture, testing, patterns, etc.)
        min_conviction: Minimum conviction score threshold (0.0-1.0)

    Returns:
        List of search results with:
        - id: Unique identifier
        - content: The principle/pattern/learning text
        - score: Relevance score (0.0-1.0)
        - conviction: How strongly this is held (0.0-1.0)
        - type: belief | principle | pattern | learning
        - source: Where this came from

    Examples:
        Search for architecture principles:
        >>> results = await search_context(
        ...     query="dependency injection patterns",
        ...     domain="architecture",
        ...     min_conviction=0.7
        ... )

        General search:
        >>> results = await search_context("error handling best practices")
    """
    logger.debug(
        "Searching context",
        query=query,
        limit=limit,
        domain=domain,
        min_conviction=min_conviction,
    )

    memory = get_memory()
    results: list[SearchResult] = await memory.search(
        query=query,
        limit=limit,
        domain=domain,
        min_conviction=min_conviction,
    )

    # Convert to dict for MCP serialization
    return [
        {
            "id": r.id,
            "content": r.content,
            "score": r.score,
            "conviction": r.conviction,
            "type": r.type,
            "source": r.source,
            "metadata": r.metadata,
        }
        for r in results
    ]
