# REQ-018: Quality-Aware Retrieval

**Priority:** P1
**Effort:** 3 days
**Dependencies:** REQ-014, REQ-001
**Blocks:** None

---

## Overview

Expose draagon-ai's sophisticated retrieval pipeline through MCP, including quality metrics, CRAG-style grading, and automatic fallback mechanisms. This enables Claude Code to understand retrieval confidence and trigger recovery when results are insufficient.

### Problem Statement

**Current State:**
- `search_context` returns results without quality indicators
- No way to know if retrieved context is actually relevant
- Poor retrieval leads to poor responses without recovery
- Users can't distinguish confident results from weak matches

**Impact:**
- Hallucination risk when context is irrelevant
- No automatic recovery from poor retrieval
- Users trust all results equally regardless of quality
- Wasted tokens on low-quality context

### Target State

- Every retrieval includes quality metrics
- CRAG-style grading (relevant/ambiguous/irrelevant)
- Automatic query expansion when quality is low
- Explicit confidence scores for informed decisions

### draagon-ai Foundation

**Already Implemented:** draagon-ai has sophisticated retrieval at `retrieval/retriever.py`:

```python
# Broad recall → Re-ranking → Quality validation → Fallback
async def retrieve(query, user_id, k=10) -> RetrievalResult:
    candidates = await self._recall_stage(query, user_id, k=recall_k)
    reranked, grading = await self._rerank_stage(query, candidates)
    avg_relevance = self._calculate_relevance(reranked)

    if avg_relevance < min_relevance:
        expanded = await self._expand_query(query)
        # ... retry with expanded query
```

This requirement exposes these capabilities through MCP.

---

## Requirements

### REQ-018.1: Enhanced Search with Quality Metrics

Extend `search_context` to return quality information.

```python
@mcp.tool()
async def search_context_with_quality(
    query: str,
    limit: int = 10,
    domain: str | None = None,
    min_conviction: float | None = None,
    min_relevance: float = 0.5,
    auto_expand: bool = True,
) -> dict:
    """Search semantic memory with quality validation and automatic fallback.

    Enhanced version of search_context that includes quality metrics
    and automatically expands queries when initial results are poor.

    Args:
        query: The search query (natural language)
        limit: Maximum results to return
        domain: Optional domain filter
        min_conviction: Minimum conviction score threshold
        min_relevance: Minimum acceptable relevance score (triggers expansion)
        auto_expand: Whether to automatically expand query if quality low

    Returns:
        Search results with quality metrics:
        - results: List of search results with individual scores
        - quality: Overall quality assessment
        - expanded_query: Query used (may differ if expansion triggered)
        - retrieval_metadata: Details about retrieval process
    """
```

**Response Format:**
```json
{
  "results": [
    {
      "id": "belief-abc123",
      "content": "Use repository pattern for data access layer",
      "score": 0.89,
      "conviction": 0.85,
      "type": "principle",
      "source": "architecture",
      "grading": "relevant",
      "metadata": {}
    },
    {
      "id": "belief-def456",
      "content": "Dependency injection improves testability",
      "score": 0.72,
      "conviction": 0.78,
      "type": "principle",
      "source": "architecture",
      "grading": "relevant",
      "metadata": {}
    }
  ],
  "quality": {
    "overall_relevance": 0.81,
    "sufficient": true,
    "grading_distribution": {
      "relevant": 4,
      "ambiguous": 1,
      "irrelevant": 0
    },
    "confidence": 0.85
  },
  "expanded_query": null,
  "retrieval_metadata": {
    "initial_candidates": 25,
    "after_reranking": 5,
    "expansion_triggered": false,
    "processing_time_ms": 342
  }
}
```

**Acceptance Criteria:**
- [ ] Returns individual result grading
- [ ] Returns overall quality metrics
- [ ] Auto-expansion triggers when relevance < threshold
- [ ] Processing metadata included
- [ ] Backward compatible (can replace existing search_context)

### REQ-018.2: CRAG-Style Result Grading

Implement per-result grading using draagon-ai's CRAG implementation.

**Grading Categories:**

