"""
Code Knowledge Mesh - Python integration module.

This module provides:
- ProjectRegistry: Manage registered projects for mesh extraction
- GitSync: Clone and sync git repositories
- Webhook: FastAPI router for GitHub webhooks
- MeshImporter: Import extraction results into Neo4j
- MeshQueryEngine: Query the mesh graph
"""

from .registry import ProjectRegistry, Project, ProjectStatus, ExtractionStats
from .git_sync import GitSync, GitSyncResult
from .webhook import router as webhook_router, set_registry
from .importer import MeshImporter, ImportStats
from .query_engine import MeshQueryEngine, QueryResult
from .mesh_aware_reviewer import (
    MeshAwareReviewer,
    MeshContext,
    ImpactAnalysis,
    create_mesh_aware_reviewer,
)

__all__ = [
    "ProjectRegistry",
    "Project",
    "ProjectStatus",
    "ExtractionStats",
    "GitSync",
    "GitSyncResult",
    "webhook_router",
    "set_registry",
    "MeshImporter",
    "ImportStats",
    "MeshQueryEngine",
    "QueryResult",
    "MeshAwareReviewer",
    "MeshContext",
    "ImpactAnalysis",
    "create_mesh_aware_reviewer",
]
