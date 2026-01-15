"""End-to-end integration tests for Java RPG game architecture beliefs.

These tests populate 20 architectural beliefs for Java RPG game development
with database persistence, then test the graph visualization APIs that
VS Code would use to display them.

Run with:
    pytest tests/integration/test_java_rpg_beliefs_e2e.py -v

To test with draagon-ai backend (requires Qdrant + Ollama running):
    DRAAGON_STORAGE_BACKEND=draagon-ai pytest tests/integration/test_java_rpg_beliefs_e2e.py -v
"""

import pytest
from datetime import datetime


# The 20 Java RPG architectural beliefs approved for testing
JAVA_RPG_BELIEFS = [
    # Entity & Data Architecture (1-3)
    {
        "content": "Use Entity-Component-System (ECS) over deep inheritance hierarchies for RPG game objects",
        "category": "architecture",
        "domain": "game-design",
        "conviction": 0.95,
        "rationale": "Composition over inheritance prevents rigid class hierarchies. RPG entities (characters, items, NPCs) vary wildly; ECS allows mixing HealthComponent, InventoryComponent, QuestGiverComponent flexibly.",
    },
    {
        "content": "Separate item templates from player-owned instances in the database schema",
        "category": "data-modeling",
        "domain": "database",
        "conviction": 0.90,
        "rationale": "Item definitions (base stats, descriptions) belong in a read-only item_templates table; player items reference templates with instance-specific data (durability, enchantments) in JSONB columns.",
    },
    {
        "content": "Store game state as immutable events and derive current state from event replay",
        "category": "architecture",
        "domain": "game-design",
        "conviction": 0.85,
        "rationale": "Event sourcing enables replay, debugging, and anti-cheat. 'Player dealt 50 damage to Goblin' events can reconstruct any point in time.",
    },
    # Database Strategy (4-7)
    {
        "content": "Use PostgreSQL for transactional data and Redis for real-time game state",
        "category": "infrastructure",
        "domain": "database",
        "conviction": 0.92,
        "rationale": "PostgreSQL provides ACID guarantees for inventory trades and currency. Redis powers session state, cooldown timers, and leaderboards with sub-millisecond latency.",
    },
    {
        "content": "Implement tiered data storage by player activity level",
        "category": "performance",
        "domain": "database",
        "conviction": 0.88,
        "rationale": "Active players (logged in <90 days) in primary DB with full indexing; inactive players in cold storage with reduced indexes; dormant accounts (365+ days) archived to object storage. Reduces costs 70-80%.",
    },
    {
        "content": "Use soft deletes with deleted_at timestamps instead of hard deletes",
        "category": "data-modeling",
        "domain": "database",
        "conviction": 0.90,
        "rationale": "Maintains referential integrity, enables GDPR-compliant data export, and allows restoration after accidental deletions or ban reversals.",
    },
    {
        "content": "Create composite indexes for common query patterns before adding single-column indexes",
        "category": "performance",
        "domain": "database",
        "conviction": 0.87,
        "rationale": "(player_id, item_type, equipped) beats three separate indexes. Use EXPLAIN ANALYZE before adding indexes speculatively.",
    },
    # Security & Integrity (8-10)
    {
        "content": "All game economy operations must be ACID transactions",
        "category": "security",
        "domain": "database",
        "conviction": 0.95,
        "rationale": "Gold transfers, item trades, and shop purchases require atomicity. Partial failures corrupt game economies irreversibly.",
    },
    {
        "content": "Never trust client-side calculations for authoritative game state",
        "category": "security",
        "domain": "networking",
        "conviction": 0.98,
        "rationale": "Server validates all damage calculations, loot drops, and stat changes. Client is only a presentation layer.",
    },
    {
        "content": "Hash passwords with bcrypt (minimum 12 rounds) or Argon2 for player accounts",
        "category": "security",
        "domain": "authentication",
        "conviction": 0.97,
        "rationale": "Player accounts are high-value targets. MD5/SHA1 are cryptographically broken for password storage.",
    },
    # Performance Patterns (11-13)
    {
        "content": "Batch database operations to avoid N+1 query problems in party/guild loading",
        "category": "performance",
        "domain": "database",
        "conviction": 0.93,
        "rationale": "Loading a party's inventory means one query for all members, not one per member. Use WHERE player_id IN (...) patterns.",
    },
    {
        "content": "Use write-behind caching for frequently updated state like player positions",
        "category": "performance",
        "domain": "caching",
        "conviction": 0.85,
        "rationale": "Player position updates every 100ms shouldn't hit the database. Buffer in Redis, flush periodically.",
    },
    {
        "content": "Implement leaderboards with Redis Sorted Sets and snapshot to SQL for history",
        "category": "architecture",
        "domain": "caching",
        "conviction": 0.88,
        "rationale": "Redis ZADD/ZRANK gives O(log N) ranking. Nightly PostgreSQL snapshots enable historical queries and complex aggregations.",
    },
    # Game Logic Architecture (14-16)
    {
        "content": "Define game rules in data configuration rather than code where possible",
        "category": "architecture",
        "domain": "game-design",
        "conviction": 0.86,
        "rationale": "Skill effects, damage formulas, and quest conditions in database/config enables designer iteration without redeployment.",
    },
    {
        "content": "Separate deterministic game logic from presentation for server-client consistency",
        "category": "architecture",
        "domain": "game-design",
        "conviction": 0.91,
        "rationale": "Combat calculations, pathfinding, and AI run the same on server and client. Only rendering differs. Enables replay and simulation testing.",
    },
    {
        "content": "Use the Command pattern for all player actions to enable validation and replay",
        "category": "patterns",
        "domain": "game-design",
        "conviction": 0.89,
        "rationale": "AttackCommand, UseItemCommand, MoveCommand are serializable, validatable, undoable, and loggable. Essential for replay and anti-cheat.",
    },
    # Scalability (17-18)
    {
        "content": "Shard player data by player_id modulo rather than by game zone",
        "category": "scalability",
        "domain": "database",
        "conviction": 0.84,
        "rationale": "Players move between zones constantly; player data stays with them. Horizontal scaling by player cohort, not geography.",
    },
    {
        "content": "Design for eventual consistency in non-critical social features",
        "category": "scalability",
        "domain": "networking",
        "conviction": 0.82,
        "rationale": "Friend lists, guild rosters, and achievement notifications can lag by seconds. Reserve strong consistency for economy/combat.",
    },
    # Development Practices (19-20)
    {
        "content": "Make it work, make it right, make it fast - in that order",
        "category": "practices",
        "domain": "development",
        "conviction": 0.90,
        "rationale": "Premature optimization kills game projects. A fun game that's slow can be optimized; a fast game that's not fun is worthless.",
    },
    {
        "content": "Prototype boldly with throwaway code but ensure it is truly disposable",
        "category": "practices",
        "domain": "development",
        "conviction": 0.87,
        "rationale": "Exploratory prototypes shouldn't accidentally become production code. Clear separation prevents technical debt accumulation.",
    },
]