| Grade | Score Range | Meaning | Action |
|-------|-------------|---------|--------|
| `relevant` | ≥0.7 | High confidence match | Use directly |
| `ambiguous` | 0.4-0.7 | Uncertain relevance | Use with caution |
| `irrelevant` | <0.4 | Poor match | Consider filtering |

```python
@dataclass
class GradedResult:
    """Search result with CRAG-style grading."""

    id: str
    content: str
    score: float
    grading: str  # "relevant" | "ambiguous" | "irrelevant"
    conviction: float
    type: str
    source: str
    metadata: dict

def grade_result(score: float) -> str:
    """Apply CRAG-style grading to a result."""
    if score >= 0.7:
        return "relevant"
    elif score >= 0.4:
        return "ambiguous"
    else:
        return "irrelevant"
```

**Acceptance Criteria:**
- [ ] Each result includes grading
- [ ] Grading thresholds configurable
- [ ] Grading distribution in quality summary
- [ ] Ambiguous results flagged for review

### REQ-018.3: Automatic Query Expansion

When retrieval quality is low, automatically expand the query.

```python
async def expand_query_if_needed(
    query: str,
    results: list[GradedResult],
    min_relevance: float,
) -> tuple[str | None, list[GradedResult]]:
    """Expand query if initial results are poor.

    Args:
        query: Original query
        results: Initial search results
        min_relevance: Threshold for triggering expansion

    Returns:
        Tuple of (expanded_query, new_results)
        expanded_query is None if expansion wasn't needed
    """
    avg_relevance = calculate_average_relevance(results)

    if avg_relevance >= min_relevance:
        return None, results  # Quality sufficient

    # Use draagon-ai's query expansion
    expanded = await retriever._expand_query(query)

    # Retry search with expanded query
    new_results = await search_internal(expanded)

    return expanded, new_results
```

**Query Expansion Strategies:**
1. **Synonym expansion**: Add related terms
2. **Context injection**: Add conversation context
3. **Domain hints**: Add domain-specific terminology
4. **Decomposition**: Break complex queries into sub-queries

**Acceptance Criteria:**
- [ ] Expansion triggered when avg relevance < threshold
- [ ] Expanded query included in response
- [ ] New results replace original if better
- [ ] Expansion logged for debugging

### REQ-018.4: Retrieval Confidence Assessment

Provide explicit confidence in retrieval results.

```python
@dataclass
class RetrievalQuality:
    """Quality assessment for retrieval results."""

    overall_relevance: float  # Average relevance score
    sufficient: bool          # Whether results are usable
    confidence: float         # Confidence in the assessment
    grading_distribution: dict[str, int]  # Count per grade
    warnings: list[str]       # Quality concerns

def assess_retrieval_quality(results: list[GradedResult]) -> RetrievalQuality:
    """Assess overall quality of retrieval results."""

    if not results:
        return RetrievalQuality(
            overall_relevance=0.0,
            sufficient=False,
            confidence=1.0,  # Confident there's nothing
            grading_distribution={"relevant": 0, "ambiguous": 0, "irrelevant": 0},
            warnings=["No results found"],
        )

    # Calculate metrics
    relevance = sum(r.score for r in results) / len(results)
    distribution = Counter(r.grading for r in results)

    # Determine sufficiency
    relevant_count = distribution.get("relevant", 0)
    sufficient = relevant_count >= 1 and relevance >= 0.5

    # Build warnings
    warnings = []
    if distribution.get("irrelevant", 0) > len(results) / 2:
        warnings.append("Majority of results are irrelevant")
    if distribution.get("ambiguous", 0) > distribution.get("relevant", 0):
        warnings.append("More ambiguous than relevant results")

    return RetrievalQuality(
        overall_relevance=relevance,
        sufficient=sufficient,
        confidence=min(relevance + 0.2, 1.0),  # Confidence tracks relevance
        grading_distribution=dict(distribution),
        warnings=warnings,
    )
```

**Acceptance Criteria:**
- [ ] Quality assessment for every search
- [ ] Sufficient flag for quick decisions
- [ ] Warnings highlight quality concerns
- [ ] Confidence score provided

### REQ-018.5: draagon-ai HybridRetriever Integration

Leverage draagon-ai's existing sophisticated retrieval.

