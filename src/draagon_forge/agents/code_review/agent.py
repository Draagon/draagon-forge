"""
Code Review Agent

Scalable code review with tiered processing for large diffs.
Fully integrated with draagon-ai LLM and memory systems.
"""

import asyncio
import logging
import re
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

logger = logging.getLogger(__name__)


class CodeReviewAgent:
    """
    Scalable code review agent with tiered processing.

    Tiers:
    1. Triage: Fast file classification (no LLM)
    2. Focused Review: Per-file analysis with memory context
    3. Synthesis: Cross-file analysis for architectural issues
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
            llm_provider: LLM provider for analysis (draagon-ai GroqLLM or similar)
            memory_backend: Memory backend for principles/beliefs (MemoryBackend)
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
        self._principle_violations: list[PrincipleViolation] = []

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
        self._principle_violations = []

        # Resolve auto mode
        if mode == ReviewMode.AUTO:
            detected_mode = await self._detect_mode()
        else:
            detected_mode = mode

        logger.info(f"Starting code review in {detected_mode.value} mode")

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

        logger.info(
            f"Tier 1 complete: {len(to_review)} files to review, {len(skipped)} skipped"
        )

        if not to_review:
            return ReviewResult(
                overall_assessment="approve",
                summary="No significant changes to review (all files filtered as noise).",
                mode=detected_mode,
                files_skipped=len(skipped),
            )

        # === TIER 2: Focused Per-File Review ===
        file_results = await self._review_files_parallel(to_review)

        logger.info(f"Tier 2 complete: reviewed {len(file_results)} files")

        # === TIER 3: Cross-File Synthesis ===
        synthesis_issues = await self._synthesize_cross_file(file_results, to_review)

        # Collect all issues
        all_issues = []
        for fr in file_results:
            all_issues.extend(fr.issues)
        all_issues.extend(synthesis_issues)

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

        # Generate summary (use LLM if available for better summaries)
        summary = await self._generate_summary(
            file_results, blocking, warnings, detected_mode
        )

        # Calculate totals
        total_lines = sum(d.total_lines_changed for d in all_diffs)
        duration_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"Review complete: {overall}, {len(blocking)} blocking, "
            f"{len(warnings)} warnings, {duration_ms}ms"
        )

        return ReviewResult(
            overall_assessment=overall,
            summary=summary,
            blocking_issues=blocking,
            warnings=warnings,
            suggestions=suggestions,
            principle_violations=self._principle_violations,
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

        async def review_with_semaphore(diff: FileDiff) -> FileReviewResult:
            async with semaphore:
                return await self._review_single_file(diff)

        tasks = [review_with_semaphore(diff) for diff in files]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and convert to results
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Review failed for {files[i].path}: {result}")
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

        try:
            # Call LLM
            response = await self._call_llm(prompt)

            # Parse response
            issues, summary = self._parse_review_response(response, chunk.file_path)

            # Check for principle violations
            for issue in issues:
                for principle in context.principles:
                    principle_content = (
                        principle.content
                        if hasattr(principle, "content")
                        else str(principle.get("content", principle))
                    )
                    # If the issue mentions a principle-related topic, track it
                    if self._issue_matches_principle(issue, principle_content):
                        self._principle_violations.append(
                            PrincipleViolation(
                                principle_id=str(
                                    getattr(principle, "id", principle.get("id", "unknown"))
                                ),
                                principle_content=principle_content,
                                violation_description=issue.message,
                                file_path=chunk.file_path,
                                line_number=issue.line_number,
                                severity=issue.severity,
                            )
                        )

            # Estimate tokens (rough)
            tokens_used = len(prompt) // 4 + len(response) // 4

            return issues, summary, tokens_used

        except Exception as e:
            logger.error(f"LLM call failed for {chunk.file_path}: {e}")
            return (
                [
                    ReviewIssue(
                        severity=IssueSeverity.WARNING,
                        message=f"LLM review failed: {e}",
                        file_path=chunk.file_path,
                    )
                ],
                "Review incomplete due to error",
                0,
            )

    def _issue_matches_principle(self, issue: ReviewIssue, principle: str) -> bool:
        """Check if an issue relates to a principle."""
        # Simple keyword matching - could be enhanced with semantic matching
        principle_lower = principle.lower()
        message_lower = issue.message.lower()

        keywords = [
            "error handling",
            "security",
            "sql injection",
            "validation",
            "authentication",
            "authorization",
            "logging",
            "testing",
            "documentation",
        ]

        for keyword in keywords:
            if keyword in principle_lower and keyword in message_lower:
                return True

        return False

    def _build_review_prompt(self, chunk: DiffChunk, context: ReviewContext) -> str:
        """Build the review prompt for a chunk."""
        prompt_parts = [
            "You are a code reviewer. Analyze the following diff and identify issues.",
            "Focus on: bugs, security issues, performance problems, and code quality.",
            "",
            f"File: {chunk.file_path}",
            "",
        ]

        # Add principles if available
        if context.principles:
            prompt_parts.append("Project principles to check against:")
            for p in context.principles[:5]:  # Limit to avoid token overflow
                content = p.content if hasattr(p, "content") else p.get("content", str(p))
                prompt_parts.append(f"- {content}")
            prompt_parts.append("")

        # Add watch rules if available
        if context.watch_rules:
            prompt_parts.append("Watch rules to enforce:")
            for r in context.watch_rules[:3]:
                desc = (
                    r.description if hasattr(r, "description") else r.get("description", str(r))
                )
                prompt_parts.append(f"- {desc}")
            prompt_parts.append("")

        # Add past issues if available (helps avoid false positives)
        if context.past_issues:
            prompt_parts.append("Previously flagged issues in similar code (for context):")
            for issue in context.past_issues[:3]:
                content = (
                    issue.content if hasattr(issue, "content") else issue.get("content", str(issue))
                )
                prompt_parts.append(f"- {content}")
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

        # Add response format (XML as per CLAUDE.md)
        prompt_parts.extend([
            "",
            "Respond ONLY in this XML format:",
            "<response>",
            "  <issues>",
            "    <issue severity='blocking|warning|suggestion'>",
            "      <message>Description of the issue</message>",
            "      <line>Line number if applicable</line>",
            "      <suggestion>How to fix it</suggestion>",
            "    </issue>",
            "  </issues>",
            "  <summary>One sentence summary of this chunk</summary>",
            "</response>",
        ])

        return "\n".join(prompt_parts)

    def _parse_review_response(
        self, response: str, file_path: str
    ) -> tuple[list[ReviewIssue], str]:
        """Parse LLM response into structured issues."""
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
            message_match = re.search(
                r"<message>(.*?)</message>", issue_content, re.DOTALL
            )
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
                    message=(
                        message_match.group(1).strip() if message_match else "Issue found"
                    ),
                    file_path=file_path,
                    line_number=int(line_match.group(1)) if line_match else None,
                    suggestion=(
                        suggestion_match.group(1).strip() if suggestion_match else None
                    ),
                )
            )

        return issues, summary

    async def _load_review_context(self, file_path: str, diff: str) -> ReviewContext:
        """Load relevant principles, watch rules, and past issues from memory."""
        if not self.memory:
            return ReviewContext()

        try:
            # Detect domain from file path
            domain = self._detect_domain(file_path)

            # Get principles
            principles = []
            if hasattr(self.memory, "get_principles"):
                raw_principles = await self.memory.get_principles(
                    domain=domain, min_conviction=0.6
                )
                # Convert to dicts if needed
                principles = [
                    p if isinstance(p, dict) else {"content": str(p), "id": str(i)}
                    for i, p in enumerate(raw_principles)
                ]

            # Search for related past issues (semantic search)
            past_issues = []
            if hasattr(self.memory, "search"):
                # Search for similar code patterns
                search_query = f"code review issues in {domain or 'general'} code"
                results = await self.memory.search(
                    query=search_query,
                    limit=5,
                    domain=domain,
                )
                past_issues = [
                    r if isinstance(r, dict) else {"content": str(r)}
                    for r in results
                ]

            # Get watch rules (if the memory backend supports it)
            watch_rules = []
            if hasattr(self.memory, "get_watch_rules"):
                watch_rules = await self.memory.get_watch_rules(file_pattern=file_path)
            elif hasattr(self.memory, "search"):
                # Fall back to searching for watch rules
                watch_results = await self.memory.search(
                    query=f"watch rules for {file_path}",
                    limit=3,
                )
                watch_rules = [
                    r if isinstance(r, dict) else {"description": str(r)}
                    for r in watch_results
                ]

            return ReviewContext(
                principles=principles,
                watch_rules=watch_rules,
                past_issues=past_issues,
            )
        except Exception as e:
            logger.warning(f"Failed to load review context: {e}")
            return ReviewContext()

    def _detect_domain(self, file_path: str) -> str | None:
        """Detect domain from file path."""
        path_lower = file_path.lower()

        domain_patterns = {
            "security": ["auth", "security", "crypto", "password", "oauth", "jwt", "token"],
            "api": ["api", "routes", "endpoints", "handlers", "controllers"],
            "database": ["database", "db", "models", "schema", "migration", "query"],
            "testing": ["test", "spec", "__tests__", "fixtures"],
            "ui": ["components", "views", "pages", "templates", "frontend"],
            "infrastructure": ["docker", "k8s", "kubernetes", "terraform", "ci", "cd"],
        }

        for domain, patterns in domain_patterns.items():
            if any(p in path_lower for p in patterns):
                return domain

        return None

    async def _synthesize_cross_file(
        self, file_results: list[FileReviewResult], diffs: list[FileDiff]
    ) -> list[ReviewIssue]:
        """
        Tier 3: Cross-file synthesis.

        Analyzes patterns across multiple files to detect:
        - Architectural inconsistencies
        - Missing test coverage
        - Cross-module issues
        """
        synthesis_issues: list[ReviewIssue] = []

        if not self.llm or len(file_results) < 2:
            return synthesis_issues

        # Check for test coverage
        test_files = [d for d in diffs if "test" in d.path.lower()]
        source_files = [d for d in diffs if "test" not in d.path.lower()]

        # If we have source changes but no test changes, flag it
        if source_files and not test_files:
            # Check if any source file has significant changes
            significant_source = [
                d for d in source_files if d.total_lines_changed > 20
            ]
            if significant_source:
                synthesis_issues.append(
                    ReviewIssue(
                        severity=IssueSeverity.WARNING,
                        message=(
                            f"No test changes detected for {len(significant_source)} "
                            f"modified source file(s). Consider adding tests."
                        ),
                        file_path="[cross-file]",
                        suggestion="Add tests for the modified functionality",
                    )
                )

        # Check for API changes without documentation updates
        api_files = [d for d in diffs if "api" in d.path.lower() or "routes" in d.path.lower()]
        doc_files = [d for d in diffs if d.path.endswith(".md") or "doc" in d.path.lower()]

        if api_files and not doc_files:
            synthesis_issues.append(
                ReviewIssue(
                    severity=IssueSeverity.SUGGESTION,
                    message="API changes detected without documentation updates.",
                    file_path="[cross-file]",
                    suggestion="Consider updating API documentation",
                )
            )

        # Use LLM for deeper cross-file analysis if we have enough context
        if len(file_results) >= 3 and self.llm:
            try:
                cross_file_issues = await self._llm_cross_file_analysis(file_results)
                synthesis_issues.extend(cross_file_issues)
            except Exception as e:
                logger.warning(f"Cross-file LLM analysis failed: {e}")

        return synthesis_issues

    async def _llm_cross_file_analysis(
        self, file_results: list[FileReviewResult]
    ) -> list[ReviewIssue]:
        """Use LLM to analyze patterns across files."""
        # Build a summary of all file reviews
        summaries = []
        for fr in file_results[:10]:  # Limit to avoid token overflow
            if fr.issues:
                issue_text = "; ".join(i.message for i in fr.issues[:3])
                summaries.append(f"- {fr.file_path}: {issue_text}")
            else:
                summaries.append(f"- {fr.file_path}: {fr.summary}")

        prompt = f"""Analyze these code review findings for cross-file patterns:

