"""Draagon Forge MCP Server.

FastMCP server providing semantic memory tools for Claude Code integration.
Uses the shared draagon-ai Agent for all semantic operations.

The MCP tools route through the same memory as the Forge Agent,
ensuring consistency between Claude Code queries and API chat.

Usage:
    python -m draagon_forge.mcp.server
"""

import asyncio
import time
import uuid
import structlog
from fastmcp import FastMCP

# Import config
from draagon_forge.mcp.config import config

# Import agent (creates shared memory)
from draagon_forge.agent import create_forge_agent
from draagon_forge.agent.forge_agent import get_shared_memory

# Import event system for Inspector
from draagon_forge.api.events import EventType, emit_event

# Initialize structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger(__name__)

# Initialize FastMCP server
mcp = FastMCP("draagon-forge")


# =============================================================================
# MCP Tools - All route through draagon-ai's orchestration
# =============================================================================


@mcp.tool()
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
) -> list[dict]:
    """Search semantic memory for relevant context.

    This searches the shared memory used by the Forge Agent,
    returning principles, patterns, and learnings relevant to your query.

    Args:
        query: Natural language search query
        limit: Maximum results to return (default 10)
        domain: Optional domain filter (architecture, testing, etc.)

    Returns:
        List of relevant context items with scores
    """
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    # Emit tool called event
    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_CALLED,
        {"tool": "search_context", "args": {"query": query, "limit": limit, "domain": domain}},
        source="mcp",
        request_id=request_id,
        user_id=config.user_id,
    ))

    memory = get_shared_memory()
    if memory is None:
        logger.warning("Memory not initialized - returning empty results")
        asyncio.create_task(emit_event(
            EventType.MCP_TOOL_ERROR,
            {"tool": "search_context", "error": "Memory not initialized"},
            source="mcp",
            request_id=request_id,
        ))
        return []

    # Optionally filter by domain in query
    search_query = f"{domain}: {query}" if domain else query

    # Emit memory search event
    asyncio.create_task(emit_event(
        EventType.MEMORY_SEARCH,
        {"query": search_query, "limit": limit},
        source="memory",
        request_id=request_id,
        user_id=config.user_id,
    ))

    # Search with proper user/agent scoping
    results = await memory.search(
        search_query,
        limit=limit,
        user_id=config.user_id,
        agent_id=config.agent_id,
    )

    duration_ms = (time.time() - start_time) * 1000
    result_list = [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "score": r.score if hasattr(r, "score") else 0.8,
            "type": r.metadata.get("type", "memory") if hasattr(r, "metadata") else "memory",
            "source": r.metadata.get("source", "agent") if hasattr(r, "metadata") else "agent",
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else domain,
        }
        for i, r in enumerate(results)
    ]

    # Emit tool result event
    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_RESULT,
        {"tool": "search_context", "result_count": len(result_list)},
        source="mcp",
        duration_ms=duration_ms,
        request_id=request_id,
        user_id=config.user_id,
    ))

    return result_list


@mcp.tool()
async def get_principles(
    domain: str | None = None,
) -> list[dict]:
    """Get development principles for a domain.

    Args:
        domain: Optional domain filter (architecture, testing, llm, etc.)

    Returns:
        List of principles with conviction scores
    """
    memory = get_shared_memory()
    if memory is None:
        return []

    from draagon_ai.memory.base import MemoryType
    query = f"principle {domain}" if domain else "principle"
    results = await memory.search(
        query,
        limit=20,
        user_id=config.user_id,
        agent_id=config.agent_id,
        memory_types=[MemoryType.KNOWLEDGE],
    )

    return [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "conviction": r.metadata.get("conviction", 0.7) if hasattr(r, "metadata") else 0.7,
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else domain,
        }
        for i, r in enumerate(results)
    ]


@mcp.tool()
async def query_beliefs(
    query: str,
    category: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Query stored beliefs about a topic.

    Beliefs are things Forge has learned and holds with varying conviction.

    Args:
        query: Search query for beliefs
        category: Optional category filter
        limit: Maximum results

    Returns:
        List of beliefs with conviction scores
    """
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_CALLED,
        {"tool": "query_beliefs", "args": {"query": query, "category": category, "limit": limit}},
        source="mcp",
        request_id=request_id,
        user_id=config.user_id,
    ))

    memory = get_shared_memory()
    if memory is None:
        return []

    from draagon_ai.memory.base import MemoryType
    search_query = f"{category} {query}" if category else query
    results = await memory.search(
        search_query,
        limit=limit,
        user_id=config.user_id,
        agent_id=config.agent_id,
        memory_types=[MemoryType.BELIEF],
    )

    duration_ms = (time.time() - start_time) * 1000
    result_list = [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "conviction": r.metadata.get("conviction", 0.7) if hasattr(r, "metadata") else 0.7,
            "category": r.metadata.get("category") if hasattr(r, "metadata") else category,
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else None,
        }
        for i, r in enumerate(results)
    ]

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_RESULT,
        {"tool": "query_beliefs", "result_count": len(result_list)},
        source="mcp",
        duration_ms=duration_ms,
        request_id=request_id,
    ))

    return result_list


@mcp.tool()
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
        category: Optional category
        domain: Optional domain
        conviction: Initial conviction (0.0-1.0, default 0.7)
        source: Where this belief came from
        rationale: Why this belief is held

    Returns:
        Status of the storage operation
    """
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_CALLED,
        {"tool": "add_belief", "args": {"content": content[:100], "category": category, "domain": domain, "conviction": conviction}},
        source="mcp",
        request_id=request_id,
        user_id=config.user_id,
    ))

    memory = get_shared_memory()
    if memory is None:
        return {"error": "Memory not initialized"}

    from draagon_ai.memory.base import MemoryType, MemoryScope
    await memory.store(
        content=content,
        memory_type=MemoryType.BELIEF,
        scope=MemoryScope.USER,
        user_id=config.user_id,
        agent_id=config.agent_id,
        confidence=conviction,
        source=source,
        metadata={
            "category": category,
            "domain": domain,
            "conviction": conviction,
            "rationale": rationale,
        },
    )

    duration_ms = (time.time() - start_time) * 1000

    # Emit memory store event
    asyncio.create_task(emit_event(
        EventType.MEMORY_STORE,
        {"type": "BELIEF", "content": content[:100], "conviction": conviction},
        source="memory",
        duration_ms=duration_ms,
        request_id=request_id,
        user_id=config.user_id,
    ))

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_RESULT,
        {"tool": "add_belief", "status": "stored"},
        source="mcp",
        duration_ms=duration_ms,
        request_id=request_id,
    ))

    return {
        "status": "stored",
        "content": content,
        "conviction": conviction,
    }


