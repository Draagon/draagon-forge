# REQ-032: Semantic Belief Decomposition (MCP Integration)

**Priority:** P0
**Effort:** Medium (8 days)
**Dependencies:** REQ-001 (MCP Server), draagon-ai FR-022 (Conditional Belief Architecture)
**Blocks:** REQ-005.6 (Graph Visualization)
**Layer:** 🟢 L3 (draagon-forge) - MCP tool exposure for draagon-ai capabilities

---

## Overview

Expose draagon-ai's conditional belief architecture (FR-022) via MCP tools for Claude Code integration. This requirement is a **thin wrapper layer** that:

1. Exposes FR-022's belief decomposition as MCP tools
2. Provides Neo4j graph queries for VS Code visualization
3. Handles MCP-specific serialization and error handling

### Architectural Principle

**All semantic processing lives in draagon-ai.** Draagon-forge only provides:
- MCP tool definitions
- Request/response serialization
- VS Code-specific UI integration
- Error handling and logging

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LAYER SEPARATION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  draagon-forge (L3: VS Code Extension + MCP Tools)                 │ │
│  │                                                                     │ │
│  │  REQ-032: MCP tool definitions                                     │ │
│  │  REQ-005.6: Graph visualization UI                                 │ │
│  │                                                                     │ │
│  │  • add_conditional_belief() → calls FR-022                         │ │
│  │  • get_belief_graph() → queries Neo4j                              │ │
│  │  • get_applicable_beliefs() → calls FR-022                         │ │
│  │                                                                     │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  draagon-ai (L2: Core AI Framework)                                │ │
│  │                                                                     │ │
│  │  FR-022: Conditional Belief Architecture                           │ │
│  │  FR-006: Word Sense Disambiguation                                 │ │
│  │  FR-019: Semantic Decomposition Pipeline                           │ │
│  │                                                                     │ │
│  │  • LayeredBelief model                                             │ │
│  │  • ConditionExtractor (uses Phase 0/1)                             │ │
│  │  • EntityRegistry (WordNet synset deduplication)                   │ │
│  │  • ConvictionPropagator                                            │ │
│  │  • DefeasibleReasoner                                              │ │
│  │  • ContextSpaceManager                                             │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Requirements

### Phase 1: MCP Tool Exposure (3 days)

#### REQ-032.1: Conditional Belief Tools

Expose FR-022's belief operations as MCP tools:

