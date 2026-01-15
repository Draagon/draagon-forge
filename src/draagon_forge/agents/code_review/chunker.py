"""
Diff Chunker

Splits large diffs into reviewable chunks to avoid context overflow.
Uses semantic boundaries (functions, classes) when possible.
"""

import re

from .models import DiffChunk, DiffHunk, FileDiff


class DiffChunker:
    """Split large diffs into reviewable chunks."""

    # Approximate tokens per character (conservative estimate)
    CHARS_PER_TOKEN = 4

    # Function/class boundary patterns for various languages
    BOUNDARY_PATTERNS = {
        "python": [
            re.compile(r"^\s*(async\s+)?def\s+\w+", re.MULTILINE),
            re.compile(r"^\s*class\s+\w+", re.MULTILINE),
        ],
        "javascript": [
            re.compile(r"^\s*(async\s+)?function\s+\w+", re.MULTILINE),
            re.compile(r"^\s*class\s+\w+", re.MULTILINE),
            re.compile(r"^\s*(const|let|var)\s+\w+\s*=\s*(async\s+)?\(", re.MULTILINE),
            re.compile(r"^\s*(const|let|var)\s+\w+\s*=\s*function", re.MULTILINE),
        ],
        "typescript": [
            re.compile(r"^\s*(async\s+)?function\s+\w+", re.MULTILINE),
            re.compile(r"^\s*class\s+\w+", re.MULTILINE),
            re.compile(r"^\s*(const|let|var)\s+\w+\s*=\s*(async\s+)?\(", re.MULTILINE),
            re.compile(r"^\s*(export\s+)?(const|let|var)\s+\w+", re.MULTILINE),
        ],
        "go": [
            re.compile(r"^\s*func\s+", re.MULTILINE),
            re.compile(r"^\s*type\s+\w+\s+struct", re.MULTILINE),
        ],
        "rust": [
            re.compile(r"^\s*(pub\s+)?fn\s+", re.MULTILINE),
            re.compile(r"^\s*(pub\s+)?struct\s+", re.MULTILINE),
            re.compile(r"^\s*(pub\s+)?impl\s+", re.MULTILINE),
        ],
        "java": [
            re.compile(r"^\s*(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(", re.MULTILINE),
            re.compile(r"^\s*(public|private|protected)?\s*(abstract)?\s*class\s+", re.MULTILINE),
        ],
    }

    # File extension to language mapping
    EXT_LANGUAGE_MAP = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
    }

    def __init__(
        self,
        max_tokens: int = 400,
        overlap_lines: int = 3,
    ):
        """
        Initialize chunker.

        Args:
            max_tokens: Maximum tokens per chunk (default 400, ~1600 chars)
            overlap_lines: Lines to overlap between chunks for context
        """
        self.max_tokens = max_tokens
        self.max_chars = max_tokens * self.CHARS_PER_TOKEN
        self.overlap_lines = overlap_lines

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        return len(text) // self.CHARS_PER_TOKEN

    def needs_chunking(self, diff: FileDiff) -> bool:
        """Check if a diff needs to be chunked."""
        return self.estimate_tokens(diff.raw_diff) > self.max_tokens

    def chunk_diff(self, diff: FileDiff) -> list[DiffChunk]:
        """
        Split a diff into reviewable chunks.

        Strategy:
        1. Try to split on function/class boundaries
        2. If not possible, split on hunk boundaries
        3. Never split within a single hunk
        """
        if not self.needs_chunking(diff):
            # Single chunk for small diffs
            return [
                DiffChunk(
                    hunks=diff.hunks,
                    file_path=diff.path,
                    estimated_tokens=self.estimate_tokens(diff.raw_diff),
                )
            ]

        # Try semantic chunking first
        chunks = self._chunk_by_semantics(diff)
        if chunks:
            return chunks

        # Fall back to hunk-based chunking
        return self._chunk_by_hunks(diff)

    def _chunk_by_semantics(self, diff: FileDiff) -> list[DiffChunk] | None:
        """Try to chunk by semantic boundaries (functions, classes)."""
        language = self._detect_language(diff.path)
        if not language or language not in self.BOUNDARY_PATTERNS:
            return None

        patterns = self.BOUNDARY_PATTERNS[language]

        # Group hunks by semantic boundary
        groups: list[list[DiffHunk]] = []
        current_group: list[DiffHunk] = []
        current_tokens = 0

        for hunk in diff.hunks:
            hunk_tokens = self.estimate_tokens(hunk.content)

            # Check if hunk starts a new semantic boundary
            starts_boundary = any(
                p.search(hunk.header) or p.search(hunk.content[:200])
                for p in patterns
            )

            if starts_boundary and current_group:
                # Start new group at boundary
                groups.append(current_group)
                current_group = []
                current_tokens = 0

            # Check if adding this hunk would exceed limit
            if current_tokens + hunk_tokens > self.max_tokens and current_group:
                groups.append(current_group)
                current_group = []
                current_tokens = 0

            current_group.append(hunk)
            current_tokens += hunk_tokens

        if current_group:
            groups.append(current_group)

        # Convert groups to chunks
        return self._groups_to_chunks(diff.path, groups)

    def _chunk_by_hunks(self, diff: FileDiff) -> list[DiffChunk]:
        """Chunk by hunks, keeping related hunks together."""
        chunks: list[DiffChunk] = []
        current_hunks: list[DiffHunk] = []
        current_tokens = 0

        for hunk in diff.hunks:
            hunk_tokens = self.estimate_tokens(hunk.content)

            # If single hunk exceeds limit, it gets its own chunk
            if hunk_tokens > self.max_tokens:
                if current_hunks:
                    chunks.append(self._create_chunk(diff.path, current_hunks))
                    current_hunks = []
                    current_tokens = 0
                chunks.append(self._create_chunk(diff.path, [hunk]))
                continue

            # Check if adding this hunk would exceed limit
            if current_tokens + hunk_tokens > self.max_tokens and current_hunks:
                chunks.append(self._create_chunk(diff.path, current_hunks))
                current_hunks = []
                current_tokens = 0

            current_hunks.append(hunk)
            current_tokens += hunk_tokens

        if current_hunks:
            chunks.append(self._create_chunk(diff.path, current_hunks))

        return chunks

    def _groups_to_chunks(
        self, file_path: str, groups: list[list[DiffHunk]]
    ) -> list[DiffChunk]:
        """Convert hunk groups to chunks with context."""
        chunks: list[DiffChunk] = []

        for i, hunks in enumerate(groups):
            context_before = ""
            context_after = ""

            # Add overlap from previous group
            if i > 0 and groups[i - 1]:
                prev_hunk = groups[i - 1][-1]
                lines = prev_hunk.content.split("\n")
                context_before = "\n".join(lines[-self.overlap_lines :])

            # Add overlap for next group
            if i < len(groups) - 1 and groups[i + 1]:
                next_hunk = groups[i + 1][0]
                lines = next_hunk.content.split("\n")
                context_after = "\n".join(lines[: self.overlap_lines])

            chunks.append(
                DiffChunk(
                    hunks=hunks,
                    file_path=file_path,
                    context_before=context_before,
                    context_after=context_after,
                    estimated_tokens=sum(
                        self.estimate_tokens(h.content) for h in hunks
                    ),
                )
            )

        return chunks

    def _create_chunk(self, file_path: str, hunks: list[DiffHunk]) -> DiffChunk:
        """Create a chunk from hunks."""
        return DiffChunk(
            hunks=hunks,
            file_path=file_path,
            estimated_tokens=sum(self.estimate_tokens(h.content) for h in hunks),
        )

    def _detect_language(self, file_path: str) -> str | None:
        """Detect language from file extension."""
        for ext, lang in self.EXT_LANGUAGE_MAP.items():
            if file_path.endswith(ext):
                return lang
        return None
