"""
MeshImporter - Import mesh extraction results into Neo4j.

Handles:
- Node creation with proper labels and properties
- Edge creation with relationship types
- Incremental updates (merge existing nodes)
- Cross-project link management
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import structlog
from neo4j import AsyncGraphDatabase, AsyncDriver

logger = structlog.get_logger(__name__)


@dataclass
class ImportStats:
    """Statistics from a mesh import operation."""

    nodes_created: int = 0
    nodes_updated: int = 0
    edges_created: int = 0
    edges_updated: int = 0
    errors: int = 0


class MeshImporter:
    """
    Import code knowledge mesh data into Neo4j.

    Creates nodes with labels based on type (e.g., :Function, :Class, :ApiEndpoint)
    and edges with relationship types (e.g., CONTAINS, CALLS, PUBLISHES_TO).
    """

    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        username: str = "neo4j",
        password: str = "password",
    ):
        """
        Initialize the importer.

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
            logger.info("Disconnected from Neo4j")

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def import_file(self, file_path: str | Path) -> ImportStats:
        """
        Import mesh data from a JSON file.

        Args:
            file_path: Path to the mesh extraction JSON file

        Returns:
            Import statistics
        """
        path = Path(file_path)
        with open(path) as f:
            data = json.load(f)

        return await self.import_data(data)

    async def import_data(self, data: dict) -> ImportStats:
        """
        Import mesh data from a dictionary.

        Args:
            data: Mesh extraction result dictionary

        Returns:
            Import statistics
        """
        if not self._driver:
            await self.connect()

        stats = ImportStats()
        project_id = data.get("project_id", "unknown")

        logger.info("Starting mesh import", project_id=project_id)

        async with self._driver.session() as session:
            # Create project node
            await self._create_project_node(session, data)

            # Process each file result
            for file_result in data.get("results", []):
                file_stats = await self._import_file_result(session, file_result, project_id)
                stats.nodes_created += file_stats.nodes_created
                stats.nodes_updated += file_stats.nodes_updated
                stats.edges_created += file_stats.edges_created
                stats.edges_updated += file_stats.edges_updated
                stats.errors += file_stats.errors

            # Import cross-project links if present
            for link in data.get("cross_project_links", []):
                try:
                    await self._create_cross_project_link(session, link)
                    stats.edges_created += 1
                except Exception as e:
                    logger.error("Failed to create cross-project link", error=str(e))
                    stats.errors += 1

        logger.info(
            "Mesh import complete",
            project_id=project_id,
            nodes_created=stats.nodes_created,
            edges_created=stats.edges_created,
        )

        return stats

    async def _create_project_node(self, session, data: dict) -> None:
        """Create or update project node."""
        query = """
        MERGE (p:Project {id: $project_id})
        SET p.path = $path,
            p.timestamp = $timestamp,
            p.files_processed = $files_processed,
            p.total_nodes = $total_nodes,
            p.total_edges = $total_edges
        """
        stats = data.get("statistics", {})
        await session.run(
            query,
            project_id=data.get("project_id"),
            path=data.get("project_path"),
            timestamp=data.get("timestamp"),
            files_processed=stats.get("files_processed", 0),
            total_nodes=stats.get("total_nodes", 0),
            total_edges=stats.get("total_edges", 0),
        )

    async def _import_file_result(
        self,
        session,
        file_result: dict,
        project_id: str,
    ) -> ImportStats:
        """Import a single file's extraction results."""
        stats = ImportStats()

        # Import nodes
        for node in file_result.get("nodes", []):
            try:
                created = await self._upsert_node(session, node, project_id)
                if created:
                    stats.nodes_created += 1
                else:
                    stats.nodes_updated += 1
            except Exception as e:
                logger.error("Failed to import node", node_id=node.get("id"), error=str(e))
                stats.errors += 1

        # Import edges
        for edge in file_result.get("edges", []):
            try:
                created = await self._upsert_edge(session, edge)
                if created:
                    stats.edges_created += 1
                else:
                    stats.edges_updated += 1
            except Exception as e:
                logger.error("Failed to import edge", edge_id=edge.get("id"), error=str(e))
                stats.errors += 1

        return stats

    async def _upsert_node(self, session, node: dict, project_id: str) -> bool:
        """Create or update a node. Returns True if created, False if updated."""
        node_type = node.get("type", "Unknown")
        node_id = node.get("id")

        # Build dynamic labels
        labels = f"MeshNode:{node_type}"

        # Build properties
        props = {
            "id": node_id,
            "name": node.get("name"),
            "project_id": project_id,
            "file": node.get("source", {}).get("file"),
            "line_start": node.get("source", {}).get("line_start"),
            "line_end": node.get("source", {}).get("line_end"),
            "tier": node.get("extraction", {}).get("tier"),
            "confidence": node.get("extraction", {}).get("confidence"),
            "extracted_at": node.get("extraction", {}).get("extracted_at"),
        }

        # Add custom properties
        for key, value in node.get("properties", {}).items():
            if isinstance(value, (str, int, float, bool)):
                props[f"prop_{key}"] = value

        # Check if exists
        check_query = "MATCH (n:MeshNode {id: $id}) RETURN n"
        result = await session.run(check_query, id=node_id)
        exists = await result.single()

        # Build MERGE query with dynamic labels
        query = f"""
        MERGE (n:{labels} {{id: $id}})
        SET n += $props
        """

        await session.run(query, id=node_id, props=props)
        return not exists

    async def _upsert_edge(self, session, edge: dict) -> bool:
        """Create or update an edge. Returns True if created, False if updated."""
        edge_type = edge.get("type", "RELATED_TO")
        edge_id = edge.get("id")
        from_id = edge.get("from_id")
        to_id = edge.get("to_id")

        # Check if exists
        check_query = """
        MATCH (a:MeshNode {id: $from_id})-[r]->(b:MeshNode {id: $to_id})
        WHERE type(r) = $edge_type
        RETURN r
        """
        result = await session.run(
            check_query,
            from_id=from_id,
            to_id=to_id,
            edge_type=edge_type,
        )
        exists = await result.single()

        # Build properties
        props = {
            "id": edge_id,
            "tier": edge.get("extraction", {}).get("tier"),
            "confidence": edge.get("extraction", {}).get("confidence"),
        }

        # Add edge properties
        for key, value in edge.get("properties", {}).items():
            if isinstance(value, (str, int, float, bool)):
                props[f"prop_{key}"] = value

        # Create edge with dynamic type
        query = f"""
        MATCH (a:MeshNode {{id: $from_id}})
        MATCH (b:MeshNode {{id: $to_id}})
        MERGE (a)-[r:{edge_type}]->(b)
        SET r += $props
        """

        await session.run(query, from_id=from_id, to_id=to_id, props=props)
        return not exists

    async def _create_cross_project_link(self, session, link: dict) -> None:
        """Create a cross-project link edge."""
        link_type_map = {
            "queue": "CONNECTS_VIA_QUEUE",
            "api": "CONNECTS_VIA_API",
            "database": "CONNECTS_VIA_DATABASE",
            "library": "DEPENDS_ON",
        }
        edge_type = link_type_map.get(link.get("type"), "DEPENDS_ON")

        query = f"""
        MATCH (a:MeshNode {{id: $from_id}})
        MATCH (b:MeshNode {{id: $to_id}})
        MERGE (a)-[r:{edge_type}]->(b)
        SET r.cross_project = true,
            r.confidence = $confidence,
            r.resolution_method = $method
        """

        await session.run(
            query,
            from_id=link.get("from_node_id"),
            to_id=link.get("to_node_id"),
            confidence=link.get("confidence"),
            method=link.get("resolution_method"),
        )

    async def clear_project(self, project_id: str) -> int:
        """
        Delete all nodes and edges for a project.

        Args:
            project_id: Project ID to clear

        Returns:
            Number of nodes deleted
        """
        if not self._driver:
            await self.connect()

        async with self._driver.session() as session:
            # Delete nodes (edges are deleted automatically)
            query = """
            MATCH (n:MeshNode {project_id: $project_id})
            DETACH DELETE n
            RETURN count(n) as deleted
            """
            result = await session.run(query, project_id=project_id)
            record = await result.single()
            deleted = record["deleted"] if record else 0

            # Delete project node
            await session.run(
                "MATCH (p:Project {id: $project_id}) DELETE p",
                project_id=project_id,
            )

            logger.info("Cleared project", project_id=project_id, deleted=deleted)
            return deleted

    async def create_indexes(self) -> None:
        """Create indexes for efficient querying."""
        if not self._driver:
            await self.connect()

        indexes = [
            "CREATE INDEX mesh_node_id IF NOT EXISTS FOR (n:MeshNode) ON (n.id)",
            "CREATE INDEX mesh_node_project IF NOT EXISTS FOR (n:MeshNode) ON (n.project_id)",
            "CREATE INDEX mesh_node_name IF NOT EXISTS FOR (n:MeshNode) ON (n.name)",
            "CREATE INDEX mesh_node_file IF NOT EXISTS FOR (n:MeshNode) ON (n.file)",
            "CREATE INDEX project_id IF NOT EXISTS FOR (p:Project) ON (p.id)",
        ]

        async with self._driver.session() as session:
            for index in indexes:
                try:
                    await session.run(index)
                except Exception as e:
                    logger.warning("Failed to create index", query=index, error=str(e))

        logger.info("Created mesh indexes")
