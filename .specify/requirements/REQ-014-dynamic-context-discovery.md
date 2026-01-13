# REQ-014: Dynamic Context Discovery

**Priority:** P0
**Effort:** High (15 days)
**Dependencies:** REQ-001
**Blocks:** REQ-015, REQ-016, REQ-017, REQ-018, REQ-019
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific context patterns

---

## Overview

Implement dynamic context discovery patterns inspired by Cursor's architecture to reduce token usage by up to 47% while improving context relevance. This requirement establishes the foundation for lazy-loaded, on-demand context retrieval rather than static pre-loading.

### Background

Cursor's blog post "[Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)" identifies a key insight: as AI models improve as agents, providing fewer details upfront and letting agents pull relevant context on demand is more efficient than pre-loading vast amounts of context.

**Key Metrics from Cursor:**
- 46.9% reduction in total agent tokens with MCP tool optimization
- Improved error handling and recovery
- Better context relevance through on-demand retrieval

### Purpose

Transform Draagon Forge from a static context provider to a dynamic context discovery system that:
1. Minimizes token overhead by lazy-loading tool descriptions
2. Preserves conversation context through searchable history
3. Validates retrieval quality before use
4. Provides adaptive processing based on query complexity

---

## Core Patterns

### Pattern 1: Tool Description Lazy Loading (REQ-015)

**Current State:** All 12+ MCP tool descriptions (~2000 tokens) sent on every listing.

**Target State:** Only tool names + 1-line summaries sent initially; full descriptions loaded on-demand.

**Token Savings:** ~47% for MCP-heavy workflows.

### Pattern 2: Conversation History as Searchable Memory (REQ-016)

**Current State:** Conversation history truncated/summarized when context fills.

**Target State:** Full conversation history stored in searchable memory, agents can retrieve relevant past turns.

**Benefit:** Recovered knowledge that summarization loses.

### Pattern 3: Adaptive Context Checking (REQ-017)

**Current State:** Full semantic expansion runs on every query.

**Target State:** Fast LLM call decides if deep context retrieval is needed.

**Benefit:** Skip 20+ seconds of processing on simple queries.

### Pattern 4: Quality-Aware Retrieval (REQ-018)

**Current State:** Search returns results without quality validation.

**Target State:** CRAG-style grading with automatic fallback and query expansion.

**Benefit:** Higher relevance, automatic recovery from poor initial retrieval.

### Pattern 5: File-Based Output Management (REQ-019)

**Current State:** Long tool outputs truncated or cause context overflow.

**Target State:** Long outputs written to temp files, agents inspect selectively.

**Benefit:** No data loss, selective inspection reduces token usage.

---

## Integration with draagon-ai

**Critical:** draagon-ai already implements most of these patterns internally. This requirement is primarily about **exposing existing capabilities** through the MCP interface.

### Already Available in draagon-ai

| Pattern | draagon-ai Component | Location |
|---------|---------------------|----------|
| Two-Pass Retrieval | `TwoPassSemanticOrchestrator` | `cognition/semantic/orchestrator.py` |
| Adaptive Processing | `_check_if_expansion_needed()` | `orchestration/loop.py:531-589` |
| Hybrid Re-Ranking | `HybridRetriever` | `retrieval/retriever.py` |
| CRAG Grading | `_rerank_stage()` | `retrieval/retriever.py:134-231` |
| Query Expansion | `_expand_query()` | `retrieval/retriever.py` |
| Episodic Memory | `MemoryType.EPISODIC` | `memory/base.py` |
| Tool Registry | `ToolRegistry` | `tools/decorator.py` |

### New Implementation Required

| Feature | Scope | Complexity |
|---------|-------|------------|
| MCP lazy tool loading | New tool + index | Medium |
| Conversation history MCP tool | Wrapper around episodic | Low |
| File-based output writer | New utility | Medium |
| Quality metrics in search response | Extend existing | Low |

---

## Requirements Summary

