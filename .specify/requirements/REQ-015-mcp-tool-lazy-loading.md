# REQ-015: MCP Tool Lazy Loading

**Priority:** P0
**Effort:** 5 days
**Dependencies:** REQ-014, REQ-001
**Blocks:** None
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific MCP optimization

---

## Overview

Implement lazy loading of MCP tool descriptions to reduce token usage by ~47%. Instead of sending all tool descriptions upfront, provide a minimal index of tool names and load full descriptions on-demand.

### Problem Statement

**Current State:**
- Draagon Forge exposes 12+ MCP tools to Claude Code
- Each tool has a detailed description (~150-300 tokens)
- Total tool descriptions: ~2000-3000 tokens
- These tokens are sent on EVERY tool listing request
- Claude Code requests tool listings frequently during operation

**Impact:**
- Unnecessary token consumption on every interaction
- Slower response times due to context processing
- Limited room for actual context retrieval

### Target State

- Tool index with names + 1-line summaries (~200 tokens total)
- Full descriptions loaded only when agent decides to use a tool
- 47% reduction in MCP-related token usage (based on Cursor's A/B testing)

---

## Requirements

### REQ-015.1: Tool Index Endpoint

Implement a minimal tool index that returns only essential information.

```python
@mcp.tool()
async def list_available_tools(
    category: str | None = None,
    include_disabled: bool = False,
) -> list[dict]:
    """List all available tools with minimal information.

    Returns only tool names and 1-line summaries to minimize token usage.
    Use get_tool_description() for full details before invoking a tool.

    Args:
        category: Optional filter by category (search, beliefs, feedback, etc.)
        include_disabled: Whether to include temporarily disabled tools

    Returns:
        List of tools with:
        - name: Tool identifier
        - summary: 1-line description (max 80 chars)
        - category: Tool category
        - enabled: Whether tool is currently available
    """
```

**Response Format:**
```json
{
  "tools": [
    {"name": "search_context", "summary": "Search semantic memory for relevant context", "category": "search", "enabled": true},
    {"name": "query_beliefs", "summary": "Query stored beliefs by content or category", "category": "beliefs", "enabled": true},
    {"name": "adjust_belief", "summary": "Reinforce, weaken, modify, or delete a belief", "category": "beliefs", "enabled": true},
    {"name": "report_outcome", "summary": "Report feedback on context helpfulness", "category": "feedback", "enabled": true}
  ],
  "total": 12,
  "categories": ["search", "beliefs", "feedback", "patterns", "review"]
}
```

**Acceptance Criteria:**
- [ ] Returns all registered tools
- [ ] Summaries are ≤80 characters
- [ ] Category filtering works correctly
- [ ] Response size ≤500 tokens for full listing
- [ ] Response time <100ms

### REQ-015.2: Tool Description Endpoint

Implement on-demand tool description retrieval.

```python
@mcp.tool()
async def get_tool_description(
    tool_name: str,
    include_examples: bool = True,
) -> dict:
    """Get full description, parameters, and examples for a specific tool.

    Call this before invoking a tool to understand its full capabilities,
    parameter requirements, and usage patterns.

    Args:
        tool_name: Name of the tool to describe
        include_examples: Whether to include usage examples

    Returns:
        Full tool specification with:
        - name: Tool identifier
        - description: Full description
        - parameters: Parameter schema with types and descriptions
        - examples: Usage examples (if requested)
        - related_tools: Other tools commonly used together
    """
```

**Response Format:**
```json
{
  "name": "search_context",
  "description": "Search semantic memory for relevant context. This is the primary tool for retrieving relevant principles, patterns, and learnings before any implementation task. Claude Code should invoke this before making architectural decisions or proposing code changes.",
  "parameters": {
    "query": {
      "type": "string",
      "description": "The search query (natural language)",
      "required": true
    },
    "limit": {
      "type": "integer",
      "description": "Maximum results to return",
      "default": 10,
      "required": false
    },
    "domain": {
      "type": "string",
      "description": "Domain filter (architecture, testing, patterns, etc.)",
      "required": false
    },
    "min_conviction": {
      "type": "number",
      "description": "Minimum conviction score threshold (0.0-1.0)",
      "required": false
    }
  },
  "examples": [
    {
      "description": "Search for architecture principles",
      "invocation": "search_context(query='dependency injection patterns', domain='architecture', min_conviction=0.7)"
    },
    {
      "description": "General search",
      "invocation": "search_context(query='error handling best practices')"
    }
  ],
  "related_tools": ["get_principles", "check_conflicts"]
}
```

**Acceptance Criteria:**
- [ ] Returns complete parameter schema
- [ ] Examples are practical and accurate
- [ ] Related tools are contextually relevant
- [ ] Unknown tool name returns helpful error
- [ ] Response time <100ms

### REQ-015.3: Tool Registry Metadata

Implement a metadata registry for tool organization and discovery.

```python
# Tool metadata structure
@dataclass
class ToolMetadata:
    """Metadata for lazy-loaded tool descriptions."""

    name: str
    summary: str  # Max 80 chars
    category: str
    description: str  # Full description
    parameters: dict[str, ParameterSpec]
    examples: list[ToolExample]
    related_tools: list[str]
    enabled: bool = True
    deprecated: bool = False
    deprecated_message: str | None = None

@dataclass
class ParameterSpec:
    """Parameter specification for tool schema."""

    type: str
    description: str
    required: bool
    default: Any = None
    enum: list[str] | None = None

@dataclass
class ToolExample:
    """Usage example for a tool."""

    description: str
    invocation: str
    expected_output: str | None = None
```

**Acceptance Criteria:**
- [ ] All existing tools have complete metadata
- [ ] Metadata validates against schema
- [ ] Summaries ≤80 characters enforced
- [ ] Examples are syntactically valid

### REQ-015.4: Backward Compatibility

Maintain backward compatibility with existing tool invocations.

**Requirements:**
- Existing direct tool calls continue to work unchanged
- Claude Code can still invoke tools without calling `get_tool_description` first
- No changes required to existing Claude Code configurations

**Acceptance Criteria:**
- [ ] All existing tools remain directly callable
- [ ] No breaking changes to tool signatures
- [ ] Existing MCP configurations work without modification

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── __init__.py
│   ├── registry.py          # NEW: Tool registry with metadata
│   ├── discovery.py         # NEW: list_available_tools, get_tool_description
│   ├── search.py            # Existing
│   ├── beliefs.py           # Existing
│   └── ...
└── server.py                # Updated to register discovery tools
```

### Tool Registration Pattern

```python
# tools/registry.py

from dataclasses import dataclass, field
from typing import Callable, Any

_tool_registry: dict[str, ToolMetadata] = {}

def register_tool(
    name: str,
    summary: str,
    category: str,
    description: str,
    parameters: dict,
    examples: list[dict] | None = None,
    related_tools: list[str] | None = None,
) -> Callable:
    """Decorator to register tool metadata for lazy loading."""

    def decorator(func: Callable) -> Callable:
        if len(summary) > 80:
            raise ValueError(f"Tool summary must be ≤80 chars: {name}")

        _tool_registry[name] = ToolMetadata(
            name=name,
            summary=summary,
            category=category,
            description=description,
            parameters=parameters,
            examples=examples or [],
            related_tools=related_tools or [],
        )
        return func

    return decorator

def get_tool_metadata(name: str) -> ToolMetadata | None:
    """Get metadata for a registered tool."""
    return _tool_registry.get(name)

def list_all_tools(category: str | None = None) -> list[ToolMetadata]:
    """List all registered tools, optionally filtered by category."""
    tools = list(_tool_registry.values())
    if category:
        tools = [t for t in tools if t.category == category]
    return tools
```

### Example Tool Registration

```python
# tools/search.py

from draagon_forge.mcp.tools.registry import register_tool

@register_tool(
    name="search_context",
    summary="Search semantic memory for relevant context",
    category="search",
    description="""Search semantic memory for relevant context.

This is the primary tool for retrieving relevant principles, patterns,
and learnings before any implementation task. Claude Code should invoke
this before making architectural decisions or proposing code changes.

The search uses semantic similarity via Qdrant embeddings and can be
filtered by domain and minimum conviction score.""",
    parameters={
        "query": {
            "type": "string",
            "description": "The search query (natural language)",
            "required": True,
        },
        "limit": {
            "type": "integer",
            "description": "Maximum results to return",
            "required": False,
            "default": 10,
        },
        "domain": {
            "type": "string",
            "description": "Domain filter (architecture, testing, patterns, etc.)",
            "required": False,
        },
        "min_conviction": {
            "type": "number",
            "description": "Minimum conviction score threshold (0.0-1.0)",
            "required": False,
        },
    },
    examples=[
        {
            "description": "Search for architecture principles",
            "invocation": "search_context(query='dependency injection patterns', domain='architecture', min_conviction=0.7)",
        },
        {
            "description": "General search",
            "invocation": "search_context(query='error handling best practices')",
        },
    ],
    related_tools=["get_principles", "check_conflicts"],
)
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
    min_conviction: float | None = None,
) -> list[dict]:
    """Implementation unchanged from existing."""
    ...
