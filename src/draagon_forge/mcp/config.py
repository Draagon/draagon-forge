"""Configuration management for Draagon Forge MCP server.

Uses draagon-ai shared infrastructure for Neo4j and Qdrant.
"""

import getpass
import os
from dataclasses import dataclass, field
from pathlib import Path


def _get_default_user_id() -> str:
    """Get the default user ID from Unix username."""
    try:
        return getpass.getuser()
    except Exception:
        return "developer"


@dataclass
class MCPConfig:
    """MCP server configuration.

    Integrates with draagon-ai's shared Neo4j and Qdrant instances.
    """

    # Storage backend type
    storage_backend: str = "draagon-ai"  # "inmemory" | "draagon-ai"

    # Neo4j configuration (shared with draagon-ai)
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "draagon-ai-2025"
    neo4j_database: str = "neo4j"

    # Qdrant configuration (shared with draagon-ai)
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "draagon_forge_beliefs"

    # Ollama embedding configuration
    ollama_url: str = "http://localhost:11434"
    embedding_model: str = "mxbai-embed-large"
    embedding_dimension: int = 1024

    # Project configuration
    project_name: str = "draagon-forge"
    project_root: Path | None = None

    # Agent identity (for draagon-ai memory scoping)
    agent_id: str = "draagon-forge"
    user_id: str = field(default_factory=_get_default_user_id)

    # Conviction score thresholds
    min_conviction_threshold: float = 0.3
    block_threshold: float = 0.9

    # Feedback deltas (map to draagon-ai confidence adjustments)
    feedback_helpful_delta: float = 0.05
    feedback_not_helpful_delta: float = -0.03
    feedback_misleading_delta: float = -0.10
    feedback_outdated_delta: float = -0.05
    adjust_reinforce_delta: float = 0.10
    adjust_weaken_delta: float = -0.15

    # Memory type mappings for draagon-ai
    memory_type_belief: str = "belief"
    memory_type_principle: str = "knowledge"
    memory_type_pattern: str = "skill"
    memory_type_learning: str = "insight"

    # LLM configuration
    llm_model: str = "llama-3.3-70b-versatile"
    llm_provider: str = "groq"
    groq_api_key: str | None = None  # Set via env or config

    @classmethod
    def from_env(cls) -> "MCPConfig":
        """Create configuration from environment variables."""
        # Get user_id from env or fall back to Unix username
        user_id = os.getenv("DRAAGON_USER_ID")
        if not user_id:
            user_id = _get_default_user_id()

        return cls(
            storage_backend=os.getenv("DRAAGON_STORAGE_BACKEND", "draagon-ai"),
            neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
            neo4j_password=os.getenv("NEO4J_PASSWORD", "draagon-ai-2025"),
            neo4j_database=os.getenv("NEO4J_DATABASE", "neo4j"),
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            qdrant_collection=os.getenv("QDRANT_COLLECTION", "draagon_forge_beliefs"),
            ollama_url=os.getenv("OLLAMA_URL", "http://localhost:11434"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "mxbai-embed-large"),
            embedding_dimension=int(os.getenv("EMBEDDING_DIMENSION", "1024")),
            project_name=os.getenv("DRAAGON_PROJECT", "draagon-forge"),
            project_root=Path(os.getenv("DRAAGON_PROJECT_ROOT", os.getcwd())),
            agent_id=os.getenv("DRAAGON_AGENT_ID", "draagon-forge"),
            user_id=user_id,
            groq_api_key=os.getenv("GROQ_API_KEY"),
        )


# Global configuration instance
config = MCPConfig.from_env()