```python
from fastmcp import FastMCP
from draagon_ai.cognition.beliefs import (
    LayeredBelief,
    BeliefLayer,
    Condition,
    LayeredBeliefProvider,
    ConditionExtractor,
)

mcp = FastMCP("draagon-forge")

@mcp.tool
async def add_conditional_belief(
    content: str,
    conditions: list[dict] | None = None,
    conviction: float = 0.7,
    category: str | None = None,
    domain: str | None = None,
    context_space: str | None = None,
    auto_extract_conditions: bool = True,
) -> dict:
    """Add a belief with optional conditions.

    If auto_extract_conditions is True (default), conditions are extracted
    from the belief text using semantic analysis.

    Args:
        content: The belief text
        conditions: Explicit conditions [{"type": "version", "expression": "Python >= 3.10"}]
        conviction: Initial conviction score (0.0-1.0)
        category: Belief category (security, architecture, etc.)
        domain: Domain filter (database, api, etc.)
        context_space: Context space this belief belongs to
        auto_extract_conditions: Whether to extract conditions from text

    Returns:
        {
            "status": "created",
            "id": "belief-abc123",
            "layer": "CONDITIONAL",
            "conditions": [...],
            "entities": [...],
            "deduplicated": false,
            "duplicate_of": null
        }
    """
    provider = get_belief_provider()

    # Parse explicit conditions
    parsed_conditions = []
    if conditions:
        parsed_conditions = [
            Condition(
                type=c["type"],
                expression=c["expression"],
                confidence=c.get("confidence", 1.0),
            )
            for c in conditions
        ]

    # Auto-extract conditions from text if enabled
    if auto_extract_conditions and not parsed_conditions:
        extractor = get_condition_extractor()
        parsed_conditions = await extractor.extract_conditions(content)

    # Determine layer based on conditions
    layer = BeliefLayer.ATOMIC if not parsed_conditions else BeliefLayer.CONDITIONAL

    # Check for duplicates
    duplicates = await provider.find_duplicate_beliefs(content)
    if duplicates:
        return {
            "status": "duplicate",
            "duplicate_of": duplicates[0],
            "message": "Semantically identical belief already exists",
        }

    # Create belief
    belief = LayeredBelief(
        id=f"belief-{uuid.uuid4().hex[:8]}",
        content=content,
        layer=layer,
        conviction=conviction,
        conditions=parsed_conditions,
        category=category,
        domain=domain,
        context_space=context_space,
    )

    await provider.store_layered_belief(belief)

    return {
        "status": "created",
        "id": belief.id,
        "layer": layer.name,
        "conditions": [c.__dict__ for c in parsed_conditions],
        "entities": belief.entity_ids,
        "deduplicated": False,
        "duplicate_of": None,
    }


@mcp.tool
async def get_applicable_beliefs(
    query: str,
    context: str | None = None,
    satisfied_conditions: list[dict] | None = None,
    limit: int = 10,
) -> list[dict]:
    """Get beliefs applicable in the current context.

    Respects conditional activation and defeasible overrides.
    More specific beliefs defeat general ones when conditions match.

    Args:
        query: Search query
        context: Active context space name (e.g., "security_mode")
        satisfied_conditions: Currently satisfied conditions
        limit: Maximum results

    Returns:
        List of applicable beliefs with scores
    """
    provider = get_belief_provider()
    reasoner = get_defeasible_reasoner()

    # Parse satisfied conditions
    parsed_conditions = []
    if satisfied_conditions:
        parsed_conditions = [
            Condition(type=c["type"], expression=c["expression"])
            for c in satisfied_conditions
        ]

    beliefs = await reasoner.get_applicable_beliefs(
        query=query,
        active_context=context,
        satisfied_conditions=parsed_conditions,
    )

    return [
        {
            "id": b.id,
            "content": b.content,
            "layer": b.layer.name,
            "conviction": b.conviction,
            "conditions": [c.__dict__ for c in b.conditions],
            "domain": b.domain,
            "category": b.category,
        }
        for b in beliefs[:limit]
    ]


@mcp.tool
async def register_belief_override(
    general_belief_id: str,
    specific_belief_id: str,
    reason: str,
) -> dict:
    """Register that a specific belief overrides a general one.

    When both beliefs would apply, the specific one defeats the general.

    Example:
        general: "Use print for debugging"
        specific: "In production, use logging instead of print"

    Args:
        general_belief_id: The more general belief
        specific_belief_id: The more specific belief that defeats it
        reason: Explanation for the override

    Returns:
        {"status": "registered", "override_chain": [...]}
    """
    reasoner = get_defeasible_reasoner()

    await reasoner.register_override(
        general_belief_id=general_belief_id,
        specific_belief_id=specific_belief_id,
        reason=reason,
    )

    # Return the override chain
    chain = await reasoner.get_override_chain(specific_belief_id)

    return {
        "status": "registered",
        "override_chain": chain,
    }
```

**Acceptance Criteria:**
- [ ] `add_conditional_belief` creates layered beliefs
- [ ] Conditions auto-extracted from text
- [ ] Duplicates detected via synset signature
- [ ] `get_applicable_beliefs` respects overrides
- [ ] `register_belief_override` creates override edges
- [ ] All tools return proper MCP-formatted responses

#### REQ-032.2: Entity and Deduplication Tools

Expose entity management tools:

