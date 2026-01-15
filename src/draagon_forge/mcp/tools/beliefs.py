"""Belief management tools."""

from datetime import datetime
import uuid
import structlog
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.models import Belief
from draagon_forge.mcp.config import config

logger = structlog.get_logger(__name__)


async def query_beliefs(
    query: str,
    category: str | None = None,
    min_conviction: float | None = None,
    limit: int = 10,
) -> list[dict]:
    """Query stored beliefs.

    Args:
        query: Search query
        category: Optional category filter
        min_conviction: Minimum conviction threshold
        limit: Maximum results

    Returns:
        List of matching beliefs

    Examples:
        >>> beliefs = await query_beliefs("error handling", min_conviction=0.7)
    """
    logger.debug(
        "Querying beliefs",
        query=query,
        category=category,
        min_conviction=min_conviction,
    )

    memory = get_memory()
    results = await memory.search(
        query=query,
        limit=limit,
        min_conviction=min_conviction,
    )

    # Filter to beliefs only
    beliefs = [r for r in results if r.type == "belief"]

    # Apply category filter if provided
    if category:
        belief_ids = [b.id for b in beliefs]
        filtered_beliefs = []
        for belief_id in belief_ids:
            belief = await memory.get_belief(belief_id)
            if belief and belief.category == category:
                filtered_beliefs.append(belief)
        return [
            {
                "id": b.id,
                "content": b.content,
                "conviction": b.conviction,
                "category": b.category,
                "domain": b.domain,
                "source": b.source,
                "usage_count": b.usage_count,
                "created_at": b.created_at.isoformat(),
                "updated_at": b.updated_at.isoformat(),
                "metadata": b.metadata,
            }
            for b in filtered_beliefs
        ]

    return [
        {
            "id": b.id,
            "content": b.content,
            "score": b.score,
            "conviction": b.conviction,
            "source": b.source,
            "metadata": b.metadata,
        }
        for b in beliefs
    ]


