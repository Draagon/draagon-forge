"""End-to-end integration tests for belief management.

These tests verify the complete flow from API → MCP tools → Memory backend → Storage.
They use the InMemoryBackend by default but can be configured to use draagon-ai.

Run with:
    pytest tests/integration/test_belief_e2e.py -v

To test with draagon-ai backend (requires Qdrant + Ollama running):
    DRAAGON_STORAGE_BACKEND=draagon-ai pytest tests/integration/test_belief_e2e.py -v
"""

# Note: Environment is set in conftest.py which runs first

import os
import pytest
from datetime import datetime


# Use session-scoped event loop from conftest.py to avoid "Event loop is closed" errors


@pytest.fixture(scope="session")
async def initialized_memory():
    """Initialize memory backend for tests."""
    from draagon_forge.mcp.memory import initialize_memory, get_memory

    await initialize_memory()
    return get_memory()


@pytest.fixture
async def clean_memory(initialized_memory):
    """Provide a clean memory state for each test.

    For InMemoryBackend, we clear the storage.
    For DraagonAIAdapter, we just return it (Qdrant persists between tests).
    """
    memory = initialized_memory
    # Clear any existing beliefs (InMemoryBackend only)
    if hasattr(memory, 'beliefs'):
        memory.beliefs.clear()
    if hasattr(memory, 'principles'):
        memory.principles.clear()
    if hasattr(memory, 'patterns'):
        memory.patterns.clear()
    # For DraagonAIAdapter, clear the ID map at least
    if hasattr(memory, '_id_map'):
        memory._id_map.clear()
    return memory


