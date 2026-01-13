# REQ-011: Developer Commit Auditor

**Priority:** P1
**Effort:** High (7 days)
**Dependencies:** REQ-001, REQ-003, REQ-005, REQ-006
**Blocks:** REQ-012
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific git audit

---

## Overview

Build a commit auditor that reviews commits from any developer (including Claude Code) against stored beliefs and watch rules, with dashboard visualization and continuous monitoring.

### Purpose

The Developer Commit Auditor allows teams to:
- Audit any developer's commits against beliefs and rules
- Review Claude Code's generated code for compliance
- Track violation patterns across developers
- Generate actionable feedback for improvement
- Continuously monitor repositories for issues

---

## Requirements

### REQ-011.1: Single Commit Audit

```python
async def audit_commit(
    repo: str,
    commit_sha: str,
    author: str | None = None,
) -> CommitAuditResult:
    """Audit a single commit against all rules and beliefs."""
```

**Checks Performed:**
1. Watch rule violations (pattern, semantic, structural)
2. Belief violations (stored principles)
3. Semantic analysis for anti-patterns
4. Architectural impact (multi-file changes)

**Acceptance Criteria:**
- [ ] Fetches commit diff from GitHub
- [ ] Evaluates all applicable watch rules
- [ ] Checks against relevant beliefs
- [ ] Returns structured audit result
- [ ] Includes severity levels per issue

### REQ-011.2: Developer History Audit

```python
async def audit_developer_history(
    repo: str,
    developer: str,
    since: datetime | None = None,
    limit: int = 50,
) -> DeveloperAuditReport:
    """Audit a developer's recent commits."""
```

**Report Contents:**
- Commits audited count
- Total issues found
- Issue breakdown by type
- Violation patterns
- Recommendations for improvement

**Acceptance Criteria:**
- [ ] Fetches developer's commit history
- [ ] Audits each commit
- [ ] Aggregates patterns
- [ ] Generates recommendations
- [ ] Produces structured report

### REQ-011.3: Audit Dashboard UI

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Commit Audit Dashboard                           [Refresh]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Recent Commits (draagon-ai)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ✅ abc123 - "Fix memory leak" by @alice     2 min ago  │   │
│  │     No issues found                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  ⚠️ def456 - "Add search feature" by @bob    15 min ago │   │
│  │     2 warnings: missing type hints, long function        │   │
│  │     [View Details]                                       │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  🔴 ghi789 - "Quick fix" by @claude-code     1 hour ago │   │
│  │     1 error: Regex used for semantic task                │   │
│  │     [View Details] [Create Issue]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Developer Statistics (Last 30 Days)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Developer     Commits  Issues  Avg Score                │   │
│  │  @alice        45       3       98%                       │   │
│  │  @bob          32       12      89%                       │   │
│  │  @claude-code  128      8       94%                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Common Patterns                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • Missing type hints in new functions (23 occurrences) │   │
│  │  • Long functions (>50 lines) in handlers/ (8 times)    │   │
│  │  • Bare except clauses (5 times)                         │   │
│  │                                                          │   │
│  │  [Generate Training Recommendations]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Shows recent commits with status
- [ ] Developer statistics table
- [ ] Common violation patterns
- [ ] Click-through to commit details
- [ ] Action buttons (create issue, view)

### REQ-011.4: Claude Code Specific Auditing

```python
class ClaudeCodeCommitAuditor(DeveloperCommitAuditor):
    """Specialized auditor for Claude Code generated commits."""

    async def audit_claude_code_session(
        self,
        session_id: str,
    ) -> SessionAuditReport:
        """Audit all changes from a Claude Code session."""

    async def generate_claude_code_feedback(
        self,
        patterns: list[ViolationPattern],
    ) -> ClaudeCodeFeedback:
        """Generate actionable feedback for improving Claude Code behavior."""
```

**Feedback Includes:**
- Suggested principles to add
- Suggested watch rules
- CLAUDE.md additions

**Acceptance Criteria:**
- [ ] Identifies Claude Code commits
- [ ] Analyzes patterns across sessions
- [ ] Generates CLAUDE.md additions
- [ ] Suggests new watch rules