```python
# Use draagon-ai's HybridRetriever directly
from draagon_ai.retrieval.retriever import HybridRetriever, RetrievalConfig

async def search_with_quality_internal(
    query: str,
    limit: int,
    min_relevance: float,
    auto_expand: bool,
) -> dict:
    """Internal implementation using draagon-ai retriever."""

    # Configure retriever
    config = RetrievalConfig(
        recall_multiplier=3,  # 3x overfetch
        min_score=0.3,        # Broad initial recall
        rerank=True,
        use_crag_grading=True,
    )

    retriever = HybridRetriever(
        memory_provider=get_memory().provider,
        config=config,
    )

    # Execute retrieval with quality validation
    result = await retriever.retrieve(
        query=query,
        user_id=config.user_id,
        k=limit,
    )

    # Check quality and potentially expand
    if result.relevance_score < min_relevance and auto_expand:
        expanded_query = await retriever._expand_query(query)
        result = await retriever.retrieve(
            query=expanded_query,
            user_id=config.user_id,
            k=limit,
        )
        return format_response(result, expanded_query)

    return format_response(result, None)
```

**Acceptance Criteria:**
- [ ] Uses draagon-ai HybridRetriever
- [ ] Configurable retrieval parameters
- [ ] CRAG grading from draagon-ai
- [ ] Query expansion from draagon-ai

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── search.py            # Updated with quality metrics
│   ├── quality.py           # NEW: Quality assessment utilities
│   └── ...
└── server.py                # Updated tool registration
```

### Quality Metrics Module

```python
# tools/quality.py

from dataclasses import dataclass
from collections import Counter
from typing import Any

@dataclass
class GradedResult:
    """Search result with CRAG-style grading."""
    id: str
    content: str
    score: float
    grading: str
    conviction: float
    type: str
    source: str
    metadata: dict

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "score": self.score,
            "grading": self.grading,
            "conviction": self.conviction,
            "type": self.type,
            "source": self.source,
            "metadata": self.metadata,
        }

@dataclass
class RetrievalQuality:
    """Quality assessment for retrieval results."""
    overall_relevance: float
    sufficient: bool
    confidence: float
    grading_distribution: dict[str, int]
    warnings: list[str]

    def to_dict(self) -> dict:
        return {
            "overall_relevance": self.overall_relevance,
            "sufficient": self.sufficient,
            "confidence": self.confidence,
            "grading_distribution": self.grading_distribution,
            "warnings": self.warnings,
        }

# Grading thresholds (configurable)
GRADING_THRESHOLDS = {
    "relevant": 0.7,
    "ambiguous": 0.4,
}

def grade_result(score: float) -> str:
    """Apply CRAG-style grading."""
    if score >= GRADING_THRESHOLDS["relevant"]:
        return "relevant"
    elif score >= GRADING_THRESHOLDS["ambiguous"]:
        return "ambiguous"
    return "irrelevant"

def assess_quality(results: list[GradedResult]) -> RetrievalQuality:
    """Assess overall retrieval quality."""
    if not results:
        return RetrievalQuality(
            overall_relevance=0.0,
            sufficient=False,
            confidence=1.0,
            grading_distribution={"relevant": 0, "ambiguous": 0, "irrelevant": 0},
            warnings=["No results found"],
        )

    relevance = sum(r.score for r in results) / len(results)
    distribution = dict(Counter(r.grading for r in results))

    # Ensure all grades present
    for grade in ["relevant", "ambiguous", "irrelevant"]:
        distribution.setdefault(grade, 0)

    relevant_count = distribution["relevant"]
    sufficient = relevant_count >= 1 and relevance >= 0.5

    warnings = []
    if distribution["irrelevant"] > len(results) / 2:
        warnings.append("Majority of results are irrelevant")
    if distribution["ambiguous"] > distribution["relevant"]:
        warnings.append("More ambiguous than relevant results")
    if relevance < 0.5:
        warnings.append("Low overall relevance - consider rephrasing query")

    return RetrievalQuality(
        overall_relevance=round(relevance, 3),
        sufficient=sufficient,
        confidence=round(min(relevance + 0.2, 1.0), 3),
        grading_distribution=distribution,
        warnings=warnings,
    )
```

---

## Testing

### Unit Tests

```python
# tests/mcp/unit/test_quality.py

