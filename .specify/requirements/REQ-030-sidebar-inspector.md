# REQ-030: Draagon Forge Sidebar & Real-Time Inspector

**Priority:** P0
**Status:** Draft
**Created:** 2026-01-13
**Dependencies:** REQ-001, REQ-002, REQ-005, REQ-006, REQ-023
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific VS Code extension UI

---

## Overview

The Draagon Forge sidebar provides a comprehensive view into the AI assistant's operations, memory, behaviors, and real-time activity. It serves as both a monitoring dashboard and an interactive control panel for developers using Claude Code alongside the Forge extension.

---

## Sidebar Views Architecture

### Activity Bar Container

```
┌─────────────────────────────────────────┐
│  🔥 Draagon Forge                       │
├─────────────────────────────────────────┤
│  ▼ Chat                    [webview]    │
│    Interactive chat with Forge          │
├─────────────────────────────────────────┤
│  ▼ Inspector               [webview]    │
│    Real-time MCP activity monitor       │
├─────────────────────────────────────────┤
│  ▼ Memory                  [tree]       │
│    Beliefs, learnings, insights         │
├─────────────────────────────────────────┤
│  ▼ Behaviors               [tree]       │
│    Active behaviors by tier             │
├─────────────────────────────────────────┤
│  ▼ Agents                  [tree]       │
│    Running subagents & status           │
├─────────────────────────────────────────┤
│  ▼ Watchlist               [tree]       │
│    Active watch rules & alerts          │
└─────────────────────────────────────────┘
```

---

## Phase 1: Real-Time Inspector (P0)

### 1.1 WebSocket Event Stream

Add WebSocket support to the Python API server for real-time event streaming:

```python
# src/draagon_forge/api/websocket.py

@dataclass
class ForgeEvent:
    """Event emitted by Forge for real-time monitoring."""
    event_type: str  # mcp_call, memory_search, decision, tool_exec, etc.
    timestamp: datetime
    source: str      # "mcp" | "api" | "agent"
    data: dict[str, Any]
    duration_ms: float | None = None

class EventType(Enum):
    # MCP Events
    MCP_TOOL_CALLED = "mcp.tool.called"
    MCP_TOOL_RESULT = "mcp.tool.result"
    MCP_RESOURCE_READ = "mcp.resource.read"

    # Memory Events
    MEMORY_SEARCH = "memory.search"
    MEMORY_STORE = "memory.store"
    MEMORY_RETRIEVE = "memory.retrieve"

    # Agent Events
    AGENT_DECISION = "agent.decision"
    AGENT_ACTION = "agent.action"
    AGENT_THOUGHT = "agent.thought"  # ReAct trace
    AGENT_OBSERVATION = "agent.observation"

    # Behavior Events
    BEHAVIOR_ACTIVATED = "behavior.activated"
    BEHAVIOR_EXECUTED = "behavior.executed"
    BEHAVIOR_EVOLVED = "behavior.evolved"
```

**WebSocket Endpoint:**
```
ws://localhost:8765/ws/events
```

**Event Stream Format:**
```json
{
  "event": "mcp.tool.called",
  "timestamp": "2026-01-13T12:34:56.789Z",
  "source": "mcp",
  "data": {
    "tool": "search_context",
    "args": {"query": "authentication patterns", "limit": 5},
    "user_id": "doug",
    "request_id": "abc123"
  }
}
```