```python
@mcp.tool
async def get_entity_info(
    entity_id: str | None = None,
    surface_form: str | None = None,
    context: str | None = None,
) -> dict:
    """Get information about a normalized entity.

    Entities are deduplicated via WordNet synsets.
    Multiple surface forms may map to the same entity.

    Args:
        entity_id: Entity ID to look up
        surface_form: Surface form to resolve (e.g., "SQL injection", "SQLi")
        context: Context for disambiguation

    Returns:
        {
            "id": "entity-xyz",
            "canonical_name": "sql_injection",
            "synset_id": "injection.n.01",
            "surface_forms": ["SQL injection", "SQLi", "sql injection attack"],
            "conviction": 0.87,
            "linked_beliefs": 5,
            "hypernym_chain": ["attack", "action", "act"]
        }
    """
    registry = get_entity_registry()

    if entity_id:
        entity = await registry.get_entity(entity_id)
    elif surface_form:
        entity, _ = await registry.normalize_entity(surface_form, context or "")
    else:
        raise ValueError("Either entity_id or surface_form required")

    return {
        "id": entity.id,
        "canonical_name": entity.canonical_name,
        "synset_id": entity.synset_id,
        "surface_forms": entity.surface_forms,
        "conviction": entity.conviction,
        "linked_beliefs": entity.linked_belief_count,
        "hypernym_chain": entity.hypernym_chain,
    }


@mcp.tool
async def find_duplicate_beliefs(
    content: str,
    threshold: float = 0.9,
) -> list[dict]:
    """Find beliefs semantically identical to the given content.

    Uses WordNet synset signatures for deduplication.
    Catches paraphrases with different word choices.

    Args:
        content: Belief text to check
        threshold: Similarity threshold (0.0-1.0)

    Returns:
        List of duplicate beliefs with similarity scores
    """
    registry = get_entity_registry()
    provider = get_belief_provider()

    duplicates = await registry.find_duplicate_beliefs(content, threshold)

    results = []
    for belief_id in duplicates:
        belief = await provider.get_belief(belief_id)
        results.append({
            "id": belief.id,
            "content": belief.content,
            "conviction": belief.conviction,
            "layer": belief.layer.name,
        })

    return results
```

**Acceptance Criteria:**
- [ ] Entity lookup by ID or surface form
- [ ] Surface form normalization returns canonical entity
- [ ] Duplicate detection uses synset signatures
- [ ] Hypernym chain available for ontology traversal

#### REQ-032.3: Context Space Tools

Expose context space management:

```python
@mcp.tool
async def create_context_space(
    name: str,
    description: str,
    parent: str | None = None,
) -> dict:
    """Create a context space for scoped belief activation.

    Context spaces allow grouping beliefs that should activate together.

    Examples:
        - "security_mode": Activate security-focused beliefs
        - "legacy_compat": Activate backward compatibility beliefs
        - "performance_mode": Activate performance optimization beliefs

    Args:
        name: Unique context space name
        description: Human-readable description
        parent: Parent context space (for inheritance)

    Returns:
        {"status": "created", "id": "context-abc", "name": "..."}
    """
    manager = get_context_space_manager()

    space = await manager.create_context_space(
        name=name,
        description=description,
        parent_space=parent,
    )

    return {
        "status": "created",
        "id": space.id,
        "name": space.name,
        "description": space.description,
        "parent": space.parent_space_id,
    }


@mcp.tool
async def activate_context(
    context_name: str,
) -> dict:
    """Activate a context space.

    When activated:
    - Beliefs assigned to this context become active
    - Conflicting beliefs may be suppressed
    - Parent contexts are also activated

    Args:
        context_name: Name of context to activate

    Returns:
        {"status": "activated", "affected_beliefs": [...]}
    """
    manager = get_context_space_manager()

    await manager.activate_context(context_name)

    space = await manager.get_active_context()

    return {
        "status": "activated",
        "context": context_name,
        "activated_beliefs": space.activated_belief_ids,
        "deactivated_beliefs": space.deactivated_belief_ids,
    }


@mcp.tool
async def assign_belief_to_context(
    belief_id: str,
    context_name: str,
    mode: str = "activate",
) -> dict:
    """Assign a belief to a context space.

    Args:
        belief_id: Belief to assign
        context_name: Target context space
        mode: "activate" (belief active when context is) or
              "deactivate" (belief suppressed when context is)

    Returns:
        {"status": "assigned", ...}
    """
    manager = get_context_space_manager()

    await manager.assign_belief_to_context(belief_id, context_name, mode)

    return {
        "status": "assigned",
        "belief_id": belief_id,
        "context": context_name,
        "mode": mode,
    }
```