```

---

## Testing

### Unit Tests

```python
# tests/mcp/unit/test_tool_registry.py

class TestToolRegistry:
    """Test tool registration and metadata."""

    def test_register_tool_valid_summary(self):
        """Tool with valid summary (≤80 chars) registers successfully."""

    def test_register_tool_long_summary_fails(self):
        """Tool with summary >80 chars raises ValueError."""

    def test_list_all_tools_returns_all(self):
        """list_all_tools() returns all registered tools."""

    def test_list_tools_by_category(self):
        """list_all_tools(category='search') filters correctly."""

    def test_get_tool_metadata_exists(self):
        """get_tool_metadata() returns metadata for registered tool."""

    def test_get_tool_metadata_unknown(self):
        """get_tool_metadata() returns None for unknown tool."""
```

### Integration Tests

```python
# tests/mcp/integration/test_lazy_loading.py

class TestLazyLoading:
    """Integration tests for lazy tool loading."""

    async def test_list_available_tools_minimal_tokens(self):
        """list_available_tools() response is under 500 tokens."""

    async def test_get_tool_description_complete(self):
        """get_tool_description() returns complete schema."""

    async def test_tool_still_callable_directly(self):
        """Existing tools remain directly callable."""

    async def test_unknown_tool_helpful_error(self):
        """Unknown tool name returns helpful error message."""
