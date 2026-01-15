"""
Code Review Agent Module

Scalable code review with tiered processing to handle large diffs efficiently.
"""

from .agent import CodeReviewAgent
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