**Acceptance Criteria:**
- [ ] Context spaces created with name and description
- [ ] Context activation switches belief visibility
- [ ] Belief assignment to contexts works
- [ ] Parent-child inheritance supported

---

### Phase 2: Graph Visualization Support (3 days)

#### REQ-032.4: Graph Query Tools

Tools for VS Code graph visualization (REQ-005.6):

```python
@mcp.tool
async def get_belief_graph(
    center_id: str | None = None,
    depth: int = 2,
    include_entities: bool = True,
    include_conditions: bool = True,
    include_overrides: bool = True,
    min_conviction: float = 0.0,
    domains: list[str] | None = None,
) -> dict:
    """Get graph data for visualization.

    Returns nodes and edges for rendering in Cytoscape.js.

    Args:
        center_id: Center the graph on this belief (optional)
        depth: How many hops from center
        include_entities: Include entity nodes
        include_conditions: Include condition nodes
        include_overrides: Include override edges
        min_conviction: Filter by minimum conviction
        domains: Filter by domains

    Returns:
        {
            "nodes": [
                {"id": "...", "type": "belief|entity|condition", "label": "...", "conviction": 0.8}
            ],
            "edges": [
                {"source": "...", "target": "...", "type": "MENTIONS|OVERRIDES|HAS_CONDITION"}
            ],
            "stats": {"node_count": 50, "edge_count": 75, "avg_conviction": 0.72}
        }
    """
    graph_store = get_graph_store()

    if center_id:
        # Ego graph centered on belief
        nodes, edges = await graph_store.get_ego_graph(
            center_id=center_id,
            depth=depth,
        )
    else:
        # Full graph (paginated)
        nodes, edges = await graph_store.get_full_graph(
            min_conviction=min_conviction,
            domains=domains,
            limit=500,
        )

    # Filter by options
    if not include_entities:
        nodes = [n for n in nodes if n["type"] != "entity"]
        edges = [e for e in edges if e["type"] != "MENTIONS"]

    if not include_conditions:
        nodes = [n for n in nodes if n["type"] != "condition"]
        edges = [e for e in edges if e["type"] != "HAS_CONDITION"]

    if not include_overrides:
        edges = [e for e in edges if e["type"] != "OVERRIDES"]

    # Calculate stats
    avg_conviction = (
        sum(n.get("conviction", 0) for n in nodes if n.get("conviction"))
        / max(len([n for n in nodes if n.get("conviction")]), 1)
    )

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "avg_conviction": round(avg_conviction, 2),
        },
    }


@mcp.tool
async def find_graph_path(
    source_id: str,
    target_id: str,
    max_hops: int = 4,
) -> dict:
    """Find shortest path between two nodes in the belief graph.

    Useful for understanding how beliefs are connected.

    Args:
        source_id: Starting node
        target_id: Ending node
        max_hops: Maximum path length

    Returns:
        {
            "found": true,
            "path": [
                {"node_id": "...", "type": "belief"},
                {"edge_type": "MENTIONS"},
                {"node_id": "...", "type": "entity"},
                ...
            ],
            "length": 3
        }
    """
    graph_store = get_graph_store()

    path = await graph_store.find_shortest_path(
        source_id=source_id,
        target_id=target_id,
        max_hops=max_hops,
    )

    if not path:
        return {
            "found": False,
            "path": [],
            "length": 0,
        }

    return {
        "found": True,
        "path": path,
        "length": len([p for p in path if "node_id" in p]),
    }


@mcp.tool
async def get_related_beliefs(
    belief_id: str,
    relationship_types: list[str] | None = None,
    min_overlap: float = 0.3,
) -> list[dict]:
    """Find beliefs related through shared entities.

    Args:
        belief_id: Source belief
        relationship_types: Filter by relationship type (MENTIONS, OVERRIDES, etc.)
        min_overlap: Minimum entity overlap ratio

    Returns:
        List of related beliefs with overlap scores
    """
    graph_store = get_graph_store()

    related = await graph_store.find_related_beliefs(
        belief_id=belief_id,
        relationship_types=relationship_types,
        min_overlap=min_overlap,
    )

    return [
        {
            "id": r.id,
            "content": r.content,
            "conviction": r.conviction,
            "overlap": r.overlap,
            "shared_entities": r.shared_entities,
        }
        for r in related
    ]
```

