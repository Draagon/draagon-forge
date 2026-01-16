"""
CodeMeshExtension - Self-improving Code Knowledge Mesh for Draagon-AI.

This extension wraps the mesh-builder TypeScript components and integrates them
with draagon-ai's agent orchestration, learning, and memory systems.

Architecture:
- mesh-builder (TypeScript): Core extraction engine, runs as subprocess
- This extension (Python): Orchestration, learning integration, tool exposure

The key insight is that the manual debugging steps I took should become
autonomous agent behaviors:
- "No Java schema" -> Agent detects, Tier 3 generates, LearningChannel broadcasts
- "Regex is slow" -> TrustScoring flags, SchemaEvolver proposes fix, Agent tests
- "JS not matching" -> Agent sees 0 extractions, proposes fix, learns from outcome
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from draagon_ai.extensions import Extension, ExtensionInfo
from draagon_ai.orchestration.registry import Tool, ToolParameter
from draagon_ai.orchestration import (
    TransactiveMemory,
    ExpertiseEntry,
    Learning,
    LearningType,
    LearningScope,
    LearningChannel,
    get_learning_channel,
)

logger = logging.getLogger(__name__)


@dataclass
class MeshConfig:
    """Configuration for the Code Mesh extension."""

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"

    # Mesh builder CLI location
    mesh_builder_path: str | None = None  # Auto-detect if None

    # Extraction settings
    enable_ai: bool = True
    tier1_threshold: float = 0.4
    tier2_threshold: float = 0.6

    # Learning settings
    enable_self_learning: bool = True
    learning_threshold: int = 5  # Min discoveries before generating schema
    evolution_check_interval: int = 300  # Seconds between evolution checks

    # Trust thresholds
    low_trust_threshold: float = 0.7
    evolution_trigger_correction_rate: float = 0.1
    evolution_trigger_rejection_rate: float = 0.05
    min_samples_for_evolution: int = 20


@dataclass
class ExtractionResult:
    """Result from a mesh extraction."""

    project_id: str
    branch: str
    commit_sha: str
    files_processed: int
    nodes_extracted: int
    edges_extracted: int
    extraction_time_ms: int
    schemas_used: list[str] = field(default_factory=list)
    schemas_generated: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


@dataclass
class SchemaHealthReport:
    """Health report for extraction schemas."""

    schema_name: str
    language: str
    trust_level: str  # "high", "medium", "low"
    accuracy: float
    total_extractions: int
    correction_rate: float
    rejection_rate: float
    needs_evolution: bool
    last_evolved: str | None


@dataclass
class ExtractionOutcome:
    """Tracks the outcome of an extraction for learning."""

    schema_name: str
    file_path: str
    language: str
    nodes_extracted: int
    expected_nodes: int | None = None  # From LLM verification
    corrections: list[dict[str, Any]] = field(default_factory=list)
    rejections: list[dict[str, Any]] = field(default_factory=list)
    extraction_time_ms: int = 0
    verified: bool = False

    @property
    def success(self) -> bool:
        """Was this extraction successful (no rejections, minimal corrections)?"""
        if self.rejections:
            return False
        if self.expected_nodes and self.nodes_extracted < self.expected_nodes * 0.8:
            return False
        correction_rate = len(self.corrections) / max(self.nodes_extracted, 1)
        return correction_rate < 0.1


# Topic hierarchy for TransactiveMemory
SCHEMA_TOPIC_HIERARCHY = {
    # Language-specific topics roll up to broader categories
    "schema:typescript": ["schema:javascript-family", "schema:language"],
    "schema:javascript": ["schema:javascript-family", "schema:language"],
    "schema:python": ["schema:language"],
    "schema:java": ["schema:jvm-family", "schema:language"],
    "schema:kotlin": ["schema:jvm-family", "schema:language"],
    "schema:csharp": ["schema:dotnet-family", "schema:language"],
    "schema:go": ["schema:language"],
    "schema:rust": ["schema:language"],
    # Framework topics roll up to language + framework category
    "schema:react": ["schema:typescript", "schema:framework"],
    "schema:nextjs": ["schema:react", "schema:framework"],
    "schema:spring": ["schema:java", "schema:framework"],
    "schema:aspnet": ["schema:csharp", "schema:framework"],
    "schema:fastapi": ["schema:python", "schema:framework"],
    "schema:django": ["schema:python", "schema:framework"],
    # Extraction topics
    "extraction:class": ["extraction:type"],
    "extraction:function": ["extraction:type"],
    "extraction:method": ["extraction:type"],
    "extraction:import": ["extraction:type"],
    "extraction:decorator": ["extraction:type"],
}


class CodeMeshExtension(Extension):
    """
    Self-improving Code Knowledge Mesh extension.

    Provides:
    - Tools for code analysis and mesh queries
    - Autonomous learning loop for schema improvement
    - Integration with draagon-ai expertise tracking
    """

    def __init__(self):
        self._config: MeshConfig | None = None
        self._mesh_builder_path: Path | None = None
        self._learning_task: asyncio.Task | None = None
        self._shutdown_event: asyncio.Event | None = None

        # TransactiveMemory for tracking schema/extraction expertise
        self._transactive_memory: TransactiveMemory | None = None

        # LearningChannel subscription ID for cleanup
        self._learning_subscription_id: str | None = None

        # Track extraction outcomes for learning
        self._extraction_outcomes: list[ExtractionOutcome] = []
        self._outcomes_lock = asyncio.Lock()

        # Schema health cache (refreshed periodically)
        self._schema_health_cache: dict[str, SchemaHealthReport] = {}
        self._health_cache_timestamp: datetime | None = None

    @property
    def info(self) -> ExtensionInfo:
        return ExtensionInfo(
            name="code-mesh",
            version="0.1.0",
            description="Self-improving Code Knowledge Mesh with tiered extraction",
            author="draagon-forge",
            requires_core=">=0.1.0",
            requires_extensions=[],
            provides_services=["mesh_extractor", "schema_store"],
            provides_behaviors=["code_analyzer"],
            provides_tools=[
                "extract_project",
                "sync_project",
                "query_mesh",
                "get_schema_health",
                "suggest_schema_fix",
                "generate_schema",
            ],
            provides_prompt_domains=["code_analysis"],
            provides_mcp_servers=[],
            config_schema={
                "type": "object",
                "properties": {
                    "neo4j_uri": {"type": "string", "default": "bolt://localhost:7687"},
                    "neo4j_user": {"type": "string", "default": "neo4j"},
                    "neo4j_password": {"type": "string"},
                    "mesh_builder_path": {"type": "string"},
                    "enable_ai": {"type": "boolean", "default": True},
                    "enable_self_learning": {"type": "boolean", "default": True},
                    "tier1_threshold": {"type": "number", "default": 0.4},
                    "tier2_threshold": {"type": "number", "default": 0.6},
                },
            },
        )

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize the extension with configuration."""
        self._config = MeshConfig(
            neo4j_uri=config.get("neo4j_uri", "bolt://localhost:7687"),
            neo4j_user=config.get("neo4j_user", "neo4j"),
            neo4j_password=config.get("neo4j_password", "password"),
            mesh_builder_path=config.get("mesh_builder_path"),
            enable_ai=config.get("enable_ai", True),
            enable_self_learning=config.get("enable_self_learning", True),
            tier1_threshold=config.get("tier1_threshold", 0.4),
            tier2_threshold=config.get("tier2_threshold", 0.6),
        )

        # Find mesh-builder CLI
        self._mesh_builder_path = self._find_mesh_builder()

        # Initialize TransactiveMemory for schema expertise tracking
        self._transactive_memory = TransactiveMemory()
        self._transactive_memory.set_hierarchy(SCHEMA_TOPIC_HIERARCHY)

        # Subscribe to learning channel for cross-agent schema knowledge
        asyncio.create_task(self._setup_learning_subscription())

        # Start learning loop if enabled
        if self._config.enable_self_learning:
            self._shutdown_event = asyncio.Event()
            self._learning_task = asyncio.create_task(self._learning_loop())

        logger.info(
            "CodeMeshExtension initialized",
            extra={
                "neo4j_uri": self._config.neo4j_uri,
                "enable_self_learning": self._config.enable_self_learning,
            },
        )

    async def _setup_learning_subscription(self) -> None:
        """Subscribe to LearningChannel to receive schema-related learnings."""
        try:
            channel = get_learning_channel()
            self._learning_subscription_id = await channel.subscribe(
                agent_id="code-mesh-extension",
                handler=self._on_learning_received,
                learning_types={
                    LearningType.FACT,      # Schema facts (e.g., "Java uses annotations")
                    LearningType.SKILL,     # Extraction skills
                    LearningType.INSIGHT,   # Pattern insights
                    LearningType.CORRECTION,  # Schema corrections
                },
            )
            logger.debug("Subscribed to LearningChannel for schema learnings")
        except Exception as e:
            logger.warning(f"Could not subscribe to LearningChannel: {e}")

    async def _on_learning_received(self, learning: Learning) -> None:
        """Handle learnings from other agents that relate to code extraction."""
        # Check if this learning is about schemas or extraction
        schema_keywords = {"schema", "extraction", "pattern", "regex", "language"}
        is_schema_related = any(
            kw in learning.content.lower() for kw in schema_keywords
        ) or any(
            entity.startswith("schema:") for entity in learning.entities
        )

        if not is_schema_related:
            return

        logger.debug(
            f"Received schema-related learning: {learning.content[:100]}...",
            extra={"learning_type": learning.learning_type},
        )

        # If it's a correction about a schema, trigger evolution check
        if learning.learning_type == LearningType.CORRECTION:
            for entity in learning.entities:
                if entity.startswith("schema:"):
                    schema_name = entity.replace("schema:", "")
                    await self._queue_schema_evolution(schema_name, learning.content)

    def shutdown(self) -> None:
        """Clean up resources."""
        if self._shutdown_event:
            self._shutdown_event.set()
        if self._learning_task:
            self._learning_task.cancel()

        # Unsubscribe from LearningChannel
        if self._learning_subscription_id:
            try:
                channel = get_learning_channel()
                asyncio.create_task(channel.unsubscribe(self._learning_subscription_id))
            except Exception:
                pass  # Best effort cleanup

        logger.info("CodeMeshExtension shutdown complete")

    def get_services(self) -> dict[str, Any]:
        """Return services provided by this extension."""
        return {
            "mesh_extractor": self,  # Self as extractor service
            "schema_store": self,    # Self as schema store service
        }

    def get_tools(self) -> list[Tool]:
        """Return tools for agent use."""
        return [
            Tool(
                name="extract_project",
                description="Extract code knowledge mesh from a project directory",
                handler=self._extract_project,
                parameters=[
                    ToolParameter(
                        name="project_path",
                        type="string",
                        description="Path to the project directory",
                        required=True,
                    ),
                    ToolParameter(
                        name="project_id",
                        type="string",
                        description="Unique identifier for the project",
                        required=False,
                    ),
                    ToolParameter(
                        name="incremental",
                        type="boolean",
                        description="Only extract changed files since last sync",
                        required=False,
                        default=True,
                    ),
                ],
            ),
            Tool(
                name="sync_project",
                description="Sync project mesh to Neo4j (extract + store with git tracking)",
                handler=self._sync_project,
                parameters=[
                    ToolParameter(
                        name="project_path",
                        type="string",
                        description="Path to the project directory",
                        required=True,
                    ),
                    ToolParameter(
                        name="full",
                        type="boolean",
                        description="Force full extraction (ignore incremental)",
                        required=False,
                        default=False,
                    ),
                ],
            ),
            Tool(
                name="query_mesh",
                description="Query the code knowledge mesh for a project",
                handler=self._query_mesh,
                parameters=[
                    ToolParameter(
                        name="project_id",
                        type="string",
                        description="Project identifier",
                        required=True,
                    ),
                    ToolParameter(
                        name="query_type",
                        type="string",
                        description="Type of query: stats, nodes, edges, dependencies",
                        required=False,
                        default="stats",
                    ),
                    ToolParameter(
                        name="node_type",
                        type="string",
                        description="Filter by node type (e.g., Class, Function)",
                        required=False,
                    ),
                    ToolParameter(
                        name="file_path",
                        type="string",
                        description="Filter by file path",
                        required=False,
                    ),
                ],
            ),
            Tool(
                name="get_schema_health",
                description="Get health report for extraction schemas",
                handler=self._get_schema_health,
                parameters=[
                    ToolParameter(
                        name="language",
                        type="string",
                        description="Filter by language (e.g., python, typescript)",
                        required=False,
                    ),
                ],
            ),
            Tool(
                name="suggest_schema_fix",
                description="Analyze a schema issue and suggest a fix",
                handler=self._suggest_schema_fix,
                parameters=[
                    ToolParameter(
                        name="schema_name",
                        type="string",
                        description="Name of the schema to analyze",
                        required=True,
                    ),
                    ToolParameter(
                        name="issue_description",
                        type="string",
                        description="Description of the issue observed",
                        required=True,
                    ),
                ],
            ),
            Tool(
                name="generate_schema",
                description="Generate a new extraction schema for a language/framework",
                handler=self._generate_schema,
                parameters=[
                    ToolParameter(
                        name="language",
                        type="string",
                        description="Target language (e.g., java, csharp)",
                        required=True,
                    ),
                    ToolParameter(
                        name="framework",
                        type="string",
                        description="Optional framework (e.g., spring, aspnet)",
                        required=False,
                    ),
                    ToolParameter(
                        name="example_files",
                        type="array",
                        description="Paths to example files for learning",
                        required=False,
                    ),
                ],
            ),
        ]

    def get_prompt_domains(self) -> dict[str, dict[str, str]]:
        """Return prompt templates for code analysis."""
        return {
            "code_analysis": {
                "SCHEMA_GENERATION_PROMPT": SCHEMA_GENERATION_PROMPT,
                "PATTERN_VERIFICATION_PROMPT": PATTERN_VERIFICATION_PROMPT,
                "PATTERN_EVOLUTION_PROMPT": PATTERN_EVOLUTION_PROMPT,
                "CODE_ANALYSIS_PROMPT": CODE_ANALYSIS_PROMPT,
            }
        }

    # =========================================================================
    # Tool Handlers
    # =========================================================================

    async def _extract_project(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Extract mesh from a project."""
        project_path = args["project_path"]
        project_id = args.get("project_id") or Path(project_path).name

        result = await self._run_mesh_builder(
            "extract",
            project_path,
            "--project-id", project_id,
            "--verbose",
            "--json",
        )

        # Record extraction outcomes for learning
        if result.get("success"):
            stats = result.get("statistics", {})
            by_language = stats.get("by_language", {})

            for language, lang_stats in by_language.items():
                outcome = ExtractionOutcome(
                    schema_name=f"base-{language}",
                    file_path=project_path,
                    language=language,
                    nodes_extracted=lang_stats.get("nodes", 0),
                    extraction_time_ms=lang_stats.get("extraction_time_ms", 0),
                )
                await self.record_extraction_outcome(outcome)

        return {
            "success": result.get("success", False),
            "project_id": project_id,
            "statistics": result.get("statistics", {}),
            "git": result.get("git", {}),
        }

    async def _sync_project(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Sync project to Neo4j with incremental support."""
        project_path = args["project_path"]
        full = args.get("full", False)

        cmd_args = ["sync", project_path, "--verbose"]
        if full:
            cmd_args.append("--full")
        cmd_args.extend([
            "--password", self._config.neo4j_password,
            "--uri", self._config.neo4j_uri,
        ])

        result = await self._run_mesh_builder(*cmd_args)

        # Broadcast learning if schemas were generated
        if result.get("schemas_generated"):
            await self._broadcast_schema_learning(result["schemas_generated"])

        return {
            "success": result.get("success", False),
            "mode": "full" if full else "incremental",
            "nodes_delta": result.get("nodes_delta", {}),
            "edges_delta": result.get("edges_delta", {}),
        }

    async def _query_mesh(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Query the mesh database."""
        project_id = args["project_id"]
        query_type = args.get("query_type", "stats")

        cmd_args = ["query", project_id]
        if query_type == "stats":
            cmd_args.append("--stats")
        if args.get("node_type"):
            cmd_args.extend(["--type", args["node_type"]])
        if args.get("file_path"):
            cmd_args.extend(["--file", args["file_path"]])
        cmd_args.extend([
            "--password", self._config.neo4j_password,
            "--json",
        ])

        return await self._run_mesh_builder(*cmd_args)

    async def _get_schema_health(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Get health report for schemas using TransactiveMemory."""
        language_filter = args.get("language")

        # Get real health data from TransactiveMemory
        health = await self._check_schema_health()

        # Build schema reports
        schemas = []
        expertise = self._transactive_memory.get_expertise_summary()
        mesh_expertise = expertise.get("code-mesh-extension", {})

        for topic, confidence in mesh_expertise.items():
            if not topic.startswith("schema:"):
                continue

            language = topic.replace("schema:", "")
            if language_filter and language != language_filter:
                continue

            schema_name = f"base-{language}"
            needs_evolution = schema_name in health.get("needing_evolution", [])

            schemas.append({
                "name": schema_name,
                "language": language,
                "trust_level": (
                    "high" if confidence >= 0.8
                    else "medium" if confidence >= 0.6
                    else "low"
                ),
                "accuracy": confidence,
                "needs_evolution": needs_evolution,
            })

        return {
            "schemas": schemas,
            "total_schemas": len(schemas),
            "needing_evolution": len(health.get("needing_evolution", [])),
        }

    async def _suggest_schema_fix(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Analyze and suggest fix for a schema issue."""
        schema_name = args["schema_name"]
        issue = args["issue_description"]

        # This would use the SchemaEvolver to analyze and propose fixes
        # For now, structure the response
        return {
            "schema": schema_name,
            "issue": issue,
            "analysis": "Analysis would be performed by SchemaEvolver LLM",
            "suggested_fix": None,
            "confidence": 0.0,
        }

    async def _generate_schema(
        self,
        args: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generate a new schema using LLM."""
        language = args["language"]
        framework = args.get("framework")

        # This would invoke SchemaEvolver.generateBaseSchema or generateFrameworkSchema
        return {
            "language": language,
            "framework": framework,
            "status": "Schema generation would be performed by SchemaEvolver",
            "schema_path": None,
        }

    # =========================================================================
    # Learning Loop
    # =========================================================================

    async def _learning_loop(self) -> None:
        """
        Autonomous learning loop that:
        1. Processes extraction outcomes to update TransactiveMemory
        2. Queries Neo4j for recent extraction results
        3. Broadcasts schema discoveries to other agents

        NOTE: Schema evolution and generation now happen INSIDE mesh-builder's
        TypeScript pipeline (Tier 2/3 + SchemaEvolver). This extension's job is
        to read results and update expertise tracking, not to drive evolution.
        """
        logger.info("Starting autonomous learning loop")

        while not self._shutdown_event.is_set():
            try:
                # Step 1: Process recent extraction outcomes to update expertise
                await self._process_extraction_outcomes()

                # Step 2: Query Neo4j for recent extractions and update from actual results
                await self._update_expertise_from_neo4j()

                # Step 3: Check schema health for reporting (not driving evolution)
                await self._check_schema_health()

                # Step 4: Refresh health cache
                self._health_cache_timestamp = datetime.now()

            except Exception as e:
                logger.error(f"Learning loop error: {e}", exc_info=True)

            # Wait before next check
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=self._config.evolution_check_interval,
                )
                break  # Shutdown requested
            except asyncio.TimeoutError:
                pass  # Continue loop

        logger.info("Learning loop terminated")

    async def _update_expertise_from_neo4j(self) -> None:
        """
        Query Neo4j for recent extraction statistics and update TransactiveMemory.
        This reflects the actual quality of extractions done by mesh-builder.
        """
        try:
            # Query mesh-builder for recent extraction statistics
            result = await self._run_mesh_builder(
                "query", "recent-stats",
                "--password", self._config.neo4j_password,
                "--uri", self._config.neo4j_uri,
                "--json",
            )

            if result.get("success") and result.get("statistics"):
                for lang_stats in result.get("statistics", []):
                    language = lang_stats.get("language")
                    if not language:
                        continue

                    # Calculate success rate from tier stats
                    total = lang_stats.get("total_extractions", 0)
                    tier1 = lang_stats.get("tier1_count", 0)
                    tier2 = lang_stats.get("tier2_count", 0)
                    tier3 = lang_stats.get("tier3_count", 0)

                    # Higher tier usage indicates schema doesn't match well
                    # Success = mostly tier1, few tier2/3 escalations
                    success = total > 0 and (tier1 / total) > 0.7

                    await self._transactive_memory.update_expertise(
                        agent_id="code-mesh-extension",
                        topic=f"schema:{language}",
                        success=success,
                    )

                    logger.debug(
                        f"Updated expertise for {language}: "
                        f"tier1={tier1}, tier2={tier2}, tier3={tier3}"
                    )

        except Exception as e:
            logger.debug(f"Could not update expertise from Neo4j: {e}")

    async def _process_extraction_outcomes(self) -> None:
        """
        Process recent extraction outcomes to update TransactiveMemory.
        This is how we learn from extraction success/failure.
        """
        async with self._outcomes_lock:
            if not self._extraction_outcomes:
                return

            outcomes_to_process = self._extraction_outcomes.copy()
            self._extraction_outcomes.clear()

        for outcome in outcomes_to_process:
            # Update TransactiveMemory with extraction outcome
            topic = f"schema:{outcome.language}"
            await self._transactive_memory.update_expertise(
                agent_id="code-mesh-extension",
                topic=topic,
                success=outcome.success,
            )

            # Also track extraction type expertise
            if outcome.nodes_extracted > 0:
                await self._transactive_memory.update_expertise(
                    agent_id="code-mesh-extension",
                    topic="extraction:type",
                    success=outcome.success,
                )

            # If extraction had issues, record them for evolution
            if outcome.corrections or outcome.rejections:
                await self._record_extraction_issues(outcome)

            logger.debug(
                f"Processed outcome for {outcome.schema_name}: "
                f"success={outcome.success}, nodes={outcome.nodes_extracted}"
            )

    async def _record_extraction_issues(self, outcome: ExtractionOutcome) -> None:
        """Record extraction issues for later schema evolution."""
        # Store issues in Neo4j for analysis
        issues = {
            "schema": outcome.schema_name,
            "file": outcome.file_path,
            "language": outcome.language,
            "corrections": outcome.corrections,
            "rejections": outcome.rejections,
            "timestamp": datetime.now().isoformat(),
        }

        # Queue for evolution if correction rate is high
        total_issues = len(outcome.corrections) + len(outcome.rejections)
        if total_issues > 2 or (outcome.rejections and len(outcome.rejections) > 0):
            await self._queue_schema_evolution(
                outcome.schema_name,
                f"High issue rate: {total_issues} issues in {outcome.file_path}",
            )

    async def _check_schema_health(self) -> dict[str, Any]:
        """
        Check health of all schemas and identify issues.
        Returns schemas needing evolution based on:
        - Low trust scores from TransactiveMemory
        - High correction rates
        - High rejection rates
        """
        needing_evolution = []

        # Get expertise summary from TransactiveMemory
        expertise = self._transactive_memory.get_expertise_summary()
        mesh_expertise = expertise.get("code-mesh-extension", {})

        for topic, confidence in mesh_expertise.items():
            if not topic.startswith("schema:"):
                continue

            language = topic.replace("schema:", "")
            schema_name = f"base-{language}"

            # Check if expertise is below threshold
            if confidence < self._config.low_trust_threshold:
                needing_evolution.append(schema_name)
                self._schema_health_cache[schema_name] = SchemaHealthReport(
                    schema_name=schema_name,
                    language=language,
                    trust_level="low" if confidence < 0.5 else "medium",
                    accuracy=confidence,
                    total_extractions=0,  # Would come from TrustScoring
                    correction_rate=0.0,
                    rejection_rate=0.0,
                    needs_evolution=True,
                    last_evolved=None,
                )

        return {
            "needing_evolution": needing_evolution,
            "total_schemas": len(self._schema_health_cache),
            "low_trust_count": len(needing_evolution),
        }

    # NOTE: _evolve_schema, _find_unknown_frameworks, and _attempt_schema_generation
    # have been removed. Schema evolution and generation now happen INSIDE mesh-builder's
    # TypeScript pipeline (Tier 2/3 + SchemaEvolver). See docs/ARCHITECTURE_DECISION.md

    async def _queue_schema_evolution(
        self, schema_name: str, reason: str
    ) -> None:
        """Queue a schema for evolution check."""
        logger.debug(f"Queuing {schema_name} for evolution: {reason}")
        # The next learning loop iteration will pick this up
        # via _check_schema_health

    # =========================================================================
    # Learning Broadcasting
    # =========================================================================

    async def _broadcast_schema_discovery(
        self,
        schema_name: str,
        language: str,
        framework: str | None = None,
    ) -> None:
        """Broadcast discovery of a new schema to other agents."""
        try:
            channel = get_learning_channel()
            learning = Learning(
                learning_type=LearningType.SKILL,
                content=(
                    f"Generated new extraction schema '{schema_name}' for {language}"
                    + (f" framework {framework}" if framework else "")
                    + ". The schema can now extract code structure from this language."
                ),
                source_agent_id="code-mesh-extension",
                scope=LearningScope.GLOBAL,
                confidence=0.8,
                importance=0.7,
                entities=[
                    f"schema:{language}",
                    f"schema:{schema_name}",
                ] + ([f"framework:{framework}"] if framework else []),
                metadata={
                    "schema_name": schema_name,
                    "language": language,
                    "framework": framework,
                },
            )
            await channel.broadcast(learning)
            logger.debug(f"Broadcasted schema discovery: {schema_name}")
        except Exception as e:
            logger.warning(f"Failed to broadcast schema discovery: {e}")

    async def _broadcast_schema_evolution(
        self,
        schema_name: str,
        changes: list[dict[str, Any]],
    ) -> None:
        """Broadcast schema evolution to other agents."""
        try:
            channel = get_learning_channel()
            learning = Learning(
                learning_type=LearningType.INSIGHT,
                content=(
                    f"Evolved extraction schema '{schema_name}' with {len(changes)} pattern changes. "
                    f"Extraction accuracy should improve for this language."
                ),
                source_agent_id="code-mesh-extension",
                scope=LearningScope.GLOBAL,
                confidence=0.7,
                importance=0.5,
                entities=[f"schema:{schema_name}"],
                metadata={
                    "schema_name": schema_name,
                    "changes": changes,
                },
            )
            await channel.broadcast(learning)
            logger.debug(f"Broadcasted schema evolution: {schema_name}")
        except Exception as e:
            logger.warning(f"Failed to broadcast schema evolution: {e}")

    async def _broadcast_schema_learning(self, schemas: list[str]) -> None:
        """Broadcast schema discoveries to learning channel."""
        for schema_name in schemas:
            # Extract language from schema name
            language = schema_name.replace("base-", "").replace("-", "")
            await self._broadcast_schema_discovery(schema_name, language)

    # =========================================================================
    # Outcome Recording (called from tool handlers)
    # =========================================================================

    async def record_extraction_outcome(self, outcome: ExtractionOutcome) -> None:
        """
        Record an extraction outcome for learning.
        Called by extraction tools after each extraction.
        """
        async with self._outcomes_lock:
            self._extraction_outcomes.append(outcome)

        logger.debug(
            f"Recorded extraction outcome: {outcome.schema_name} "
            f"({outcome.nodes_extracted} nodes, success={outcome.success})"
        )

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _find_mesh_builder(self) -> Path:
        """Find the mesh-builder CLI."""
        if self._config and self._config.mesh_builder_path:
            return Path(self._config.mesh_builder_path)

        # Try to find relative to this file
        possible_paths = [
            Path(__file__).parent.parent.parent.parent / "mesh-builder" / "dist" / "cli" / "index.js",
            Path.home() / "Development" / "draagon-forge" / "src" / "mesh-builder" / "dist" / "cli" / "index.js",
        ]

        for path in possible_paths:
            if path.exists():
                return path

        raise FileNotFoundError("Could not find mesh-builder CLI")

    async def _run_mesh_builder(self, *args: str) -> dict[str, Any]:
        """Run a mesh-builder command and return parsed output."""
        cmd = ["node", str(self._mesh_builder_path), *args]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                return {
                    "success": False,
                    "error": stderr.decode(),
                }

            # Try to parse JSON output
            output = stdout.decode()
            try:
                return {"success": True, **json.loads(output)}
            except json.JSONDecodeError:
                return {"success": True, "output": output}

        except Exception as e:
            return {"success": False, "error": str(e)}


# =============================================================================
# Prompt Templates
# =============================================================================

SCHEMA_GENERATION_PROMPT = """<task>Generate extraction schema for {language}</task>

<instructions>
Create a comprehensive extraction schema for {language} source code.
The schema should extract:
1. Classes/structs with inheritance
2. Functions/methods with parameters and return types
3. Import/require statements
4. Module-level variables and constants
5. Decorators/annotations

For each extraction pattern, provide:
- A regex that works with multiline flag
- Named capture groups for key data
- A node template defining the extracted type

Use standard {language} conventions and common patterns.
</instructions>

<response_format>
<schema>
  <name>base-{language}</name>
  <version>1.0.0</version>
  <description>Base {language} extraction patterns</description>
</schema>

<patterns>
  <pattern>
    <name>pattern_name</name>
    <regex>the_regex_pattern</regex>
    <node_template type="Function" name_from="name" />
  </pattern>
</patterns>
</response_format>"""

PATTERN_VERIFICATION_PROMPT = """<task>Verify extracted code element</task>

<extracted>
Type: {node_type}
Name: {node_name}
Properties: {properties}
</extracted>

<source_context>
{source_context}
</source_context>

<instructions>
Verify that the extracted element is correct:
1. Is the type correct?
2. Is the name correct?
3. Are the properties (parameters, return type, etc.) correct?
4. Is anything missing?

If corrections are needed, provide them.
</instructions>

<response_format>
<verification>
  <status>verified|corrected|rejected</status>
  <confidence>0.0-1.0</confidence>
  <corrections>
    <field name="..." original="..." corrected="..." />
  </corrections>
  <reason>Explanation</reason>
</verification>
</response_format>"""

PATTERN_EVOLUTION_PROMPT = """<task>Improve extraction pattern based on corrections</task>

<corrections>
{corrections}
</corrections>

<current_pattern>
{current_regex}
</current_pattern>

<instructions>
Analyze the corrections and suggest an improved regex pattern.
Consider:
1. Why did the original pattern fail?
2. What pattern change would fix these cases?
3. Will the change break existing correct extractions?

Keep changes minimal - only fix the identified issues.
</instructions>

<response_format>
<evolution>
  <new_regex>improved_regex</new_regex>
  <confidence>0.0-1.0</confidence>
  <reason>Explanation of fix</reason>
</evolution>
</response_format>"""

CODE_ANALYSIS_PROMPT = """<task>Analyze code structure</task>

<file>
Path: {file_path}
Language: {language}
</file>

<content>
{content}
</content>

<instructions>
Analyze this code and extract:
1. All classes, functions, and methods
2. Import relationships
3. Inheritance hierarchies
4. API endpoints if present
5. Key architectural patterns

Format as structured data.
</instructions>"""
