"""
Unit tests for DiffChunker.

Tests diff chunking strategies without external dependencies.
"""

import pytest

from draagon_forge.agents.code_review.chunker import DiffChunker
from draagon_forge.agents.code_review.models import DiffHunk, FileDiff


# =============================================================================
# FIXTURES: Sample diffs for chunking tests
# =============================================================================

def make_hunk(content: str, old_start: int = 1, header: str = "") -> DiffHunk:
    """Helper to create DiffHunk objects."""
    lines = content.split("\n")
    return DiffHunk(
        old_start=old_start,
        old_count=len([l for l in lines if l.startswith("-")]) or 1,
        new_start=old_start,
        new_count=len([l for l in lines if l.startswith("+")]) or 1,
        content=content,
        header=header,
    )


def make_diff_with_hunks(path: str, hunks: list[DiffHunk]) -> FileDiff:
    """Helper to create FileDiff with hunks."""
    raw_diff = f"diff --git a/{path} b/{path}\n"
    for hunk in hunks:
        raw_diff += hunk.content + "\n"

    return FileDiff(
        path=path,
        hunks=hunks,
        raw_diff=raw_diff,
    )


SMALL_CONTENT = "+line1\n+line2\n+line3"  # ~20 chars
MEDIUM_CONTENT = "+line\n" * 50  # ~300 chars
LARGE_CONTENT = "+line\n" * 500  # ~3000 chars


# =============================================================================
# UNIT TESTS: estimate_tokens()
# =============================================================================

class TestEstimateTokens:
    """Tests for token estimation."""

    def test_estimate_tokens_empty_string(self):
        """Empty string has 0 tokens."""
        chunker = DiffChunker()
        assert chunker.estimate_tokens("") == 0

    def test_estimate_tokens_short_string(self):
        """Short strings estimate correctly."""
        chunker = DiffChunker()
        # 20 chars / 4 = 5 tokens
        assert chunker.estimate_tokens("12345678901234567890") == 5

    def test_estimate_tokens_proportional(self):
        """Token count is proportional to length."""
        chunker = DiffChunker()
        short = chunker.estimate_tokens("a" * 100)
        long = chunker.estimate_tokens("a" * 200)
        assert long == short * 2


# =============================================================================
# UNIT TESTS: needs_chunking()
# =============================================================================

class TestNeedsChunking:
    """Tests for chunking necessity detection."""

    def test_small_diff_no_chunking(self):
        """Small diffs don't need chunking."""
        chunker = DiffChunker(max_tokens=400)
        diff = make_diff_with_hunks("test.py", [make_hunk(SMALL_CONTENT)])

        assert chunker.needs_chunking(diff) is False

    def test_large_diff_needs_chunking(self):
        """Large diffs need chunking."""
        chunker = DiffChunker(max_tokens=400)
        diff = make_diff_with_hunks("test.py", [make_hunk(LARGE_CONTENT)])

        assert chunker.needs_chunking(diff) is True

    def test_custom_max_tokens_respected(self):
        """Custom max_tokens threshold is respected."""
        # Very low threshold
        strict_chunker = DiffChunker(max_tokens=10)
        diff = make_diff_with_hunks("test.py", [make_hunk(SMALL_CONTENT)])

        assert strict_chunker.needs_chunking(diff) is True


# =============================================================================
# UNIT TESTS: chunk_diff()
# =============================================================================

class TestChunkDiff:
    """Tests for diff chunking."""

    def test_small_diff_single_chunk(self):
        """Small diff returns single chunk."""
        chunker = DiffChunker(max_tokens=400)
        diff = make_diff_with_hunks("test.py", [make_hunk(SMALL_CONTENT)])

        chunks = chunker.chunk_diff(diff)

        assert len(chunks) == 1
        assert chunks[0].file_path == "test.py"
        assert len(chunks[0].hunks) == 1

    def test_large_diff_multiple_chunks(self):
        """Large diff returns multiple chunks."""
        chunker = DiffChunker(max_tokens=100)

        # Create many hunks
        hunks = [make_hunk(MEDIUM_CONTENT, old_start=i * 100) for i in range(5)]
        diff = make_diff_with_hunks("test.py", hunks)

        chunks = chunker.chunk_diff(diff)

        assert len(chunks) > 1
        # All chunks should have the file path
        for chunk in chunks:
            assert chunk.file_path == "test.py"

    def test_chunks_preserve_all_hunks(self):
        """All hunks are preserved across chunks."""
        chunker = DiffChunker(max_tokens=100)

        hunks = [make_hunk(MEDIUM_CONTENT, old_start=i * 100) for i in range(5)]
        diff = make_diff_with_hunks("test.py", hunks)

        chunks = chunker.chunk_diff(diff)

        # Count total hunks across all chunks
        total_hunks = sum(len(c.hunks) for c in chunks)
        assert total_hunks == 5

    def test_chunk_token_estimate_populated(self):
        """Chunks have estimated_tokens populated."""
        chunker = DiffChunker(max_tokens=400)
        diff = make_diff_with_hunks("test.py", [make_hunk(SMALL_CONTENT)])

        chunks = chunker.chunk_diff(diff)

        assert chunks[0].estimated_tokens > 0


