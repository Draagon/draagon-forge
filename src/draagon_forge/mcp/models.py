"""Pydantic models for Draagon Forge MCP server."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class Belief(BaseModel):
    """A stored belief/principle with conviction scoring."""

    id: str
    content: str
    conviction: float = Field(ge=0.0, le=1.0, description="Conviction score 0.0-1.0")
    category: str | None = None
    domain: str | None = None
    source: str
    usage_count: int = 0
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, str] = Field(default_factory=dict)


class Principle(BaseModel):
    """A development principle or pattern."""

    id: str
    content: str
    domain: str
    conviction: float = Field(ge=0.0, le=1.0)
    examples: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, str] = Field(default_factory=dict)


class Pattern(BaseModel):
    """A code pattern with examples."""

    id: str
    name: str
    description: str
    domain: str
    code_examples: list[str] = Field(default_factory=list)
    conviction: float = Field(ge=0.0, le=1.0)
    usage_count: int = 0
    created_at: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, str] = Field(default_factory=dict)


class SearchResult(BaseModel):
    """Result from semantic search."""

    id: str
    content: str
    score: float = Field(ge=0.0, le=1.0, description="Relevance score")
    conviction: float = Field(ge=0.0, le=1.0, description="Conviction score")
    source: str
    type: Literal["belief", "principle", "pattern", "learning"]
    metadata: dict[str, str] = Field(default_factory=dict)


class WatchRule(BaseModel):
    """A watch rule for monitoring code changes."""

    id: str
    name: str
    description: str
    severity: Literal["block", "warn", "suggest"]
    pattern: str  # Natural language pattern description
    file_patterns: list[str] = Field(
        default_factory=list, description="Glob patterns for files to watch"
    )
    enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, str] = Field(default_factory=dict)


class WatchViolation(BaseModel):
    """A detected violation of a watch rule."""

    rule_id: str
    rule_name: str
    file_path: str
    line: int | None = None
    matched_text: str
    severity: Literal["block", "warn", "suggest"]
    explanation: str
    timestamp: datetime = Field(default_factory=datetime.now)


class ReviewItem(BaseModel):
    """An item flagged for human review."""

    id: str
    type: Literal["misleading", "outdated", "conflict", "low_conviction"]
    content: str
    reason: str
    flagged_at: datetime = Field(default_factory=datetime.now)
    resolved: bool = False
    resolution: str | None = None
    resolved_at: datetime | None = None


class OutcomeReport(BaseModel):
    """Report of how helpful context was."""

    context_ids: list[str]
    outcome: Literal["helpful", "not_helpful", "misleading", "outdated"]
    reason: str | None = None
    timestamp: datetime = Field(default_factory=datetime.now)