@mcp.tool()
async def store_learning(
    content: str,
    source: str,
    conviction: float = 0.7,
    category: str | None = None,
    domain: str | None = None,
) -> dict:
    """Store a new learning in semantic memory.

    Args:
        content: What was learned
        source: Where this learning came from
        conviction: How strongly held (0.0-1.0)
        category: Optional category
        domain: Optional domain

    Returns:
        Status of the storage operation
    """
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_CALLED,
        {"tool": "store_learning", "args": {"content": content[:100], "source": source, "conviction": conviction}},
        source="mcp",
        request_id=request_id,
        user_id=config.user_id,
    ))

    memory = get_shared_memory()
    if memory is None:
        return {"error": "Memory not initialized"}

    from draagon_ai.memory.base import MemoryType, MemoryScope
    await memory.store(
        content=content,
        memory_type=MemoryType.INSIGHT,
        scope=MemoryScope.USER,
        user_id=config.user_id,
        agent_id=config.agent_id,
        confidence=conviction,
        source=source,
        metadata={
            "category": category,
            "domain": domain,
            "conviction": conviction,
        },
    )

    duration_ms = (time.time() - start_time) * 1000

    asyncio.create_task(emit_event(
        EventType.MEMORY_STORE,
        {"type": "INSIGHT", "content": content[:100], "conviction": conviction},
        source="memory",
        duration_ms=duration_ms,
        request_id=request_id,
        user_id=config.user_id,
    ))

    asyncio.create_task(emit_event(
        EventType.MCP_TOOL_RESULT,
        {"tool": "store_learning", "status": "stored"},
        source="mcp",
        duration_ms=duration_ms,
        request_id=request_id,
    ))

    return {
        "status": "stored",
        "content": content,
        "conviction": conviction,
    }


@mcp.tool()
async def get_patterns(domain: str | None = None) -> list[dict]:
    """Get design patterns for a domain.

    Args:
        domain: Optional domain filter

    Returns:
        List of patterns
    """
    memory = get_shared_memory()
    if memory is None:
        return []

    from draagon_ai.memory.base import MemoryType
    query = f"pattern {domain}" if domain else "design pattern"
    results = await memory.search(
        query,
        limit=20,
        user_id=config.user_id,
        agent_id=config.agent_id,
        memory_types=[MemoryType.SKILL],
    )

    return [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else domain,
        }
        for i, r in enumerate(results)
    ]


@mcp.tool()
async def find_examples(pattern: str, limit: int = 5) -> list[dict]:
    """Find code examples matching a pattern.

    Args:
        pattern: The pattern to find examples for
        limit: Maximum examples to return

    Returns:
        List of example code/patterns
    """
    memory = get_shared_memory()
    if memory is None:
        return []

    results = await memory.search(
        f"example: {pattern}",
        limit=limit,
        user_id=config.user_id,
        agent_id=config.agent_id,
    )

    return [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "pattern": pattern,
        }
        for i, r in enumerate(results)
    ]


# =============================================================================
# Server Entry Point
# =============================================================================


async def _initialize() -> None:
    """Initialize the server by creating the Forge agent.

    This initializes the shared memory that all MCP tools use.
    """
    logger.info("Initializing Forge agent (creates shared memory)...")
    try:
        await create_forge_agent()
        logger.info("Forge agent initialized - MCP tools ready")
    except Exception as e:
        logger.error(f"Failed to initialize agent: {e}")
        logger.warning("MCP tools will return empty results until agent is initialized")


def main() -> None:
    """Start the MCP server."""
    logger.info("Starting Draagon Forge MCP Server...")
    logger.info(
        "Configuration",
        llm_model=config.llm_model,
        embedding_model=config.embedding_model,
        project=config.project_name,
    )

    # Initialize agent (and shared memory) before starting server
    asyncio.run(_initialize())

    # Start the MCP server
    mcp.run()


if __name__ == "__main__":
    main()