@pytest.fixture(scope="module")
async def initialized_memory():
    """Initialize memory backend for tests."""
    from draagon_forge.mcp.memory import initialize_memory, get_memory

    await initialize_memory()
    return get_memory()


@pytest.fixture(scope="module")
async def populated_beliefs(initialized_memory):
    """Populate all 20 Java RPG beliefs and return their IDs."""
    from draagon_forge.mcp.tools import beliefs

    # Clear existing beliefs
    if hasattr(initialized_memory, 'beliefs'):
        initialized_memory.beliefs.clear()
    if hasattr(initialized_memory, '_id_map'):
        initialized_memory._id_map.clear()

    belief_ids = []
    for belief_data in JAVA_RPG_BELIEFS:
        result = await beliefs.add_belief(
            content=belief_data["content"],
            category=belief_data["category"],
            domain=belief_data["domain"],
            conviction=belief_data["conviction"],
            source="java-rpg-architecture",
            rationale=belief_data["rationale"],
        )
        assert result["status"] == "created", f"Failed to create belief: {belief_data['content'][:50]}"
        belief_ids.append(result["id"])

    return belief_ids


class TestJavaRPGBeliefPopulation:
    """Test that all 20 Java RPG beliefs are correctly populated."""

    @pytest.mark.asyncio
    async def test_all_beliefs_created(self, populated_beliefs) -> None:
        """Verify all 20 beliefs were created."""
        assert len(populated_beliefs) == 20, f"Expected 20 beliefs, got {len(populated_beliefs)}"

    @pytest.mark.asyncio
    async def test_list_all_beliefs(self, populated_beliefs) -> None:
        """Test listing all beliefs returns all 20."""
        from draagon_forge.mcp.tools import beliefs

        result = await beliefs.list_all_beliefs()

        assert result["count"] == 20
        assert len(result["beliefs"]) == 20

    @pytest.mark.asyncio
    async def test_filter_by_domain(self, populated_beliefs) -> None:
        """Test filtering beliefs by domain."""
        from draagon_forge.mcp.tools import beliefs

        # Filter by database domain
        db_beliefs = await beliefs.list_all_beliefs(domain="database")
        assert db_beliefs["count"] >= 6, "Expected at least 6 database domain beliefs"

        # Filter by game-design domain
        game_beliefs = await beliefs.list_all_beliefs(domain="game-design")
        assert game_beliefs["count"] >= 4, "Expected at least 4 game-design domain beliefs"

    @pytest.mark.asyncio
    async def test_filter_by_category(self, populated_beliefs) -> None:
        """Test filtering beliefs by category."""
        from draagon_forge.mcp.tools import beliefs

        # Filter by security category
        security_beliefs = await beliefs.list_all_beliefs(category="security")
        assert security_beliefs["count"] == 3, "Expected 3 security category beliefs"

        # Filter by architecture category
        arch_beliefs = await beliefs.list_all_beliefs(category="architecture")
        assert arch_beliefs["count"] >= 4, "Expected at least 4 architecture category beliefs"

    @pytest.mark.asyncio
    async def test_filter_by_conviction(self, populated_beliefs) -> None:
        """Test filtering beliefs by minimum conviction."""
        from draagon_forge.mcp.tools import beliefs

        # High conviction beliefs (>= 0.9)
        high_conviction = await beliefs.list_all_beliefs(min_conviction=0.9)
        assert high_conviction["count"] >= 6, "Expected at least 6 high-conviction beliefs"

        # Very high conviction (>= 0.95)
        very_high = await beliefs.list_all_beliefs(min_conviction=0.95)
        assert very_high["count"] >= 3, "Expected at least 3 beliefs with conviction >= 0.95"

    @pytest.mark.asyncio
    async def test_query_beliefs_by_keyword(self, populated_beliefs) -> None:
        """Test querying beliefs by keyword."""
        from draagon_forge.mcp.tools import beliefs

        # Query for database-related
        results = await beliefs.query_beliefs("database", limit=10)
        assert len(results) >= 1, "Expected at least 1 result for 'database'"

        # Query for security-related
        results = await beliefs.query_beliefs("security password", limit=10)
        assert len(results) >= 1, "Expected at least 1 result for 'security password'"


