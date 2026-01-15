# REQ-033: Scalable Code Review Subagent

**Status:** Draft
**Priority:** High
**Created:** 2026-01-15
**Dependencies:** REQ-022 (Shared Memory), MCP Server

## Problem Statement

Code review by LLMs faces several challenges:

1. **Large Diffs**: 200+ files changed can exceed context windows
2. **Lost in Middle**: LLMs perform poorly on information in the middle of large inputs
3. **Cross-file Context**: Diff-only analysis misses system-wide architectural issues
4. **Staged vs All**: Different use cases require reviewing different change sets
5. **Cost Management**: Full codebase analysis is expensive; smart prioritization needed

## Research Findings

### Chunking Best Practices (Pinecone, et al.)
- **Optimal chunk size**: 256-512 tokens with 10-20% overlap
- **Preserve semantic boundaries**: Don't split mid-function or mid-class
- **Hierarchical summarization**: Summarize chunks → summarize summaries

### Code Review Tool Limitations (Qodo, Copilot analysis)
- **Diff-only approaches** miss system-wide behavior changes
- **Single-file focus** can't detect cross-module regressions
- **No memory** means repeated issues get flagged again and again

### Git Diff Strategies
- **Unified diff** (`git diff`): Good for small changes, context window issues at scale
- **File-by-file** (`git diff --name-only` → individual diffs): Parallelizable, loses cross-file context
- **Stat-based prioritization** (`git diff --stat`): Identify highest-impact files first

## Architecture Design

### 1. Input Selection Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CODE REVIEW AGENT                             │
├─────────────────────────────────────────────────────────────────┤
│  Input Modes:                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   STAGED    │  │  UNSTAGED   │  │   BRANCH    │             │
│  │  git diff   │  │ git diff    │  │ git diff    │             │
│  │  --cached   │  │ (working)   │  │ main..HEAD  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  User selects mode, or agent auto-detects:                      │
│  - If staged changes exist → review staged                      │
│  - Else if unstaged → review unstaged                           │
│  - Else → review branch vs main                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Multi-Tier Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROCESSING PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: Triage (Fast, Cheap)                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  git diff --stat → File list with change magnitude       │  │
│  │  Classify files: [critical, important, minor, noise]     │  │
│  │  Uses: File extension, path, lines changed               │  │
│  │  No LLM needed - heuristic classification                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  TIER 2: Focused Review (Per-file, Parallel)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  For each critical/important file (max 20):              │  │
│  │    1. Get individual diff                                │  │
│  │    2. Load relevant beliefs/principles from memory       │  │
│  │    3. LLM review → issues[], suggestions[]               │  │
│  │  Parallelizable - process 5 files concurrently           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  TIER 3: Cross-file Analysis (Synthesis)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Input: Tier 2 summaries (not raw diffs)                 │  │
│  │  Detect: Architectural patterns, cross-module issues     │  │
│  │  Check: Consistency with project principles              │  │
│  │  Output: High-level review + aggregated issues           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. File Prioritization Heuristics

| Category | Criteria | Priority |
|----------|----------|----------|
| **Critical** | Security-related paths (`auth/`, `crypto/`, `secrets/`) | 1 (Always review) |
| **Critical** | Config files (`.env`, `config.py`, `package.json`) | 1 |
| **Important** | Core business logic (>100 lines changed) | 2 |
| **Important** | API endpoints, database schemas | 2 |
| **Minor** | Tests (unless >50% of changes) | 3 |
| **Minor** | Documentation, comments only | 3 |
| **Noise** | Auto-generated files (`*.lock`, `dist/`) | Skip |
| **Noise** | Formatting-only changes | Skip |

### 4. Chunking Strategy for Large Files

For files with >500 lines changed:

```python
def chunk_diff(diff: str, max_tokens: int = 400) -> list[DiffChunk]:
    """
    Split large diffs into reviewable chunks.

    Strategy:
    1. Split on function/class boundaries when possible
    2. Ensure each chunk has context (3-5 lines before/after)
    3. Keep hunks together - never split a hunk mid-way
    4. Add overlap at chunk boundaries for continuity
    """
    hunks = parse_diff_hunks(diff)
    chunks = []
    current_chunk = []
    current_tokens = 0

    for hunk in hunks:
        hunk_tokens = estimate_tokens(hunk)

        if current_tokens + hunk_tokens > max_tokens:
            if current_chunk:
                chunks.append(DiffChunk(
                    hunks=current_chunk,
                    context_before=get_context(current_chunk[0], lines=3),
                    context_after=get_context(current_chunk[-1], lines=3),
                ))
            current_chunk = [hunk]
            current_tokens = hunk_tokens
        else:
            current_chunk.append(hunk)
            current_tokens += hunk_tokens

    if current_chunk:
        chunks.append(DiffChunk(hunks=current_chunk, ...))

    return chunks
```