### REQ-011.5: Continuous Monitoring

```python
async def continuous_commit_monitoring(repos: list[str]):
    """Background task to monitor commits in real-time."""

    while True:
        for repo in repos:
            new_commits = await github.get_commits(repo, since=last_check[repo])

            for commit in new_commits:
                result = await audit_commit(repo, commit.sha)

                if result.issues:
                    await notify_issues(result)

                    if any(i.severity == "error" for i in result.issues):
                        await create_issue_comment(result)

            last_check[repo] = datetime.now()

        await asyncio.sleep(300)  # Check every 5 minutes
```

**Acceptance Criteria:**
- [ ] Polls for new commits periodically
- [ ] Audits each new commit
- [ ] Notifies on issues found
- [ ] Creates GitHub comments for critical issues
- [ ] Configurable check interval

### REQ-011.6: Notification Integration

**Notification Channels:**
- VS Code notification
- Slack webhook (optional)
- GitHub issue comment

**Acceptance Criteria:**
- [ ] VS Code notifications for all issues
- [ ] Slack notifications (if configured)
- [ ] GitHub comments for critical issues
- [ ] Configurable notification preferences

---

## Technical Design

### Data Models

```python
@dataclass
class CommitAuditResult:
    commit: str
    author: str
    repo: str
    files_changed: list[str]
    issues: list[CommitIssue]
    passed: bool
    summary: str

@dataclass
class CommitIssue:
    type: str  # "watch_violation" | "belief_violation" | "anti_pattern"
    severity: str  # "error" | "warn" | "info"
    file: str
    line: int | None
    description: str
    rule: str | None = None
    belief: str | None = None
    belief_conviction: float | None = None
    matched_text: str | None = None

@dataclass
class DeveloperAuditReport:
    developer: str
    repo: str
    commits_audited: int
    total_issues: int
    issue_breakdown: dict[str, int]
    patterns: list[ViolationPattern]
    recommendations: list[str]

@dataclass
class ViolationPattern:
    description: str
    frequency: int
    severity: str
    suggested_pattern: str | None
    affected_files: list[str]
```

### MCP Tools

```python
@mcp.tool
async def audit_commit(
    repo: str,
    commit_sha: str,
) -> CommitAuditResult:
    """Audit a single commit."""

@mcp.tool
async def audit_developer(
    repo: str,
    developer: str,
    days: int = 30,
    limit: int = 50,
) -> DeveloperAuditReport:
    """Audit a developer's recent commits."""

@mcp.tool
async def get_audit_statistics(
    repo: str,
    days: int = 30,
) -> dict:
    """Get audit statistics for a repository."""
```

### VS Code Panel

```typescript
// src/extension/panel/AuditPanel.ts

class AuditPanel {
    private commits: CommitAuditResult[] = [];
    private statistics: DeveloperStats[] = [];

    async refresh(): Promise<void> {
        this.commits = await this.mcpClient.callTool('get_recent_audits', {
            repo: this.activeRepo,
            limit: 20,
        });
        this.statistics = await this.mcpClient.callTool('get_audit_statistics', {
            repo: this.activeRepo,
        });
        this.updateWebview();
    }

    async auditCommit(sha: string): Promise<void> {
        const result = await this.mcpClient.callTool('audit_commit', {
            repo: this.activeRepo,
            commit_sha: sha,
        });
        this.showAuditResult(result);
    }
}
```

---

## Testing

### Unit Tests

- Test commit audit logic
- Test pattern aggregation
- Test severity classification
- Test recommendation generation

### Integration Tests

- Test GitHub API integration
- Test audit → notification flow
- Test continuous monitoring

### Acceptance Tests

- Audit identifies known issues
- Dashboard shows correct data
- Notifications delivered
- Claude Code feedback accurate

---

## Acceptance Checklist

- [ ] Single commit audit working
- [ ] Developer history audit working
- [ ] Dashboard UI functional
- [ ] Claude Code specific auditing
- [ ] Continuous monitoring running
- [ ] Notifications delivered
- [ ] Tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Semantic analysis via LLM |
| Protocol-Based Design | ✅ | GitHub API, MCP |
| Async-First Processing | ✅ | All I/O async |

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