class TestGraphVisualizationAPI:
    """Test graph visualization APIs that VS Code would call."""

    @pytest.mark.asyncio
    async def test_get_belief_graph_returns_nodes_and_edges(self, populated_beliefs) -> None:
        """Test that get_belief_graph returns proper graph structure."""
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph()

        # Verify structure
        assert "nodes" in graph
        assert "edges" in graph
        assert "stats" in graph

        # Verify stats
        assert graph["stats"]["belief_count"] == 20
        assert graph["stats"]["node_count"] >= 20  # At least beliefs, plus entities
        assert graph["stats"]["edge_count"] >= 0  # Edges from relationships

    @pytest.mark.asyncio
    async def test_graph_nodes_have_required_fields(self, populated_beliefs) -> None:
        """Test that graph nodes have all required visualization fields."""
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph()

        belief_nodes = [n for n in graph["nodes"] if n["type"] == "belief"]
        assert len(belief_nodes) == 20

        # Check first belief node has required fields
        node = belief_nodes[0]
        assert "id" in node
        assert "type" in node
        assert "label" in node
        assert "conviction" in node
        assert "color" in node
        assert "size" in node
        assert "full_content" in node

    @pytest.mark.asyncio
    async def test_graph_conviction_coloring(self, populated_beliefs) -> None:
        """Test that conviction is reflected in node colors."""
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph()

        belief_nodes = [n for n in graph["nodes"] if n["type"] == "belief"]

        # High conviction should be green (#4CAF50)
        high_conviction_nodes = [n for n in belief_nodes if n["conviction"] >= 0.9]
        for node in high_conviction_nodes:
            assert node["color"] == "#4CAF50", f"High conviction node should be green: {node['conviction']}"

        # Medium conviction should be yellow (#FFC107)
        medium_conviction_nodes = [n for n in belief_nodes if 0.5 <= n["conviction"] < 0.8]
        for node in medium_conviction_nodes:
            assert node["color"] == "#FFC107", f"Medium conviction node should be yellow: {node['conviction']}"

    @pytest.mark.asyncio
    async def test_graph_entities_extracted(self, populated_beliefs) -> None:
        """Test that entities are extracted from belief content."""
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph(include_entities=True)

        entity_nodes = [n for n in graph["nodes"] if n["type"] == "entity"]
        assert len(entity_nodes) > 0, "Expected entity nodes to be extracted"

        # Entity nodes should have purple color
        for entity in entity_nodes:
            assert entity["color"] == "#9C27B0"

    @pytest.mark.asyncio
    async def test_graph_edges_connect_beliefs(self, populated_beliefs) -> None:
        """Test that edges connect related beliefs."""
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph()

        # Should have SAME_DOMAIN edges for beliefs in same domain
        domain_edges = [e for e in graph["edges"] if e["type"] == "SAME_DOMAIN"]
        assert len(domain_edges) > 0, "Expected SAME_DOMAIN edges between beliefs"

    @pytest.mark.asyncio
    async def test_graph_filter_by_domain(self, populated_beliefs) -> None:
        """Test filtering graph by domains."""
        from draagon_forge.mcp.tools import beliefs

        # Get only database domain
        graph = await beliefs.get_belief_graph(domains=["database"])

        belief_nodes = [n for n in graph["nodes"] if n["type"] == "belief"]

        # All belief nodes should be from database domain
        for node in belief_nodes:
            assert node["domain"] == "database", f"Expected database domain, got {node['domain']}"

    @pytest.mark.asyncio
    async def test_graph_filter_by_min_conviction(self, populated_beliefs) -> None:
        """Test filtering graph by minimum conviction."""
        from draagon_forge.mcp.tools import beliefs

        # Get only high conviction beliefs
        graph = await beliefs.get_belief_graph(min_conviction=0.9)

        belief_nodes = [n for n in graph["nodes"] if n["type"] == "belief"]

        # All should have conviction >= 0.9
        for node in belief_nodes:
            assert node["conviction"] >= 0.9, f"Expected conviction >= 0.9, got {node['conviction']}"

    @pytest.mark.asyncio
    async def test_find_graph_path(self, populated_beliefs) -> None:
        """Test finding path between two nodes in the graph."""
        from draagon_forge.mcp.tools import beliefs

        # First get the graph to find two connected nodes
        graph = await beliefs.get_belief_graph()

        if len(graph["edges"]) > 0:
            # Try to find a path between first two connected nodes
            edge = graph["edges"][0]
            path = await beliefs.find_graph_path(edge["source"], edge["target"])

            assert len(path) >= 2, "Path should have at least 2 nodes"
            assert path[0]["id"] == edge["source"]
            assert path[-1]["id"] == edge["target"]

    @pytest.mark.asyncio
    async def test_get_entity_context(self, populated_beliefs) -> None:
        """Test getting context for an entity."""
        from draagon_forge.mcp.tools import beliefs

        # First get graph to find an entity
        graph = await beliefs.get_belief_graph(include_entities=True)
        entity_nodes = [n for n in graph["nodes"] if n["type"] == "entity"]

        if entity_nodes:
            entity = entity_nodes[0]
            context = await beliefs.get_entity_context(entity["id"])

            assert "entity" in context
            assert "beliefs" in context
            assert "belief_count" in context


