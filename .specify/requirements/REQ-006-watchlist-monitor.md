# REQ-006: Watchlist & Real-Time Monitor

**Priority:** P1
**Effort:** High (8 days)
**Dependencies:** REQ-001, REQ-002, REQ-003
**Blocks:** REQ-011
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific code monitoring

---

## Overview

Build a real-time monitoring system that watches for specific patterns, violations, and anti-patterns in code as it's being written, with configurable severity levels and actions.

### Purpose

The Watchlist & Real-Time Monitor allows developers to:
- Define what patterns to watch for (natural language or regex)
- Set severity levels (block, warn, suggest)
- Receive immediate alerts when violations occur
- Block saves that violate critical rules
- Configure project-wide or file-specific rules

---

## Requirements

### REQ-006.1: Watch Rule Configuration UI

```
┌─────────────────────────────────────────────────────────────────┐
│  👁️ Watchlist & Prevention Rules                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚠️ ACTIVE WATCHES                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 BLOCK: Regex for semantic tasks                      │   │
│  │     Pattern: re.match|re.search|re.findall              │   │
│  │     In files: cognition/, orchestration/                 │   │
│  │     Action: Block save + Show warning                    │   │
│  │     Triggered: 3 times today                             │   │
│  │                                             [Edit] [❌]  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  🟡 WARN: Bare except clauses                            │   │
│  │     Pattern: except:                                     │   │
│  │     Action: Warning notification                         │   │
│  │     Triggered: 1 time today                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ➕ Add New Watch Rule                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  What to watch for:                                      │   │
│  │  [Prevent using eval() or exec() anywhere___________]   │   │
│  │                                                          │   │
│  │  Severity: [🔴 Block ▼]  Files: [**/*.py_________]      │   │
│  │                                                          │   │
│  │  [Add Watch Rule]                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] List all active watch rules
- [ ] Show trigger count per rule
- [ ] Edit and delete rules
- [ ] Add rules via form
- [ ] Add rules via natural language

### REQ-006.2: Watch Rule Data Model

```python
@dataclass
class WatchRule:
    id: str
    name: str
    description: str
    severity: str  # "block" | "warn" | "suggest"
    detection_type: str  # "pattern" | "semantic" | "structural"

    # For pattern-based detection
    pattern: str | None = None

    # For semantic detection (LLM-based)
    semantic_description: str | None = None

    # Scope
    file_patterns: list[str] = field(default_factory=lambda: ["**/*"])
    exclude_patterns: list[str] = field(default_factory=list)

    # Actions
    block_save: bool = False
    show_inline: bool = True
    notification: bool = True

    # Metadata
    created_by: str = "user"
    triggered_count: int = 0
    last_triggered: datetime | None = None
```

**Acceptance Criteria:**
- [ ] All fields persisted
- [ ] Severity determines default actions
- [ ] Detection type determines evaluation method
- [ ] Scope filters correctly apply

### REQ-006.3: Natural Language Rule Creation

```
User: "Watch for any hardcoded API keys or secrets in the code"
Draagon: "Added semantic watch rule 'Hardcoded Secrets Detection':
  - Severity: 🔴 BLOCK
  - Detection: Semantic (LLM-based pattern recognition)
  - Scope: All files
  - Action: Block save + notification

  I'll watch for patterns like:
  • API_KEY = "sk-..."
  • password = "..."
  • Inline credentials in URLs

  Should I also check for .env files that might be staged for commit?"
```

**Acceptance Criteria:**
- [ ] Understands natural language descriptions
- [ ] Suggests appropriate severity
- [ ] Generates regex patterns when applicable
- [ ] Creates semantic descriptions for complex rules
- [ ] Confirms rule creation

### REQ-006.4: Real-Time Monitoring

```python
class RealTimeMonitor:
    async def on_text_change(self, file_path: str, content: str):
        """Called on every text change (debounced)."""
        violations = await self.evaluate_code(file_path, content)
        await self.update_inline_hints(file_path, violations)

    async def on_pre_save(self, file_path: str, content: str) -> SaveDecision:
        """Called before file save - can block."""
        violations = await self.evaluate_code(file_path, content, is_save=True)
        blocking = [v for v in violations if v.rule.block_save]

        if blocking:
            await self.show_blocking_alert(blocking)
            return SaveDecision(allow=False, violations=blocking)

        return SaveDecision(allow=True)
