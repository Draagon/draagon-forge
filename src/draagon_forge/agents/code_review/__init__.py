"""
Code Review Agent Module

Scalable code review with tiered processing to handle large diffs efficiently.
"""

from .agent import CodeReviewAgent, create_code_review_agent
from .models import (
    ReviewResult,
    ReviewIssue,
    IssueSeverity,
    ReviewMode,
    FileClassification,
    DiffChunk,
)
from .git_diff import GitDiffParser
from .file_classifier import FileClassifier
from .chunker import DiffChunker

__all__ = [
    "CodeReviewAgent",
    "create_code_review_agent",
    "ReviewResult",
    "ReviewIssue",
    "IssueSeverity",
    "ReviewMode",
    "FileClassification",
    "DiffChunk",
    "GitDiffParser",
    "FileClassifier",
    "DiffChunker",
]