class TestBeliefCRUD:
    """Test complete CRUD operations on beliefs."""

    @pytest.mark.asyncio
    async def test_add_belief_stores_correctly(self, clean_memory) -> None:
        """Test that adding a belief stores it with correct attributes."""
        from draagon_forge.mcp.tools import beliefs

        result = await beliefs.add_belief(
            content="Always use parameterized queries for SQL",
            category="security",
            domain="database",
            conviction=0.85,
            source="test",
            rationale="Prevents SQL injection attacks",
        )

        assert result["status"] == "created"
        assert "id" in result
        assert result["conviction"] == 0.85
        assert result["category"] == "security"

        # Verify it's actually stored
        stored = await clean_memory.get_belief(result["id"])
        assert stored is not None
        assert stored.content == "Always use parameterized queries for SQL"
        assert stored.conviction == 0.85
        assert stored.domain == "database"

    @pytest.mark.asyncio
    async def test_query_beliefs_returns_matching(self, clean_memory) -> None:
        """Test that querying beliefs returns relevant matches."""
        from draagon_forge.mcp.tools import beliefs

        # Add some beliefs
        await beliefs.add_belief(
            content="Use async/await for I/O operations",
            category="patterns",
            domain="python",
            conviction=0.9,
        )
        await beliefs.add_belief(
            content="Always validate input at API boundaries",
            category="security",
            domain="api",
            conviction=0.85,
        )
        await beliefs.add_belief(
            content="Prefer composition over inheritance",
            category="architecture",
            domain="design",
            conviction=0.8,
        )

        # Query for async-related beliefs
        results = await beliefs.query_beliefs("async await", limit=10)

        assert len(results) > 0
        # Should find the async belief
        contents = [r["content"] for r in results]
        assert any("async" in c.lower() for c in contents)

    @pytest.mark.asyncio
    async def test_reinforce_increases_conviction(self, clean_memory) -> None:
        """Test that reinforcing a belief increases its conviction."""
        from draagon_forge.mcp.tools import beliefs
        from draagon_forge.mcp.config import config

        # Add a belief
        added = await beliefs.add_belief(
            content="Test belief for reinforcement",
            conviction=0.7,
        )
        belief_id = added["id"]
        initial_conviction = added["conviction"]

        # Reinforce it
        result = await beliefs.adjust_belief(
            belief_id=belief_id,
            action="reinforce",
            reason="Proved helpful in code review",
        )

        assert result["status"] == "updated"
        assert result["conviction"] > initial_conviction
        assert result["conviction"] == initial_conviction + config.adjust_reinforce_delta

    @pytest.mark.asyncio
    async def test_weaken_decreases_conviction(self, clean_memory) -> None:
        """Test that weakening a belief decreases its conviction."""
        from draagon_forge.mcp.tools import beliefs
        from draagon_forge.mcp.config import config

        # Add a belief
        added = await beliefs.add_belief(
            content="Test belief for weakening",
            conviction=0.7,
        )
        belief_id = added["id"]
        initial_conviction = added["conviction"]

        # Weaken it
        result = await beliefs.adjust_belief(
            belief_id=belief_id,
            action="weaken",
            reason="Led to incorrect suggestion",
        )

        assert result["status"] == "updated"
        assert result["conviction"] < initial_conviction
        # Note: weaken delta is negative in config
        expected = max(0.0, initial_conviction + config.adjust_weaken_delta)
        assert abs(result["conviction"] - expected) < 0.001

    @pytest.mark.asyncio
    async def test_conviction_capped_at_one(self, clean_memory) -> None:
        """Test that conviction never exceeds 1.0 after reinforcement."""
        from draagon_forge.mcp.tools import beliefs

        # Add a belief with high conviction
        added = await beliefs.add_belief(
            content="High conviction belief",
            conviction=0.98,
        )

        # Reinforce multiple times
        for _ in range(5):
            result = await beliefs.adjust_belief(
                belief_id=added["id"],
                action="reinforce",
            )

        assert result["conviction"] <= 1.0

    @pytest.mark.asyncio
    async def test_conviction_floored_at_zero(self, clean_memory) -> None:
        """Test that conviction never goes below 0.0 after weakening."""
        from draagon_forge.mcp.tools import beliefs

        # Add a belief with low conviction
        added = await beliefs.add_belief(
            content="Low conviction belief",
            conviction=0.1,
        )

        # Weaken multiple times
        for _ in range(5):
            result = await beliefs.adjust_belief(
                belief_id=added["id"],
                action="weaken",
            )

        assert result["conviction"] >= 0.0

    @pytest.mark.asyncio
    async def test_modify_updates_content(self, clean_memory) -> None:
        """Test that modifying a belief updates its content."""
        from draagon_forge.mcp.tools import beliefs

        # Add a belief
        added = await beliefs.add_belief(
            content="Original content",
            conviction=0.7,
        )

        # Modify it
        result = await beliefs.adjust_belief(
            belief_id=added["id"],
            action="modify",
            new_content="Updated content with better wording",
            reason="Improved clarity",
        )

        assert result["status"] == "updated"

        # Verify the update persisted
        stored = await clean_memory.get_belief(added["id"])
        assert stored.content == "Updated content with better wording"

    @pytest.mark.asyncio
    async def test_delete_removes_belief(self, clean_memory) -> None:
        """Test that deleting a belief removes it from storage."""
        from draagon_forge.mcp.tools import beliefs

        # Add a belief
        added = await beliefs.add_belief(
            content="Belief to be deleted",
            conviction=0.7,
        )

        # Delete it
        result = await beliefs.adjust_belief(
            belief_id=added["id"],
            action="delete",
            reason="No longer relevant",
        )

        assert result["status"] == "deleted"

        # Verify it's gone
        stored = await clean_memory.get_belief(added["id"])
        assert stored is None

    @pytest.mark.asyncio
    async def test_adjust_nonexistent_belief_returns_error(self, clean_memory) -> None:
        """Test that adjusting a non-existent belief returns error."""
        from draagon_forge.mcp.tools import beliefs

        result = await beliefs.adjust_belief(
            belief_id="nonexistent-id",
            action="reinforce",
        )

        assert result["status"] == "error"
        assert "not found" in result["message"].lower()


class TestAPIEndpoints:
    """Test the API layer integration."""

    @pytest.mark.asyncio
    async def test_api_add_belief(self, clean_memory) -> None:
        """Test adding a belief through the API route."""
        from draagon_forge.api.routes import add_belief

        result = await add_belief(
            content="API test belief",
            category="testing",
            domain="api",
            conviction=0.75,
        )

        assert result["status"] == "created"
        assert result["category"] == "testing"

    @pytest.mark.asyncio
    async def test_api_list_beliefs(self, clean_memory) -> None:
        """Test listing beliefs through the API route."""
        from draagon_forge.api.routes import add_belief, list_beliefs

        # Add some beliefs
        await add_belief(content="First API belief", conviction=0.8)
        await add_belief(content="Second API belief", conviction=0.7)

        result = await list_beliefs(query="API belief", limit=10)

        assert "beliefs" in result
        assert result["count"] >= 2

    @pytest.mark.asyncio
    async def test_api_adjust_belief(self, clean_memory) -> None:
        """Test adjusting a belief through the API route."""
        from draagon_forge.api.routes import add_belief, adjust_belief

        # Add a belief
        added = await add_belief(content="Belief to adjust via API", conviction=0.7)
        belief_id = added["id"]

        # Adjust it via API
        result = await adjust_belief(
            belief_id=belief_id,
            action="reinforce",
            reason="API reinforcement test",
        )

        assert result["status"] == "updated"
        assert result["conviction"] > 0.7

    @pytest.mark.asyncio
    async def test_api_delete_belief(self, clean_memory) -> None:
        """Test deleting a belief through the API route."""
        from draagon_forge.api.routes import add_belief, delete_belief

        # Add a belief
        added = await add_belief(content="Belief to delete via API", conviction=0.7)
        belief_id = added["id"]

        # Delete it via API
        result = await delete_belief(
            belief_id=belief_id,
            reason="API deletion test",
        )

        assert result["status"] == "deleted"