class TestVSCodeIntegration:
    """Test scenarios that match VS Code extension usage patterns."""

    @pytest.mark.asyncio
    async def test_initial_load_workflow(self, populated_beliefs) -> None:
        """Simulate VS Code opening the belief graph panel for the first time."""
        from draagon_forge.mcp.tools import beliefs

        # Step 1: Get overview stats
        all_beliefs = await beliefs.list_all_beliefs()
        assert all_beliefs["count"] == 20

        # Step 2: Get graph for visualization
        graph = await beliefs.get_belief_graph()
        assert graph["stats"]["belief_count"] == 20

        # This is what VS Code would pass to Cytoscape.js
        assert "nodes" in graph
        assert "edges" in graph

    @pytest.mark.asyncio
    async def test_domain_filter_workflow(self, populated_beliefs) -> None:
        """Simulate user filtering graph by domain in VS Code."""
        from draagon_forge.mcp.tools import beliefs

        # User clicks "database" domain filter
        graph = await beliefs.get_belief_graph(domains=["database"])

        # VS Code updates the visualization
        belief_count = graph["stats"]["belief_count"]
        assert belief_count >= 6, "Expected at least 6 database beliefs"

    @pytest.mark.asyncio
    async def test_conviction_filter_workflow(self, populated_beliefs) -> None:
        """Simulate user adjusting conviction slider in VS Code."""
        from draagon_forge.mcp.tools import beliefs

        # User moves slider to 0.85
        graph = await beliefs.get_belief_graph(min_conviction=0.85)

        # All visible beliefs should have conviction >= 0.85
        for node in graph["nodes"]:
            if node["type"] == "belief":
                assert node["conviction"] >= 0.85

    @pytest.mark.asyncio
    async def test_node_click_workflow(self, populated_beliefs) -> None:
        """Simulate user clicking on a belief node in the graph."""
        from draagon_forge.mcp.tools import beliefs

        # Get graph
        graph = await beliefs.get_belief_graph()
        belief_nodes = [n for n in graph["nodes"] if n["type"] == "belief"]

        # Simulate clicking on first belief
        clicked_node = belief_nodes[0]

        # VS Code would show the full content
        assert "full_content" in clicked_node
        assert len(clicked_node["full_content"]) > len(clicked_node["label"])

    @pytest.mark.asyncio
    async def test_export_graph_data(self, populated_beliefs) -> None:
        """Test exporting graph data as JSON (for VS Code export feature)."""
        import json
        from draagon_forge.mcp.tools import beliefs

        graph = await beliefs.get_belief_graph()

        # Should be JSON serializable
        json_str = json.dumps(graph)
        assert len(json_str) > 0

        # Should round-trip correctly
        parsed = json.loads(json_str)
        assert parsed["stats"]["belief_count"] == 20


