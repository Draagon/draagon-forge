"""In-memory storage backend for fast iteration."""

from datetime import datetime
from draagon_forge.mcp.models import (
    Belief,
    Principle,
    Pattern,
    SearchResult,
    ReviewItem,
)


class InMemoryBackend:
    """In-memory storage backend using dicts."""

    def __init__(self) -> None:
        """Initialize in-memory storage."""
        self.beliefs: dict[str, Belief] = {}
        self.principles: dict[str, Principle] = {}
        self.patterns: dict[str, Pattern] = {}
        self.review_items: dict[str, ReviewItem] = {}

    def _calculate_match_score(self, query_words: list[str], text: str) -> float:
        """Calculate match score based on keyword overlap.

        Args:
            query_words: Query split into lowercase words
            text: Text to match against

        Returns:
            Score from 0.0 to 1.0 based on word overlap
        """
        text_lower = text.lower()
        text_words = set(text_lower.split())

        # Count matching words
        matches = sum(1 for word in query_words if word in text_words or word in text_lower)

        if matches == 0:
            return 0.0

        # Score based on percentage of query words matched
        return matches / len(query_words)

    async def search(
        self,
        query: str,
        limit: int = 10,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[SearchResult]:
        """Search for relevant content using keyword matching.

        Args:
            query: Search query
            limit: Maximum results to return
            domain: Optional domain filter
            min_conviction: Minimum conviction score filter

        Returns:
            List of search results ordered by relevance
        """
        results: list[SearchResult] = []
        # Split query into words for keyword matching
        query_words = [w.lower().strip() for w in query.split() if w.strip()]
        if not query_words:
            return results

        # Search beliefs
        for belief in self.beliefs.values():
            if domain and belief.domain != domain:
                continue
            if min_conviction and belief.conviction < min_conviction:
                continue

            score = self._calculate_match_score(query_words, belief.content)
            if score > 0:
                results.append(
                    SearchResult(
                        id=belief.id,
                        content=belief.content,
                        score=score,
                        conviction=belief.conviction,
                        source=belief.source,
                        type="belief",
                        metadata=belief.metadata,
                    )
                )

        # Search principles
        for principle in self.principles.values():
            if domain and principle.domain != domain:
                continue
            if min_conviction and principle.conviction < min_conviction:
                continue

            score = self._calculate_match_score(query_words, principle.content)
            if score > 0:
                results.append(
                    SearchResult(
                        id=principle.id,
                        content=principle.content,
                        score=score,
                        conviction=principle.conviction,
                        source="principle",
                        type="principle",
                        metadata=principle.metadata,
                    )
                )

        # Search patterns
        for pattern in self.patterns.values():
            if domain and pattern.domain != domain:
                continue

            searchable = f"{pattern.name} {pattern.description}"
            score = self._calculate_match_score(query_words, searchable)
            if score > 0:
                results.append(
                    SearchResult(
                        id=pattern.id,
                        content=f"{pattern.name}: {pattern.description}",
                        score=score,
                        conviction=pattern.conviction,
                        source="pattern",
                        type="pattern",
                        metadata=pattern.metadata,
                    )
                )

        # Sort by score descending and limit
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:limit]

    async def store_belief(self, belief: Belief) -> str:
        """Store a belief."""
        self.beliefs[belief.id] = belief
        return belief.id

    async def get_belief(self, belief_id: str) -> Belief | None:
        """Get a belief by ID."""
        return self.beliefs.get(belief_id)

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
            List of beliefs matching the filters
        """
        beliefs = list(self.beliefs.values())

        if domain:
            beliefs = [b for b in beliefs if b.domain == domain]

        if category:
            beliefs = [b for b in beliefs if b.category == category]

        if min_conviction is not None:
            beliefs = [b for b in beliefs if b.conviction >= min_conviction]

        # Sort by conviction descending
        beliefs.sort(key=lambda b: b.conviction, reverse=True)
        return beliefs

    async def update_belief(self, belief: Belief) -> None:
        """Update a belief."""
        self.beliefs[belief.id] = belief

    async def delete_belief(self, belief_id: str) -> bool:
        """Delete a belief."""
        if belief_id in self.beliefs:
            del self.beliefs[belief_id]
            return True
        return False

    async def store_principle(self, principle: Principle) -> str:
        """Store a principle."""
        self.principles[principle.id] = principle
        return principle.id

    async def get_principles(
        self,
        domain: str | None = None,
        min_conviction: float | None = None,
    ) -> list[Principle]:
        """Get principles."""
        principles = list(self.principles.values())

        if domain:
            principles = [p for p in principles if p.domain == domain]

        if min_conviction is not None:
            principles = [p for p in principles if p.conviction >= min_conviction]

        # Sort by conviction descending
        principles.sort(key=lambda p: p.conviction, reverse=True)
        return principles

    async def store_pattern(self, pattern: Pattern) -> str:
        """Store a pattern."""
        self.patterns[pattern.id] = pattern
        return pattern.id

    async def get_patterns(self, domain: str | None = None) -> list[Pattern]:
        """Get patterns."""
        patterns = list(self.patterns.values())

        if domain:
            patterns = [p for p in patterns if p.domain == domain]

        # Sort by usage count and conviction
        patterns.sort(key=lambda p: (p.usage_count, p.conviction), reverse=True)
        return patterns

    async def store_review_item(self, item: ReviewItem) -> str:
        """Store a review item."""
        self.review_items[item.id] = item
        return item.id

    async def get_review_queue(self) -> list[ReviewItem]:
        """Get unresolved review items."""
        items = [item for item in self.review_items.values() if not item.resolved]
        # Sort by flagged_at descending (most recent first)
        items.sort(key=lambda i: i.flagged_at, reverse=True)
        return items

    async def resolve_review_item(
        self, item_id: str, resolution: str
    ) -> ReviewItem | None:
        """Resolve a review item."""
        item = self.review_items.get(item_id)
        if item:
            item.resolved = True
            item.resolution = resolution
            item.resolved_at = datetime.now()
            self.review_items[item_id] = item
        return item
