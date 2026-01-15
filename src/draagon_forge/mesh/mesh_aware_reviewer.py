"""
MeshAwareReviewer - Code review integration with Code Knowledge Mesh.

Enhances code review by providing:
- Cross-file relationship context from the mesh
- Call graph information for changed functions
- API consumer impact analysis
- Cross-project dependency awareness
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import structlog

from .query_engine import MeshQueryEngine, QueryResult

logger = structlog.get_logger(__name__)


@dataclass
class MeshContext:
    """Context information from the mesh for code review."""

    # Callers of functions being modified
    callers: list[dict[str, Any]] = field(default_factory=list)
    # Functions called by modified functions
    callees: list[dict[str, Any]] = field(default_factory=list)
    # Related API endpoints
    api_endpoints: list[dict[str, Any]] = field(default_factory=list)
    # Cross-project consumers
    cross_project_consumers: list[dict[str, Any]] = field(default_factory=list)
    # Class hierarchy for modified classes
    class_hierarchy: list[dict[str, Any]] = field(default_factory=list)
    # Queue/topic subscribers for modified publishers
    queue_consumers: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ImpactAnalysis:
    """Analysis of impact from code changes."""

    # Files that may be affected by changes
    potentially_affected_files: list[str] = field(default_factory=list)
    # Functions that call modified functions
    upstream_callers: int = 0
    # Functions called by modified functions
    downstream_callees: int = 0
    # API consumers that may be affected
    api_consumers: int = 0
    # Cross-project dependencies
    cross_project_deps: int = 0
    # Risk level: low, medium, high
    risk_level: str = "low"
    # Suggested reviewers based on file ownership
    suggested_reviewers: list[str] = field(default_factory=list)
    # Warnings from impact analysis
    warnings: list[str] = field(default_factory=list)


class MeshAwareReviewer:
    """
    Provides mesh context for code review.

    Uses the code knowledge mesh to enhance code review with:
    - Call graph context (who calls this? what does this call?)
    - API impact analysis (what consumers might be affected?)
    - Cross-project dependencies (what other services use this?)
    - Class hierarchy context (inheritance relationships)
    """

    def __init__(
        self,
        query_engine: Optional[MeshQueryEngine] = None,
        uri: str = "bolt://localhost:7687",
        username: str = "neo4j",
        password: str = "password",
    ):
        """
        Initialize the mesh-aware reviewer.

        Args:
            query_engine: Optional existing query engine
            uri: Neo4j connection URI
            username: Neo4j username
            password: Neo4j password
        """
        self.query_engine = query_engine or MeshQueryEngine(
            uri=uri, username=username, password=password
        )
        self._connected = False

    async def connect(self) -> None:
        """Connect to the mesh database."""
        if not self._connected:
            await self.query_engine.connect()
            self._connected = True

    async def close(self) -> None:
        """Close the connection."""
        if self._connected:
            await self.query_engine.close()
            self._connected = False

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def get_context_for_file(
        self,
        file_path: str,
        project_id: Optional[str] = None,
    ) -> MeshContext:
        """
        Get mesh context for a file being reviewed.

        Args:
            file_path: Path to the file
            project_id: Optional project filter

        Returns:
            MeshContext with relevant information
        """
        await self.connect()
        context = MeshContext()

        try:
            # Get all nodes in this file
            file_contents = await self.query_engine.find_file_contents(
                file_path, project_id
            )

            if file_contents.count == 0:
                logger.debug("No mesh data for file", file_path=file_path)
                return context

            # Collect function names from the file
            function_names = []
            class_names = []

            for record in file_contents.records:
                node = record.get("n", {})
                labels = node.get("labels", []) if isinstance(node, dict) else []

                # Handle Neo4j node object
                if hasattr(node, "labels"):
                    labels = list(node.labels)
                if hasattr(node, "__getitem__"):
                    name = node.get("name", "")
                else:
                    name = getattr(node, "name", "")

                if "Function" in labels or "Method" in labels:
                    if name:
                        function_names.append(name)
                elif "Class" in labels:
                    if name:
                        class_names.append(name)

            # Get callers for each function
            for func_name in function_names[:10]:  # Limit to avoid overwhelming
                callers = await self.query_engine.find_callers(
                    func_name, project_id, limit=20
                )
                context.callers.extend(callers.records)

                callees = await self.query_engine.find_callees(
                    func_name, project_id, limit=20
                )
                context.callees.extend(callees.records)

            # Get class hierarchy for each class
            for class_name in class_names[:5]:
                hierarchy = await self.query_engine.find_class_hierarchy(
                    class_name, project_id, direction="both", depth=3
                )
                context.class_hierarchy.extend(hierarchy.records)

            # Get API endpoints in this file
            api_result = await self._find_apis_in_file(file_path, project_id)
            context.api_endpoints = api_result.records

            # Get cross-project links
            cross_links = await self.query_engine.find_cross_project_links(
                project_id, limit=50
            )
            context.cross_project_consumers = cross_links.records

        except Exception as e:
            logger.error("Failed to get mesh context", error=str(e), file_path=file_path)

        return context

    async def analyze_impact(
        self,
        changed_files: list[str],
        project_id: Optional[str] = None,
    ) -> ImpactAnalysis:
        """
        Analyze the impact of changes to a set of files.

        Args:
            changed_files: List of changed file paths
            project_id: Optional project filter

        Returns:
            ImpactAnalysis with impact assessment
        """
        await self.connect()
        analysis = ImpactAnalysis()

        try:
            affected_files = set()
            total_callers = 0
            total_callees = 0
            api_consumers = 0
            cross_project_deps = 0
            warnings = []

            for file_path in changed_files:
                context = await self.get_context_for_file(file_path, project_id)

                # Count callers and extract their files
                for caller in context.callers:
                    total_callers += 1
                    caller_node = caller.get("caller", {})
                    if hasattr(caller_node, "__getitem__"):
                        caller_file = caller_node.get("file", "")
                    else:
                        caller_file = getattr(caller_node, "file", "")
                    if caller_file and caller_file not in changed_files:
                        affected_files.add(caller_file)

                # Count callees
                total_callees += len(context.callees)

                # Count API consumers
                if context.api_endpoints:
                    api_consumers += len(context.api_endpoints)
                    warnings.append(
                        f"File {file_path} contains {len(context.api_endpoints)} "
                        f"API endpoint(s) - changes may affect external consumers"
                    )

                # Count cross-project dependencies
                for link in context.cross_project_consumers:
                    cross_project_deps += 1
                    # Extract the other project
                    node_a = link.get("a", {})
                    node_b = link.get("b", {})

                    a_project = (
                        node_a.get("project_id", "")
                        if hasattr(node_a, "__getitem__")
                        else getattr(node_a, "project_id", "")
                    )
                    b_project = (
                        node_b.get("project_id", "")
                        if hasattr(node_b, "__getitem__")
                        else getattr(node_b, "project_id", "")
                    )

                    other_project = (
                        b_project if a_project == project_id else a_project
                    )
                    if other_project:
                        warnings.append(
                            f"Cross-project dependency with {other_project} may be affected"
                        )

            # Determine risk level
            if cross_project_deps > 0 or api_consumers > 5:
                risk_level = "high"
            elif api_consumers > 0 or total_callers > 10:
                risk_level = "medium"
            else:
                risk_level = "low"

            analysis = ImpactAnalysis(
                potentially_affected_files=list(affected_files),
                upstream_callers=total_callers,
                downstream_callees=total_callees,
                api_consumers=api_consumers,
                cross_project_deps=cross_project_deps,
                risk_level=risk_level,
                warnings=warnings,
            )

        except Exception as e:
            logger.error("Failed to analyze impact", error=str(e))
            analysis.warnings.append(f"Impact analysis failed: {e}")

        return analysis

    async def get_review_context(
        self,
        file_path: str,
        line_start: int,
        line_end: int,
        project_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Get context for a specific code location being reviewed.

        Args:
            file_path: Path to the file
            line_start: Start line of the code section
            line_end: End line of the code section
            project_id: Optional project filter

        Returns:
            Dictionary with contextual information
        """
        await self.connect()

        try:
            # Find the node at this location
            query = """
            MATCH (n:MeshNode)
            WHERE n.file CONTAINS $file_path
              AND n.line_start <= $line_end
              AND n.line_end >= $line_start
            RETURN n
            ORDER BY (n.line_end - n.line_start)
            LIMIT 1
            """

            result = await self.query_engine.execute(
                query,
                {
                    "file_path": file_path,
                    "line_start": line_start,
                    "line_end": line_end,
                },
            )

            if result.count == 0:
                return {
                    "found": False,
                    "message": "No mesh data for this code location",
                }

            node = result.records[0]["n"]
            node_dict = dict(node) if hasattr(node, "__iter__") else {"name": str(node)}

            # Get callers and callees for this specific node
            node_name = (
                node.get("name", "")
                if hasattr(node, "__getitem__")
                else getattr(node, "name", "")
            )

            callers = []
            callees = []

            if node_name:
                callers_result = await self.query_engine.find_callers(
                    node_name, project_id, limit=10
                )
                callers = [
                    self._node_to_dict(r.get("caller", {}))
                    for r in callers_result.records
                ]

                callees_result = await self.query_engine.find_callees(
                    node_name, project_id, limit=10
                )
                callees = [
                    self._node_to_dict(r.get("callee", {}))
                    for r in callees_result.records
                ]

            return {
                "found": True,
                "node": node_dict,
                "callers": callers,
                "callees": callees,
                "caller_count": len(callers),
                "callee_count": len(callees),
            }

        except Exception as e:
            logger.error("Failed to get review context", error=str(e))
            return {
                "found": False,
                "error": str(e),
            }

    async def suggest_reviewers(
        self,
        changed_files: list[str],
        project_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Suggest reviewers based on file ownership from the mesh.

        Looks at who has modified related files in the past
        and who owns dependent code.

        Args:
            changed_files: List of changed file paths
            project_id: Optional project filter

        Returns:
            List of suggested reviewers with rationale
        """
        await self.connect()
        reviewers = []

        try:
            # Find files that import or are imported by changed files
            for file_path in changed_files:
                # Find files that depend on this one
                query = """
                MATCH (dependent:MeshNode)-[r:IMPORTS|USES|CALLS]->(n:MeshNode)
                WHERE n.file CONTAINS $file_path
                RETURN DISTINCT dependent.file as file, count(*) as refs
                ORDER BY refs DESC
                LIMIT 5
                """

                result = await self.query_engine.execute(
                    query, {"file_path": file_path}
                )

                for record in result.records:
                    dep_file = record.get("file", "")
                    refs = record.get("refs", 0)
                    if dep_file:
                        reviewers.append({
                            "file": dep_file,
                            "reason": f"Depends on {file_path} ({refs} references)",
                            "priority": "high" if refs > 3 else "medium",
                        })

        except Exception as e:
            logger.error("Failed to suggest reviewers", error=str(e))

        return reviewers

    async def _find_apis_in_file(
        self,
        file_path: str,
        project_id: Optional[str] = None,
    ) -> QueryResult:
        """Find API endpoints in a specific file."""
        conditions = ["n:ApiEndpoint", "n.file CONTAINS $file_path"]
        params: dict[str, Any] = {"file_path": file_path}

        if project_id:
            conditions.append("n.project_id = $project_id")
            params["project_id"] = project_id

        query = f"""
        MATCH (n:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN n
        """

        return await self.query_engine.execute(query, params)

    def _node_to_dict(self, node: Any) -> dict[str, Any]:
        """Convert a Neo4j node to a dictionary."""
        if isinstance(node, dict):
            return node
        if hasattr(node, "__iter__"):
            return dict(node)
        return {"value": str(node)}


async def create_mesh_aware_reviewer(
    uri: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> MeshAwareReviewer:
    """
    Factory function to create a MeshAwareReviewer.

    Uses configuration from environment if not provided.

    Args:
        uri: Neo4j URI (default from config)
        username: Neo4j username (default from config)
        password: Neo4j password (default from config)

    Returns:
        Configured MeshAwareReviewer
    """
    from ..mcp.config import config

    reviewer = MeshAwareReviewer(
        uri=uri or config.neo4j_uri,
        username=username or config.neo4j_username,
        password=password or config.neo4j_password,
    )

    return reviewer