class TestBeliefAdjustment:
    """Test belief adjustment through the API."""

    @pytest.mark.asyncio
    async def test_reinforce_belief(self, populated_beliefs) -> None:
        """Test reinforcing a belief increases conviction."""
        from draagon_forge.mcp.tools import beliefs

        belief_id = populated_beliefs[0]

        # Get initial conviction
        all_beliefs = await beliefs.list_all_beliefs()
        initial_belief = next(b for b in all_beliefs["beliefs"] if b["id"] == belief_id)
        initial_conviction = initial_belief["conviction"]

        # Reinforce
        result = await beliefs.adjust_belief(
            belief_id=belief_id,
            action="reinforce",
            reason="Proved correct in production",
        )

        assert result["status"] == "updated"
        assert result["conviction"] > initial_conviction

    @pytest.mark.asyncio
    async def test_weaken_belief(self, populated_beliefs) -> None:
        """Test weakening a belief decreases conviction."""
        from draagon_forge.mcp.tools import beliefs

        belief_id = populated_beliefs[1]

        # Get initial conviction
        all_beliefs = await beliefs.list_all_beliefs()
        initial_belief = next(b for b in all_beliefs["beliefs"] if b["id"] == belief_id)
        initial_conviction = initial_belief["conviction"]

        # Weaken
        result = await beliefs.adjust_belief(
            belief_id=belief_id,
            action="weaken",
            reason="Found edge case where this doesn't apply",
        )

        assert result["status"] == "updated"
        assert result["conviction"] < initial_conviction


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