{chr(10).join(summaries)}

Look for:
1. Repeated issues across files (systematic problems)
2. Inconsistent patterns between files
3. Missing dependencies or integration issues

Respond in XML format:
<response>
  <issues>
    <issue severity='warning|suggestion'>
      <message>Description of cross-file issue</message>
      <suggestion>How to address it</suggestion>
    </issue>
  </issues>
</response>

If no cross-file issues found, respond with empty <issues></issues>."""

        try:
            response = await self._call_llm(prompt)
            issues, _ = self._parse_review_response(response, "[cross-file]")
            self._total_tokens += len(prompt) // 4 + len(response) // 4
            return issues
        except Exception as e:
            logger.warning(f"Cross-file analysis failed: {e}")
            return []

    async def _generate_summary(
        self,
        file_results: list[FileReviewResult],
        blocking: list[ReviewIssue],
        warnings: list[ReviewIssue],
        mode: ReviewMode,
    ) -> str:
        """Generate overall review summary."""
        mode_desc = {
            ReviewMode.STAGED: "staged changes",
            ReviewMode.UNSTAGED: "unstaged changes",
            ReviewMode.BRANCH: "branch changes",
            ReviewMode.AUTO: "changes",
        }

        parts = [f"Reviewed {len(file_results)} files with {mode_desc[mode]}."]

        if blocking:
            parts.append(f"Found {len(blocking)} blocking issue(s) that must be fixed.")
        if warnings:
            parts.append(f"Found {len(warnings)} warning(s) to consider.")
        if self._principle_violations:
            parts.append(
                f"Detected {len(self._principle_violations)} principle violation(s)."
            )

        if not blocking and not warnings:
            parts.append("No significant issues found.")

        return " ".join(parts)

    async def _call_llm(self, prompt: str) -> str:
        """Call the LLM provider."""
        # Handle draagon-ai GroqLLM
        if hasattr(self.llm, "generate"):
            result = await self.llm.generate(prompt)
            # Handle different response types
            if hasattr(result, "content"):
                return result.content
            elif hasattr(result, "text"):
                return result.text
            return str(result)

        # Handle complete() method
        if hasattr(self.llm, "complete"):
            result = await self.llm.complete(prompt)
            if hasattr(result, "content"):
                return result.content
            return str(result)

        # Handle callable
        if callable(self.llm):
            result = await self.llm(prompt)
            return str(result)

        raise ValueError("LLM provider must have generate() or complete() method")

    def _estimate_cost(self, tokens: int) -> float:
        """Estimate cost in cents based on token usage."""
        # Groq is free for most models
        # Fall back to Sonnet pricing if using Claude
        input_tokens = tokens * 0.6
        output_tokens = tokens * 0.4

        # Groq pricing (llama-3.3-70b is free)
        # Claude 3.5 Sonnet: $3/M input, $15/M output
        input_cost = (input_tokens / 1_000_000) * 300  # cents per M
        output_cost = (output_tokens / 1_000_000) * 1500

        return input_cost + output_cost


async def create_code_review_agent(
    repo_path: str | Path | None = None,
    max_files: int = 20,
    parallel_reviews: int = 5,
) -> CodeReviewAgent:
    """
    Factory function to create a fully-wired CodeReviewAgent.

    Uses draagon-forge's shared LLM and memory infrastructure.

    Args:
        repo_path: Path to git repository (defaults to cwd)
        max_files: Maximum files to review
        parallel_reviews: Number of concurrent file reviews

    Returns:
        Configured CodeReviewAgent with LLM and memory
    """
    from draagon_forge.mcp.config import config
    from draagon_forge.mcp.memory import get_memory

    # Get shared memory backend
    memory = get_memory()

    # Create LLM provider
    llm = None
    if config.groq_api_key:
        try:
            from draagon_ai.llm import GroqLLM, GroqConfig

            llm = GroqLLM(
                api_key=config.groq_api_key,
                config=GroqConfig(
                    complex_model=config.llm_model,
                    deep_model=config.llm_model,
                ),
            )
            logger.info(f"Created LLM provider: {config.llm_model}")
        except ImportError:
            logger.warning("draagon-ai not available, LLM features disabled")
        except Exception as e:
            logger.warning(f"Failed to create LLM provider: {e}")

    return CodeReviewAgent(
        repo_path=repo_path,
        max_files=max_files,
        parallel_reviews=parallel_reviews,
        llm_provider=llm,
        memory_backend=memory,
    )
