"""API route definitions for Forge chat service."""

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from draagon_forge.api.models import (
    ChatRequest,
    ChatResponse,
    OpenAIChatRequest,
    OpenAIChatResponse,
    OpenAIChoice,
    OpenAIMessage,
    OpenAIUsage,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Singleton for Forge agent
_forge_agent = None
_agent_initialized = False


async def get_forge_agent():
    """Get or create the Forge agent singleton.

    Lazy loads the agent to avoid slow startup.
    """
    global _forge_agent, _agent_initialized

    if not _agent_initialized:
        try:
            from draagon_forge.agent import create_forge_agent

            _forge_agent = await create_forge_agent()
            _agent_initialized = True
            logger.info("Forge agent initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Forge agent: {e}")
            _agent_initialized = True  # Don't retry every request
            raise

    return _forge_agent


async def process_chat(
    message: str,
    user_id: str = "default",
    conversation_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> ChatResponse:
    """Process a chat message through the Forge agent.

    Args:
        message: User's message
        user_id: User identifier
        conversation_id: Optional conversation ID for context
        context: Optional additional context

    Returns:
        ChatResponse with Forge's response
    """
    try:
        agent = await get_forge_agent()

        if agent is None:
            # Fallback to search if agent unavailable
            return await _fallback_chat(message)

        from draagon_forge.agent.forge_agent import process_message

        agent_context = context or {}
        agent_context["user_id"] = user_id
        if conversation_id:
            agent_context["session_id"] = conversation_id

        response_text = await process_message(agent, message, agent_context)

        return ChatResponse(
            response=response_text,
            conversation_id=conversation_id,
            beliefs_used=[],
            actions_taken=["answer"],
            confidence=0.8,
        )

    except Exception as e:
        logger.error(f"Chat processing error: {e}")
        return await _fallback_chat(message, error=str(e))


async def _fallback_chat(message: str, error: str | None = None) -> ChatResponse:
    """Fallback response when agent is unavailable."""
    from draagon_forge.mcp.tools import search

    results = await search.search_context(message, limit=3)

    if results:
        response = "Here's what I found:\n\n"
        for r in results:
            response += f"- {r['content']}\n"
        if error:
            response += f"\n(Full agent unavailable: {error})"
    else:
        response = "I don't have specific information about that yet."
        if error:
            response += f" (Error: {error})"

    return ChatResponse(
        response=response,
        beliefs_used=[r.get("id", "") for r in results] if results else [],
        actions_taken=["search_context"],
        confidence=0.5,
    )


# =============================================================================
# CHAT ENDPOINTS
# =============================================================================


@router.post("/chat", response_model=None)
async def chat(request: ChatRequest) -> ChatResponse:
    """Simple chat endpoint for Forge.

    Args:
        request: Chat request with message and optional context

    Returns:
        ChatResponse with Forge's response
    """
    from draagon_forge.mcp.config import config

    user_id = request.user_id or config.user_id
    return await process_chat(
        message=request.message,
        user_id=user_id,
        conversation_id=request.conversation_id,
        context=request.context,
    )


@router.post("/v1/chat/completions", response_model=None)
async def openai_chat_completions(request: OpenAIChatRequest) -> OpenAIChatResponse:
    """OpenAI-compatible chat completions endpoint.

    This allows Forge to work with Open WebUI and other OpenAI-compatible clients.

    Args:
        request: OpenAI-format chat completion request

    Returns:
        OpenAI-format chat completion response
    """
    query = request.get_user_query()

    if not query:
        return OpenAIChatResponse(
            choices=[OpenAIChoice(message=OpenAIMessage(content="No query provided"))],
            usage=OpenAIUsage(),
        )

    chat_response = await process_chat(
        message=query,
        user_id=request.get_user_id(),
        conversation_id=request.conversation_id,
        context=request.context,
    )

    return OpenAIChatResponse(
        choices=[
            OpenAIChoice(
                message=OpenAIMessage(role="assistant", content=chat_response.response)
            )
        ],
        usage=OpenAIUsage(
            completion_tokens=len(chat_response.response),
            total_tokens=len(chat_response.response),
        ),
    )


# =============================================================================
# HEALTH & INFO ENDPOINTS
# =============================================================================


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "draagon-forge",
        "timestamp": int(time.time()),
    }


@router.get("/info")
async def info() -> dict[str, Any]:
    """Service information endpoint."""
    from draagon_forge.mcp.config import config

    return {
        "service": "draagon-forge",
        "version": "0.1.0",
        "description": "AI Development Companion - intelligent, learning, proactive coding assistance",
        "llm_model": config.llm_model,
        "llm_provider": config.llm_provider,
        "user_id": config.user_id,
    }


# =============================================================================
# BELIEFS & CONTEXT ENDPOINTS
# =============================================================================


@router.get("/beliefs")
async def list_beliefs(
    query: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Query stored beliefs.

    Args:
        query: Optional search query
        limit: Maximum results to return

    Returns:
        List of matching beliefs
    """
    from draagon_forge.mcp.tools import beliefs

    if query:
        results = await beliefs.query_beliefs(query, limit=limit)
    else:
        results = await beliefs.query_beliefs("*", limit=limit)

    return {"beliefs": results, "count": len(results)}


@router.post("/beliefs")
async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
) -> dict[str, Any]:
    """Add a new belief.

    Args:
        content: The belief content
        category: Optional category
        domain: Optional domain
        conviction: Initial conviction score (0-1)

    Returns:
        The created belief
    """
    from draagon_forge.mcp.tools import beliefs

    result = await beliefs.add_belief(
        content=content,
        category=category,
        domain=domain,
        conviction=conviction,
        source="api",
    )
    return result


@router.get("/search")
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
) -> dict[str, Any]:
    """Search semantic memory.

    Args:
        query: Search query
        limit: Maximum results
        domain: Optional domain filter

    Returns:
        Search results
    """
    from draagon_forge.mcp.tools import search

    results = await search.search_context(query, limit=limit, domain=domain)
    return {"results": results, "count": len(results)}


@router.get("/memory")
async def list_memory(
    memory_type: str | None = None,
    domain: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """List all memories, optionally filtered.

    Args:
        memory_type: Filter by type (belief, insight, knowledge, skill)
        domain: Filter by domain
        limit: Maximum results

    Returns:
        List of memories
    """
    from draagon_forge.agent.forge_agent import get_shared_memory
    from draagon_forge.mcp.config import config

    memory = get_shared_memory()
    if memory is None:
        return {"memories": [], "count": 0}

    # Build query based on filters
    query_parts = []
    if memory_type:
        query_parts.append(memory_type)
    if domain:
        query_parts.append(domain)

    query = " ".join(query_parts) if query_parts else "*"

    results = await memory.search(
        query,
        limit=limit,
        user_id=config.user_id,
        agent_id=config.agent_id,
    )

    memories = [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "type": r.metadata.get("type", "memory") if hasattr(r, "metadata") else "memory",
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else None,
            "category": r.metadata.get("category") if hasattr(r, "metadata") else None,
            "conviction": r.metadata.get("conviction", 0.7) if hasattr(r, "metadata") else 0.7,
            "score": r.score if hasattr(r, "score") else 0.8,
            "source": r.metadata.get("source", "agent") if hasattr(r, "metadata") else "agent",
        }
        for i, r in enumerate(results)
    ]

    return {"memories": memories, "count": len(memories)}


@router.put("/beliefs/{belief_id}/conviction")
async def adjust_belief_conviction(
    belief_id: str,
    delta: float,
) -> dict[str, Any]:
    """Adjust a belief's conviction score.

    Args:
        belief_id: ID of the belief to adjust
        delta: Amount to adjust (-0.1 to +0.1 typical)

    Returns:
        Updated belief info
    """
    # TODO: Implement actual conviction adjustment in memory
    # For now, return a placeholder response
    return {
        "status": "adjusted",
        "belief_id": belief_id,
        "delta": delta,
        "message": "Conviction adjustment not yet implemented",
    }


@router.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str) -> dict[str, Any]:
    """Delete a memory by ID.

    Args:
        memory_id: ID of the memory to delete

    Returns:
        Deletion status
    """
    # TODO: Implement actual deletion in memory provider
    return {
        "status": "deleted",
        "memory_id": memory_id,
        "message": "Memory deletion not yet implemented",
    }