### 1.2 Inspector Panel UI

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Inspector                                    [▶ ⏸ 🗑]   │
├─────────────────────────────────────────────────────────────┤
│  Filter: [All ▼]  [MCP ✓] [Memory ✓] [Agent ✓] [🔍      ]  │
├─────────────────────────────────────────────────────────────┤
│  12:34:56.789  MCP  search_context                 45ms     │
│    └─ query: "authentication patterns"                      │
│    └─ results: 3 beliefs found                              │
├─────────────────────────────────────────────────────────────┤
│  12:34:56.234  AGENT  decision                     12ms     │
│    └─ action: "answer"                                      │
│    └─ confidence: 0.85                                      │
├─────────────────────────────────────────────────────────────┤
│  12:34:55.100  MEMORY  store                       8ms      │
│    └─ type: INSIGHT                                         │
│    └─ content: "User prefers explicit error..."            │
└─────────────────────────────────────────────────────────────┘
```

**Inspector Features:**
- Real-time event stream with auto-scroll
- Filter by event type (MCP, Memory, Agent, Behavior)
- Search events by content
- Click event to expand full request/response
- Pause/resume stream
- Clear history
- Export session log

### 1.3 Request/Response Detail View

Click any event to open detail view:

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Event Detail: search_context                    [✕]     │
├─────────────────────────────────────────────────────────────┤
│  Request:                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ {                                                       ││
│  │   "tool": "search_context",                            ││
│  │   "args": {                                            ││
│  │     "query": "authentication patterns",               ││
│  │     "limit": 5,                                        ││
│  │     "domain": null                                     ││
│  │   }                                                     ││
│  │ }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Response (45ms):                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [                                                       ││
│  │   {                                                     ││
│  │     "id": "belief_001",                                ││
│  │     "content": "Use JWT for stateless auth",          ││
│  │     "conviction": 0.87,                                ││
│  │     "score": 0.92                                      ││
│  │   },                                                    ││
│  │   ...                                                   ││
│  │ ]                                                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 2: Memory Browser (P1)

### 2.1 Memory Tree View

Hierarchical view of all stored memories:

```
▼ 🧠 Memory (47 items)
  ▼ 💡 Beliefs (23)
    ▼ architecture (8)
      ├─ 🔹 Use JWT for stateless auth [0.87]
      ├─ 🔹 Prefer composition over inheritance [0.92]
      └─ 🔹 Always validate at boundaries [0.78]
    ▼ testing (6)
      ├─ 🔹 Test behavior, not implementation [0.95]
      └─ ...
    ▼ security (9)
      └─ ...
  ▼ 📚 Learnings (15)
    └─ ...
  ▼ 🔮 Insights (9)
    └─ ...
```

**Tree Item Context Menu:**
- View Details
- Reinforce (+0.05)
- Weaken (-0.08)
- Edit Content
- Delete
- View Related
- Copy to Clipboard

### 2.2 Memory Search Panel

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search Memory                                           │
├─────────────────────────────────────────────────────────────┤
│  [authentication patterns                              🔍]   │
├─────────────────────────────────────────────────────────────┤
│  Type: [All ▼]  Domain: [All ▼]  Min Conviction: [0.5 ═══] │
├─────────────────────────────────────────────────────────────┤
│  Results (3):                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 💡 Use JWT for stateless authentication              │  │
│  │ Conviction: ████████░░ 0.87  Domain: architecture    │  │
│  │ Source: learned  Used: 12 times                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 💡 Validate tokens on every request                  │  │
│  │ Conviction: █████████░ 0.92  Domain: security        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Add Belief Form

```
┌─────────────────────────────────────────────────────────────┐
│  ➕ Add Belief                                       [✕]    │
├─────────────────────────────────────────────────────────────┤
│  Content:                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Always use parameterized queries for database access   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Category: [Principle ▼]    Domain: [security ▼]           │
│                                                             │
│  Initial Conviction: [0.8 ════════════════]                │
│                                                             │
│  Source: [Manual Entry ▼]                                   │
│                                                             │
│                                        [Cancel] [Add Belief]│
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Behavior Registry (P1)

### 3.1 Behavior Tree View

```
▼ ⚡ Behaviors (34)
  ▼ 🔴 CORE (5)
    ├─ ✅ error-recovery [ACTIVE]
    ├─ ✅ context-gathering [ACTIVE]
    └─ ✅ safety-checks [ACTIVE]
  ▼ 🟠 ADDON (12)
    ├─ ✅ code-review [ACTIVE]
    ├─ ⏸ security-scan [TESTING]
    └─ 📝 pr-analysis [DRAFT]
  ▼ 🟡 APPLICATION (8)
    └─ ...
  ▼ 🟢 GENERATED (6)
    └─ ...
  ▼ 🔵 EXPERIMENTAL (3)
    └─ ...
```

**Tier Legend:**
- 🔴 CORE: Cannot be disabled, critical for operation
- 🟠 ADDON: Optional built-in behaviors
- 🟡 APPLICATION: Project-specific behaviors
- 🟢 GENERATED: Auto-evolved behaviors
- 🔵 EXPERIMENTAL: Under development

**Lifecycle States:**
- 📝 DRAFT: Being designed
- ⏸ TESTING: Running tests
- 🔄 STAGING: Validation phase
- ✅ ACTIVE: Production use
- ⚠️ DEPRECATED: Phasing out

