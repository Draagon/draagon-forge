# REQ-019: File-Based Output Management

**Priority:** P2
**Effort:** 3 days
**Dependencies:** REQ-014, REQ-001
**Blocks:** None
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific output handling

---

## Overview

Implement file-based output management for long tool responses and terminal outputs, enabling selective inspection rather than context overflow or truncation.

### Problem Statement

**Current State:**
- Long tool outputs are truncated at ~30,000 characters
- Terminal outputs often exceed context limits
- Truncation loses potentially important information
- No way to selectively inspect parts of large outputs

**Impact:**
- Lost diagnostic information when commands fail
- Incomplete results from large searches
- No way to inspect specific sections of large files
- Context wasted on irrelevant portions of large outputs

### Target State

- Long outputs automatically written to temporary files
- MCP tools for selective inspection (head, tail, grep)
- Terminal output synced to inspectable files
- Configurable thresholds for file vs inline output

### Cursor Pattern

From Cursor's blog:
> "Tool Response File Conversion: Long responses from shell commands or MCP calls get written to files rather than truncated. Agents can then use commands like `tail` to inspect outputs selectively."

---

## Requirements

### REQ-019.1: Automatic Output Capture

Automatically capture long outputs to temporary files.

```python
@dataclass
class OutputCapture:
    """Captured output with optional file backing."""

    content: str              # Full or truncated content
    truncated: bool           # Whether content was truncated
    file_path: str | None     # Path to full content file (if captured)
    total_lines: int          # Total lines in output
    total_bytes: int          # Total size in bytes
    content_type: str         # "text" | "json" | "log" | "unknown"

async def capture_output(
    content: str,
    source: str,
    inline_threshold: int = 5000,
) -> OutputCapture:
    """Capture output, writing to file if over threshold.

    Args:
        content: The output content
        source: Source identifier (tool name, command, etc.)
        inline_threshold: Max chars to return inline

    Returns:
        OutputCapture with content and optional file path
    """
```

**Configuration:**
```python
@dataclass
class OutputConfig:
    """Output capture configuration."""

    inline_threshold_chars: int = 5000       # Max inline characters
    inline_threshold_lines: int = 100        # Max inline lines
    temp_dir: Path = Path("/tmp/draagon-forge/outputs")
    retention_hours: int = 24                # Auto-cleanup after
    compress_large: bool = True              # Gzip files >1MB
```

**Acceptance Criteria:**
- [ ] Outputs >threshold written to temp files
- [ ] File path returned in response
- [ ] Inline content truncated with indicator
- [ ] Total size/lines reported
- [ ] Content type detected

### REQ-019.2: Output Inspection Tools

MCP tools for selective inspection of captured outputs.

```python
@mcp.tool()
async def inspect_output(
    file_path: str,
    mode: str = "head",
    lines: int = 50,
    pattern: str | None = None,
    context_lines: int = 3,
) -> dict:
    """Inspect a captured output file selectively.

    Use this to examine specific parts of large outputs without
    loading the entire content into context.

    Args:
        file_path: Path to the captured output file
        mode: Inspection mode:
            - "head": First N lines
            - "tail": Last N lines
            - "grep": Lines matching pattern
            - "range": Specific line range
            - "summary": Statistical summary
        lines: Number of lines to return (for head/tail)
        pattern: Regex pattern (for grep mode)
        context_lines: Context around matches (for grep mode)

    Returns:
        Inspection result with:
        - content: Selected content
        - start_line: First line number in selection
        - end_line: Last line number in selection
        - total_lines: Total lines in file
        - matches: Match count (for grep mode)
    """
```

**Response Format:**
```json
{
  "content": "Line 1\nLine 2\n...",
  "start_line": 1,
  "end_line": 50,
  "total_lines": 5000,
  "mode": "head",
  "matches": null,
  "file_path": "/tmp/draagon-forge/outputs/cmd-abc123.txt"
}
```

**Acceptance Criteria:**
- [ ] Head mode returns first N lines
- [ ] Tail mode returns last N lines
- [ ] Grep mode finds pattern matches with context
- [ ] Range mode returns specific lines
- [ ] Summary mode provides statistics
- [ ] Invalid file path returns helpful error

### REQ-019.3: Terminal Output Sync

Sync terminal output to inspectable files (VS Code extension integration).

```typescript
// Extension-side: terminalWatcher.ts

interface TerminalSession {
    id: string;
    name: string;
    outputFile: string;
    startTime: Date;
    lastActivity: Date;
}

class TerminalOutputSync {
    private sessions: Map<string, TerminalSession> = new Map();

    async onTerminalOutput(
        terminalId: string,
        data: string
    ): Promise<void> {
        // Append to session's output file
        const session = this.sessions.get(terminalId);
        if (session) {
            await fs.appendFile(session.outputFile, data);
            session.lastActivity = new Date();
        }
    }

    async getSessionFile(terminalId: string): Promise<string | null> {
        return this.sessions.get(terminalId)?.outputFile ?? null;
    }
}
```

