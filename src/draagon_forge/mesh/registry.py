"""
ProjectRegistry - Manage projects for code knowledge mesh extraction.

The registry tracks:
- Project configuration (path, git URL, branches)
- Last extraction timestamps and stats
- Incremental extraction metadata
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)


class ProjectStatus(str, Enum):
    """Project extraction status."""

    PENDING = "pending"  # Never extracted
    EXTRACTING = "extracting"  # Extraction in progress
    READY = "ready"  # Successfully extracted
    ERROR = "error"  # Extraction failed
    STALE = "stale"  # Has updates since last extraction


@dataclass
class ExtractionStats:
    """Statistics from a project extraction."""

    files_processed: int = 0
    files_skipped: int = 0
    tier1_extractions: int = 0
    tier2_extractions: int = 0
    tier3_extractions: int = 0
    total_nodes: int = 0
    total_edges: int = 0
    schemas_generated: int = 0
    extraction_time_ms: int = 0
    ai_calls: int = 0
    ai_tokens_used: int = 0


@dataclass
class Project:
    """A registered project for mesh extraction."""

    # Identity
    id: str
    name: str

    # Location
    path: str
    git_url: Optional[str] = None
    branch: str = "main"

    # Filtering
    include_paths: list[str] = field(default_factory=lambda: ["**/*"])
    exclude_paths: list[str] = field(
        default_factory=lambda: [
            "**/node_modules/**",
            "**/__pycache__/**",
            "**/venv/**",
            "**/.venv/**",
            "**/dist/**",
            "**/build/**",
            "**/.git/**",
        ]
    )

    # Custom schemas
    schemas_dir: Optional[str] = None

    # Extraction state
    status: ProjectStatus = ProjectStatus.PENDING
    last_extracted: Optional[str] = None
    last_commit: Optional[str] = None
    last_stats: Optional[ExtractionStats] = None

    # Webhook
    webhook_secret: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data["status"] = self.status.value
        if self.last_stats:
            data["last_stats"] = asdict(self.last_stats)
        return data

    @classmethod
    def from_dict(cls, data: dict) -> Project:
        """Create from dictionary."""
        data = data.copy()
        data["status"] = ProjectStatus(data.get("status", "pending"))
        if data.get("last_stats"):
            data["last_stats"] = ExtractionStats(**data["last_stats"])
        return cls(**data)


class ProjectRegistry:
    """
    Registry for managing projects that will be extracted to the code mesh.

    Provides:
    - CRUD operations for projects
    - Status tracking
    - Persistence to JSON file
    """

    def __init__(
        self,
        storage_path: str | Path = "~/.draagon-forge/projects.json",
        mesh_builder_path: str | Path = None,
    ):
        """
        Initialize the registry.

        Args:
            storage_path: Path to JSON file for persistence
            mesh_builder_path: Path to mesh-builder CLI (auto-detected if not provided)
        """
        self.storage_path = Path(storage_path).expanduser()
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)

        self.mesh_builder_path = mesh_builder_path or self._find_mesh_builder()
        self._projects: dict[str, Project] = {}
        self._load()

    def _find_mesh_builder(self) -> str:
        """Find the mesh-builder CLI path."""
        # Check if installed globally
        try:
            result = subprocess.run(
                ["which", "mesh-builder"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass

        # Check relative to this module
        module_dir = Path(__file__).parent.parent.parent.parent
        local_path = module_dir / "mesh-builder" / "dist" / "cli" / "index.js"
        if local_path.exists():
            return f"node {local_path}"

        logger.warning("mesh-builder not found, extraction will fail")
        return "mesh-builder"

    def _load(self) -> None:
        """Load projects from storage."""
        if not self.storage_path.exists():
            self._projects = {}
            return

        try:
            with open(self.storage_path) as f:
                data = json.load(f)
                self._projects = {
                    p["id"]: Project.from_dict(p) for p in data.get("projects", [])
                }
            logger.info("Loaded projects", count=len(self._projects))
        except Exception as e:
            logger.error("Failed to load projects", error=str(e))
            self._projects = {}

    def _save(self) -> None:
        """Save projects to storage."""
        try:
            data = {"projects": [p.to_dict() for p in self._projects.values()]}
            with open(self.storage_path, "w") as f:
                json.dump(data, f, indent=2)
            logger.debug("Saved projects", count=len(self._projects))
        except Exception as e:
            logger.error("Failed to save projects", error=str(e))

    def register(self, project: Project) -> Project:
        """
        Register a new project.

        Args:
            project: Project configuration

        Returns:
            The registered project

        Raises:
            ValueError: If project ID already exists
        """
        if project.id in self._projects:
            raise ValueError(f"Project '{project.id}' already registered")

        self._projects[project.id] = project
        self._save()
        logger.info("Registered project", id=project.id, name=project.name)
        return project

    def get(self, project_id: str) -> Optional[Project]:
        """Get a project by ID."""
        return self._projects.get(project_id)

    def list(self, status: Optional[ProjectStatus] = None) -> list[Project]:
        """
        List all projects.

        Args:
            status: Filter by status (optional)

        Returns:
            List of projects
        """
        projects = list(self._projects.values())
        if status:
            projects = [p for p in projects if p.status == status]
        return projects

    def update(self, project: Project) -> Project:
        """Update an existing project."""
        if project.id not in self._projects:
            raise ValueError(f"Project '{project.id}' not found")

        self._projects[project.id] = project
        self._save()
        logger.info("Updated project", id=project.id)
        return project

    def delete(self, project_id: str) -> bool:
        """
        Delete a project.

        Args:
            project_id: Project ID to delete

        Returns:
            True if deleted, False if not found
        """
        if project_id not in self._projects:
            return False

        del self._projects[project_id]
        self._save()
        logger.info("Deleted project", id=project_id)
        return True

    def update_status(
        self,
        project_id: str,
        status: ProjectStatus,
        stats: Optional[ExtractionStats] = None,
        commit: Optional[str] = None,
    ) -> Project:
        """
        Update project extraction status.

        Args:
            project_id: Project ID
            status: New status
            stats: Extraction statistics (for READY status)
            commit: Git commit hash

        Returns:
            Updated project
        """
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")

        project.status = status
        if status == ProjectStatus.READY:
            project.last_extracted = datetime.now().isoformat()
            if stats:
                project.last_stats = stats
            if commit:
                project.last_commit = commit

        self._save()
        logger.info("Updated project status", id=project_id, status=status.value)
        return project

    async def extract(self, project_id: str, output_path: Optional[str] = None) -> dict:
        """
        Trigger extraction for a project.

        Args:
            project_id: Project ID
            output_path: Path to write extraction results (optional)

        Returns:
            Extraction result dictionary
        """
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")

        # Update status to extracting
        self.update_status(project_id, ProjectStatus.EXTRACTING)

        try:
            # Build command
            cmd = [
                *self.mesh_builder_path.split(),
                "extract",
                project.path,
                "--project-id",
                project.id,
            ]

            if output_path:
                cmd.extend(["--output", output_path])
            else:
                output_path = f"/tmp/mesh-{project.id}.json"
                cmd.extend(["--output", output_path])

            # Run extraction
            logger.info("Starting extraction", project_id=project_id, cmd=" ".join(cmd))
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

            if result.returncode != 0:
                logger.error(
                    "Extraction failed",
                    project_id=project_id,
                    stderr=result.stderr,
                )
                self.update_status(project_id, ProjectStatus.ERROR)
                return {"success": False, "error": result.stderr}

            # Parse results
            with open(output_path) as f:
                extraction_result = json.load(f)

            # Update status with stats
            stats = ExtractionStats(
                files_processed=extraction_result["statistics"]["files_processed"],
                total_nodes=extraction_result["statistics"]["total_nodes"],
                total_edges=extraction_result["statistics"]["total_edges"],
                extraction_time_ms=extraction_result["statistics"]["extraction_time_ms"],
            )

            # Get current commit
            commit = None
            try:
                commit_result = subprocess.run(
                    ["git", "-C", project.path, "rev-parse", "HEAD"],
                    capture_output=True,
                    text=True,
                )
                if commit_result.returncode == 0:
                    commit = commit_result.stdout.strip()
            except Exception:
                pass

            self.update_status(project_id, ProjectStatus.READY, stats=stats, commit=commit)

            logger.info(
                "Extraction complete",
                project_id=project_id,
                nodes=stats.total_nodes,
                edges=stats.total_edges,
                time_ms=stats.extraction_time_ms,
            )

            return {
                "success": True,
                "output_path": output_path,
                "statistics": asdict(stats),
            }

        except subprocess.TimeoutExpired:
            logger.error("Extraction timed out", project_id=project_id)
            self.update_status(project_id, ProjectStatus.ERROR)
            return {"success": False, "error": "Extraction timed out"}

        except Exception as e:
            logger.error("Extraction error", project_id=project_id, error=str(e))
            self.update_status(project_id, ProjectStatus.ERROR)
            return {"success": False, "error": str(e)}

    def check_for_updates(self, project_id: str) -> bool:
        """
        Check if a project has updates since last extraction.

        Args:
            project_id: Project ID

        Returns:
            True if updates exist
        """
        project = self._projects.get(project_id)
        if not project:
            return False

        if not project.last_commit:
            return True

        try:
            # Get current HEAD
            result = subprocess.run(
                ["git", "-C", project.path, "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                return False

            current_commit = result.stdout.strip()
            has_updates = current_commit != project.last_commit

            if has_updates:
                project.status = ProjectStatus.STALE
                self._save()

            return has_updates

        except Exception as e:
            logger.error("Failed to check for updates", error=str(e))
            return False

    def get_changed_files(self, project_id: str) -> list[str]:
        """
        Get list of files changed since last extraction.

        Args:
            project_id: Project ID

        Returns:
            List of changed file paths (relative)
        """
        project = self._projects.get(project_id)
        if not project or not project.last_commit:
            return []

        try:
            result = subprocess.run(
                [
                    "git",
                    "-C",
                    project.path,
                    "diff",
                    "--name-only",
                    project.last_commit,
                    "HEAD",
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return [f for f in result.stdout.strip().split("\n") if f]
        except Exception as e:
            logger.error("Failed to get changed files", error=str(e))

        return []
