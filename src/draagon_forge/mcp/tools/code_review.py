"""
Code Review MCP Tool

Exposes the Code Review Agent as an MCP tool for Claude Code integration.
"""

from pathlib import Path
from typing import Any

from draagon_forge.agents.code_review import (
    ReviewMode,
    ReviewResult,
    create_code_review_agent,
)
from draagon_forge.mcp.server import mcp


@mcp.tool
async def review_code_changes(
    mode: str = "auto",
    base_branch: str = "main",
    max_files: int = 20,
    include_suggestions: bool = True,
    parallel_reviews: int = 5,
    repo_path: str | None = None,
) -> dict[str, Any]:
    """
    Review code changes for issues, violations, and improvements.

    This tool performs a multi-tiered code review:
    1. **Triage**: Classifies files by priority (critical, important, minor, noise)
    2. **Focused Review**: Per-file analysis with project principles
    3. **Synthesis**: Cross-file pattern detection (identifies cross-module issues)

    Modes:
    - `staged`: Review only staged changes (`git diff --cached`)
    - `unstaged`: Review only unstaged changes (`git diff`)
    - `branch`: Review all changes since base_branch
    - `auto`: Detect most relevant mode automatically

    Args:
        mode: What changes to review (staged, unstaged, branch, auto)
        base_branch: Base branch for comparison (branch mode)
        max_files: Maximum files to review (for cost control)
        include_suggestions: Include low-priority suggestions
        parallel_reviews: Number of files to review in parallel
        repo_path: Path to git repository (defaults to current directory)

    Returns:
        Structured review with issues categorized by severity:
        - overall_assessment: "approve", "request_changes", or "needs_discussion"
        - summary: Brief description of findings
        - blocking_issues: Must fix before merge
        - warnings: Should fix, but not blocking
        - suggestions: Nice to have improvements
        - principle_violations: Project principles that were violated
        - new_patterns_detected: Potential new patterns to learn
        - files_reviewed: Number of files analyzed
        - files_skipped: Number of files skipped (noise, over limit)
        - tokens_used: Total tokens consumed
        - estimated_cost_cents: Estimated cost

    Example:
        ```
        # Review staged changes
        review_code_changes(mode="staged")

        # Review branch against main with cost limit
        review_code_changes(mode="branch", max_files=10)
        ```
    """
    # Resolve mode
    mode_map = {
        "staged": ReviewMode.STAGED,
        "unstaged": ReviewMode.UNSTAGED,
        "branch": ReviewMode.BRANCH,
        "auto": ReviewMode.AUTO,
    }
    review_mode = mode_map.get(mode.lower(), ReviewMode.AUTO)

    # Create fully-wired agent using factory (includes LLM + memory)
    agent = await create_code_review_agent(
        repo_path=Path(repo_path) if repo_path else None,
        max_files=max_files,
        parallel_reviews=parallel_reviews,
    )

    # Run review
    result: ReviewResult = await agent.review(
        mode=review_mode,
        base_branch=base_branch,
        include_suggestions=include_suggestions,
    )

    return result.to_dict()


@mcp.tool
async def get_review_summary(
    mode: str = "auto",
    base_branch: str = "main",
    repo_path: str | None = None,
) -> dict[str, Any]:
    """
    Get a quick summary of changes without full review.

    This is a fast, cheap operation that doesn't use LLM calls.
    Use this to understand the scope of changes before running full review.

    Args:
        mode: What changes to summarize (staged, unstaged, branch, auto)
        base_branch: Base branch for comparison (branch mode)
        repo_path: Path to git repository

    Returns:
        Summary statistics:
        - mode_detected: The actual mode used
        - files_changed: Total number of files
        - total_additions: Lines added
        - total_deletions: Lines deleted
        - critical_files: Number of critical files (security, config)
        - important_files: Number of important files
        - minor_files: Number of minor files
        - noise_files: Number of noise files (to be skipped)

    Example:
        ```
        # Check what would be reviewed
        get_review_summary(mode="staged")
        ```
    """
    from draagon_forge.agents.code_review import (
        FileClassifier,
        GitDiffParser,
    )

    # Resolve mode
    mode_map = {
        "staged": ReviewMode.STAGED,
        "unstaged": ReviewMode.UNSTAGED,
        "branch": ReviewMode.BRANCH,
        "auto": ReviewMode.AUTO,
    }
    review_mode = mode_map.get(mode.lower(), ReviewMode.AUTO)

    parser = GitDiffParser(Path(repo_path) if repo_path else None)
    classifier = FileClassifier()

    # Get stats (fast)
    stats = await parser.get_stats(review_mode, base_branch)

    # Get full diff for classification
    raw_diff = await parser.get_diff(review_mode, base_branch)
    diffs = parser.parse_diff(raw_diff)

    # Classify files
    classified = classifier.classify_all(diffs)

    return {
        "mode_detected": review_mode.value,
        "files_changed": stats.files_changed,
        "total_additions": stats.total_additions,
        "total_deletions": stats.total_deletions,
        "critical_files": len(classified.get("critical", [])),
        "important_files": len(classified.get("important", [])),
        "minor_files": len(classified.get("minor", [])),
        "noise_files": len(classified.get("noise", [])),
        "file_list": [
            {
                "path": d.path,
                "lines_added": d.lines_added,
                "lines_deleted": d.lines_deleted,
                "classification": classifier.classify(d).value,
            }
            for d in diffs[:50]  # Limit response size
        ],
    }
