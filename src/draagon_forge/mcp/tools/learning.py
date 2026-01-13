"""Learning storage tool."""

from datetime import datetime
import uuid
import structlog
from draagon_forge.mcp.memory import get_memory
from draagon_forge.mcp.models import Belief

logger = structlog.get_logger(__name__)


async def store_learning(
    content: str,
    source: str,
    conviction: float = 0.7,
    category: str | None = None,
    domain: str | None = None,
) -> dict:
    """Store a new learning/principle in semantic memory.

    Use this after discovering new patterns, researching best practices,
    or learning from code reviews. This creates a new belief that will
    be available for future context retrieval.

    Args:
        content: The learning content (max 2000 chars)
        source: Source reference (e.g., "claude-code", "commit:abc123", "pr:42")
        conviction: Initial conviction score (0.0-1.0, default 0.7)
        category: Optional category (architecture, testing, patterns, security, etc.)
        domain: Optional domain (backend, frontend, api, etc.)

    Returns:
        Dictionary with:
        - id: Unique identifier for the learning
        - status: "stored" if successful
        - conviction: Initial conviction score
        - timestamp: When stored

    Examples:
        Store an architectural learning:
        >>> result = await store_learning(
        ...     content="Use dependency injection for testability",
        ...     source="code-review:pr-123",
        ...     conviction=0.85,
        ...     category="architecture",
        ...     domain="backend"
        ... )

        Store a pattern discovered:
        >>> result = await store_learning(
        ...     content="Repository pattern separates data access from business logic",
        ...     source="refactoring:sprint-5",
        ...     category="patterns"
        ... )
    """
    if len(content) > 2000:
        return {
            "status": "error",
            "message": "Content exceeds maximum length of 2000 characters",
        }

    if not 0.0 <= conviction <= 1.0:
        return {
            "status": "error",
            "message": "Conviction must be between 0.0 and 1.0",
        }

    logger.info(
        "Storing learning",
        content=content[:100],
        source=source,
        category=category,
    )

    belief = Belief(
        id=f"learning-{uuid.uuid4().hex[:8]}",
        content=content,
        conviction=conviction,
        category=category,
        domain=domain,
        source=source,
        usage_count=0,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        metadata={"type": "learning"},
    )

    memory = get_memory()
    belief_id = await memory.store_belief(belief)

    return {
        "id": belief_id,
        "status": "stored",
        "conviction": conviction,
        "timestamp": belief.created_at.isoformat(),
        "category": category,
        "domain": domain,
    }
