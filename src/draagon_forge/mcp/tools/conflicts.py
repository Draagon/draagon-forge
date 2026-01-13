"""Conflict detection tool."""

import structlog
from draagon_forge.mcp.memory import get_memory

logger = structlog.get_logger(__name__)


async def check_conflicts(
    content: str,
    domain: str | None = None,
) -> list[dict]:
    """Check if content conflicts with established principles.

    Use this before proposing changes to detect potential violations
    of project principles and patterns.

    Args:
        content: The content to check (code, proposal, etc.)
        domain: Optional domain for focused checking

    Returns:
        List of potential conflicts with:
        - principle_id: ID of conflicting principle
        - principle_content: The conflicting principle text
        - confidence: How confident the conflict is (0.0-1.0)
        - explanation: Why this is a conflict

    Examples:
        Check code for conflicts:
        >>> conflicts = await check_conflicts(
        ...     content="using regex for semantic analysis",
        ...     domain="architecture"
        ... )
    """
    logger.debug("Checking conflicts", content_length=len(content), domain=domain)

    memory = get_memory()

    # Get relevant principles
    principles = await memory.get_principles(domain=domain, min_conviction=0.7)

    # Simple keyword-based conflict detection for now
    # TODO: Use LLM for semantic conflict detection
    conflicts = []
    content_lower = content.lower()

    for principle in principles:
        principle_lower = principle.content.lower()

        # Check for explicit contradictions
        if "never" in principle_lower or "avoid" in principle_lower:
            # Extract what to avoid
            keywords = _extract_avoid_keywords(principle_lower)
            for keyword in keywords:
                if keyword in content_lower:
                    conflicts.append(
                        {
                            "principle_id": principle.id,
                            "principle_content": principle.content,
                            "confidence": 0.8,
                            "explanation": f"Content mentions '{keyword}' which conflicts with principle",
                        }
                    )

    return conflicts


def _extract_avoid_keywords(text: str) -> list[str]:
    """Extract keywords to avoid from principle text.

    This is a simple implementation. In production, use LLM.
    """
    # Simple extraction: words after "never" or "avoid"
    keywords = []

    if "regex" in text and ("never" in text or "avoid" in text):
        keywords.append("regex")

    if "keyword" in text and ("never" in text or "avoid" in text):
        keywords.append("keyword")

    return keywords
