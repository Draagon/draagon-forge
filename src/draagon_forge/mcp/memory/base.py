"""Abstract memory backend interface."""

from typing import Protocol
from draagon_forge.mcp.models import Belief, Principle, Pattern, SearchResult, ReviewItem


class MemoryBackend(Protocol):
    """Protocol for memory storage backends."""

    async def search(
        self,
        query: str,
        limit: int = 10,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[SearchResult]:
        """Search for relevant content.

        Args:
            query: Search query
            limit: Maximum results to return
            domain: Optional domain filter
            min_conviction: Minimum conviction score filter

        Returns:
            List of search results ordered by relevance
        """
        ...

    async def store_belief(self, belief: Belief) -> str:
        """Store a belief.

        Args:
            belief: Belief to store

        Returns:
            ID of stored belief
        """
        ...

    async def get_belief(self, belief_id: str) -> Belief | None:
        """Get a belief by ID.

        Args:
            belief_id: Belief ID

        Returns:
            Belief if found, None otherwise
        """
        ...

    async def update_belief(self, belief: Belief) -> None:
        """Update a belief.

        Args:
            belief: Updated belief
        """
        ...

    async def delete_belief(self, belief_id: str) -> bool:
        """Delete a belief.

        Args:
            belief_id: Belief ID

        Returns:
            True if deleted, False if not found
        """
        ...

    async def store_principle(self, principle: Principle) -> str:
        """Store a principle.

        Args:
            principle: Principle to store

        Returns:
            ID of stored principle
        """
        ...

    async def get_principles(
        self,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[Principle]:
        """Get principles.

        Args:
            domain: Optional domain filter
            min_conviction: Minimum conviction score filter

        Returns:
            List of principles
        """
        ...

    async def store_pattern(self, pattern: Pattern) -> str:
        """Store a pattern.

        Args:
            pattern: Pattern to store

        Returns:
            ID of stored pattern
        """
        ...

    async def get_patterns(self, domain: str | None = None) -> list[Pattern]:
        """Get patterns.

        Args:
            domain: Optional domain filter

        Returns:
            List of patterns
        """
        ...

    async def store_review_item(self, item: ReviewItem) -> str:
        """Store a review item.

        Args:
            item: Review item to store

        Returns:
            ID of stored item
        """
        ...

    async def get_review_queue(self) -> list[ReviewItem]:
        """Get unresolved review items.

        Returns:
            List of review items
        """
        ...

    async def resolve_review_item(
        self, item_id: str, resolution: str
    ) -> ReviewItem | None:
        """Resolve a review item.

        Args:
            item_id: Review item ID
            resolution: Resolution decision

        Returns:
            Updated review item if found, None otherwise
        """
        ...
