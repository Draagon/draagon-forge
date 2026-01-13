"""Forge Agent - Development companion using draagon-ai."""

from draagon_forge.agent.behavior import FORGE_BEHAVIOR, FORGE_PERSONALITY, create_forge_behavior
from draagon_forge.agent.forge_agent import (
    create_forge_agent,
    get_shared_memory,
    process_message,
)

__all__ = [
    "FORGE_BEHAVIOR",
    "FORGE_PERSONALITY",
    "create_forge_behavior",
    "create_forge_agent",
    "get_shared_memory",
    "process_message",
]