### 3.2 Behavior Detail Panel

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Behavior: code-review                            [✕]    │
├─────────────────────────────────────────────────────────────┤
│  Status: ✅ ACTIVE    Tier: 🟠 ADDON    Version: 1.2.0     │
│                                                             │
│  Description:                                               │
│  Reviews code changes for bugs, security issues, and        │
│  adherence to project patterns.                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Triggers:                                                  │
│  • File save with language: [ts, py, go]                   │
│  • Git pre-commit hook                                      │
│  • Manual invocation                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                   │
│  • analyze_code → check patterns                            │
│  • find_issues → categorize by severity                     │
│  • suggest_fixes → provide solutions                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Performance:                                               │
│  Success Rate: ████████░░ 85%    Avg Time: 1.2s            │
│  Invocations: 234    Last Used: 2 hours ago                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Evolution History:                                         │
│  v1.0.0 → v1.1.0: +7% accuracy (prompt refinement)        │
│  v1.1.0 → v1.2.0: +5% accuracy (added context)            │
│                                                             │
│  [View Tests]  [Run Tests]  [Edit]  [Promote]  [Disable]   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Behavior Graph Visualization

WebView with D3.js or vis.js visualization:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Behavior Graph                      [Zoom: 100%] [⟲]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ┌──────────┐                                        │
│         │  CORE    │                                        │
│         │ safety   │                                        │
│         └────┬─────┘                                        │
│              │                                              │
│    ┌─────────┼─────────┐                                   │
│    │         │         │                                    │
│    ▼         ▼         ▼                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐                                │
│ │review│ │security│ │test │                               │
│ └──┬───┘ └──┬────┘ └──┬──┘                                │
│    │        │         │                                     │
│    └────────┼─────────┘                                    │
│             ▼                                               │
│       ┌──────────┐                                         │
│       │ pr-check │                                         │
│       └──────────┘                                         │
│                                                             │
│  Legend: ───▶ triggers  ···▶ depends on                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Agent Monitor (P2)

### 4.1 Active Agents View

Monitor subagents spawned by Forge:

```
▼ 🤖 Agents (3 active)
  ├─ 🟢 code-review-agent [running] 12.3s
  │    └─ Reviewing src/auth/login.ts
  ├─ 🟡 security-scanner [pending]
  │    └─ Queued for: 5 files
  └─ 🔴 test-generator [error]
       └─ Failed: timeout after 30s
```

**Agent States:**
- 🟢 Running: Currently executing
- 🟡 Pending: Queued for execution
- ⏸ Paused: Temporarily suspended
- ✅ Completed: Finished successfully
- 🔴 Error: Failed with error

### 4.2 Agent Detail View

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 code-review-agent                               [✕]     │
├─────────────────────────────────────────────────────────────┤
│  Status: 🟢 Running    Elapsed: 12.3s    Progress: 60%     │
│                                                             │
│  Task: Review code changes in src/auth/login.ts            │
│                                                             │
│  ReAct Trace:                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 💭 THOUGHT: Analyzing authentication flow...           ││
│  │ 🔧 ACTION: analyze_code(file="login.ts")               ││
│  │ 👁 OBSERVATION: Found 3 potential issues               ││
│  │ 💭 THOUGHT: Checking for SQL injection...              ││
│  │ 🔧 ACTION: check_security(pattern="sql_injection")     ││
│  │ 👁 OBSERVATION: No SQL injection found                 ││
│  │ 💭 THOUGHT: Reviewing error handling...                ││
│  │ ▶ [In Progress]                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Memory Access:                                             │
│  • Retrieved 5 beliefs about authentication                 │
│  • Stored 1 new insight                                     │
│                                                             │
│  [Pause]  [Stop]  [View Full Log]                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Should Forge Run Independent Agents?

**Question:** Should Forge spawn its own subagents outside of Claude Code?

**Recommendation:** Yes, with caveats:

| Scenario | Agent Source | Rationale |
|----------|--------------|-----------|
| Claude Code is actively working | MCP tools only | Don't interfere with user's active session |
| Background tasks (PR review, security scan) | Forge agents | Proactive analysis |
| User explicitly requests | Forge agents | Direct user action |
| Continuous monitoring (watchlist) | Forge agents | Real-time protection |

**Implemented as:**
- Forge agents run in background, lower priority than Claude Code
- MCP tools remain Claude Code's interface to Forge capabilities
- User can see both Claude Code's activity AND Forge's independent activity in Inspector

---

## Phase 5: Watchlist & Alerts (P2)

### 5.1 Watchlist Tree View

```
▼ 👁 Watchlist (8 rules)
  ▼ 🔴 Block (2)
    ├─ 🚫 No hardcoded secrets [4 triggers]
    └─ 🚫 No SQL injection patterns [0 triggers]
  ▼ 🟠 Warn (4)
    ├─ ⚠️ Avoid regex for semantic tasks [12 triggers]
    ├─ ⚠️ Test coverage required [3 triggers]
    └─ ...
  ▼ 🟢 Suggest (2)
    └─ ...
```