**Acceptance Criteria:**
- [ ] Graph data returned in Cytoscape-compatible format
- [ ] Ego graph queries work with center node
- [ ] Path finding returns shortest path
- [ ] Related beliefs found via entity overlap
- [ ] Performance: < 500ms for 500 nodes

#### REQ-032.5: Conviction Propagation Trigger

Tool to trigger conviction propagation after changes:

```python
@mcp.tool
async def propagate_conviction_changes(
    belief_id: str,
) -> dict:
    """Propagate conviction changes through the belief graph.

    Called after a belief is reinforced or weakened.
    Updates entity convictions and related beliefs.

    Args:
        belief_id: Belief that was changed

    Returns:
        {"affected_entities": [...], "affected_beliefs": [...]}
    """
    propagator = get_conviction_propagator()
    provider = get_belief_provider()

    belief = await provider.get_belief(belief_id)

    affected = await propagator.propagate_belief_change(
        belief_id=belief_id,
        old_conviction=belief.conviction,  # Note: need to track old value
        new_conviction=belief.conviction,
    )

    return {
        "affected_entities": list(affected.keys()),
        "new_convictions": affected,
    }
```

**Acceptance Criteria:**
- [ ] Entity convictions updated after belief change
- [ ] Propagation respects weighted averaging
- [ ] Returns list of affected nodes

---

### Phase 3: Integration & Testing (2 days)

#### REQ-032.6: Integration with Existing Belief Tools

Update existing belief tools to use FR-022 under the hood:

```python
# Update existing add_belief to use layered beliefs
@mcp.tool
async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
    source: str = "user",
    rationale: str | None = None,
) -> dict:
    """Add a belief (now with automatic condition extraction).

    This is the original add_belief tool, now enhanced to automatically:
    - Extract conditions from belief text
    - Detect duplicates via synset signatures
    - Store in layered belief format

    Args:
        content: Belief text
        category: Category (security, architecture, etc.)
        domain: Domain filter
        conviction: Initial conviction (0.0-1.0)
        source: Source of belief
        rationale: Why this belief exists

    Returns:
        Standard belief creation response
    """
    # Delegate to conditional belief with auto-extraction
    result = await add_conditional_belief(
        content=content,
        conviction=conviction,
        category=category,
        domain=domain,
        auto_extract_conditions=True,
    )

    # Add source and rationale to metadata
    if result["status"] == "created":
        await update_belief_metadata(
            belief_id=result["id"],
            source=source,
            rationale=rationale,
        )

    return result
```

**Acceptance Criteria:**
- [ ] Existing `add_belief` uses FR-022 under the hood
- [ ] Backward compatible with existing callers
- [ ] Automatic condition extraction enabled by default
- [ ] Deduplication active by default

---

## Technical Design

### Module Structure

```
src/draagon_forge/mcp/tools/
├── beliefs.py          # Existing belief tools (enhanced)
├── conditional.py      # NEW: Conditional belief tools (REQ-032.1)
├── entities.py         # NEW: Entity/deduplication tools (REQ-032.2)
├── context_spaces.py   # NEW: Context space tools (REQ-032.3)
└── graph.py            # NEW: Graph visualization tools (REQ-032.4)
```

### Dependencies

```python
# In draagon-forge/pyproject.toml
[project]
dependencies = [
    "draagon-ai>=0.2.0",  # Requires FR-022
    "fastmcp>=0.1.0",
]
```

### Error Handling

```python
from fastmcp.exceptions import ToolError

@mcp.tool
async def add_conditional_belief(...) -> dict:
    try:
        # ... implementation
    except DuplicateBeliefError as e:
        return {
            "status": "duplicate",
            "duplicate_of": e.existing_belief_id,
            "message": str(e),
        }
    except ConditionExtractionError as e:
        # Fall back to atomic belief
        logger.warning(f"Condition extraction failed: {e}")
        return await add_belief(content=content, conviction=conviction, ...)
    except Exception as e:
        raise ToolError(f"Failed to add belief: {e}")
```

