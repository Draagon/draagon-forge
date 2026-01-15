"""
Data models for Code Review Agent.

Defines all types used throughout the code review pipeline.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ReviewMode(str, Enum):
    """What changes to review."""

    STAGED = "staged"  # git diff --cached
    UNSTAGED = "unstaged"  # git diff
    BRANCH = "branch"  # git diff main..HEAD
    AUTO = "auto"  # Auto-detect best mode


class IssueSeverity(str, Enum):
    """How severe is the issue."""

    BLOCKING = "blocking"  # Must fix before merge
    WARNING = "warning"  # Should fix, but not blocking
    SUGGESTION = "suggestion"  # Nice to have


class FileClassification(str, Enum):
    """Priority classification for files."""

    CRITICAL = "critical"  # Always review (security, config)
    IMPORTANT = "important"  # Core business logic
    MINOR = "minor"  # Tests, docs
    NOISE = "noise"  # Skip (auto-generated, formatting)


@dataclass
class DiffHunk:
    """A single hunk within a diff."""

    old_start: int
    old_count: int
    new_start: int
    new_count: int
    content: str
    header: str = ""


@dataclass
class DiffChunk:
    """A reviewable chunk of diff content."""

    hunks: list[DiffHunk]
    context_before: str = ""
    context_after: str = ""
    file_path: str = ""
    estimated_tokens: int = 0


@dataclass
class FileDiff:
    """Diff for a single file."""

    path: str
    old_path: str | None = None  # For renames
    status: str = "modified"  # added, deleted, modified, renamed
    hunks: list[DiffHunk] = field(default_factory=list)
    lines_added: int = 0
    lines_deleted: int = 0
    is_binary: bool = False
    raw_diff: str = ""

    @property
    def total_lines_changed(self) -> int:
        """Total lines affected."""
        return self.lines_added + self.lines_deleted


@dataclass
class DiffStats:
    """Summary statistics for all changes."""

    files_changed: int = 0
    total_additions: int = 0
    total_deletions: int = 0
    files: list[tuple[str, int, int]] = field(default_factory=list)  # (path, +, -)


@dataclass
class ReviewIssue:
    """A single issue found during review."""

    severity: IssueSeverity
    message: str
    file_path: str
    line_number: int | None = None
    code_snippet: str | None = None
    suggestion: str | None = None
    principle_violated: str | None = None
    confidence: float = 0.8


@dataclass
class PrincipleViolation:
    """A detected violation of a stored principle."""

    principle_id: str
    principle_content: str
    violation_description: str
    file_path: str
    line_number: int | None = None
    severity: IssueSeverity = IssueSeverity.WARNING


@dataclass
class ReviewContext:
    """Context loaded from memory for review."""

    principles: list[dict[str, Any]] = field(default_factory=list)
    past_issues: list[dict[str, Any]] = field(default_factory=list)
    watch_rules: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class FileReviewResult:
    """Review result for a single file."""

    file_path: str
    issues: list[ReviewIssue] = field(default_factory=list)
    summary: str = ""
    tokens_used: int = 0
    review_duration_ms: int = 0


@dataclass
class ReviewResult:
    """Complete review output."""

    # Summary
    overall_assessment: str  # "approve", "request_changes", "needs_discussion"
    summary: str  # 2-3 sentence summary

    # Issues by severity
    blocking_issues: list[ReviewIssue] = field(default_factory=list)
    warnings: list[ReviewIssue] = field(default_factory=list)
    suggestions: list[ReviewIssue] = field(default_factory=list)

    # Learning opportunities
    new_patterns_detected: list[str] = field(default_factory=list)
    principle_violations: list[PrincipleViolation] = field(default_factory=list)

    # Per-file results (for detailed view)
    file_results: list[FileReviewResult] = field(default_factory=list)

    # Metadata
    mode: ReviewMode = ReviewMode.AUTO
    files_reviewed: int = 0
    files_skipped: int = 0
    total_lines_changed: int = 0
    review_duration_ms: int = 0
    tokens_used: int = 0
    estimated_cost_cents: float = 0.0

    @property
    def all_issues(self) -> list[ReviewIssue]:
        """All issues combined."""
        return self.blocking_issues + self.warnings + self.suggestions

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "overall_assessment": self.overall_assessment,
            "summary": self.summary,
            "blocking_issues": [
                {
                    "severity": i.severity.value,
                    "message": i.message,
                    "file_path": i.file_path,
                    "line_number": i.line_number,
                    "code_snippet": i.code_snippet,
                    "suggestion": i.suggestion,
                    "principle_violated": i.principle_violated,
                    "confidence": i.confidence,
                }
                for i in self.blocking_issues
            ],
            "warnings": [
                {
                    "severity": i.severity.value,
                    "message": i.message,
                    "file_path": i.file_path,
                    "line_number": i.line_number,
                    "code_snippet": i.code_snippet,
                    "suggestion": i.suggestion,
                    "principle_violated": i.principle_violated,
                    "confidence": i.confidence,
                }
                for i in self.warnings
            ],
            "suggestions": [
                {
                    "severity": i.severity.value,
                    "message": i.message,
                    "file_path": i.file_path,
                    "line_number": i.line_number,
                    "code_snippet": i.code_snippet,
                    "suggestion": i.suggestion,
                    "principle_violated": i.principle_violated,
                    "confidence": i.confidence,
                }
                for i in self.suggestions
            ],
            "new_patterns_detected": self.new_patterns_detected,
            "principle_violations": [
                {
                    "principle_id": v.principle_id,
                    "principle_content": v.principle_content,
                    "violation_description": v.violation_description,
                    "file_path": v.file_path,
                    "line_number": v.line_number,
                    "severity": v.severity.value,
                }
                for v in self.principle_violations
            ],
            "mode": self.mode.value,
            "files_reviewed": self.files_reviewed,
            "files_skipped": self.files_skipped,
            "total_lines_changed": self.total_lines_changed,
            "review_duration_ms": self.review_duration_ms,
            "tokens_used": self.tokens_used,
            "estimated_cost_cents": self.estimated_cost_cents,
        }
