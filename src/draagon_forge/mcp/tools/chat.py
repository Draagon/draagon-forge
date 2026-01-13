"""Chat tool - Conversational interface using the Forge agent."""

import structlog
from typing import Any

logger = structlog.get_logger(__name__)

# Global agent instance (lazy loaded)
_agent = None
_agent_initialized = False


async def get_agent():
    """Get or create the Forge agent.

    Lazy loads the agent to avoid import cycles and slow startup.
    """
    global _agent, _agent_initialized

    if not _agent_initialized:
        try:
            from draagon_forge.agent import create_forge_agent
            _agent = await create_forge_agent()
            _agent_initialized = True
            logger.info("Forge agent initialized")
        except Exception as e:
            logger.error("Failed to initialize agent", error=str(e))
            _agent_initialized = True  # Don't retry on every call
            raise

    return _agent


async def chat(
    message: str,
    conversation_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict:
    """Chat with Forge - the development companion.

    This is the main conversational interface. Forge will:
    - Answer questions using its knowledge and opinions
    - Search for relevant beliefs and principles
    - Store new learnings when appropriate
    - Express opinions on development topics

    Args:
        message: The user's message
        conversation_id: Optional conversation ID for context
        context: Optional additional context (file path, selection, etc.)

    Returns:
        Response dict with:
        - response: The text response
        - beliefs_used: Any beliefs referenced
        - actions_taken: What actions Forge took
        - confidence: How confident Forge is in the response

    Examples:
        Simple question:
        >>> result = await chat("What do you think about regex for parsing intents?")
        >>> print(result["response"])
        "I strongly advise against using regex for semantic understanding..."

        With context:
        >>> result = await chat(
        ...     "How should I handle errors here?",
        ...     context={"file": "src/api.py", "selection": "def fetch_user():..."}
        ... )
    """
    logger.info("Chat message received", message=message[:50])

    try:
        agent = await get_agent()

        if agent is None:
            # Fallback to simple search if agent unavailable
            return await _fallback_response(message)

        # Build context for agent with user_id from config
        from draagon_forge.mcp.config import config

        agent_context = context or {}
        agent_context.setdefault("user_id", config.user_id)
        if conversation_id:
            agent_context["session_id"] = conversation_id

        # Process through agent
        from draagon_forge.agent.forge_agent import process_message
        response_text = await process_message(agent, message, agent_context)

        return {
            "response": response_text,
            "beliefs_used": [],  # TODO: Track which beliefs were used
            "actions_taken": ["answer"],
            "confidence": 0.8,
        }

    except Exception as e:
        logger.error("Chat error", error=str(e))
        return await _fallback_response(message, error=str(e))


async def _fallback_response(message: str, error: str | None = None) -> dict:
    """Fallback response when agent is unavailable.

    Does a simple search and returns results directly.
    """
    from draagon_forge.mcp.tools import search

    # Search for relevant context
    results = await search.search_context(message, limit=3)

    if results:
        response = "Here's what I found:\n\n"
        for r in results:
            response += f"• {r['content']}\n"

        if error:
            response += f"\n(Note: Full conversational mode unavailable: {error})"
    else:
        response = "I don't have specific information about that topic yet."
        if error:
            response += f" (Agent error: {error})"

    return {
        "response": response,
        "beliefs_used": [r.get("id") for r in results] if results else [],
        "actions_taken": ["search_context"],
        "confidence": 0.5,
    }