**MCP Tool for Terminal Access:**
```python
@mcp.tool()
async def get_terminal_output(
    terminal_id: str | None = None,
    mode: str = "tail",
    lines: int = 100,
    since_timestamp: str | None = None,
) -> dict:
    """Get output from a terminal session.

    Retrieves terminal output that has been synced to the filesystem
    by the VS Code extension.

    Args:
        terminal_id: Specific terminal ID (None = active terminal)
        mode: "head" | "tail" | "all" | "since"
        lines: Number of lines (for head/tail)
        since_timestamp: Get output since timestamp (for since mode)

    Returns:
        Terminal output with metadata
    """
```

**Acceptance Criteria:**
- [ ] Terminal output synced to files
- [ ] Files accessible via MCP tool
- [ ] Multiple terminal sessions supported
- [ ] Recent output retrievable by timestamp
- [ ] Session metadata tracked

### REQ-019.4: MCP Tool Response Capture

Wrap MCP tool responses to automatically capture long outputs.

```python
def capture_tool_response(response: Any, tool_name: str) -> dict:
    """Wrap tool response with output capture.

    Args:
        response: Original tool response
        tool_name: Name of the tool

    Returns:
        Wrapped response with capture metadata
    """
    # Serialize response
    if isinstance(response, dict):
        content = json.dumps(response, indent=2)
    elif isinstance(response, list):
        content = json.dumps(response, indent=2)
    else:
        content = str(response)

    # Check if capture needed
    capture = await capture_output(
        content=content,
        source=f"tool:{tool_name}",
    )

    if capture.truncated:
        return {
            "status": "captured",
            "preview": capture.content,
            "full_output_file": capture.file_path,
            "total_lines": capture.total_lines,
            "total_bytes": capture.total_bytes,
            "message": f"Output captured to file. Use inspect_output('{capture.file_path}') to examine.",
        }
    else:
        return {
            "status": "inline",
            "data": response,
        }
```

**Acceptance Criteria:**
- [ ] Long tool responses auto-captured
- [ ] Preview included in response
- [ ] File path provided for inspection
- [ ] Original response structure preserved when inline

### REQ-019.5: Cleanup and Retention

Manage temporary output files with automatic cleanup.

```python
class OutputFileManager:
    """Manage captured output files."""

    def __init__(self, config: OutputConfig):
        self.config = config
        self.files: dict[str, datetime] = {}

    async def cleanup_expired(self) -> int:
        """Remove files older than retention period.

        Returns:
            Number of files removed
        """
        cutoff = datetime.now() - timedelta(hours=self.config.retention_hours)
        removed = 0

        for file_path, created_at in list(self.files.items()):
            if created_at < cutoff:
                try:
                    os.remove(file_path)
                    del self.files[file_path]
                    removed += 1
                except OSError:
                    pass

        return removed

    async def get_storage_stats(self) -> dict:
        """Get storage statistics for captured outputs."""
        total_bytes = sum(
            os.path.getsize(f) for f in self.files if os.path.exists(f)
        )
        return {
            "file_count": len(self.files),
            "total_bytes": total_bytes,
            "oldest_file": min(self.files.values()) if self.files else None,
            "retention_hours": self.config.retention_hours,
        }
```

**Acceptance Criteria:**
- [ ] Files auto-removed after retention period
- [ ] Storage statistics available
- [ ] Cleanup runs periodically
- [ ] Manual cleanup trigger available

---

## Technical Design

### File Structure

```
src/draagon_forge/mcp/
├── tools/
│   ├── output.py            # NEW: Output capture and inspection
│   └── ...
├── output/
│   ├── __init__.py          # NEW: Output management module
│   ├── capture.py           # Output capture logic
│   ├── inspect.py           # Inspection utilities
│   └── manager.py           # File lifecycle management
└── server.py                # Updated with output tools

src/extension/
├── watcher/
│   └── terminalWatcher.ts   # Updated with output sync
└── output/
    └── sync.ts              # NEW: Terminal output sync
```

### Output File Format

```
/tmp/draagon-forge/outputs/
├── tool-search_context-2026-01-13T10-30-00-abc123.json
├── tool-get_patterns-2026-01-13T10-31-00-def456.json
├── terminal-1-2026-01-13T10-00-00.log
├── terminal-2-2026-01-13T10-15-00.log
└── .metadata.json  # Tracks file metadata for cleanup
```

### Inspection Implementation

```python
# output/inspect.py

import re
from pathlib import Path

async def inspect_head(file_path: str, lines: int) -> dict:
    """Get first N lines of file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Output file not found: {file_path}")

    result_lines = []
    total_lines = 0

    with open(path, "r") as f:
        for i, line in enumerate(f):
            total_lines = i + 1
            if i < lines:
                result_lines.append(line.rstrip())

    return {
        "content": "\n".join(result_lines),
        "start_line": 1,
        "end_line": min(lines, total_lines),
        "total_lines": total_lines,
        "mode": "head",
    }

async def inspect_grep(
    file_path: str,
    pattern: str,
    context_lines: int = 3,
    max_matches: int = 50,
) -> dict:
    """Find lines matching pattern with context."""
    path = Path(file_path)
    regex = re.compile(pattern, re.IGNORECASE)

    matches = []
    all_lines = path.read_text().splitlines()
    total_lines = len(all_lines)

    for i, line in enumerate(all_lines):
        if regex.search(line):
            start = max(0, i - context_lines)
            end = min(total_lines, i + context_lines + 1)

            match_block = {
                "line_number": i + 1,
                "match": line,
                "context_before": all_lines[start:i],
                "context_after": all_lines[i+1:end],
            }
            matches.append(match_block)

            if len(matches) >= max_matches:
                break

    return {
        "matches": matches,
        "match_count": len(matches),
        "total_lines": total_lines,
        "mode": "grep",
        "pattern": pattern,
    }
```