---

## Testing

### Unit Tests

```python
class TestMCPConditionalBelief:
    """Test MCP tool wrappers."""

    @pytest.mark.asyncio
    async def test_add_conditional_belief_extracts_conditions(self, mcp_server):
        result = await mcp_server.call_tool(
            "add_conditional_belief",
            content="In Python 3.10+, use match statements",
        )

        assert result["status"] == "created"
        assert result["layer"] == "CONDITIONAL"
        assert len(result["conditions"]) > 0
        assert any("3.10" in c["expression"] for c in result["conditions"])

    @pytest.mark.asyncio
    async def test_duplicate_detection(self, mcp_server):
        # Add first belief
        await mcp_server.call_tool(
            "add_conditional_belief",
            content="Use async/await for I/O operations",
        )

        # Try to add duplicate with different wording
        result = await mcp_server.call_tool(
            "add_conditional_belief",
            content="Use asynchronous programming for input/output",
        )

        assert result["status"] == "duplicate"
```

### Integration Tests

```python
class TestFullPipeline:
    """Test full belief pipeline through MCP."""

    @pytest.mark.asyncio
    async def test_conditional_belief_e2e(self, mcp_server, neo4j_store):
        # Add conditional belief
        result = await mcp_server.call_tool(
            "add_conditional_belief",
            content="For security-critical APIs, always validate JWT tokens",
            conviction=0.9,
        )

        belief_id = result["id"]

        # Verify graph structure
        graph = await mcp_server.call_tool(
            "get_belief_graph",
            center_id=belief_id,
            depth=1,
        )

        assert len(graph["nodes"]) > 1  # Belief + entities
        assert any(n["type"] == "entity" for n in graph["nodes"])
```

---

## Acceptance Checklist

### Phase 1: MCP Tool Exposure (3 days)
- [ ] `add_conditional_belief` tool working
- [ ] `get_applicable_beliefs` respects overrides
- [ ] `register_belief_override` creates edges
- [ ] `get_entity_info` returns normalized entity
- [ ] `find_duplicate_beliefs` uses synset signatures
- [ ] Context space tools working

### Phase 2: Graph Visualization (3 days)
- [ ] `get_belief_graph` returns Cytoscape format
- [ ] `find_graph_path` finds shortest path
- [ ] `get_related_beliefs` finds entity overlap
- [ ] Performance < 500ms for 500 nodes

### Phase 3: Integration (2 days)
- [ ] Existing `add_belief` uses FR-022
- [ ] Backward compatibility maintained
- [ ] Integration tests passing
- [ ] Error handling complete

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Delegated to FR-022 |
| Protocol-Based Design | ✅ | MCP tools |
| Async-First Processing | ✅ | All I/O async |
| Test Outcomes | ✅ | E2E tests verify behavior |

---

## Relationship to draagon-ai FR-022

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `LayeredBelief` | draagon-ai FR-022 | Data model |
| `ConditionExtractor` | draagon-ai FR-022 | Semantic extraction |
| `EntityRegistry` | draagon-ai FR-022 | WordNet deduplication |
| `DefeasibleReasoner` | draagon-ai FR-022 | Override logic |
| `ContextSpaceManager` | draagon-ai FR-022 | Context activation |
| MCP tools | draagon-forge REQ-032 | Tool exposure |
| Graph queries | draagon-forge REQ-032 | Neo4j queries for UI |
| Error handling | draagon-forge REQ-032 | MCP-specific errors |

---

## References

- [draagon-ai FR-022: Conditional Belief Architecture](../../../draagon-ai/.specify/requirements/FR-022-conditional-belief-architecture.md)
- [REQ-005.6: Semantic Graph Visualization](./REQ-005-belief-manager.md#req-0056-semantic-graph-visualization)
- [MCP Specification](https://modelcontextprotocol.io/docs)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
