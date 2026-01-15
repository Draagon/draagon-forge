"""Pytest configuration for integration tests.

Sets up environment variables and reloads config before tests run.
"""

import os

# Set storage backend to inmemory by default BEFORE any imports
os.environ.setdefault("DRAAGON_STORAGE_BACKEND", "inmemory")

import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop.

    This prevents "Event loop is closed" errors when using async
    fixtures across multiple tests with the draagon-ai backend.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
def reset_memory_module():
    """Reset memory module state before running tests."""
    # Import and reset global state
    from draagon_forge.mcp import memory as mem_module

    mem_module._memory = None
    mem_module._draagon_ai_provider = None
    mem_module._initialized = False

    # Reload config to pick up env vars
    from draagon_forge.mcp import config as config_module
    config_module.config = config_module.MCPConfig.from_env()

    yield

    # Cleanup after all tests
    mem_module._memory = None
    mem_module._draagon_ai_provider = None
    mem_module._initialized = False