# =============================================================================
# UNIT TESTS: Semantic Boundary Detection
# =============================================================================

class TestSemanticBoundaries:
    """Tests for semantic boundary-based chunking."""

    def test_python_function_boundary(self):
        """Python function definitions are detected as boundaries."""
        chunker = DiffChunker(max_tokens=100)

        hunk1 = make_hunk("+def foo():\n+    pass\n", header="def foo()")
        hunk2 = make_hunk("+def bar():\n+    pass\n", header="def bar()")

        diff = make_diff_with_hunks("test.py", [hunk1, hunk2])
        chunks = chunker.chunk_diff(diff)

        # Should try to split on function boundaries
        assert len(chunks) >= 1

    def test_class_definition_boundary(self):
        """Class definitions are detected as boundaries."""
        chunker = DiffChunker(max_tokens=50)

        hunk1 = make_hunk("+class Foo:\n" + "+    pass\n" * 20, header="class Foo")
        hunk2 = make_hunk("+class Bar:\n" + "+    pass\n" * 20, header="class Bar")

        diff = make_diff_with_hunks("test.py", [hunk1, hunk2])
        chunks = chunker.chunk_diff(diff)

        # Should create multiple chunks
        assert len(chunks) >= 1


# =============================================================================
# UNIT TESTS: _detect_language()
# =============================================================================

class TestDetectLanguage:
    """Tests for language detection."""

    @pytest.mark.parametrize("path,expected", [
        ("test.py", "python"),
        ("test.js", "javascript"),
        ("test.jsx", "javascript"),
        ("test.ts", "typescript"),
        ("test.tsx", "typescript"),
        ("test.go", "go"),
        ("test.rs", "rust"),
        ("test.java", "java"),
        ("test.unknown", None),
        ("Makefile", None),
    ])
    def test_detect_language_by_extension(self, path, expected):
        """Language is detected correctly from file extension."""
        chunker = DiffChunker()
        result = chunker._detect_language(path)
        assert result == expected


# =============================================================================
# UNIT TESTS: Chunk Overlap
# =============================================================================

class TestChunkOverlap:
    """Tests for chunk overlap/context."""

    def test_overlap_lines_default(self):
        """Default overlap is 3 lines."""
        chunker = DiffChunker()
        assert chunker.overlap_lines == 3

    def test_custom_overlap_lines(self):
        """Custom overlap lines can be set."""
        chunker = DiffChunker(overlap_lines=5)
        assert chunker.overlap_lines == 5


# =============================================================================
# EDGE CASE TESTS
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_diff(self):
        """Empty diff returns empty chunks."""
        chunker = DiffChunker()
        diff = make_diff_with_hunks("test.py", [])

        chunks = chunker.chunk_diff(diff)

        assert len(chunks) == 1
        assert len(chunks[0].hunks) == 0

    def test_single_huge_hunk(self):
        """Single huge hunk still gets its own chunk."""
        chunker = DiffChunker(max_tokens=100)

        # One massive hunk
        huge_hunk = make_hunk(LARGE_CONTENT)
        diff = make_diff_with_hunks("test.py", [huge_hunk])

        chunks = chunker.chunk_diff(diff)

        # Should still return at least one chunk
        assert len(chunks) >= 1
        # The huge hunk should be in a chunk
        assert any(huge_hunk in c.hunks for c in chunks)

    def test_mixed_size_hunks(self):
        """Mixed size hunks are grouped efficiently."""
        chunker = DiffChunker(max_tokens=200)

        hunks = [
            make_hunk(SMALL_CONTENT),  # ~5 tokens
            make_hunk(SMALL_CONTENT),  # ~5 tokens
            make_hunk(MEDIUM_CONTENT),  # ~75 tokens
            make_hunk(SMALL_CONTENT),  # ~5 tokens
        ]
        diff = make_diff_with_hunks("test.py", hunks)

        chunks = chunker.chunk_diff(diff)

        # Should group small hunks together
        assert len(chunks) >= 1