### 5. Memory Integration

The agent leverages Draagon Forge's belief system:

```python
async def get_review_context(file_path: str, diff: str) -> ReviewContext:
    """Load relevant principles and past learnings for this file."""

    # 1. Domain detection from file path
    domain = detect_domain(file_path)  # e.g., "security", "api", "database"

    # 2. Get principles for this domain
    principles = await memory.get_principles(domain=domain, min_conviction=0.6)

    # 3. Get related past issues (semantic search)
    past_issues = await memory.search(
        query=f"issues in {domain} code similar to {extract_summary(diff)}",
        limit=5,
    )

    # 4. Get project-specific watch rules
    watch_rules = await memory.get_watch_rules(file_pattern=file_path)

    return ReviewContext(
        principles=principles,
        past_issues=past_issues,
        watch_rules=watch_rules,
    )
```

### 6. Output Format

```python
@dataclass
class ReviewResult:
    """Structured review output."""

    # Summary
    overall_assessment: str  # "approve", "request_changes", "needs_discussion"
    summary: str  # 2-3 sentence summary

    # Issues by severity
    blocking_issues: list[Issue]  # Must fix before merge
    warnings: list[Issue]  # Should fix, but not blocking
    suggestions: list[Issue]  # Nice to have improvements

    # Learning opportunities
    new_patterns_detected: list[str]  # Potential new beliefs
    principle_violations: list[PrincipleViolation]  # Existing beliefs violated

    # Metadata
    files_reviewed: int
    files_skipped: int
    total_lines_changed: int
    review_duration_ms: int
    tokens_used: int
    estimated_cost_cents: float
```

## Implementation Phases

### Phase 1: Core Pipeline
- [ ] Git diff parsing and file classification
- [ ] Per-file review with basic chunking
- [ ] Structured output format

### Phase 2: Memory Integration
- [ ] Load relevant principles per domain
- [ ] Check against watch rules
- [ ] Record learnings from reviews

### Phase 3: Cross-file Analysis
- [ ] Tier 3 synthesis layer
- [ ] Architectural pattern detection
- [ ] Cross-module consistency checks

### Phase 4: VS Code Integration
- [ ] Review command in extension
- [ ] Inline annotations for issues
- [ ] Quick-fix suggestions

## API Design

### MCP Tool

```python
@mcp.tool
async def review_code_changes(
    mode: str = "auto",  # "staged", "unstaged", "branch", "auto"
    base_branch: str = "main",  # For branch mode
    max_files: int = 20,  # Limit for cost control
    include_suggestions: bool = True,
    parallel_reviews: int = 5,
) -> ReviewResult:
    """
    Review code changes for issues, violations, and improvements.

    Modes:
    - staged: Review only staged changes (git diff --cached)
    - unstaged: Review only unstaged changes (git diff)
    - branch: Review all changes since base_branch
    - auto: Detect most relevant mode automatically

    Returns structured review with issues categorized by severity.
    """
```

### Extension Command

```typescript
vscode.commands.registerCommand('draagon-forge.reviewChanges', async () => {
    const mode = await vscode.window.showQuickPick([
        { label: 'Auto-detect', value: 'auto' },
        { label: 'Staged changes only', value: 'staged' },
        { label: 'All uncommitted changes', value: 'unstaged' },
        { label: 'Branch vs main', value: 'branch' },
    ]);

    const result = await apiClient.reviewCodeChanges(mode.value);

    // Show results in panel or diagnostics
    panelManager.showReviewResults(result);
});
```

## Cost Analysis

| Scenario | Files | Tokens Est. | Cost (Claude 3.5 Sonnet) |
|----------|-------|-------------|--------------------------|
| Small PR (5 files) | 5 | ~15K | ~$0.05 |
| Medium PR (20 files) | 20 | ~60K | ~$0.20 |
| Large refactor (50 files) | 20 (prioritized) | ~60K | ~$0.20 |
| Huge migration (200 files) | 20 (prioritized) | ~60K | ~$0.20 |

The tiered approach caps costs by reviewing only the most important files.

## Success Criteria

1. **Handles 200+ file changes** without context overflow
2. **Reviews complete in <60 seconds** for typical PRs
3. **Zero false positives on formatting-only changes**
4. **Catches 80%+ of principle violations** detected by human reviewers
5. **Learns from feedback** - flagged issues that get dismissed reduce future false positives
