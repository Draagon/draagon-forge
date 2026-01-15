"""Adapter to use draagon-ai MemoryProvider with Draagon Forge's MemoryBackend interface."""

from datetime import datetime
from typing import TYPE_CHECKING
import uuid

import structlog

from draagon_forge.mcp.config import MCPConfig
from draagon_forge.mcp.models import (
    Belief,
    Principle,
    Pattern,
    SearchResult,
    ReviewItem,
)

if TYPE_CHECKING:
    from draagon_ai.memory.base import MemoryProvider

logger = structlog.get_logger(__name__)


class DraagonAIAdapter:
    """Adapts draagon-ai MemoryProvider to Draagon Forge MemoryBackend interface."""

    def __init__(self, provider: "MemoryProvider", config: MCPConfig) -> None:
        """Initialize adapter.

        Args:
            provider: draagon-ai memory provider
            config: MCP configuration
        """
        self.provider = provider
        self.config = config
        self.review_items: dict[str, ReviewItem] = {}  # Local storage for review queue
        # ID mapping: forge_id -> memory_id (Qdrant uses UUIDs, we use forge IDs)
        self._id_map: dict[str, str] = {}

    async def search(
        self,
        query: str,
        limit: int = 10,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[SearchResult]:
        """Search using draagon-ai semantic search.

        Args:
            query: Search query
            limit: Maximum results
            domain: Optional domain filter (mapped to metadata)
            min_conviction: Minimum conviction (mapped to confidence)

        Returns:
            List of search results
        """
        from draagon_ai.memory.base import MemoryType, MemoryScope

        # Map to draagon-ai search
        results = await self.provider.search(
            query=query,
            agent_id=self.config.agent_id,
            limit=limit,
            min_score=min_conviction or self.config.min_conviction_threshold,
        )

        search_results = []
        for result in results:
            memory = result.memory

            # Filter by domain if specified
            if domain and memory.source != domain:
                continue

            # Map memory type to our type
            type_mapping = {
                "belief": "belief",
                "knowledge": "principle",
                "skill": "pattern",
                "insight": "learning",
            }
            result_type = type_mapping.get(memory.memory_type.value, "belief")

            search_results.append(
                SearchResult(
                    id=memory.id,
                    content=memory.content,
                    score=result.score,
                    conviction=memory.confidence,
                    source=memory.source or "unknown",
                    type=result_type,
                    metadata={
                        "memory_type": memory.memory_type.value,
                        "scope": memory.scope.value if hasattr(memory.scope, 'value') else str(memory.scope),
                        "importance": str(memory.importance),
                    },
                )
            )

        return search_results[:limit]

    async def store_belief(self, belief: Belief) -> str:
        """Store a belief as a draagon-ai memory.

        Args:
            belief: Belief to store

        Returns:
            Memory ID (the forge_id, not the Qdrant UUID)
        """
        from draagon_ai.memory.base import MemoryType, MemoryScope

        memory = await self.provider.store(
            content=belief.content,
            memory_type=MemoryType.BELIEF,
            scope=MemoryScope.AGENT,
            agent_id=self.config.agent_id,
            user_id=self.config.user_id,
            importance=belief.conviction,
            confidence=belief.conviction,
            metadata={
                "category": belief.category or "",
                "domain": belief.domain or "",
                "forge_id": belief.id,
                **belief.metadata,
            },
        )
        # Store the mapping: forge_id -> qdrant_uuid
        self._id_map[belief.id] = memory.id
        logger.debug("Stored belief ID mapping", forge_id=belief.id, memory_id=memory.id)
        return belief.id  # Return forge_id for consistency

    async def get_belief(self, belief_id: str) -> Belief | None:
        """Get a belief by ID.

        Args:
            belief_id: Belief ID (can be forge_id like 'belief-abc123' or Qdrant UUID)

        Returns:
            Belief if found
        """
        memory = None
        forge_id = belief_id
        qdrant_metadata: dict = {}

        # Check if it's a forge_id that we have mapped
        if belief_id in self._id_map:
            memory_id = self._id_map[belief_id]
            memory = await self.provider.get(memory_id)
            # Also get the metadata from Qdrant
            qdrant_metadata = await self._get_qdrant_metadata(memory_id)
        # If it looks like a forge_id (starts with "belief-"), try to find it
        elif belief_id.startswith("belief-"):
            memory = await self._find_by_forge_id(belief_id)
            if memory:
                qdrant_metadata = await self._get_qdrant_metadata(memory.id)
        else:
            # Assume it's a Qdrant UUID, try direct lookup
            memory = await self.provider.get(belief_id)
            if memory:
                qdrant_metadata = await self._get_qdrant_metadata(belief_id)
                forge_id = qdrant_metadata.get("forge_id", belief_id)
                # Cache the reverse mapping too
                self._id_map[forge_id] = belief_id

        if not memory:
            return None

        # Extract category and domain from Qdrant metadata (where we stored them)
        category = qdrant_metadata.get("category") or None
        domain = qdrant_metadata.get("domain") or None

        return Belief(
            id=forge_id,
            content=memory.content,
            conviction=memory.confidence,
            category=category,
            domain=domain,
            source=memory.source if isinstance(memory.source, str) else "draagon-ai",
            usage_count=memory.stated_count,
            created_at=memory.created_at,
            updated_at=memory.last_accessed or memory.created_at,
            metadata=qdrant_metadata,
        )

    async def _get_qdrant_metadata(self, memory_id: str) -> dict:
        """Get metadata from Qdrant payload.

        Args:
            memory_id: The Qdrant point ID (UUID)

        Returns:
            Metadata dict from the payload
        """
        try:
            point_result = await self.provider._client.retrieve(
                collection_name=self.provider.config.collection_name,
                ids=[memory_id],
                with_payload=True,
            )
            if point_result:
                return point_result[0].payload.get("metadata", {})
        except Exception as e:
            logger.debug("Failed to retrieve Qdrant metadata", memory_id=memory_id, error=str(e))
        return {}

    async def _find_by_forge_id(self, forge_id: str) -> "Memory | None":
        """Find a memory by its forge_id in metadata.

        Note: This is a fallback when we don't have the ID in our mapping.
        It's less efficient than a direct lookup, but necessary when the
        adapter is restarted and loses its in-memory ID map.

        Args:
            forge_id: The forge ID to search for

        Returns:
            Memory if found
        """
        from draagon_ai.memory.base import MemoryType

        # Search all beliefs and filter by forge_id
        # We can't search by metadata directly, so we search with the belief content
        # and then filter by forge_id in the metadata
        results = await self.provider.search(
            query="belief principle pattern",  # General query to get beliefs
            agent_id=self.config.agent_id,
            memory_types=[MemoryType.BELIEF],
            limit=100,  # Should be enough for most cases
        )

        for result in results:
            memory = result.memory
            # The forge_id is stored in Qdrant payload's metadata field
            # We need to access it through the raw client since Memory doesn't expose it
            # For now, we'll use a workaround: search by content that was stored
            # TODO: Add metadata access to draagon-ai Memory class or use Qdrant client directly

            # Try to get the raw point to access metadata
            try:
                point_result = await self.provider._client.retrieve(
                    collection_name=self.provider.config.collection_name,
                    ids=[memory.id],
                    with_payload=True,
                )
                if point_result:
                    payload = point_result[0].payload
                    metadata = payload.get("metadata", {})
                    if metadata.get("forge_id") == forge_id:
                        # Cache the mapping for future lookups
                        self._id_map[forge_id] = memory.id
                        return memory
            except Exception as e:
                logger.debug("Failed to retrieve metadata for belief", memory_id=memory.id, error=str(e))
                continue

        return None

    async def update_belief(self, belief: Belief) -> None:
        """Update a belief.

        Args:
            belief: Updated belief
        """
        # Resolve forge_id to qdrant_uuid
        memory_id = self._id_map.get(belief.id)
        if not memory_id:
            # Try to find it
            memory = await self._find_by_forge_id(belief.id)
            if memory:
                memory_id = memory.id
            else:
                logger.warning("Cannot update belief - not found", belief_id=belief.id)
                return

        await self.provider.update(
            memory_id=memory_id,
            content=belief.content,
            confidence=belief.conviction,
            importance=belief.conviction,
        )

    async def delete_belief(self, belief_id: str) -> bool:
        """Delete a belief.

        Args:
            belief_id: Belief ID (forge_id)

        Returns:
            True if deleted
        """
        # Resolve forge_id to qdrant_uuid
        memory_id = self._id_map.get(belief_id)
        if not memory_id:
            # Try to find it
            memory = await self._find_by_forge_id(belief_id)
            if memory:
                memory_id = memory.id
            else:
                logger.warning("Cannot delete belief - not found", belief_id=belief_id)
                return False

        result = await self.provider.delete(memory_id)
        # Remove from mapping
        if belief_id in self._id_map:
            del self._id_map[belief_id]
        return result

    async def get_all_beliefs(
        self,
        domain: str | None = None,
        category: str | None = None,
        min_conviction: float | None = None,
    ) -> list[Belief]:
        """Get all beliefs with optional filtering.

        Args:
            domain: Optional domain filter
            category: Optional category filter
            min_conviction: Minimum conviction threshold

        Returns:
            List of beliefs matching filters
        """
        from draagon_ai.memory.base import MemoryType

        # Search for all beliefs using a broad query that matches common belief content
        # Since "*" doesn't work as wildcard, use common words found in beliefs
        results = await self.provider.search(
            query="always never should use avoid prefer implement handle",
            agent_id=self.config.agent_id,
            memory_types=[MemoryType.BELIEF],
            limit=500,  # Get a lot to capture all beliefs
            min_score=min_conviction or 0.0,
        )

        beliefs = []
        seen_ids: set[str] = set()  # Track IDs to avoid duplicates

        for result in results:
            memory = result.memory

            # Get metadata from Qdrant payload
            qdrant_metadata = await self._get_qdrant_metadata(memory.id)
            belief_domain = qdrant_metadata.get("domain") or None
            belief_category = qdrant_metadata.get("category") or None
            forge_id = qdrant_metadata.get("forge_id")

            # Skip entries without a proper forge_id (these are test artifacts)
            if not forge_id or not forge_id.startswith("belief-"):
                logger.debug("Skipping memory without proper forge_id", memory_id=memory.id)
                continue

            # Skip duplicates (semantic search can return the same entry multiple times)
            if forge_id in seen_ids:
                continue
            seen_ids.add(forge_id)

            # Apply domain filter
            if domain and belief_domain != domain:
                continue

            # Apply category filter
            if category and belief_category != category:
                continue

            beliefs.append(
                Belief(
                    id=forge_id,
                    content=memory.content,
                    conviction=memory.confidence,
                    category=belief_category,
                    domain=belief_domain,
                    source=memory.source if isinstance(memory.source, str) else "draagon-ai",
                    usage_count=memory.stated_count,
                    created_at=memory.created_at,
                    updated_at=memory.last_accessed or memory.created_at,
                    metadata=qdrant_metadata,
                )
            )

        return beliefs

    async def store_principle(self, principle: Principle) -> str:
        """Store a principle as knowledge memory.

        Args:
            principle: Principle to store

        Returns:
            Memory ID
        """
        from draagon_ai.memory.base import MemoryType, MemoryScope

        # Include examples in content
        content = principle.content
        if principle.examples:
            content += "\n\nExamples:\n" + "\n".join(f"- {ex}" for ex in principle.examples)

        memory = await self.provider.store(
            content=content,
            memory_type=MemoryType.KNOWLEDGE,
            scope=MemoryScope.AGENT,
            agent_id=self.config.agent_id,
            importance=principle.conviction,
            confidence=principle.conviction,
            metadata={
                "domain": principle.domain,
                "forge_id": principle.id,
                "type": "principle",
                **principle.metadata,
            },
        )
        return memory.id

    async def get_principles(
        self,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[Principle]:
        """Get principles.

        Args:
            domain: Optional domain filter
            min_conviction: Minimum conviction filter

        Returns:
            List of principles
        """
        from draagon_ai.memory.base import MemoryType

        # Search for knowledge-type memories
        results = await self.provider.search(
            query="principle pattern best practice",
            agent_id=self.config.agent_id,
            memory_types=[MemoryType.KNOWLEDGE],
            limit=50,
            min_score=min_conviction,
        )

        principles = []
        for result in results:
            memory = result.memory
            principles.append(
                Principle(
                    id=memory.id,
                    content=memory.content,
                    domain=domain or "general",
                    conviction=memory.confidence,
                    examples=[],
                    created_at=memory.created_at,
                    metadata={},
                )
            )

        return principles

    async def store_pattern(self, pattern: Pattern) -> str:
        """Store a pattern as skill memory.

        Args:
            pattern: Pattern to store

        Returns:
            Memory ID
        """
        from draagon_ai.memory.base import MemoryType, MemoryScope

        content = f"{pattern.name}: {pattern.description}"
        if pattern.code_examples:
            content += "\n\nCode examples:\n" + "\n---\n".join(pattern.code_examples)

        memory = await self.provider.store(
            content=content,
            memory_type=MemoryType.SKILL,
            scope=MemoryScope.AGENT,
            agent_id=self.config.agent_id,
            importance=pattern.conviction,
            confidence=pattern.conviction,
            metadata={
                "domain": pattern.domain,
                "forge_id": pattern.id,
                "name": pattern.name,
                "type": "pattern",
                **pattern.metadata,
            },
        )
        return memory.id

    async def get_patterns(self, domain: str | None = None) -> list[Pattern]:
        """Get patterns.

        Args:
            domain: Optional domain filter

        Returns:
            List of patterns
        """
        from draagon_ai.memory.base import MemoryType

        results = await self.provider.search(
            query="pattern example code implementation",
            agent_id=self.config.agent_id,
            memory_types=[MemoryType.SKILL],
            limit=50,
        )

        patterns = []
        for result in results:
            memory = result.memory
            patterns.append(
                Pattern(
                    id=memory.id,
                    name=memory.content.split(":")[0] if ":" in memory.content else memory.id,
                    description=memory.content,
                    domain=domain or "general",
                    code_examples=[],
                    conviction=memory.confidence,
                    usage_count=memory.stated_count,
                    created_at=memory.created_at,
                    metadata={},
                )
            )

        return patterns

    async def store_review_item(self, item: ReviewItem) -> str:
        """Store a review item (local storage).

        Args:
            item: Review item

        Returns:
            Item ID
        """
        self.review_items[item.id] = item
        return item.id

    async def get_review_queue(self) -> list[ReviewItem]:
        """Get unresolved review items.

        Returns:
            List of review items
        """
        return [item for item in self.review_items.values() if not item.resolved]

    async def resolve_review_item(
        self, item_id: str, resolution: str
    ) -> ReviewItem | None:
        """Resolve a review item.

        Args:
            item_id: Item ID
            resolution: Resolution text

        Returns:
            Updated item if found
        """
        item = self.review_items.get(item_id)
        if item:
            item.resolved = True
            item.resolution = resolution
            item.resolved_at = datetime.now()
        return item
