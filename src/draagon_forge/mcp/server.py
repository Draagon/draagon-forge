"""Draagon Forge MCP Server.

FastMCP server providing semantic memory and tools for Claude Code integration.
Uses draagon-ai's shared Neo4j + Qdrant infrastructure.

Usage:
    python -m draagon_forge.mcp.server
"""

import asyncio
import structlog
from fastmcp import FastMCP

# Import config and memory
from draagon_forge.mcp.config import config
from draagon_forge.mcp.memory import initialize_memory

# Import tools
from draagon_forge.mcp.tools import search, principles, conflicts, patterns
from draagon_forge.mcp.tools import beliefs, feedback, learning, review

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
# MCP Tools
# =============================================================================


@mcp.tool()
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
    min_conviction: float | None = None,
) -> list[dict]:
    """Search semantic memory for relevant context."""
    return await search.search_context(query, limit, domain, min_conviction)


@mcp.tool()
async def get_principles_tool(
    domain: str | None = None,
    min_conviction: float | None = None,
) -> list[dict]:
    """Get development principles for a domain."""
    return await principles.get_principles(domain, min_conviction)


@mcp.tool()
async def check_conflicts_tool(
    content: str,
    domain: str | None = None,
) -> list[dict]:
    """Check if content conflicts with established principles."""
    return await conflicts.check_conflicts(content, domain)


@mcp.tool()
async def get_patterns(domain: str | None = None) -> list[dict]:
    """Get design patterns for a domain."""
    return await patterns.get_patterns(domain)


@mcp.tool()
async def find_examples(pattern: str, limit: int = 5) -> list[dict]:
    """Find real code examples matching a pattern."""
    return await patterns.find_examples(pattern, limit)


@mcp.tool()
async def query_beliefs_tool(
    query: str,
    category: str | None = None,
    min_conviction: float | None = None,
    limit: int = 10,
) -> list[dict]:
    """Query stored beliefs."""
    return await beliefs.query_beliefs(query, category, min_conviction, limit)


@mcp.tool()
async def adjust_belief_tool(
    belief_id: str,
    action: str,
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust a belief based on user feedback."""
    return await beliefs.adjust_belief(belief_id, action, new_content, reason)


@mcp.tool()
async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
    source: str = "manual",
    rationale: str | None = None,
) -> dict:
    """Add a new belief to memory."""
    return await beliefs.add_belief(content, category, domain, conviction, source, rationale)


@mcp.tool()
async def report_outcome_tool(
    context_ids: list[str],
    outcome: str,
    reason: str | None = None,
) -> dict:
    """Report how helpful retrieved context was."""
    return await feedback.report_outcome(context_ids, outcome, reason)


@mcp.tool()
async def store_learning_tool(
    content: str,
    source: str,
    conviction: float = 0.7,
    category: str | None = None,
    domain: str | None = None,
) -> dict:
    """Store a new learning/principle in semantic memory."""
    return await learning.store_learning(content, source, conviction, category, domain)


@mcp.tool()
async def get_review_queue() -> list[dict]:
    """Get items flagged for human review."""
    return await review.get_review_queue()


@mcp.tool()
async def resolve_review(
    item_id: str,
    decision: str,
    reason: str | None = None,
) -> dict:
    """Resolve a flagged review item."""
    return await review.resolve_review(item_id, decision, reason)


# =============================================================================
# Server Entry Point
# =============================================================================


async def _initialize() -> None:
    """Initialize the server (async setup)."""
    logger.info("Initializing memory backend...")
    await initialize_memory()
    logger.info(
        "Memory initialized",
        backend=config.storage_backend,
        qdrant_url=config.qdrant_url if config.storage_backend == "draagon-ai" else "N/A",
    )


def main() -> None:
    """Start the MCP server."""
    logger.info("Starting Draagon Forge MCP Server...")
    logger.info(
        "Configuration",
        storage_backend=config.storage_backend,
        project=config.project_name,
    )

    # Initialize memory backend before starting server
    asyncio.run(_initialize())

    # Start the MCP server
    mcp.run()


if __name__ == "__main__":
    main()
