"""Memory backends for Draagon Forge.

This module integrates with draagon-ai's memory infrastructure:
- inmemory: In-memory storage (for testing/development)
- draagon-ai: Shared Neo4j + Qdrant with semantic decomposition
"""

import asyncio
import structlog
from typing import TYPE_CHECKING

from draagon_forge.mcp.config import config
from draagon_forge.mcp.memory.base import MemoryBackend
from draagon_forge.mcp.memory.inmemory import InMemoryBackend

if TYPE_CHECKING:
    from draagon_ai.memory.base import MemoryProvider

__all__ = [
    "MemoryBackend",
    "InMemoryBackend",
    "get_memory",
    "initialize_memory",
]

logger = structlog.get_logger(__name__)

# Global memory instance
_memory: MemoryBackend | None = None
_draagon_ai_provider: "MemoryProvider | None" = None
_initialized: bool = False


async def initialize_memory() -> None:
    """Initialize memory backend asynchronously.

    Call this at server startup to establish database connections.
    """
    global _memory, _draagon_ai_provider, _initialized

    if _initialized:
        return

    if config.storage_backend == "inmemory":
        logger.info("Using in-memory storage backend")
        _memory = InMemoryBackend()

    elif config.storage_backend == "draagon-ai":
        logger.info(
            "Initializing draagon-ai memory backend",
            qdrant_url=config.qdrant_url,
            neo4j_uri=config.neo4j_uri,
        )
        try:
            from draagon_ai.memory.providers.qdrant import QdrantConfig, QdrantMemoryProvider
            from draagon_ai.memory.embedding import create_embedding_provider

            # Create embedding provider using Ollama
            embedder = await create_embedding_provider(
                primary="ollama",
                ollama_url=config.ollama_url,
                ollama_model=config.embedding_model,
                use_fallback=True,
            )

            # Create Qdrant memory provider (Neo4j integration comes via layered provider)
            qdrant_config = QdrantConfig(
                url=config.qdrant_url,
                collection_name=config.qdrant_collection,
                embedding_dimension=config.embedding_dimension,
            )

            _draagon_ai_provider = QdrantMemoryProvider(qdrant_config, embedder)
            await _draagon_ai_provider.initialize()

            # Wrap draagon-ai provider with our MemoryBackend interface
            from draagon_forge.mcp.memory.draagon_ai_adapter import DraagonAIAdapter
            _memory = DraagonAIAdapter(_draagon_ai_provider, config)

            logger.info("draagon-ai memory backend initialized")

        except ImportError as e:
            logger.warning(
                "draagon-ai not available, falling back to in-memory",
                error=str(e),
            )
            _memory = InMemoryBackend()

        except Exception as e:
            logger.error(
                "Failed to initialize draagon-ai backend, falling back to in-memory",
                error=str(e),
            )
            _memory = InMemoryBackend()

    else:
        raise ValueError(f"Unsupported storage backend: {config.storage_backend}")

    _initialized = True


def get_memory() -> MemoryBackend:
    """Get the configured memory backend.

    Returns:
        Memory backend instance

    Raises:
        RuntimeError: If memory not initialized
    """
    global _memory

    if _memory is None:
        # Synchronous fallback - try to initialize in-memory
        if config.storage_backend == "inmemory":
            _memory = InMemoryBackend()
        else:
            # For async backends, run initialization
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Can't run async from sync context when loop is running
                    # Fall back to in-memory
                    logger.warning("Using in-memory fallback (call initialize_memory at startup)")
                    _memory = InMemoryBackend()
                else:
                    loop.run_until_complete(initialize_memory())
            except RuntimeError:
                # No event loop
                asyncio.run(initialize_memory())

    if _memory is None:
        raise RuntimeError("Memory backend not initialized. Call initialize_memory() first.")

    return _memory