async def adjust_belief(
    belief_id: str,
    action: str,  # "reinforce" | "weaken" | "modify" | "delete"
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust a belief based on user feedback.

    Args:
        belief_id: ID of the belief to adjust
        action: Action to take (reinforce, weaken, modify, delete)
        new_content: New content if modifying
        reason: Reason for the adjustment

    Returns:
        Updated belief or deletion confirmation

    Examples:
        Reinforce a helpful belief:
        >>> result = await adjust_belief(
        ...     belief_id="belief-001",
        ...     action="reinforce",
        ...     reason="Helped avoid a bug"
        ... )

        Modify outdated belief:
        >>> result = await adjust_belief(
        ...     belief_id="belief-002",
        ...     action="modify",
        ...     new_content="Updated approach after library upgrade"
        ... )
    """
    logger.info("Adjusting belief", belief_id=belief_id, action=action)

    memory = get_memory()
    belief = await memory.get_belief(belief_id)

    if not belief:
        return {"status": "error", "message": f"Belief {belief_id} not found"}

    if action == "delete":
        await memory.delete_belief(belief_id)
        return {"status": "deleted", "belief_id": belief_id, "reason": reason}

    elif action == "reinforce":
        belief.conviction = min(1.0, belief.conviction + config.adjust_reinforce_delta)
        belief.updated_at = datetime.now()

    elif action == "weaken":
        belief.conviction = max(0.0, belief.conviction + config.adjust_weaken_delta)
        belief.updated_at = datetime.now()

    elif action == "modify":
        if new_content:
            belief.content = new_content
            belief.updated_at = datetime.now()
        else:
            return {"status": "error", "message": "new_content required for modify"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}

    await memory.update_belief(belief)

    return {
        "status": "updated",
        "belief_id": belief.id,
        "conviction": belief.conviction,
        "action": action,
        "reason": reason,
    }


async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
    source: str = "manual",
    rationale: str | None = None,
) -> dict:
    """Add a new belief to memory.

    Args:
        content: The belief content
        category: Category (architecture, testing, patterns, etc.)
        domain: Domain it applies to
        conviction: Initial conviction (default 0.7)
        source: Where this came from
        rationale: Why this is a belief

    Returns:
        Created belief

    Examples:
        >>> result = await add_belief(
        ...     content="Always validate user input at API boundaries",
        ...     category="security",
        ...     conviction=0.9,
        ...     rationale="Prevents injection attacks"
        ... )
    """
    logger.info("Adding belief", content=content[:50], category=category)

    belief = Belief(
        id=f"belief-{uuid.uuid4().hex[:8]}",
        content=content,
        conviction=conviction,
        category=category,
        domain=domain,
        source=source,
        usage_count=0,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        metadata={"rationale": rationale} if rationale else {},
    )

    memory = get_memory()
    await memory.store_belief(belief)

    return {
        "status": "created",
        "id": belief.id,
        "conviction": belief.conviction,
        "category": belief.category,
    }


async def list_all_beliefs(
    domain: str | None = None,
    category: str | None = None,
    min_conviction: float | None = None,
) -> dict:
    """List all beliefs with optional filtering.

    Args:
        domain: Optional domain filter
        category: Optional category filter
        min_conviction: Minimum conviction threshold

    Returns:
        List of all beliefs matching filters

    Examples:
        >>> result = await list_all_beliefs(domain="database")
        >>> result = await list_all_beliefs(min_conviction=0.8)
    """
    logger.debug(
        "Listing all beliefs",
        domain=domain,
        category=category,
        min_conviction=min_conviction,
    )

    memory = get_memory()
    beliefs = await memory.get_all_beliefs(
        domain=domain,
        category=category,
        min_conviction=min_conviction,
    )

    return {
        "beliefs": [
            {
                "id": b.id,
                "content": b.content,
                "conviction": b.conviction,
                "category": b.category,
                "domain": b.domain,
                "source": b.source,
                "usage_count": b.usage_count,
                "created_at": b.created_at.isoformat(),
                "updated_at": b.updated_at.isoformat(),
                "metadata": b.metadata,
            }
            for b in beliefs
        ],
        "count": len(beliefs),
    }


async def get_belief_graph(
    center_id: str | None = None,
    depth: int = 2,
    include_entities: bool = True,
    min_conviction: float = 0.0,
    domains: list[str] | None = None,
) -> dict:
    """Get graph data for visualization.

    Returns belief graph data formatted for Cytoscape.js or similar
    graph visualization libraries. Nodes represent beliefs, entities,
    and patterns. Edges represent relationships like MENTIONS, RELATED_TO.

    Args:
        center_id: Optional belief ID to center the graph on
        depth: How many hops from center (default 2)
        include_entities: Include extracted entity nodes
        min_conviction: Minimum conviction to include
        domains: Optional list of domains to filter

    Returns:
        Graph data with nodes and edges for visualization

    Examples:
        >>> graph = await get_belief_graph(min_conviction=0.7)
        >>> graph = await get_belief_graph(domains=["database", "architecture"])
    """
    logger.debug(
        "Getting belief graph",
        center_id=center_id,
        depth=depth,
        min_conviction=min_conviction,
    )

    memory = get_memory()
    beliefs = await memory.get_all_beliefs(min_conviction=min_conviction)

    # Filter by domains if specified
    if domains:
        beliefs = [b for b in beliefs if b.domain in domains]

    nodes = []
    edges = []
    entity_set: set[str] = set()  # Track unique entities

    # Create belief nodes
    for belief in beliefs:
        # Determine color based on conviction
        if belief.conviction >= 0.8:
            color = "#4CAF50"  # Green - high conviction
        elif belief.conviction >= 0.5:
            color = "#FFC107"  # Yellow - medium conviction
        else:
            color = "#F44336"  # Red - low conviction

        nodes.append({
            "id": belief.id,
            "type": "belief",
            "label": belief.content[:50] + ("..." if len(belief.content) > 50 else ""),
            "full_content": belief.content,
            "conviction": belief.conviction,
            "category": belief.category,
            "domain": belief.domain,
            "color": color,
            "size": 30 + (belief.conviction * 20),  # Size based on conviction
        })

        # Extract simple entities from content (keywords)
        if include_entities:
            # Simple entity extraction - in production this would use NLP
            words = belief.content.lower().split()
            # Extract key terms (words > 4 chars, not common)
            stop_words = {"should", "always", "never", "about", "using", "which", "their", "these", "those", "would", "could"}
            entities = [w.strip(".,;:!?()\"'") for w in words if len(w) > 4 and w not in stop_words]

            for entity in entities[:5]:  # Limit entities per belief
                if entity and entity not in entity_set:
                    entity_set.add(entity)
                    nodes.append({
                        "id": f"entity-{entity}",
                        "type": "entity",
                        "label": entity,
                        "color": "#9C27B0",  # Purple for entities
                        "size": 15,
                    })

                # Create edge from belief to entity
                if entity:
                    edges.append({
                        "source": belief.id,
                        "target": f"entity-{entity}",
                        "type": "MENTIONS",
                        "color": "#999999",
                    })

    # Create edges between beliefs in same category/domain
    belief_list = list(beliefs)
    for i, b1 in enumerate(belief_list):
        for b2 in belief_list[i+1:]:
            # Connect beliefs in same domain
            if b1.domain and b1.domain == b2.domain:
                edges.append({
                    "source": b1.id,
                    "target": b2.id,
                    "type": "SAME_DOMAIN",
                    "color": "#2196F3",  # Blue
                })
            # Connect beliefs in same category
            elif b1.category and b1.category == b2.category:
                edges.append({
                    "source": b1.id,
                    "target": b2.id,
                    "type": "SAME_CATEGORY",
                    "color": "#FF9800",  # Orange
                })

    # Calculate stats
    avg_conviction = sum(b.conviction for b in beliefs) / len(beliefs) if beliefs else 0

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "belief_count": len(beliefs),
            "entity_count": len(entity_set),
            "avg_conviction": round(avg_conviction, 3),
        },
    }


async def find_graph_path(
    source_id: str,
    target_id: str,
    max_hops: int = 4,
) -> list[dict]:
    """Find shortest path between two nodes in belief graph.

    Uses breadth-first search to find the shortest path between
    two nodes (beliefs or entities) in the graph.

    Args:
        source_id: Starting node ID
        target_id: Target node ID
        max_hops: Maximum number of edges to traverse

    Returns:
        List of nodes in the path, or empty if no path found

    Examples:
        >>> path = await find_graph_path("belief-001", "belief-005")
    """
    logger.debug(
        "Finding graph path",
        source_id=source_id,
        target_id=target_id,
        max_hops=max_hops,
    )

    # Get the full graph
    graph = await get_belief_graph(include_entities=True)

    # Build adjacency list
    adjacency: dict[str, list[str]] = {}
    for edge in graph["edges"]:
        src, tgt = edge["source"], edge["target"]
        if src not in adjacency:
            adjacency[src] = []
        if tgt not in adjacency:
            adjacency[tgt] = []
        adjacency[src].append(tgt)
        adjacency[tgt].append(src)  # Undirected graph

    # BFS to find shortest path
    if source_id not in adjacency:
        return []

    visited = {source_id}
    queue = [(source_id, [source_id])]

    while queue:
        current, path = queue.pop(0)

        if current == target_id:
            # Build path with node details
            node_map = {n["id"]: n for n in graph["nodes"]}
            return [node_map.get(node_id, {"id": node_id}) for node_id in path]

        if len(path) >= max_hops:
            continue

        for neighbor in adjacency.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))

    return []  # No path found


async def get_entity_context(entity_id: str) -> dict:
    """Get all beliefs mentioning an entity.

    Args:
        entity_id: Entity ID (e.g., "entity-database")

    Returns:
        Entity details with all related beliefs

    Examples:
        >>> context = await get_entity_context("entity-database")
    """
    logger.debug("Getting entity context", entity_id=entity_id)

    # Get graph to find connections
    graph = await get_belief_graph(include_entities=True)

    # Find the entity node
    entity_node = None
    for node in graph["nodes"]:
        if node["id"] == entity_id:
            entity_node = node
            break

    if not entity_node:
        return {"status": "error", "message": f"Entity {entity_id} not found"}

    # Find all beliefs connected to this entity
    connected_beliefs = []
    for edge in graph["edges"]:
        if edge["target"] == entity_id:
            # Find the source belief
            for node in graph["nodes"]:
                if node["id"] == edge["source"] and node["type"] == "belief":
                    connected_beliefs.append(node)
                    break

    return {
        "entity": entity_node,
        "beliefs": connected_beliefs,
        "belief_count": len(connected_beliefs),
    }