| REQ ID | Feature | Priority | Effort | Status |
|--------|---------|----------|--------|--------|
| REQ-015 | MCP Tool Lazy Loading | P0 | 5 days | Planned |
| REQ-016 | Conversation History Search | P1 | 3 days | Planned |
| REQ-017 | Adaptive Context Checking | P1 | 3 days | Planned |
| REQ-018 | Quality-Aware Retrieval | P1 | 3 days | Planned |
| REQ-019 | File-Based Output Management | P2 | 3 days | Planned |

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Token usage per MCP session | ~5000 tokens | ~2500 tokens | Instrumentation |
| Context relevance score | 75% | 90% | User feedback |
| Average tool response time | 800ms | 500ms | Performance logs |
| Wasted retrievals (low quality) | 30% | 10% | Quality grading |
| Conversation knowledge loss | High | Low | Retrieval success |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DYNAMIC CONTEXT DISCOVERY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────┐    ┌────────────────────┐    ┌──────────────────┐  │
│  │  Tool Index        │    │  Conversation      │    │  Output          │  │
│  │  (REQ-015)         │    │  Memory (REQ-016)  │    │  Files (REQ-019) │  │
│  │                    │    │                    │    │                  │  │
│  │  list_tools() ─────┼────┼─► search_history() │    │  write_output()  │  │
│  │  get_tool_desc()   │    │                    │    │  inspect_file()  │  │
│  └────────────────────┘    └────────────────────┘    └──────────────────┘  │
│           │                         │                         │             │
│           ▼                         ▼                         ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      ADAPTIVE CONTEXT LAYER (REQ-017)               │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐    │   │
│  │  │ Complexity     │  │ Needs Deep     │  │ Route to           │    │   │
│  │  │ Classifier     │──│ Context?       │──│ Appropriate        │    │   │
│  │  │                │  │ (Fast LLM)     │  │ Retrieval          │    │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    QUALITY-AWARE RETRIEVAL (REQ-018)                │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐    │   │
│  │  │ Broad Recall   │  │ Re-Ranking +   │  │ Quality Validation │    │   │
│  │  │ (10x overetch) │──│ CRAG Grading   │──│ + Auto Fallback    │    │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         DRAAGON-AI CORE                             │   │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │   │
│  │  │ MemoryProvider  │  │ HybridRetriever  │  │ SemanticOrchest.  │  │   │
│  │  │ (Neo4j/Qdrant)  │  │ (Two-Pass)       │  │ (Context Enrich)  │  │   │
│  │  └─────────────────┘  └──────────────────┘  └───────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 5a: Dynamic Context Foundation (REQ-015, REQ-016)

**Duration:** 8 days

1. Implement MCP tool lazy loading (REQ-015)
2. Implement conversation history search (REQ-016)
3. Integration tests for both

### Phase 5b: Intelligent Processing (REQ-017, REQ-018)

**Duration:** 6 days

1. Expose adaptive context checking via MCP (REQ-017)
2. Add quality metrics to search responses (REQ-018)
3. Integration tests for retrieval quality

### Phase 5c: Output Management (REQ-019)

**Duration:** 3 days

1. Implement file-based output writer
2. Add selective inspection tools
3. Integration with long-running operations

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Adaptive checking uses LLM for decisions |
| XML Output Format | ✅ | All LLM prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol for all communication |
| Async-First Processing | ✅ | All retrieval operations async |
| Test Outcomes | ✅ | Tests validate behavior, not implementation |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance regression | Medium | High | Benchmark before/after |
| Increased complexity | Medium | Medium | Clear abstraction layers |
| draagon-ai API changes | Low | High | Pin dependency versions |
| Token estimation inaccuracy | Medium | Low | Measure actual usage |

---

## References

- [Cursor: Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)
- [draagon-ai: Retrieval Documentation](../draagon-ai/docs/retrieval.md)
- [MCP Specification](https://modelcontextprotocol.io/docs)
- [CRAG: Corrective Retrieval Augmented Generation](https://arxiv.org/abs/2401.15884)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
