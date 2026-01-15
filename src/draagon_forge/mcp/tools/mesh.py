"""
MCP tools for Code Knowledge Mesh operations.

Provides tools for:
- Building/extracting mesh from projects
- Querying the mesh graph
- Finding relationships and dependencies
- Generating documentation from mesh data
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Optional

import structlog

from ..server import mcp
from ...mesh import ProjectRegistry, Project, ProjectStatus
from ...mesh.importer import MeshImporter
from ...mesh.query_engine import MeshQueryEngine

logger = structlog.get_logger(__name__)

# Global instances (initialized on first use)
_registry: Optional[ProjectRegistry] = None
_importer: Optional[MeshImporter] = None
_query_engine: Optional[MeshQueryEngine] = None


def _get_registry() -> ProjectRegistry:
    """Get or create the project registry."""
    global _registry
    if _registry is None:
        _registry = ProjectRegistry()
    return _registry


async def _get_importer() -> MeshImporter:
    """Get or create the mesh importer."""
    global _importer
    if _importer is None:
        _importer = MeshImporter()
        await _importer.connect()
    return _importer


async def _get_query_engine() -> MeshQueryEngine:
    """Get or create the query engine."""
    global _query_engine
    if _query_engine is None:
        _query_engine = MeshQueryEngine()
        await _query_engine.connect()
    return _query_engine


@mcp.tool
async def build_mesh(
    project_path: str,
    project_id: Optional[str] = None,
    incremental: bool = False,
) -> dict:
    """
    Build code knowledge mesh for a project.

    Extracts code structure (functions, classes, APIs, etc.) and stores
    it in the mesh graph for querying.

    Args:
        project_path: Path to the project directory
        project_id: Optional project identifier (defaults to directory name)
        incremental: Only process changed files since last extraction

    Returns:
        Dictionary with extraction statistics
    """
    path = Path(project_path).resolve()
    if not path.is_dir():
        return {"success": False, "error": f"Not a directory: {project_path}"}

    project_id = project_id or path.name
    registry = _get_registry()

    # Check if project is registered
    project = registry.get(project_id)
    if not project:
        # Register new project
        project = Project(
            id=project_id,
            name=path.name,
            path=str(path),
        )
        registry.register(project)

    # Get changed files if incremental
    changed_files = None
    if incremental:
        changed_files = registry.get_changed_files(project_id)
        if not changed_files:
            return {
                "success": True,
                "message": "No changes detected",
                "nodes": 0,
                "edges": 0,
            }

    # Run extraction
    logger.info("Starting mesh extraction", project_id=project_id, incremental=incremental)
    result = await registry.extract(project_id)

    if not result["success"]:
        return result

    # Import to Neo4j
    try:
        importer = await _get_importer()
        output_path = result.get("output_path")
        if output_path:
            import_stats = await importer.import_file(output_path)
            result["imported"] = {
                "nodes_created": import_stats.nodes_created,
                "nodes_updated": import_stats.nodes_updated,
                "edges_created": import_stats.edges_created,
            }
    except Exception as e:
        logger.warning("Failed to import to Neo4j", error=str(e))
        result["import_warning"] = str(e)

    return result


@mcp.tool
async def query_mesh(
    query: str,
    project_id: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """
    Query the code knowledge mesh.

    Supports natural language queries like:
    - "find functions that call sendEmail"
    - "show API endpoints"
    - "trace queue order-created"

    For complex queries, use query_mesh_cypher directly.

    Args:
        query: Natural language query
        project_id: Filter by project
        limit: Maximum results

    Returns:
        Query results
    """
    engine = await _get_query_engine()
    query_lower = query.lower()

    try:
        # Parse query intent
        if "api" in query_lower and "endpoint" in query_lower:
            method = None
            for m in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                if m.lower() in query_lower:
                    method = m
                    break
            result = await engine.find_api_endpoints(
                project_id=project_id,
                method=method,
                limit=limit,
            )

        elif "call" in query_lower:
            # Extract function name
            words = query.split()
            func_name = words[-1] if words else ""
            if "calls" in query_lower:
                result = await engine.find_callers(func_name, project_id, limit)
            else:
                result = await engine.find_callees(func_name, project_id, limit)

        elif "queue" in query_lower or "topic" in query_lower:
            # Extract queue name
            words = query.split()
            queue_name = words[-1] if words else ""
            result = await engine.trace_queue_flow(queue_name, limit)

        elif "cross" in query_lower and "project" in query_lower:
            link_type = None
            if "queue" in query_lower:
                link_type = "queue"
            elif "api" in query_lower:
                link_type = "api"
            elif "database" in query_lower or "db" in query_lower:
                link_type = "database"
            result = await engine.find_cross_project_links(project_id, link_type, limit)

        elif "class" in query_lower and ("inherit" in query_lower or "hierarchy" in query_lower):
            words = query.split()
            class_name = words[-1] if words else ""
            result = await engine.find_class_hierarchy(class_name, project_id)

        elif "function" in query_lower or "method" in query_lower:
            # Extract name pattern
            name_pattern = None
            if "named" in query_lower or "called" in query_lower:
                words = query.split()
                idx = -1
                for i, w in enumerate(words):
                    if w in ["named", "called"]:
                        idx = i
                        break
                if idx >= 0 and idx + 1 < len(words):
                    name_pattern = words[idx + 1]
            result = await engine.find_functions(project_id, name_pattern, limit)

        elif "file" in query_lower:
            # Extract file path
            words = query.split()
            file_path = words[-1] if words else ""
            result = await engine.find_file_contents(file_path, project_id)

        else:
            # Default to name search
            result = await engine.search_by_name(query, project_id=project_id, limit=limit)

        return {
            "success": True,
            "count": result.count,
            "results": result.records,
            "query_used": result.query,
        }

    except Exception as e:
        logger.error("Mesh query failed", error=str(e))
        return {"success": False, "error": str(e)}


@mcp.tool
async def query_mesh_cypher(
    cypher: str,
    params: Optional[dict] = None,
) -> dict:
    """
    Execute a raw Cypher query against the mesh graph.

    Use this for complex queries that can't be expressed naturally.
    The mesh uses labels like :Function, :Class, :ApiEndpoint, etc.

    Args:
        cypher: Cypher query string
        params: Query parameters

    Returns:
        Query results
    """
    engine = await _get_query_engine()

    try:
        result = await engine.execute(cypher, params)
        return {
            "success": True,
            "count": result.count,
            "results": result.records,
        }
    except Exception as e:
        logger.error("Cypher query failed", error=str(e))
        return {"success": False, "error": str(e)}


@mcp.tool
async def get_mesh_context(
    file_path: str,
    line_number: Optional[int] = None,
    context_type: str = "full",
) -> dict:
    """
    Get mesh context for a specific code location.

    Useful for code review and understanding code in context.

    Args:
        file_path: Path to the file
        line_number: Optional line number for more specific context
        context_type: "full" (all info), "callers" (who calls this),
                      "dependencies" (what this uses)

    Returns:
        Context information from the mesh
    """
    engine = await _get_query_engine()

    try:
        # Find node at this location
        if line_number:
            query = """
            MATCH (n:MeshNode)
            WHERE n.file CONTAINS $file_path
              AND n.line_start <= $line
              AND n.line_end >= $line
            RETURN n
            ORDER BY (n.line_end - n.line_start)
            LIMIT 1
            """
            result = await engine.execute(
                query,
                {"file_path": file_path, "line": line_number},
            )
        else:
            result = await engine.find_file_contents(file_path)

        if result.count == 0:
            return {
                "success": True,
                "message": "No mesh data for this location",
                "suggestion": "Run build_mesh to extract code structure",
            }

        node = result.records[0]["n"] if result.records else None
        if not node:
            return {"success": True, "results": []}

        context = {
            "node": dict(node),
            "callers": [],
            "callees": [],
            "related": [],
        }

        # Get callers
        if context_type in ["full", "callers"]:
            callers = await engine.execute(
                """
                MATCH (caller:MeshNode)-[r:CALLS]->(n:MeshNode {id: $id})
                RETURN caller, r
                LIMIT 10
                """,
                {"id": node["id"]},
            )
            context["callers"] = callers.records

        # Get callees/dependencies
        if context_type in ["full", "dependencies"]:
            callees = await engine.execute(
                """
                MATCH (n:MeshNode {id: $id})-[r]->(target:MeshNode)
                RETURN target, type(r) as relationship
                LIMIT 20
                """,
                {"id": node["id"]},
            )
            context["callees"] = callees.records

        return {"success": True, "context": context}

    except Exception as e:
        logger.error("Failed to get mesh context", error=str(e))
        return {"success": False, "error": str(e)}


@mcp.tool
async def list_projects() -> dict:
    """
    List all registered projects in the mesh.

    Returns:
        List of projects with their status
    """
    registry = _get_registry()
    projects = registry.list()

    return {
        "success": True,
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "path": p.path,
                "status": p.status.value,
                "last_extracted": p.last_extracted,
                "stats": {
                    "nodes": p.last_stats.total_nodes if p.last_stats else 0,
                    "edges": p.last_stats.total_edges if p.last_stats else 0,
                },
            }
            for p in projects
        ],
    }


@mcp.tool
async def generate_docs(
    project_path: str,
    output_format: str = "markdown",
    output_file: Optional[str] = None,
    project_name: Optional[str] = None,
    include_diagrams: bool = True,
) -> dict:
    """
    Generate documentation from code knowledge mesh data.

    Extracts the mesh for the given project and generates documentation
    in the specified format.

    Args:
        project_path: Path to the project directory
        output_format: Output format - "markdown", "openapi", "mermaid"
        output_file: Optional output file path (returns content if not specified)
        project_name: Optional project name for documentation title
        include_diagrams: Include Mermaid diagrams (markdown only)

    Returns:
        Dictionary with generated documentation or file path
    """
    path = Path(project_path).resolve()
    if not path.is_dir():
        return {"success": False, "error": f"Not a directory: {project_path}"}

    # Get mesh-builder path
    mesh_builder = Path(__file__).parent.parent.parent.parent.parent / "mesh-builder"
    cli_path = mesh_builder / "dist" / "cli" / "index.js"

    if not cli_path.exists():
        # Try to build it first
        try:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=str(mesh_builder),
                capture_output=True,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": f"Failed to build mesh-builder: {e}"}

    # Run extraction to get mesh data
    try:
        output_path = path / ".mesh" / "extraction.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        result = subprocess.run(
            [
                "node",
                str(cli_path),
                "extract",
                str(path),
                "--output",
                str(output_path),
                "--format",
                "json",
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return {
                "success": False,
                "error": f"Extraction failed: {result.stderr}",
            }

        # Read extraction result
        with open(output_path) as f:
            extraction_data = json.load(f)

    except Exception as e:
        return {"success": False, "error": f"Extraction error: {e}"}

    # Generate documentation based on format
    try:
        doc_content = await _generate_doc_content(
            extraction_data,
            output_format,
            project_name or path.name,
            include_diagrams,
        )

        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(doc_content)
            return {
                "success": True,
                "output_file": str(output_path),
                "format": output_format,
                "message": f"Documentation written to {output_path}",
            }
        else:
            return {
                "success": True,
                "format": output_format,
                "content": doc_content,
            }

    except Exception as e:
        logger.error("Documentation generation failed", error=str(e))
        return {"success": False, "error": f"Generation error: {e}"}


async def _generate_doc_content(
    extraction_data: dict,
    output_format: str,
    project_name: str,
    include_diagrams: bool,
) -> str:
    """
    Generate documentation content from extraction data.

    This is a Python implementation that mirrors the TypeScript generators.
    """
    # Flatten nodes and edges from all file results
    nodes = []
    edges = []
    for file_result in extraction_data.get("results", []):
        nodes.extend(file_result.get("nodes", []))
        edges.extend(file_result.get("edges", []))

    if output_format == "openapi":
        return _generate_openapi(nodes, project_name)
    elif output_format == "mermaid":
        return _generate_mermaid(nodes, edges)
    else:  # markdown
        return _generate_markdown(nodes, edges, project_name, include_diagrams)


def _generate_markdown(
    nodes: list,
    edges: list,
    project_name: str,
    include_diagrams: bool,
) -> str:
    """Generate Markdown documentation."""
    lines = [
        f"# {project_name} Documentation",
        "",
        f"> Auto-generated from code knowledge mesh",
        "",
        "## Table of Contents",
        "",
        "- [Overview](#overview)",
        "- [API Endpoints](#api-endpoints)",
        "- [Classes](#classes)",
        "- [Functions](#functions)",
        "",
        "## Overview",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Total Nodes | {len(nodes)} |",
        f"| Total Edges | {len(edges)} |",
        "",
    ]

    # Add Mermaid diagram if enabled
    if include_diagrams:
        lines.extend([
            "### Architecture Overview",
            "",
            "```mermaid",
            "graph TD",
        ])

        # Add a subset of nodes and edges
        node_ids = set()
        for node in nodes[:20]:
            node_id = _sanitize_id(node.get("name", node.get("id", "unknown")))
            node_name = node.get("name", "Unknown")
            node_type = node.get("type", "")

            if node_type == "ApiEndpoint":
                lines.append(f"    {node_id}[/{node_name}/]")
            elif node_type == "Class":
                lines.append(f"    {node_id}[{node_name}]")
            else:
                lines.append(f"    {node_id}({node_name})")
            node_ids.add(node.get("id"))

        # Add edges
        added_edges = set()
        for edge in edges[:30]:
            from_id = edge.get("from_id", "")
            to_id = edge.get("to_id", "")
            if from_id in node_ids and to_id in node_ids:
                source_id = _sanitize_id(from_id)
                target_id = _sanitize_id(to_id)
                edge_key = f"{source_id}-{target_id}"
                if edge_key not in added_edges:
                    lines.append(f"    {source_id} --> {target_id}")
                    added_edges.add(edge_key)

        lines.extend(["```", ""])

    # API Endpoints section
    api_nodes = [n for n in nodes if n.get("type") == "ApiEndpoint"]
    if api_nodes:
        lines.extend(["## API Endpoints", ""])

        for node in api_nodes:
            method = node.get("properties", {}).get("method", "GET")
            path = node.get("properties", {}).get("path", "/")
            method_badge = _get_method_badge(method)
            source = node.get("source", {})
            lines.extend([
                f"### {method_badge} `{path}`",
                "",
                f"**File:** {source.get('file', 'unknown')}:{source.get('line_start', 0)}",
                "",
                "---",
                "",
            ])

    # Classes section
    class_nodes = [n for n in nodes if n.get("type") == "Class"]
    if class_nodes:
        lines.extend(["## Classes", ""])

        for node in class_nodes:
            name = node.get("name", "Unknown")
            source = node.get("source", {})
            lines.extend([
                f"### {name}",
                "",
                f"**File:** {source.get('file', 'unknown')}:{source.get('line_start', 0)}",
                "",
            ])

            # Find methods
            methods = [
                n for n in nodes
                if n.get("type") == "Method"
                and n.get("properties", {}).get("class") == name
            ]
            if methods:
                lines.append("**Methods:**")
                for m in methods[:10]:
                    lines.append(f"- `{m.get('name', 'unknown')}()`")
                lines.append("")

            lines.extend(["---", ""])

    # Functions section
    func_nodes = [n for n in nodes if n.get("type") == "Function"]
    if func_nodes:
        lines.extend(["## Functions", ""])

        for node in func_nodes[:50]:  # Limit to avoid huge docs
            name = node.get("name", "Unknown")
            params = node.get("properties", {}).get("parameters", [])
            param_str = ", ".join(params) if isinstance(params, list) else ""
            return_type = node.get("properties", {}).get("return_type", "")
            return_str = f" -> {return_type}" if return_type else ""
            source = node.get("source", {})

            lines.extend([
                f"#### `{name}({param_str}){return_str}`",
                "",
                f"**File:** {source.get('file', 'unknown')}:{source.get('line_start', 0)}",
                "",
            ])

    return "\n".join(lines)


def _generate_openapi(nodes: list, project_name: str) -> str:
    """Generate OpenAPI 3.0 specification."""
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": f"{project_name} API",
            "version": "1.0.0",
            "description": f"Auto-generated API documentation for {project_name}",
        },
        "paths": {},
    }

    # Group endpoints by path
    api_nodes = [n for n in nodes if n.get("type") == "ApiEndpoint"]

    for node in api_nodes:
        props = node.get("properties", {})
        path = props.get("path", "/unknown")
        method = props.get("method", "get").lower()

        if path not in spec["paths"]:
            spec["paths"][path] = {}

        spec["paths"][path][method] = {
            "summary": node.get("name", ""),
            "operationId": node.get("id", ""),
            "responses": {
                "200": {
                    "description": "Successful response",
                }
            },
        }

        # Add parameters if available
        parameters = props.get("parameters", [])
        if parameters:
            spec["paths"][path][method]["parameters"] = [
                {
                    "name": p if isinstance(p, str) else p.get("name", "param"),
                    "in": "query",
                    "schema": {"type": "string"},
                }
                for p in parameters
            ]

    return json.dumps(spec, indent=2)


def _generate_mermaid(nodes: list, edges: list) -> str:
    """Generate Mermaid class diagram."""
    lines = ["classDiagram"]

    # Add classes
    class_nodes = [n for n in nodes if n.get("type") == "Class"]

    for cls in class_nodes[:30]:
        name = _sanitize_id(cls.get("name", "Unknown"))
        lines.append(f"    class {name}")

        # Find methods
        methods = [
            n for n in nodes
            if n.get("type") == "Method"
            and n.get("properties", {}).get("class") == cls.get("name")
        ]
        for m in methods[:5]:
            method_name = m.get("name", "method")
            lines.append(f"    {name} : +{method_name}()")

    # Add inheritance relationships
    for edge in edges:
        if edge.get("type") == "INHERITS":
            from_id = _sanitize_id(edge.get("from_id", "").split(":")[-1])
            to_id = _sanitize_id(edge.get("to_id", "").split(":")[-1])
            if from_id and to_id:
                lines.append(f"    {to_id} <|-- {from_id}")

    return "\n".join(lines)


def _sanitize_id(id_str: str) -> str:
    """Sanitize identifier for Mermaid compatibility."""
    import re
    return re.sub(r"[^a-zA-Z0-9_]", "_", str(id_str))[:30]


def _get_method_badge(method: str) -> str:
    """Get method badge for markdown."""
    badges = {
        "GET": "🟢 GET",
        "POST": "🟡 POST",
        "PUT": "🟠 PUT",
        "PATCH": "🟣 PATCH",
        "DELETE": "🔴 DELETE",
    }
    return badges.get(method.upper(), method)