```

### Performance Tests

```python
# tests/mcp/performance/test_token_usage.py

class TestTokenUsage:
    """Verify token reduction from lazy loading."""

    async def test_listing_token_count(self):
        """Tool listing uses <500 tokens."""

    async def test_full_description_token_count(self):
        """Full description + examples uses <400 tokens per tool."""

    async def test_total_reduction(self):
        """Total token usage reduced by >40% vs static loading."""
```

---

## Acceptance Checklist

- [ ] `list_available_tools` implemented and tested
- [ ] `get_tool_description` implemented and tested
- [ ] All existing tools have metadata registered
- [ ] Summary length validation enforced
- [ ] Backward compatibility verified
- [ ] Token usage measured and documented
- [ ] Performance benchmarks passing
- [ ] Integration tests passing

---

## Migration Guide

### For Claude Code Users

No changes required. Existing configurations and tool invocations continue to work.

### For Extension Developers

To optimize token usage, update tool invocation patterns:

```python
# Before (still works, but higher token usage)
result = await mcp.call_tool("search_context", {"query": "..."})

# After (recommended for complex workflows)
# 1. List available tools
tools = await mcp.call_tool("list_available_tools", {"category": "search"})

# 2. Get description for tool you want to use
desc = await mcp.call_tool("get_tool_description", {"tool_name": "search_context"})

# 3. Invoke with informed parameters
result = await mcp.call_tool("search_context", {"query": "...", "domain": "architecture"})
```

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Tool selection still by Claude |
| XML Output Format | N/A | JSON for tool metadata is appropriate |
| Protocol-Based Design | ✅ | MCP protocol standard |
| Async-First Processing | ✅ | All operations async |
| Test Outcomes | ✅ | Tests validate token reduction |

---

## References

- [Cursor: MCP Tool Optimization](https://cursor.com/blog/dynamic-context-discovery)
- [MCP Tool Specification](https://modelcontextprotocol.io/docs/concepts/tools)
- [Token Counting Best Practices](https://platform.openai.com/tokenizer)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
