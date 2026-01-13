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
            Memory ID
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
        return memory.id

    async def get_belief(self, belief_id: str) -> Belief | None:
        """Get a belief by ID.

        Args:
            belief_id: Belief ID (could be forge_id or memory_id)

        Returns:
            Belief if found
        """
        memory = await self.provider.get(belief_id)
        if not memory:
            return None

        return Belief(
            id=memory.id,
            content=memory.content,
            conviction=memory.confidence,
            category=memory.source,
            domain=memory.source,
            source=memory.source or "draagon-ai",
            usage_count=memory.stated_count,
            created_at=memory.created_at,
            updated_at=memory.last_accessed or memory.created_at,
            metadata={},
        )

    async def update_belief(self, belief: Belief) -> None:
        """Update a belief.

        Args:
            belief: Updated belief
        """
        await self.provider.update(
            memory_id=belief.id,
            content=belief.content,
            confidence=belief.conviction,
            importance=belief.conviction,
        )

    async def delete_belief(self, belief_id: str) -> bool:
        """Delete a belief.

        Args:
            belief_id: Belief ID

        Returns:
            True if deleted
        """
        return await self.provider.delete(belief_id)

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