class TestMemoryBackendIntegration:
    """Test memory backend functionality directly."""

    @pytest.mark.asyncio
    async def test_memory_search_returns_results(self, clean_memory) -> None:
        """Test that memory search returns relevant results."""
        from draagon_forge.mcp.models import Belief
        from datetime import datetime

        # Store beliefs directly
        belief1 = Belief(
            id="mem-test-1",
            content="Use context managers for resource cleanup",
            conviction=0.9,
            category="patterns",
            domain="python",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        belief2 = Belief(
            id="mem-test-2",
            content="Avoid global mutable state",
            conviction=0.85,
            category="architecture",
            domain="general",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await clean_memory.store_belief(belief1)
        await clean_memory.store_belief(belief2)

        # Search for context managers
        results = await clean_memory.search("context manager resource", limit=10)

        assert len(results) > 0

    @pytest.mark.asyncio
    async def test_memory_update_persists(self, clean_memory) -> None:
        """Test that memory updates persist correctly."""
        from draagon_forge.mcp.models import Belief
        from datetime import datetime

        belief = Belief(
            id="update-test-1",
            content="Original belief content",
            conviction=0.5,
            category="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await clean_memory.store_belief(belief)

        # Update conviction
        belief.conviction = 0.8
        belief.updated_at = datetime.now()
        await clean_memory.update_belief(belief)

        # Retrieve and verify
        updated = await clean_memory.get_belief("update-test-1")
        assert updated is not None
        assert updated.conviction == 0.8


class TestDraagonAIIntegration:
    """Test integration with draagon-ai (when available)."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        os.environ.get("DRAAGON_STORAGE_BACKEND") != "draagon-ai",
        reason="Requires draagon-ai backend (set STORAGE_BACKEND=draagon-ai)"
    )
    async def test_draagon_ai_search(self, clean_memory) -> None:
        """Test semantic search with draagon-ai backend."""
        from draagon_forge.mcp.tools import beliefs

        # Add beliefs with specific unique content
        unique_marker = f"draagon_test_{datetime.now().timestamp()}"
        await beliefs.add_belief(
            content=f"Use dependency injection for loose coupling [{unique_marker}]",
            category="architecture",
            conviction=0.9,
        )
        await beliefs.add_belief(
            content=f"Prefer interfaces over concrete implementations [{unique_marker}]",
            category="architecture",
            conviction=0.85,
        )

        # Search for the unique content we just added
        results = await beliefs.query_beliefs(f"dependency injection {unique_marker}")

        # Should find at least one of our beliefs
        assert len(results) >= 1
        # Verify we found what we added
        all_contents = [r["content"].lower() for r in results]
        assert any(unique_marker.lower() in c for c in all_contents)

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        os.environ.get("DRAAGON_STORAGE_BACKEND") != "draagon-ai",
        reason="Requires draagon-ai backend (set STORAGE_BACKEND=draagon-ai)"
    )
    async def test_draagon_ai_embedding_consistency(self, clean_memory) -> None:
        """Test that embeddings are consistent for same content."""
        from draagon_forge.mcp.tools import beliefs

        # Add same content twice with different IDs
        result1 = await beliefs.add_belief(
            content="Test consistency of embeddings",
            category="test",
            conviction=0.7,
        )
        result2 = await beliefs.add_belief(
            content="Test consistency of embeddings",
            category="test",
            conviction=0.7,
        )

        # Search should find both with similar scores
        results = await beliefs.query_beliefs("consistency of embeddings")

        assert len(results) >= 2
        # Both should have similar relevance scores (within 5%)
        scores = [r.get("score", 0) for r in results[:2]]
        if len(scores) == 2 and all(s > 0 for s in scores):
            assert abs(scores[0] - scores[1]) < 0.05


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