### 5.2 Recent Alerts Panel

```
┌─────────────────────────────────────────────────────────────┐
│  🔔 Recent Alerts (5)                            [Clear]    │
├─────────────────────────────────────────────────────────────┤
│  🔴 12:34:56  Blocked: Hardcoded API key detected          │
│     └─ src/config/api.ts:23 • Show Fix                     │
├─────────────────────────────────────────────────────────────┤
│  🟠 12:30:22  Warning: Using regex for intent detection    │
│     └─ src/parser/intent.ts:45 • Ignore Once • Add Exception│
├─────────────────────────────────────────────────────────────┤
│  🟢 12:28:11  Suggestion: Consider adding error boundary   │
│     └─ src/components/App.tsx:12                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Add WebSocket support to API server
- [ ] Create event emission infrastructure in MCP tools
- [ ] Build Inspector webview panel
- [ ] Implement event filtering and search
- [ ] Add request/response detail view

### Phase 2: Memory (Week 3-4)
- [ ] Create Memory tree view provider
- [ ] Implement memory search panel
- [ ] Add belief CRUD operations
- [ ] Build conviction adjustment UI
- [ ] Add memory export/import

### Phase 3: Behaviors (Week 5-6)
- [ ] Create Behavior tree view provider
- [ ] Implement behavior detail panel
- [ ] Add behavior lifecycle management
- [ ] Build behavior graph visualization
- [ ] Integrate with draagon-ai BehaviorArchitect

### Phase 4: Agents (Week 7-8)
- [ ] Create Agent tree view provider
- [ ] Implement agent detail view with ReAct trace
- [ ] Add background agent management
- [ ] Build agent start/stop/pause controls
- [ ] Show memory access in real-time

### Phase 5: Watchlist (Week 9-10)
- [ ] Create Watchlist tree view provider
- [ ] Implement alerts panel
- [ ] Add watch rule CRUD
- [ ] Build inline alert actions
- [ ] Integrate with real-time monitor

---

## Technical Requirements

### Python API Server Additions

```python
# New files:
src/draagon_forge/api/websocket.py  # WebSocket endpoint
src/draagon_forge/api/events.py     # Event types and emission

# Event emission in existing code:
# - MCP tools emit events on call/result
# - Memory operations emit events
# - Agent decisions emit events
```

### VS Code Extension Additions

```typescript
// New files:
src/extension/providers/InspectorViewProvider.ts
src/extension/providers/MemoryViewProvider.ts
src/extension/providers/BehaviorViewProvider.ts
src/extension/providers/AgentViewProvider.ts
src/extension/providers/WatchlistViewProvider.ts

// New webview:
src/extension/webview/inspector/
src/extension/webview/behavior-graph/
```

### package.json Additions

```json
{
  "views": {
    "draagon-forge": [
      {"type": "webview", "id": "draagon-forge.chat", "name": "Chat"},
      {"type": "webview", "id": "draagon-forge.inspector", "name": "Inspector"},
      {"type": "tree", "id": "draagon-forge.memory", "name": "Memory"},
      {"type": "tree", "id": "draagon-forge.behaviors", "name": "Behaviors"},
      {"type": "tree", "id": "draagon-forge.agents", "name": "Agents"},
      {"type": "tree", "id": "draagon-forge.watchlist", "name": "Watchlist"}
    ]
  }
}
```

---

## Dependencies from draagon-ai-vscode

Features to port:
- `providers/accountViewProvider.ts` - Account/auth view pattern
- `providers/memoryViewProvider.ts` - Memory tree view pattern
- `providers/agentsViewProvider.ts` - Agent tree view pattern
- `memory/client.ts` - WebSocket client with reconnect logic
- `ui/webview/content.ts` - Webview HTML generation patterns

---

## Success Criteria

1. **Inspector:** Real-time visibility into all MCP calls with <100ms latency
2. **Memory:** Full CRUD on beliefs with conviction adjustment
3. **Behaviors:** View and manage all behavior tiers and lifecycles
4. **Agents:** Monitor background agents with ReAct trace visibility
5. **Watchlist:** See active rules and recent alerts

---

## References

- REQ-001: MCP Context Server
- REQ-002: VS Code Extension Core
- REQ-005: Belief Manager
- REQ-006: Watchlist & Real-Time Monitor
- REQ-023: Behavior Architect
- REQ-024: Behavior Evolution
- draagon-ai-vscode: Reference implementation
