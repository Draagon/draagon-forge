# REQ-001: MCP Context Server

**Priority:** P0
**Effort:** High (10 days)
**Dependencies:** None
**Blocks:** REQ-002, REQ-005, REQ-008, REQ-009

---

## Overview

Build a FastMCP server that exposes semantic memory to Claude Code, providing dynamic, searchable, evolving context for AI-assisted development.

### Purpose

The MCP Context Server is the central knowledge hub for Draagon Forge. It stores principles, patterns, learnings, and beliefs in a semantic knowledge base (Neo4j + Qdrant) and exposes them via MCP tools to Claude Code.

---

## Requirements

### REQ-001.1: Core MCP Tools

Implement the following MCP tools:

| Tool | Purpose | Invocation Context |
|------|---------|-------------------|
| `search_context` | Semantic search across memory | Before any implementation |
| `get_principles` | Domain-specific principles | Architecture decisions |
| `check_conflicts` | Detect principle violations | Before proposing changes |
| `get_patterns` | Design patterns + examples | Learning idioms |
| `find_examples` | Real code from codebase | "How do we do X?" |
| `report_outcome` | Feedback for reinforcement | After task completion |
| `store_learning` | Save new knowledge | After external research |
| `get_review_queue` | Flagged items for review | Maintenance |
| `resolve_review` | Human decision on flagged item | Maintenance |

**Acceptance Criteria:**
- [ ] Each tool is callable via Claude Code MCP integration
- [ ] Tools return structured responses with scores/confidence
- [ ] Error handling returns meaningful error messages
- [ ] All tools are async and non-blocking

### REQ-001.2: Knowledge Base Integration

**Neo4j Integration:**
- Store entities (principles, patterns, learnings, beliefs)
- Store relationships (supports, contradicts, relates_to)
- Query via Cypher for relationship traversal

**Qdrant Integration:**
- Store embeddings for all text content
- Support semantic similarity search
- Use mxbai-embed-large embeddings

**Acceptance Criteria:**
- [ ] Principles stored with conviction scores
- [ ] Patterns stored with code examples
- [ ] Learnings stored with source tracking
- [ ] Vector search returns relevant results (>0.7 similarity)
- [ ] Graph queries traverse relationships correctly

### REQ-001.3: CLAUDE.md Seeding

Parse and seed knowledge from CLAUDE.md files:

```bash
python -m draagon_forge.mcp.seed \
    --claude-md ~/project/CLAUDE.md \
    --core-beliefs \
    --index-codebase ~/project/src
```

**Acceptance Criteria:**
- [ ] Extracts principles with category and conviction
- [ ] Extracts patterns with code examples
- [ ] Handles multiple CLAUDE.md files
- [ ] Idempotent seeding (no duplicates)
- [ ] Reports seeding statistics

### REQ-001.4: Feedback Loop Integration

```python
@mcp.tool
async def report_outcome(
    context_ids: list[str],
    outcome: str,  # "helpful" | "not_helpful" | "misleading" | "outdated"
    reason: str | None = None,
) -> dict:
```

**Acceptance Criteria:**
- [ ] Reinforces helpful context (+0.05 conviction)
- [ ] Weakens unhelpful context (-0.03 conviction)
- [ ] Flags misleading content for review (-0.1 conviction)
- [ ] Marks outdated content appropriately
- [ ] Logs all feedback for analysis

---

## Technical Design

### File Structure

```
src/mcp/
├── __init__.py
├── server.py             # FastMCP entry point
├── tools/
│   ├── __init__.py
│   ├── search.py         # search_context
│   ├── principles.py     # get_principles
│   ├── conflicts.py      # check_conflicts
│   ├── patterns.py       # get_patterns, find_examples
│   ├── feedback.py       # report_outcome
│   ├── learning.py       # store_learning
│   └── review.py         # get_review_queue, resolve_review
├── resources/
│   └── project.py        # Project context resource
├── prompts/
│   └── workflows.py
├── memory/
│   ├── neo4j.py
│   └── qdrant.py
└── seed/
    ├── __init__.py
    └── claude_md.py      # CLAUDE.md parser
```

### Configuration

```json
// ~/.config/claude-code/mcp.json
{
    "mcpServers": {
        "draagon-forge": {
            "command": "python",
            "args": ["-m", "draagon_forge.mcp.server"],
            "env": {
                "NEO4J_URI": "bolt://localhost:7687",
                "QDRANT_URL": "http://localhost:6333",
                "DRAAGON_PROJECT": "my-project"
            }
        }
    }
}
```

---

## Testing

### Unit Tests

- Test each tool function in isolation
- Mock database responses for edge cases
- Test error handling paths

### Integration Tests

- Test with real Neo4j/Qdrant instances
- Test full search → retrieval → feedback cycle
- Test CLAUDE.md seeding with sample files

### Acceptance Tests

- Claude Code can invoke all tools
- Search returns semantically relevant results
- Feedback affects future search rankings

---

## Acceptance Checklist

- [ ] All 9 core tools implemented and tested
- [ ] Neo4j integration working
- [ ] Qdrant integration working
- [ ] CLAUDE.md seeding functional
- [ ] Feedback loop updating conviction scores
- [ ] Documentation complete
- [ ] Integration tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | All semantic analysis via LLM |
| XML Output Format | ✅ | LLM prompts use XML |
| Protocol-Based Design | ✅ | MCP protocol standard |
| Async-First Processing | ✅ | All I/O is async |
| Test Outcomes | ✅ | Tests validate behavior |

---

## References

- [MCP Specification](https://modelcontextprotocol.io/docs)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)
- [Neo4j Python Driver](https://neo4j.com/docs/python-manual/)
- [Qdrant Client](https://qdrant.tech/documentation/)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
