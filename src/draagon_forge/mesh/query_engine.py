"""
MeshQueryEngine - Query the code knowledge mesh in Neo4j.

Provides high-level query methods for common operations:
- Find functions that call other functions
- Trace data flow through queues
- Find all API endpoints
- Discover dependencies
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Any

import structlog
from neo4j import AsyncGraphDatabase, AsyncDriver

logger = structlog.get_logger(__name__)


@dataclass
class QueryResult:
    """Result of a mesh query."""

    records: list[dict[str, Any]]
    count: int
    query: str


class MeshQueryEngine:
    """
    High-level query interface for the code knowledge mesh.

    Provides both pre-built queries for common operations and
    support for custom Cypher queries.
    """

    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        username: str = "neo4j",
        password: str = "draagon-ai-2025",
    ):
        """
        Initialize the query engine.

        Args:
            uri: Neo4j connection URI
            username: Neo4j username
            password: Neo4j password
        """
        self.uri = uri
        self.username = username
        self.password = password
        self._driver: Optional[AsyncDriver] = None

    async def connect(self) -> None:
        """Connect to Neo4j."""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.username, self.password),
            )
            logger.info("Connected to Neo4j", uri=self.uri)

    async def close(self) -> None:
        """Close Neo4j connection."""
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    # =========================================================================
    # High-level query methods
    # =========================================================================

    async def find_functions(
        self,
        project_id: Optional[str] = None,
        name_pattern: Optional[str] = None,
        limit: int = 100,
    ) -> QueryResult:
        """
        Find functions in the mesh.

        Args:
            project_id: Filter by project
            name_pattern: Filter by name (regex)
            limit: Maximum results

        Returns:
            Query result with function nodes
        """
        conditions = ["n:Function OR n:Method"]
        params: dict[str, Any] = {"limit": limit}

        if project_id:
            conditions.append("n.project_id = $project_id")
            params["project_id"] = project_id

        if name_pattern:
            conditions.append("n.name =~ $name_pattern")
            params["name_pattern"] = name_pattern

        query = f"""
        MATCH (n:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN n
        ORDER BY n.name
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def find_api_endpoints(
        self,
        project_id: Optional[str] = None,
        method: Optional[str] = None,
        path_pattern: Optional[str] = None,
        limit: int = 100,
    ) -> QueryResult:
        """
        Find API endpoints in the mesh.

        Args:
            project_id: Filter by project
            method: Filter by HTTP method (GET, POST, etc.)
            path_pattern: Filter by path (regex)
            limit: Maximum results

        Returns:
            Query result with API endpoint nodes
        """
        conditions = ["n:ApiEndpoint"]
        params: dict[str, Any] = {"limit": limit}

        if project_id:
            conditions.append("n.project_id = $project_id")
            params["project_id"] = project_id

        if method:
            conditions.append("n.prop_method = $method")
            params["method"] = method.upper()

        if path_pattern:
            conditions.append("n.prop_path =~ $path_pattern")
            params["path_pattern"] = path_pattern

        query = f"""
        MATCH (n:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN n
        ORDER BY n.prop_method, n.prop_path
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def find_callers(
        self,
        function_name: str,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> QueryResult:
        """
        Find functions that call a given function.

        Args:
            function_name: Name of the target function
            project_id: Filter by project
            limit: Maximum results

        Returns:
            Query result with caller nodes and relationships
        """
        params: dict[str, Any] = {
            "function_name": function_name,
            "limit": limit,
        }

        project_filter = ""
        if project_id:
            project_filter = "AND caller.project_id = $project_id"
            params["project_id"] = project_id

        query = f"""
        MATCH (caller:MeshNode)-[r:CALLS]->(target:MeshNode)
        WHERE target.name = $function_name {project_filter}
        RETURN caller, r, target
        ORDER BY caller.file, caller.line_start
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def find_callees(
        self,
        function_name: str,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> QueryResult:
        """
        Find functions called by a given function.

        Args:
            function_name: Name of the calling function
            project_id: Filter by project
            limit: Maximum results

        Returns:
            Query result with callee nodes and relationships
        """
        params: dict[str, Any] = {
            "function_name": function_name,
            "limit": limit,
        }

        project_filter = ""
        if project_id:
            project_filter = "AND caller.project_id = $project_id"
            params["project_id"] = project_id

        query = f"""
        MATCH (caller:MeshNode)-[r:CALLS]->(callee:MeshNode)
        WHERE caller.name = $function_name {project_filter}
        RETURN caller, r, callee
        ORDER BY callee.name
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def trace_queue_flow(
        self,
        queue_name: str,
        limit: int = 50,
    ) -> QueryResult:
        """
        Trace data flow through a queue.

        Finds producers, the queue, and consumers.

        Args:
            queue_name: Name of the queue/topic
            limit: Maximum results

        Returns:
            Query result with flow path
        """
        query = """
        MATCH path = (producer:MeshNode)-[:PUBLISHES_TO]->(queue:MeshNode)-[:SUBSCRIBES_TO]-(consumer:MeshNode)
        WHERE queue.name = $queue_name OR queue.prop_queue = $queue_name
        RETURN producer, queue, consumer, path
        LIMIT $limit
        """

        return await self.execute(query, {"queue_name": queue_name, "limit": limit})

    async def find_cross_project_links(
        self,
        project_id: Optional[str] = None,
        link_type: Optional[str] = None,
        limit: int = 100,
    ) -> QueryResult:
        """
        Find cross-project links.

        Args:
            project_id: Filter by project (either side)
            link_type: Filter by link type (queue, api, database)
            limit: Maximum results

        Returns:
            Query result with cross-project relationships
        """
        conditions = ["r.cross_project = true"]
        params: dict[str, Any] = {"limit": limit}

        if project_id:
            conditions.append("(a.project_id = $project_id OR b.project_id = $project_id)")
            params["project_id"] = project_id

        rel_types = []
        if link_type == "queue":
            rel_types = ["CONNECTS_VIA_QUEUE", "PUBLISHES_TO", "SUBSCRIBES_TO"]
        elif link_type == "api":
            rel_types = ["CONNECTS_VIA_API", "CALLS_SERVICE"]
        elif link_type == "database":
            rel_types = ["CONNECTS_VIA_DATABASE", "READS_FROM", "WRITES_TO"]

        if rel_types:
            conditions.append(f"type(r) IN {rel_types}")

        query = f"""
        MATCH (a:MeshNode)-[r]->(b:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN a, r, b
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def get_project_stats(self, project_id: str) -> QueryResult:
        """
        Get statistics for a project.

        Args:
            project_id: Project ID

        Returns:
            Query result with node counts by type
        """
        query = """
        MATCH (n:MeshNode {project_id: $project_id})
        WITH labels(n) as nodeLabels
        UNWIND nodeLabels as label
        WITH label WHERE label <> 'MeshNode'
        RETURN label as type, count(*) as count
        ORDER BY count DESC
        """

        return await self.execute(query, {"project_id": project_id})

    async def find_class_hierarchy(
        self,
        class_name: str,
        project_id: Optional[str] = None,
        direction: str = "both",
        depth: int = 5,
    ) -> QueryResult:
        """
        Find class inheritance hierarchy.

        Args:
            class_name: Name of the class
            project_id: Filter by project
            direction: "up" for parents, "down" for children, "both"
            depth: Maximum depth to traverse

        Returns:
            Query result with hierarchy
        """
        params: dict[str, Any] = {
            "class_name": class_name,
            "depth": depth,
        }

        project_filter = ""
        if project_id:
            project_filter = "{project_id: $project_id}"
            params["project_id"] = project_id

        if direction == "up":
            query = f"""
            MATCH path = (c:Class {project_filter})-[:INHERITS|IMPLEMENTS*1..{depth}]->(parent)
            WHERE c.name = $class_name
            RETURN path
            """
        elif direction == "down":
            query = f"""
            MATCH path = (child)-[:INHERITS|IMPLEMENTS*1..{depth}]->(c:Class {project_filter})
            WHERE c.name = $class_name
            RETURN path
            """
        else:
            query = f"""
            MATCH path = (child)-[:INHERITS|IMPLEMENTS*0..{depth}]->(c:Class)-[:INHERITS|IMPLEMENTS*0..{depth}]->(parent)
            WHERE c.name = $class_name
            RETURN path
            """

        return await self.execute(query, params)

    async def search_by_name(
        self,
        name_pattern: str,
        node_type: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> QueryResult:
        """
        Search for nodes by name pattern.

        Args:
            name_pattern: Regex pattern for name
            node_type: Filter by node type
            project_id: Filter by project
            limit: Maximum results

        Returns:
            Query result with matching nodes
        """
        conditions = ["n.name =~ $name_pattern"]
        params: dict[str, Any] = {
            "name_pattern": f"(?i).*{name_pattern}.*",
            "limit": limit,
        }

        if node_type:
            conditions.append(f"n:{node_type}")

        if project_id:
            conditions.append("n.project_id = $project_id")
            params["project_id"] = project_id

        query = f"""
        MATCH (n:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN n
        ORDER BY n.name
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def find_file_contents(
        self,
        file_path: str,
        project_id: Optional[str] = None,
    ) -> QueryResult:
        """
        Find all nodes in a specific file.

        Args:
            file_path: File path (relative or partial match)
            project_id: Filter by project

        Returns:
            Query result with file contents
        """
        conditions = ["n.file CONTAINS $file_path"]
        params: dict[str, Any] = {"file_path": file_path}

        if project_id:
            conditions.append("n.project_id = $project_id")
            params["project_id"] = project_id

        query = f"""
        MATCH (n:MeshNode)
        WHERE {" AND ".join(conditions)}
        RETURN n
        ORDER BY n.line_start
        """

        return await self.execute(query, params)

    # =========================================================================
    # Raw query execution
    # =========================================================================

    async def execute(self, query: str, params: Optional[dict] = None) -> QueryResult:
        """
        Execute a raw Cypher query.

        Args:
            query: Cypher query string
            params: Query parameters

        Returns:
            Query result
        """
        if not self._driver:
            await self.connect()

        params = params or {}

        async with self._driver.session() as session:
            result = await session.run(query, params)
            records = []
            async for record in result:
                records.append(dict(record))

        return QueryResult(
            records=records,
            count=len(records),
            query=query,
        )
