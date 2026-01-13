"""Tests for in-memory storage backend."""

from datetime import datetime
import pytest
from draagon_forge.mcp.memory.inmemory import InMemoryBackend
from draagon_forge.mcp.models import Belief, Principle, Pattern


class TestInMemoryBackend:
    """Tests for InMemoryBackend."""

    @pytest.fixture
    def backend(self) -> InMemoryBackend:
        """Create a backend instance."""
        return InMemoryBackend()

    @pytest.mark.asyncio
    async def test_store_and_get_belief(self, backend: InMemoryBackend) -> None:
        """Test storing and retrieving a belief."""
        belief = Belief(
            id="test-001",
            content="Test belief content",
            conviction=0.8,
            category="testing",
            domain="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await backend.store_belief(belief)
        retrieved = await backend.get_belief("test-001")

        assert retrieved is not None
        assert retrieved.id == "test-001"
        assert retrieved.content == "Test belief content"
        assert retrieved.conviction == 0.8

    @pytest.mark.asyncio
    async def test_search_beliefs(self, backend: InMemoryBackend) -> None:
        """Test searching for beliefs."""
        belief1 = Belief(
            id="test-001",
            content="Use dependency injection for testability",
            conviction=0.9,
            category="architecture",
            domain="backend",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        belief2 = Belief(
            id="test-002",
            content="Always validate user input",
            conviction=0.95,
            category="security",
            domain="api",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await backend.store_belief(belief1)
        await backend.store_belief(belief2)

        # Search for "dependency injection"
        results = await backend.search("dependency injection", limit=10)

        assert len(results) > 0
        assert results[0].content == belief1.content
        assert results[0].type == "belief"

    @pytest.mark.asyncio
    async def test_update_belief_conviction(self, backend: InMemoryBackend) -> None:
        """Test updating belief conviction."""
        belief = Belief(
            id="test-001",
            content="Test belief",
            conviction=0.7,
            category="testing",
            domain="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await backend.store_belief(belief)

        # Update conviction
        belief.conviction = 0.9
        await backend.update_belief(belief)

        retrieved = await backend.get_belief("test-001")
        assert retrieved is not None
        assert retrieved.conviction == 0.9

    @pytest.mark.asyncio
    async def test_delete_belief(self, backend: InMemoryBackend) -> None:
        """Test deleting a belief."""
        belief = Belief(
            id="test-001",
            content="Test belief",
            conviction=0.7,
            category="testing",
            domain="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await backend.store_belief(belief)
        deleted = await backend.delete_belief("test-001")

        assert deleted is True

        retrieved = await backend.get_belief("test-001")
        assert retrieved is None

    @pytest.mark.asyncio
    async def test_get_principles_with_filter(self, backend: InMemoryBackend) -> None:
        """Test getting principles with domain filter."""
        principle1 = Principle(
            id="principle-001",
            content="Use async for I/O operations",
            domain="architecture",
            conviction=0.9,
            created_at=datetime.now(),
        )
        principle2 = Principle(
            id="principle-002",
            content="Write tests for all public APIs",
            domain="testing",
            conviction=0.95,
            created_at=datetime.now(),
        )

        await backend.store_principle(principle1)
        await backend.store_principle(principle2)

        # Get architecture principles
        arch_principles = await backend.get_principles(domain="architecture")

        assert len(arch_principles) == 1
        assert arch_principles[0].domain == "architecture"

    @pytest.mark.asyncio
    async def test_search_with_conviction_filter(self, backend: InMemoryBackend) -> None:
        """Test search with minimum conviction filter."""
        belief_high = Belief(
            id="test-001",
            content="High conviction belief",
            conviction=0.9,
            category="testing",
            domain="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        belief_low = Belief(
            id="test-002",
            content="Low conviction belief",
            conviction=0.3,
            category="testing",
            domain="test",
            source="test",
            usage_count=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        await backend.store_belief(belief_high)
        await backend.store_belief(belief_low)

        # Search with min_conviction filter
        results = await backend.search("belief", limit=10, min_conviction=0.7)

        assert len(results) == 1
        assert results[0].conviction >= 0.7