```

**Acceptance Criteria:**
- [ ] Evaluates on text change (debounced 500ms)
- [ ] Evaluates on pre-save
- [ ] Can block saves for blocking violations
- [ ] Shows inline hints for all severities
- [ ] Notifications for warn/block

### REQ-006.5: Alert UI

```
┌─────────────────────────────────────────────────────────────────┐
│  🚨 REAL-TIME ALERTS                                 [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 BLOCKED at 2:34 PM                                   │   │
│  │  File: src/cognition/analyzer.py:45                      │   │
│  │                                                          │   │
│  │  Detected: re.match(r"user said (.+)", text)            │   │
│  │                                                          │   │
│  │  ⚠️ This violates: "Never use regex for semantic tasks" │   │
│  │                                                          │   │
│  │  Suggestion: Use LLM to extract user intent instead     │   │
│  │                                                          │   │
│  │  [Show Fix] [Ignore Once] [Add Exception] [Dismiss]     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Shows all recent alerts
- [ ] Alert includes file, line, matched text
- [ ] Shows violated rule
- [ ] Provides actionable suggestions
- [ ] Action buttons functional

### REQ-006.6: Detection Types

**Pattern Detection:**
```python
matches = re.finditer(rule.pattern, content)
for match in matches:
    line_num = content[:match.start()].count('\n') + 1
    violations.append(WatchViolation(rule=rule, line=line_num, matched=match.group()))
```

**Semantic Detection:**
```python
result = await llm.chat([{
    "role": "user",
    "content": f"""
    Does this code violate the rule: "{rule.semantic_description}"?

    Code:
    {content}

    Output XML:
    <analysis>
      <violates>true|false</violates>
      <locations>Line numbers</locations>
      <explanation>Why it violates</explanation>
    </analysis>
    """
}])
```

**Structural Detection:**
```python
tree = ast.parse(content)
for node in ast.walk(tree):
    if rule.check_node(node):
        violations.append(WatchViolation(rule=rule, line=node.lineno))
```

**Acceptance Criteria:**
- [ ] Pattern detection uses regex
- [ ] Semantic detection uses LLM
- [ ] Structural detection uses AST
- [ ] All types can be combined
- [ ] Detection type chosen based on rule

---

## Technical Design

### VS Code Integration

```typescript
// src/extension/monitor/realTimeMonitor.ts

class RealTimeMonitor implements vscode.Disposable {
    private decorationType: vscode.TextEditorDecorationType;
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(private mcpClient: MCPClient) {
        // Set up text change listener
        vscode.workspace.onDidChangeTextDocument(
            debounce(this.onDocumentChange.bind(this), 500)
        );

        // Set up pre-save listener
        vscode.workspace.onWillSaveTextDocument(this.onWillSave.bind(this));

        // Set up inline decorations
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                color: new vscode.ThemeColor('editorWarning.foreground'),
            }
        });

        // Set up diagnostics
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('draagon-forge');
    }

    private async onWillSave(event: vscode.TextDocumentWillSaveEvent): Promise<void> {
        const document = event.document;
        const violations = await this.mcpClient.callTool('evaluate_watch_rules', {
            file_path: document.uri.fsPath,
            content: document.getText(),
            is_save: true,
        });

        const blocking = violations.filter((v: any) => v.rule.severity === 'block');

        if (blocking.length > 0) {
            // Show modal warning
            const action = await vscode.window.showWarningMessage(
                `Save blocked by ${blocking.length} watch rule(s)`,
                'View Issues', 'Save Anyway', 'Cancel'
            );

            if (action !== 'Save Anyway') {
                throw new Error('Save blocked by watch rules');
            }
        }
    }
}
```

### MCP Tools

```python
@mcp.tool
async def add_watch_rule(
    description: str,
    severity: str = "warn",
    file_patterns: list[str] | None = None,
) -> WatchRule:
    """Add a new watch rule from natural language description."""

@mcp.tool
async def get_watch_rules(
    file_pattern: str | None = None,
) -> list[WatchRule]:
    """Get all watch rules, optionally filtered by file pattern."""

@mcp.tool
async def update_watch_rule(
    rule_id: str,
    description: str | None = None,
    severity: str | None = None,
    file_patterns: list[str] | None = None,
    enabled: bool | None = None,
) -> dict:
    """Update an existing watch rule.

    Returns explicit status with previous and new values.
    """

@mcp.tool
async def delete_watch_rule(
    rule_id: str,
    reason: str | None = None,
) -> dict:
    """Delete a watch rule (soft delete).

    Returns explicit deletion confirmation.
    """

@mcp.tool
async def evaluate_watch_rules(
    file_path: str,
    content: str,
    is_save: bool = False,
) -> list[WatchViolation]:
    """Evaluate code against all applicable watch rules."""

@mcp.tool
async def add_watch_exception(
    rule_id: str,
    file_path: str,
    reason: str,
) -> dict:
    """Add an exception for a specific file to a watch rule."""

@mcp.tool
async def get_recent_alerts(
    limit: int = 20,
    severity: str | None = None,
) -> list[dict]:
    """Get recent alert history for visibility."""

@mcp.tool
async def dismiss_alert(
    alert_id: str,
    action: str,  # "ignore_once" | "add_exception" | "disable_rule"
    reason: str | None = None,
) -> dict:
    """Dismiss an alert with specified action."""
```

---

## Testing

### Unit Tests

- Test pattern matching
- Test file pattern filtering
- Test severity → action mapping
- Test rule persistence

### Integration Tests

- Test save blocking
- Test inline hint display
- Test notification display
- Test natural language rule creation

### Acceptance Tests

- Block rule prevents save
- Warn rule shows notification
- Suggest rule shows inline hint
- Rules persist across sessions
- Natural language creates correct rules

---

## Acceptance Checklist

- [ ] Watch rule UI functional
- [ ] All three detection types working
- [ ] Save blocking functional
- [ ] Inline hints displayed
- [ ] Notifications working
- [ ] Natural language rule creation
- [ ] CRUD completeness: Create, Read, Update, Delete for watch rules
- [ ] Exception management functional
- [ ] Alert history and dismissal functional
- [ ] All mutations return explicit status with ID and persistence
- [ ] Tests passing
- [ ] Agent-native audit checklist passed for this component

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| LLM-First Architecture | ✅ | Semantic detection uses LLM |
| Protocol-Based Design | ✅ | MCP tools |
| Async-First Processing | ✅ | All I/O async |

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
