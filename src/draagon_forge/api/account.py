"""
Account API Endpoints

Provides endpoints for retrieving Claude Code and Draagon Forge account information,
as well as session usage tracking.
"""

from typing import Any

from fastapi import APIRouter

from draagon_forge.mcp.config import config
from draagon_forge.services.claude_config import read_claude_config
from draagon_forge.services.usage_tracker import UsageTracker

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/claude")
async def get_claude_account() -> dict[str, Any]:
    """
    Get Claude Code account information from ~/.claude.json

    Returns:
        ClaudeAccountInfo as dictionary
    """
    info = read_claude_config()
    return info.to_dict()


@router.get("/forge")
async def get_forge_account() -> dict[str, Any]:
    """
    Get Draagon Forge identity and stats.

    Returns:
        Forge account information including user_id, agent_id, and memory counts
    """
    # Import here to avoid circular imports
    from draagon_forge.mcp.server import get_shared_memory

    memory = get_shared_memory()

    # Get memory counts
    memory_count = 0
    belief_count = 0

    if memory:
        try:
            # Search for all memories
            all_memories = await memory.search(
                query="*",
                limit=1000,
                user_id=config.user_id,
            )
            memory_count = len(all_memories)

            # Count beliefs specifically
            beliefs = [m for m in all_memories if getattr(m, "type", None) == "belief"]
            belief_count = len(beliefs)
        except Exception as e:
            print(f"Warning: Failed to get memory counts: {e}")

    return {
        "userId": config.user_id,
        "agentId": config.agent_id,
        "projectName": config.project_name,
        "memoryCount": memory_count,
        "beliefCount": belief_count,
    }


@router.get("")
async def get_combined_account() -> dict[str, Any]:
    """
    Get combined Claude Code and Draagon Forge account information.

    Returns:
        Combined account info for both systems
    """
    claude_info = await get_claude_account()
    forge_info = await get_forge_account()

    return {
        "claude": claude_info,
        "forge": forge_info,
    }


# =============================================================================
# Usage Tracking Endpoints
# =============================================================================


@router.get("/usage")
async def get_session_usage() -> dict[str, Any]:
    """
    Get current session token usage and costs.

    Returns:
        Session usage summary including token counts, costs, and per-model breakdown
    """
    return UsageTracker.get_summary(config.user_id)


@router.post("/usage/reset")
async def reset_session_usage() -> dict[str, Any]:
    """
    Reset session usage tracking.

    Returns:
        Status confirmation
    """
    UsageTracker.reset()
    return {"status": "reset", "message": "Session usage has been reset"}


@router.post("/usage/record")
async def record_usage(
    model_id: str,
    provider: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> dict[str, Any]:
    """
    Record token usage for a model call.

    This endpoint is called by LLM providers to track usage.

    Args:
        model_id: The model identifier (e.g., "claude-3-5-sonnet")
        provider: The provider name (e.g., "anthropic", "groq")
        prompt_tokens: Number of prompt/input tokens
        completion_tokens: Number of completion/output tokens

    Returns:
        Updated session usage summary
    """
    await UsageTracker.record(
        model_id=model_id,
        provider=provider,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        user_id=config.user_id,
    )
    return UsageTracker.get_summary(config.user_id)