---

## Testing

### Unit Tests

```python
# tests/mcp/unit/test_output.py

class TestOutputCapture:
    """Test output capture logic."""

    async def test_small_output_inline(self):
        """Small outputs returned inline."""
        capture = await capture_output("small content", "test", inline_threshold=100)
        assert capture.truncated is False
        assert capture.file_path is None

    async def test_large_output_captured(self):
        """Large outputs written to file."""
        large_content = "x" * 10000
        capture = await capture_output(large_content, "test", inline_threshold=100)
        assert capture.truncated is True
        assert capture.file_path is not None
        assert os.path.exists(capture.file_path)

    async def test_line_count_accurate(self):
        """Line count correctly reported."""
        content = "\n".join(["line"] * 500)
        capture = await capture_output(content, "test", inline_threshold=100)
        assert capture.total_lines == 500


class TestOutputInspection:
    """Test output inspection tools."""

    async def test_head_returns_first_lines(self):
        """Head mode returns first N lines."""
        result = await inspect_head(test_file, lines=10)
        assert result["start_line"] == 1
        assert result["end_line"] == 10

    async def test_tail_returns_last_lines(self):
        """Tail mode returns last N lines."""
        result = await inspect_tail(test_file, lines=10)
        assert result["end_line"] == result["total_lines"]

    async def test_grep_finds_matches(self):
        """Grep mode finds pattern matches."""
        result = await inspect_grep(test_file, pattern="error")
        assert result["match_count"] > 0
        assert all("error" in m["match"].lower() for m in result["matches"])
```

### Integration Tests

```python
# tests/mcp/integration/test_file_output.py

class TestFileBasedOutput:
    """Integration tests for file-based output."""

    async def test_tool_response_capture(self):
        """Long tool responses captured to files."""
        # Trigger a search that returns many results
        result = await search_context_with_quality(
            query="common pattern",
            limit=100,
        )

        # Check if captured
        if result.get("status") == "captured":
            assert "full_output_file" in result
            assert os.path.exists(result["full_output_file"])

    async def test_inspect_captured_output(self):
        """Captured outputs can be inspected."""
        # First, trigger capture
        capture_result = await some_tool_that_produces_large_output()

        if capture_result.get("full_output_file"):
            # Then inspect
            inspection = await inspect_output(
                file_path=capture_result["full_output_file"],
                mode="tail",
                lines=20,
            )
            assert "content" in inspection
            assert inspection["total_lines"] > 0
```

---

## Acceptance Checklist

- [ ] `capture_output` function implemented
- [ ] `inspect_output` MCP tool implemented
- [ ] Head/tail/grep/range modes working
- [ ] Terminal output sync implemented (extension)
- [ ] `get_terminal_output` MCP tool implemented
- [ ] Automatic cleanup working
- [ ] Storage statistics available
- [ ] Unit tests passing
- [ ] Integration tests passing

---

## Usage Examples

### Inspecting Large Search Results

```python
# Search returns too many results
result = await mcp.call_tool("search_context_with_quality", {
    "query": "error handling",
    "limit": 100,
})

# Result was captured to file
if result["status"] == "captured":
    # Inspect first 10 results
    head = await mcp.call_tool("inspect_output", {
        "file_path": result["full_output_file"],
        "mode": "head",
        "lines": 50,
    })

    # Search for specific pattern
    matches = await mcp.call_tool("inspect_output", {
        "file_path": result["full_output_file"],
        "mode": "grep",
        "pattern": "validation",
    })
```

### Debugging Command Failures

```python
# Command failed with long output
# Get terminal output
terminal = await mcp.call_tool("get_terminal_output", {
    "mode": "tail",
    "lines": 100,
})

# Search for error messages
errors = await mcp.call_tool("inspect_output", {
    "file_path": terminal["file_path"],
    "mode": "grep",
    "pattern": "(error|failed|exception)",
    "context_lines": 5,
})
```

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | N/A | File operations don't require LLM |
| XML Output Format | N/A | Not applicable |
| Protocol-Based Design | ✅ | MCP protocol for all access |
| Async-First Processing | ✅ | All file I/O async |
| Test Outcomes | ✅ | Tests validate inspection accuracy |

---

## References

- [Cursor: Tool Response File Conversion](https://cursor.com/blog/dynamic-context-discovery)
- [Cursor: Terminal Output as Files](https://cursor.com/blog/dynamic-context-discovery)
- [VS Code Terminal API](https://code.visualstudio.com/api/references/vscode-api#Terminal)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
