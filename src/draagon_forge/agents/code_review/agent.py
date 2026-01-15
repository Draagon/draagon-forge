"""
Code Review Agent

Scalable code review with tiered processing for large diffs.
"""

import asyncio
import time
from pathlib import Path
from typing import Any

from .chunker import DiffChunker
from .file_classifier import FileClassifier
from .git_diff import GitDiffParser
from .models import (
    DiffChunk,
    FileDiff,
    FileReviewResult,
    IssueSeverity,
    PrincipleViolation,
    ReviewContext,
    ReviewIssue,
    ReviewMode,
    ReviewResult,
)


class CodeReviewAgent:
    """
    Scalable code review agent with tiered processing.

    Tiers:
    1. Triage: Fast file classification (no LLM)
    2. Focused Review: Per-file analysis with memory context
    3. Synthesis: Cross-file analysis of summaries
    """

    def __init__(
        self,
        repo_path: str | Path | None = None,
        max_files: int = 20,
        max_tokens_per_chunk: int = 400,
        parallel_reviews: int = 5,
        llm_provider: Any = None,
        memory_backend: Any = None,
    ):
        """
        Initialize the code review agent.

        Args:
            repo_path: Path to git repository
            max_files: Maximum files to review (for cost control)
            max_tokens_per_chunk: Max tokens per review chunk
            parallel_reviews: Number of files to review in parallel
            llm_provider: LLM provider for analysis
            memory_backend: Memory backend for principles/beliefs
        """
        self.repo_path = Path(repo_path) if repo_path else Path.cwd()
        self.max_files = max_files
        self.parallel_reviews = parallel_reviews

        self.diff_parser = GitDiffParser(self.repo_path)
        self.classifier = FileClassifier()
        self.chunker = DiffChunker(max_tokens=max_tokens_per_chunk)

        self.llm = llm_provider
        self.memory = memory_backend

        self._total_tokens = 0

    async def review(
        self,
        mode: ReviewMode = ReviewMode.AUTO,
        base_branch: str = "main",
        include_suggestions: bool = True,
    ) -> ReviewResult:
        """
        Review code changes.

        Args:
            mode: What changes to review (staged, unstaged, branch, auto)
            base_branch: Base branch for comparison (branch mode)
            include_suggestions: Include low-priority suggestions

        Returns:
            ReviewResult with all findings
        """
        start_time = time.time()
        self._total_tokens = 0

        # Resolve auto mode
        if mode == ReviewMode.AUTO:
            detected_mode = await self._detect_mode()
        else:
            detected_mode = mode

        # === TIER 1: Triage ===
        # Get all diffs and classify files
        raw_diff = await self.diff_parser.get_diff(detected_mode, base_branch)
        if not raw_diff.strip():
            return ReviewResult(
                overall_assessment="approve",
                summary="No changes to review.",
                mode=detected_mode,
            )

        all_diffs = self.diff_parser.parse_diff(raw_diff)
        to_review, skipped = self.classifier.prioritize(all_diffs, self.max_files)

        if not to_review:
            return ReviewResult(
                overall_assessment="approve",
                summary="No significant changes to review (all files filtered as noise).",
                mode=detected_mode,
                files_skipped=len(skipped),
            )

        # === TIER 2: Focused Per-File Review ===
        file_results = await self._review_files_parallel(to_review)

        # === TIER 3: Cross-File Synthesis ===
        # Collect all issues
        all_issues = []
        for fr in file_results:
            all_issues.extend(fr.issues)

        blocking = [i for i in all_issues if i.severity == IssueSeverity.BLOCKING]
        warnings = [i for i in all_issues if i.severity == IssueSeverity.WARNING]
        suggestions = (
            [i for i in all_issues if i.severity == IssueSeverity.SUGGESTION]
            if include_suggestions
            else []
        )

        # Determine overall assessment
        if blocking:
            overall = "request_changes"
        elif len(warnings) > 3:
            overall = "request_changes"
        elif warnings:
            overall = "needs_discussion"
        else:
            overall = "approve"

        # Generate summary
        summary = await self._generate_summary(
            file_results, blocking, warnings, detected_mode
        )

        # Calculate totals
        total_lines = sum(d.total_lines_changed for d in all_diffs)
        duration_ms = int((time.time() - start_time) * 1000)

        return ReviewResult(
            overall_assessment=overall,
            summary=summary,
            blocking_issues=blocking,
            warnings=warnings,
            suggestions=suggestions,
            file_results=file_results,
            mode=detected_mode,
            files_reviewed=len(to_review),
            files_skipped=len(skipped),
            total_lines_changed=total_lines,
            review_duration_ms=duration_ms,
            tokens_used=self._total_tokens,
            estimated_cost_cents=self._estimate_cost(self._total_tokens),
        )

    async def _detect_mode(self) -> ReviewMode:
        """Auto-detect the best review mode."""
        # Check for staged changes
        staged_files = await self.diff_parser.get_file_list(ReviewMode.STAGED)
        if staged_files:
            return ReviewMode.STAGED

        # Check for unstaged changes
        unstaged_files = await self.diff_parser.get_file_list(ReviewMode.UNSTAGED)
        if unstaged_files:
            return ReviewMode.UNSTAGED

        # Fall back to branch
        return ReviewMode.BRANCH

    async def _review_files_parallel(
        self, files: list[FileDiff]
    ) -> list[FileReviewResult]:
        """Review files in parallel with concurrency limit."""
        semaphore = asyncio.Semaphore(self.parallel_reviews)
        results = []

        async def review_with_semaphore(diff: FileDiff) -> FileReviewResult:
            async with semaphore:
                return await self._review_single_file(diff)

        tasks = [review_with_semaphore(diff) for diff in files]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and convert to results
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Create error result for failed reviews
                valid_results.append(
                    FileReviewResult(
                        file_path=files[i].path,
                        issues=[
                            ReviewIssue(
                                severity=IssueSeverity.WARNING,
                                message=f"Review failed: {result}",
                                file_path=files[i].path,
                            )
                        ],
                        summary="Review failed due to error",
                    )
                )
            else:
                valid_results.append(result)

        return valid_results

    async def _review_single_file(self, diff: FileDiff) -> FileReviewResult:
        """Review a single file, chunking if needed."""
        start_time = time.time()
        issues: list[ReviewIssue] = []

        # Skip formatting-only changes
        if self.classifier.is_formatting_only(diff):
            return FileReviewResult(
                file_path=diff.path,
                summary="Formatting-only changes, skipped detailed review",
            )

        # Load context from memory
        context = await self._load_review_context(diff.path, diff.raw_diff)

        # Chunk if needed
        chunks = self.chunker.chunk_diff(diff)

        # Review each chunk
        chunk_summaries = []
        for chunk in chunks:
            chunk_issues, chunk_summary, tokens = await self._review_chunk(
                chunk, context
            )
            issues.extend(chunk_issues)
            chunk_summaries.append(chunk_summary)
            self._total_tokens += tokens

        # Combine chunk summaries
        summary = " ".join(chunk_summaries) if chunk_summaries else "No issues found."

        duration_ms = int((time.time() - start_time) * 1000)

        return FileReviewResult(
            file_path=diff.path,
            issues=issues,
            summary=summary,
            review_duration_ms=duration_ms,
        )

    async def _review_chunk(
        self, chunk: DiffChunk, context: ReviewContext
    ) -> tuple[list[ReviewIssue], str, int]:
        """
        Review a single chunk of diff.

        Returns:
            Tuple of (issues, summary, tokens_used)
        """
        if not self.llm:
            # No LLM available - return empty result
            return [], "No LLM configured for review", 0

        # Build prompt with context
        prompt = self._build_review_prompt(chunk, context)

        # Call LLM
        response = await self._call_llm(prompt)

        # Parse response
        issues, summary = self._parse_review_response(response, chunk.file_path)

        # Estimate tokens (rough)
        tokens_used = len(prompt) // 4 + len(response) // 4

        return issues, summary, tokens_used

    def _build_review_prompt(self, chunk: DiffChunk, context: ReviewContext) -> str:
        """Build the review prompt for a chunk."""
        prompt_parts = [
            "You are reviewing code changes. Analyze the following diff and identify any issues.",
            "",
            f"File: {chunk.file_path}",
            "",
        ]

        # Add principles if available
        if context.principles:
            prompt_parts.append("Relevant project principles to check:")
            for p in context.principles[:5]:  # Limit to avoid token overflow
                prompt_parts.append(f"- {p.get('content', p)}")
            prompt_parts.append("")

        # Add watch rules if available
        if context.watch_rules:
            prompt_parts.append("Watch rules to enforce:")
            for r in context.watch_rules[:3]:
                prompt_parts.append(f"- {r.get('description', r)}")
            prompt_parts.append("")

        # Add context before if available
        if chunk.context_before:
            prompt_parts.extend(["Context before:", chunk.context_before, ""])

        # Add the diff content
        prompt_parts.append("Changes to review:")
        for hunk in chunk.hunks:
            prompt_parts.append(hunk.content)

        # Add context after if available
        if chunk.context_after:
            prompt_parts.extend(["", "Context after:", chunk.context_after])

        # Add response format
        prompt_parts.extend([
            "",
            "Respond in this format:",
            "<issues>",
            "  <issue severity='blocking|warning|suggestion'>",
            "    <message>Description of the issue</message>",
            "    <line>Line number if applicable</line>",
            "    <suggestion>How to fix it</suggestion>",
            "  </issue>",
            "</issues>",
            "<summary>One sentence summary of this chunk</summary>",
        ])

        return "\n".join(prompt_parts)

    def _parse_review_response(
        self, response: str, file_path: str
    ) -> tuple[list[ReviewIssue], str]:
        """Parse LLM response into structured issues."""
        import re

        issues: list[ReviewIssue] = []
        summary = "Review completed."

        # Extract summary
        summary_match = re.search(r"<summary>(.*?)</summary>", response, re.DOTALL)
        if summary_match:
            summary = summary_match.group(1).strip()

        # Extract issues
        issue_pattern = re.compile(
            r"<issue\s+severity=['\"]?(blocking|warning|suggestion)['\"]?\s*>"
            r"(.*?)</issue>",
            re.DOTALL,
        )

        for match in issue_pattern.finditer(response):
            severity_str = match.group(1)
            issue_content = match.group(2)

            # Parse issue details
            message_match = re.search(r"<message>(.*?)</message>", issue_content, re.DOTALL)
            line_match = re.search(r"<line>(\d+)</line>", issue_content)
            suggestion_match = re.search(
                r"<suggestion>(.*?)</suggestion>", issue_content, re.DOTALL
            )

            severity_map = {
                "blocking": IssueSeverity.BLOCKING,
                "warning": IssueSeverity.WARNING,
                "suggestion": IssueSeverity.SUGGESTION,
            }

            issues.append(
                ReviewIssue(
                    severity=severity_map.get(severity_str, IssueSeverity.WARNING),
                    message=message_match.group(1).strip() if message_match else "Issue found",
                    file_path=file_path,
                    line_number=int(line_match.group(1)) if line_match else None,
                    suggestion=suggestion_match.group(1).strip() if suggestion_match else None,
                )
            )

        return issues, summary

    async def _load_review_context(self, file_path: str, _diff: str) -> ReviewContext:
        """Load relevant principles and watch rules from memory."""
        if not self.memory:
            return ReviewContext()

        try:
            # Detect domain from file path
            domain = self._detect_domain(file_path)

            # Get principles
            principles = []
            if hasattr(self.memory, "get_principles"):
                principles = await self.memory.get_principles(
                    domain=domain, min_conviction=0.6
                )

            # Get watch rules
            watch_rules = []
            if hasattr(self.memory, "get_watch_rules"):
                watch_rules = await self.memory.get_watch_rules(file_pattern=file_path)

            return ReviewContext(
                principles=principles,
                watch_rules=watch_rules,
            )
        except Exception as e:
            print(f"Warning: Failed to load review context: {e}")
            return ReviewContext()

    def _detect_domain(self, file_path: str) -> str | None:
        """Detect domain from file path."""
        path_lower = file_path.lower()

        domain_patterns = {
            "security": ["auth", "security", "crypto", "password", "oauth"],
            "api": ["api", "routes", "endpoints", "handlers"],
            "database": ["database", "db", "models", "schema", "migration"],
            "testing": ["test", "spec", "__tests__"],
            "ui": ["components", "views", "pages", "templates"],
        }

        for domain, patterns in domain_patterns.items():
            if any(p in path_lower for p in patterns):
                return domain

        return None

    async def _generate_summary(
        self,
        file_results: list[FileReviewResult],
        blocking: list[ReviewIssue],
        warnings: list[ReviewIssue],
        mode: ReviewMode,
    ) -> str:
        """Generate overall review summary."""
        parts = []

        # Mode info
        mode_desc = {
            ReviewMode.STAGED: "staged changes",
            ReviewMode.UNSTAGED: "unstaged changes",
            ReviewMode.BRANCH: "branch changes",
            ReviewMode.AUTO: "changes",
        }
        parts.append(f"Reviewed {len(file_results)} files with {mode_desc[mode]}.")

        # Issue counts
        if blocking:
            parts.append(f"Found {len(blocking)} blocking issue(s).")
        if warnings:
            parts.append(f"Found {len(warnings)} warning(s).")

        if not blocking and not warnings:
            parts.append("No significant issues found.")

        return " ".join(parts)

    async def _call_llm(self, prompt: str) -> str:
        """Call the LLM provider."""
        if hasattr(self.llm, "generate"):
            return await self.llm.generate(prompt)
        elif hasattr(self.llm, "complete"):
            return await self.llm.complete(prompt)
        elif callable(self.llm):
            return await self.llm(prompt)
        else:
            raise ValueError("LLM provider must have generate() or complete() method")

    def _estimate_cost(self, tokens: int) -> float:
        """Estimate cost in cents based on token usage."""
        # Assuming Claude 3.5 Sonnet pricing: $3/M input, $15/M output
        # Rough estimate: 60% input, 40% output
        input_tokens = tokens * 0.6
        output_tokens = tokens * 0.4

        input_cost = (input_tokens / 1_000_000) * 300  # cents per M
        output_cost = (output_tokens / 1_000_000) * 1500

        return input_cost + output_cost