class TestResultGrading:
    """Test CRAG-style grading."""

    def test_high_score_relevant(self):
        """Score ≥0.7 graded as relevant."""
        assert grade_result(0.85) == "relevant"
        assert grade_result(0.70) == "relevant"

    def test_medium_score_ambiguous(self):
        """Score 0.4-0.7 graded as ambiguous."""
        assert grade_result(0.55) == "ambiguous"
        assert grade_result(0.40) == "ambiguous"

    def test_low_score_irrelevant(self):
        """Score <0.4 graded as irrelevant."""
        assert grade_result(0.30) == "irrelevant"
        assert grade_result(0.0) == "irrelevant"


class TestQualityAssessment:
    """Test retrieval quality assessment."""

    def test_empty_results_insufficient(self):
        """Empty results assessed as insufficient."""
        quality = assess_quality([])
        assert quality.sufficient is False
        assert "No results found" in quality.warnings

    def test_high_relevance_sufficient(self):
        """High relevance results assessed as sufficient."""
        results = [
            GradedResult(id="1", content="...", score=0.85, grading="relevant", ...),
            GradedResult(id="2", content="...", score=0.75, grading="relevant", ...),
        ]
        quality = assess_quality(results)
        assert quality.sufficient is True
        assert quality.overall_relevance >= 0.7

    def test_low_relevance_warnings(self):
        """Low relevance generates warnings."""
        results = [
            GradedResult(id="1", content="...", score=0.35, grading="irrelevant", ...),
            GradedResult(id="2", content="...", score=0.30, grading="irrelevant", ...),
        ]
        quality = assess_quality(results)
        assert quality.sufficient is False
        assert len(quality.warnings) > 0
```

### Integration Tests

```python
# tests/mcp/integration/test_quality_aware_retrieval.py

class TestQualityAwareRetrieval:
    """Integration tests for quality-aware search."""

    async def test_search_returns_quality_metrics(self):
        """Search includes quality assessment."""
        result = await search_context_with_quality(
            query="dependency injection patterns"
        )
        assert "quality" in result
        assert "overall_relevance" in result["quality"]
        assert "sufficient" in result["quality"]

    async def test_auto_expansion_triggers(self):
        """Query expansion triggers on low quality."""
        # Search for something likely to have poor initial results
        result = await search_context_with_quality(
            query="xyzzy obscure term unlikely match",
            auto_expand=True,
        )
        # Even if expanded, should have metadata
        assert "expanded_query" in result

    async def test_grading_distribution_accurate(self):
        """Grading distribution matches individual gradings."""
        result = await search_context_with_quality(
            query="error handling patterns",
            limit=10,
        )

        # Count individual gradings
        counted = Counter(r["grading"] for r in result["results"])

        # Should match distribution
        for grade, count in counted.items():
            assert result["quality"]["grading_distribution"][grade] == count
```

---

## Acceptance Checklist

- [ ] `search_context_with_quality` MCP tool implemented
- [ ] CRAG-style grading for each result
- [ ] Overall quality metrics calculated
- [ ] Automatic query expansion working
- [ ] Warnings generated for quality issues
- [ ] draagon-ai HybridRetriever integrated
- [ ] Backward compatibility with `search_context`
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Migration Guide

### Updating Existing Code

The new tool is an enhancement, not a replacement:

```python
# Option 1: Use new tool directly
result = await mcp.call_tool("search_context_with_quality", {
    "query": "...",
    "min_relevance": 0.6,
})

if result["quality"]["sufficient"]:
    # Use results with confidence
    context = result["results"]
else:
    # Handle insufficient results
    warnings = result["quality"]["warnings"]

# Option 2: Original tool still works
result = await mcp.call_tool("search_context", {"query": "..."})
# Returns list directly, no quality metrics
```

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Query expansion uses LLM |
| XML Output Format | ✅ | Internal prompts use XML |
| Protocol-Based Design | ✅ | Uses draagon-ai protocols |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Tests validate retrieval quality |

---

## References

- [CRAG: Corrective Retrieval Augmented Generation](https://arxiv.org/abs/2401.15884)
- [draagon-ai: HybridRetriever](../draagon-ai/retrieval/retriever.py)
- [Self-RAG: Learning to Retrieve](https://arxiv.org/abs/2310.11511)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
