"""API route definitions for Forge chat service."""

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from draagon_forge.api.models import (
    ChatRequest,
    ChatResponse,
    OpenAIChatRequest,
    OpenAIChatResponse,
    OpenAIChoice,
    OpenAIMessage,
    OpenAIUsage,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Singleton for Forge agent
_forge_agent = None
_agent_initialized = False


async def get_forge_agent():
    """Get or create the Forge agent singleton.

    Lazy loads the agent to avoid slow startup.
    """
    global _forge_agent, _agent_initialized

    if not _agent_initialized:
        try:
            from draagon_forge.agent import create_forge_agent

            _forge_agent = await create_forge_agent()
            _agent_initialized = True
            logger.info("Forge agent initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Forge agent: {e}")
            _agent_initialized = True  # Don't retry every request
            raise

    return _forge_agent


async def process_chat(
    message: str,
    user_id: str = "default",
    conversation_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> ChatResponse:
    """Process a chat message through the Forge agent.

    Args:
        message: User's message
        user_id: User identifier
        conversation_id: Optional conversation ID for context
        context: Optional additional context

    Returns:
        ChatResponse with Forge's response
    """
    try:
        agent = await get_forge_agent()

        if agent is None:
            # Fallback to search if agent unavailable
            return await _fallback_chat(message)

        from draagon_forge.agent.forge_agent import process_message

        agent_context = context or {}
        agent_context["user_id"] = user_id
        if conversation_id:
            agent_context["session_id"] = conversation_id

        response_text = await process_message(agent, message, agent_context)

        return ChatResponse(
            response=response_text,
            conversation_id=conversation_id,
            beliefs_used=[],
            actions_taken=["answer"],
            confidence=0.8,
        )

    except Exception as e:
        logger.error(f"Chat processing error: {e}")
        return await _fallback_chat(message, error=str(e))


async def _fallback_chat(message: str, error: str | None = None) -> ChatResponse:
    """Fallback response when agent is unavailable."""
    from draagon_forge.mcp.tools import search

    results = await search.search_context(message, limit=3)

    if results:
        response = "Here's what I found:\n\n"
        for r in results:
            response += f"- {r['content']}\n"
        if error:
            response += f"\n(Full agent unavailable: {error})"
    else:
        response = "I don't have specific information about that yet."
        if error:
            response += f" (Error: {error})"

    return ChatResponse(
        response=response,
        beliefs_used=[r.get("id", "") for r in results] if results else [],
        actions_taken=["search_context"],
        confidence=0.5,
    )


# =============================================================================
# CHAT ENDPOINTS
# =============================================================================


@router.post("/chat", response_model=None)
async def chat(request: ChatRequest) -> ChatResponse:
    """Simple chat endpoint for Forge.

    Args:
        request: Chat request with message and optional context

    Returns:
        ChatResponse with Forge's response
    """
    from draagon_forge.mcp.config import config

    user_id = request.user_id or config.user_id
    return await process_chat(
        message=request.message,
        user_id=user_id,
        conversation_id=request.conversation_id,
        context=request.context,
    )


@router.post("/v1/chat/completions", response_model=None)
async def openai_chat_completions(request: OpenAIChatRequest) -> OpenAIChatResponse:
    """OpenAI-compatible chat completions endpoint.

    This allows Forge to work with Open WebUI and other OpenAI-compatible clients.

    Args:
        request: OpenAI-format chat completion request

    Returns:
        OpenAI-format chat completion response
    """
    query = request.get_user_query()

    if not query:
        return OpenAIChatResponse(
            choices=[OpenAIChoice(message=OpenAIMessage(content="No query provided"))],
            usage=OpenAIUsage(),
        )

    chat_response = await process_chat(
        message=query,
        user_id=request.get_user_id(),
        conversation_id=request.conversation_id,
        context=request.context,
    )

    return OpenAIChatResponse(
        choices=[
            OpenAIChoice(
                message=OpenAIMessage(role="assistant", content=chat_response.response)
            )
        ],
        usage=OpenAIUsage(
            completion_tokens=len(chat_response.response),
            total_tokens=len(chat_response.response),
        ),
    )


# =============================================================================
# HEALTH & INFO ENDPOINTS
# =============================================================================


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "draagon-forge",
        "timestamp": int(time.time()),
    }


@router.get("/info")
async def info() -> dict[str, Any]:
    """Service information endpoint."""
    from draagon_forge.mcp.config import config

    return {
        "service": "draagon-forge",
        "version": "0.1.0",
        "description": "AI Development Companion - intelligent, learning, proactive coding assistance",
        "llm_model": config.llm_model,
        "llm_provider": config.llm_provider,
        "user_id": config.user_id,
    }


# =============================================================================
# BELIEFS & CONTEXT ENDPOINTS
# =============================================================================


@router.get("/beliefs")
async def list_beliefs(
    query: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Query stored beliefs.

    Args:
        query: Optional search query
        limit: Maximum results to return

    Returns:
        List of matching beliefs
    """
    from draagon_forge.mcp.tools import beliefs

    if query:
        results = await beliefs.query_beliefs(query, limit=limit)
    else:
        results = await beliefs.query_beliefs("*", limit=limit)

    return {"beliefs": results, "count": len(results)}


@router.post("/beliefs")
async def add_belief(
    content: str,
    category: str | None = None,
    domain: str | None = None,
    conviction: float = 0.7,
) -> dict[str, Any]:
    """Add a new belief.

    Args:
        content: The belief content
        category: Optional category
        domain: Optional domain
        conviction: Initial conviction score (0-1)

    Returns:
        The created belief
    """
    from draagon_forge.mcp.tools import beliefs

    result = await beliefs.add_belief(
        content=content,
        category=category,
        domain=domain,
        conviction=conviction,
        source="api",
    )
    return result


@router.get("/search")
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
) -> dict[str, Any]:
    """Search semantic memory.

    Args:
        query: Search query
        limit: Maximum results
        domain: Optional domain filter

    Returns:
        Search results
    """
    from draagon_forge.mcp.tools import search

    results = await search.search_context(query, limit=limit, domain=domain)
    return {"results": results, "count": len(results)}


@router.get("/memory")
async def list_memory(
    memory_type: str | None = None,
    domain: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """List all memories, optionally filtered.

    Args:
        memory_type: Filter by type (belief, insight, knowledge, skill)
        domain: Filter by domain
        limit: Maximum results

    Returns:
        List of memories
    """
    from draagon_forge.agent.forge_agent import get_shared_memory
    from draagon_forge.mcp.config import config

    memory = get_shared_memory()
    if memory is None:
        return {"memories": [], "count": 0}

    # Build query based on filters
    query_parts = []
    if memory_type:
        query_parts.append(memory_type)
    if domain:
        query_parts.append(domain)

    query = " ".join(query_parts) if query_parts else "*"

    results = await memory.search(
        query,
        limit=limit,
        user_id=config.user_id,
        agent_id=config.agent_id,
    )

    memories = [
        {
            "id": str(r.id) if hasattr(r, "id") else str(i),
            "content": r.content if hasattr(r, "content") else str(r),
            "type": r.metadata.get("type", "memory") if hasattr(r, "metadata") else "memory",
            "domain": r.metadata.get("domain") if hasattr(r, "metadata") else None,
            "category": r.metadata.get("category") if hasattr(r, "metadata") else None,
            "conviction": r.metadata.get("conviction", 0.7) if hasattr(r, "metadata") else 0.7,
            "score": r.score if hasattr(r, "score") else 0.8,
            "source": r.metadata.get("source", "agent") if hasattr(r, "metadata") else "agent",
        }
        for i, r in enumerate(results)
    ]

    return {"memories": memories, "count": len(memories)}


@router.patch("/beliefs/{belief_id}")
async def adjust_belief(
    belief_id: str,
    action: str,
    new_content: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    """Adjust a belief (reinforce, weaken, modify, or delete).

    Args:
        belief_id: ID of the belief to adjust
        action: Action to take - "reinforce" | "weaken" | "modify" | "delete"
        new_content: New content if modifying
        reason: Reason for the adjustment

    Returns:
        Updated belief info or deletion confirmation
    """
    from draagon_forge.mcp.tools import beliefs

    if action not in ("reinforce", "weaken", "modify", "delete"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action: {action}. Must be reinforce, weaken, modify, or delete.",
        )

    result = await beliefs.adjust_belief(
        belief_id=belief_id,
        action=action,
        new_content=new_content,
        reason=reason,
    )

    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "Belief not found"))

    return result


@router.delete("/beliefs/{belief_id}")
async def delete_belief(
    belief_id: str,
    reason: str | None = None,
) -> dict[str, Any]:
    """Delete a belief by ID.

    Args:
        belief_id: ID of the belief to delete
        reason: Reason for deletion

    Returns:
        Deletion status
    """
    from draagon_forge.mcp.tools import beliefs

    result = await beliefs.adjust_belief(
        belief_id=belief_id,
        action="delete",
        reason=reason,
    )

    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "Belief not found"))

    return result


# =============================================================================
# BELIEF GRAPH VISUALIZATION ENDPOINTS
# =============================================================================


@router.get("/beliefs/all")
async def get_all_beliefs(
    domain: str | None = None,
    category: str | None = None,
    min_conviction: float | None = None,
) -> dict[str, Any]:
    """List all beliefs with optional filtering.

    Args:
        domain: Optional domain filter
        category: Optional category filter
        min_conviction: Minimum conviction threshold (0.0-1.0)

    Returns:
        List of all beliefs matching filters
    """
    from draagon_forge.mcp.tools import beliefs

    result = await beliefs.list_all_beliefs(
        domain=domain,
        category=category,
        min_conviction=min_conviction,
    )
    return result


@router.get("/beliefs/graph")
async def get_belief_graph(
    center_id: str | None = None,
    depth: int = 2,
    include_entities: bool = True,
    min_conviction: float = 0.0,
    domains: str | None = None,
) -> dict[str, Any]:
    """Get belief graph data for visualization.

    Returns graph data formatted for Cytoscape.js visualization.
    Nodes represent beliefs and entities. Edges show relationships.

    Args:
        center_id: Optional belief ID to center the graph on
        depth: How many hops from center (default 2)
        include_entities: Include extracted entity nodes (default True)
        min_conviction: Minimum conviction to include (0.0-1.0)
        domains: Comma-separated list of domains to filter

    Returns:
        Graph data with nodes, edges, and stats
    """
    from draagon_forge.mcp.tools import beliefs

    domain_list = domains.split(",") if domains else None

    result = await beliefs.get_belief_graph(
        center_id=center_id,
        depth=depth,
        include_entities=include_entities,
        min_conviction=min_conviction,
        domains=domain_list,
    )
    return result


@router.get("/beliefs/graph/path")
async def find_graph_path(
    source_id: str,
    target_id: str,
    max_hops: int = 4,
) -> dict[str, Any]:
    """Find shortest path between two nodes in the belief graph.

    Uses BFS to find the shortest path between two nodes (beliefs or entities).

    Args:
        source_id: Starting node ID
        target_id: Target node ID
        max_hops: Maximum number of edges to traverse (default 4)

    Returns:
        List of nodes in the path, or empty if no path found
    """
    from draagon_forge.mcp.tools import beliefs

    path = await beliefs.find_graph_path(
        source_id=source_id,
        target_id=target_id,
        max_hops=max_hops,
    )
    return {"path": path, "found": len(path) > 0, "hop_count": max(0, len(path) - 1)}


@router.get("/beliefs/graph/entity/{entity_id}")
async def get_entity_context(entity_id: str) -> dict[str, Any]:
    """Get context for a specific entity.

    Returns the entity details along with all beliefs that mention it.

    Args:
        entity_id: Entity ID (e.g., "entity-database")

    Returns:
        Entity details with all connected beliefs
    """
    from draagon_forge.mcp.tools import beliefs

    result = await beliefs.get_entity_context(entity_id)

    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "Entity not found"))

    return result


# =============================================================================
# CODE MESH ENDPOINTS
# =============================================================================

# Global mesh query engine (lazy-initialized)
_mesh_query_engine = None


async def get_mesh_query_engine():
    """Get or create the mesh query engine."""
    global _mesh_query_engine

    if _mesh_query_engine is None:
        from draagon_forge.mcp.config import config
        from draagon_forge.mesh.query_engine import MeshQueryEngine

        _mesh_query_engine = MeshQueryEngine(
            uri=config.neo4j_uri,
            username=config.neo4j_user,
            password=config.neo4j_password,
        )
        await _mesh_query_engine.connect()
        logger.info("Mesh query engine initialized")

    return _mesh_query_engine


@router.get("/mesh/projects")
async def get_mesh_projects(q: str | None = None) -> dict[str, Any]:
    """Get all projects in the mesh store.

    Args:
        q: Optional search query to filter projects by name

    Returns:
        List of projects with branches and statistics
    """
    try:
        engine = await get_mesh_query_engine()

        if q:
            # Search projects by name
            result = await engine.execute(
                """
                MATCH (n:MeshNode)
                WHERE toLower(n.project_id) CONTAINS toLower($query)
                WITH n.project_id AS project_id,
                     collect(DISTINCT n.branch) AS branches,
                     max(n.stored_at) AS last_extraction,
                     count(n) AS total_nodes
                RETURN project_id, branches, last_extraction, total_nodes
                ORDER BY last_extraction DESC
                """,
                {"query": q},
            )
        else:
            # Get all projects
            result = await engine.execute(
                """
                MATCH (n:MeshNode)
                WITH n.project_id AS project_id,
                     collect(DISTINCT n.branch) AS branches,
                     max(n.stored_at) AS last_extraction,
                     count(n) AS total_nodes
                RETURN project_id, branches, last_extraction, total_nodes
                ORDER BY last_extraction DESC
                """
            )

        projects = []
        for record in result.records:
            projects.append({
                "project_id": record.get("project_id"),
                "branches": record.get("branches", []),
                "last_extraction": record.get("last_extraction"),
                "total_nodes": record.get("total_nodes", 0),
            })

        return {"projects": projects}

    except Exception as e:
        logger.error(f"Failed to get mesh projects: {e}")
        return {"projects": [], "error": str(e)}


@router.get("/mesh/projects/{project_id}")
async def get_mesh_project_data(
    project_id: str,
    branch: str | None = None,
) -> dict[str, Any]:
    """Get mesh data for a specific project.

    Args:
        project_id: Project identifier
        branch: Optional branch filter (uses first branch if not specified)

    Returns:
        Project mesh data with nodes and edges
    """
    try:
        engine = await get_mesh_query_engine()

        # Get available branches for this project
        branches_result = await engine.execute(
            """
            MATCH (n:MeshNode {project_id: $project_id})
            RETURN DISTINCT n.branch AS branch
            ORDER BY branch
            """,
            {"project_id": project_id},
        )

        available_branches = [r.get("branch") for r in branches_result.records if r.get("branch")]

        if not available_branches:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        # Use specified branch or default to first available
        target_branch = branch if branch in available_branches else available_branches[0]

        # Get nodes for this project/branch
        nodes_result = await engine.execute(
            """
            MATCH (n:MeshNode {project_id: $project_id, branch: $branch})
            RETURN n
            ORDER BY n.file_path, n.source_line_start
            """,
            {"project_id": project_id, "branch": target_branch},
        )

        # Get edges for this project/branch
        edges_result = await engine.execute(
            """
            MATCH (from:MeshNode {project_id: $project_id, branch: $branch})-[e:MESH_EDGE]->(to:MeshNode)
            RETURN e, from.id AS from_id, to.id AS to_id
            """,
            {"project_id": project_id, "branch": target_branch},
        )

        # Group nodes by file
        files_map: dict[str, dict] = {}
        for record in nodes_result.records:
            node_data = record.get("n")
            if not node_data:
                continue

            # Extract properties from node
            props = dict(node_data) if hasattr(node_data, "items") else node_data
            file_path = props.get("file_path", "unknown")

            if file_path not in files_map:
                files_map[file_path] = {"file": file_path, "nodes": [], "edges": []}

            # Parse properties JSON if stored as string
            node_props = props.get("properties", {})
            if isinstance(node_props, str):
                try:
                    import json
                    node_props = json.loads(node_props)
                except Exception:
                    node_props = {}

            files_map[file_path]["nodes"].append({
                "id": props.get("id"),
                "type": props.get("type"),
                "name": props.get("name"),
                "source": {
                    "file": file_path,
                    "line_start": props.get("source_line_start", 0),
                    "line_end": props.get("source_line_end", 0),
                },
                "properties": node_props,
            })

        # Add edges to file results
        node_to_file: dict[str, str] = {}
        for file_path, file_data in files_map.items():
            for node in file_data["nodes"]:
                node_to_file[node["id"]] = file_path

        for record in edges_result.records:
            edge_data = record.get("e")
            from_id = record.get("from_id")
            to_id = record.get("to_id")

            if not edge_data:
                continue

            props = dict(edge_data) if hasattr(edge_data, "items") else edge_data
            file_path = node_to_file.get(from_id)

            if file_path and file_path in files_map:
                files_map[file_path]["edges"].append({
                    "type": props.get("type"),
                    "from_id": from_id,
                    "to_id": to_id,
                })

        # Compute statistics
        total_nodes = sum(len(f["nodes"]) for f in files_map.values())
        total_edges = sum(len(f["edges"]) for f in files_map.values())

        return {
            "project_id": project_id,
            "branch": target_branch,
            "results": list(files_map.values()),
            "statistics": {
                "total_nodes": total_nodes,
                "total_edges": total_edges,
                "files": len(files_map),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get mesh project data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
