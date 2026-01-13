# Draagon Forge - Claude Context

**Last Updated:** 2026-01-13
**Version:** 0.1.0
**Project:** AI Development Companion for intelligent, learning, proactive coding assistance

---

## Project Overview

Draagon Forge is an AI Development Companion that provides intelligent, learning, proactive assistance throughout the software development lifecycle. It consists of:

1. **MCP Context Server** - Semantic memory for Claude Code integration
2. **VS Code Extension** - Watches, learns, and interacts during development
3. **Autonomous Agents** - Cross-check code, review PRs, find architectural issues
4. **Curiosity Engine** - Proactively researches and asks clarifying questions
5. **GitHub Integration** - Cross-repo architectural analysis and issue detection
6. **Feedback Loops** - Continuous learning from developer corrections and outcomes

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Tell Draagon What to Watch** | Natural language rules: "Prevent regex for semantic tasks" |
| **Real-Time Alerts** | Immediate notifications when problems arise during coding |
| **Block Dangerous Patterns** | Prevent saves that violate critical beliefs |
| **Query & Adjust Beliefs** | "What do you believe about X?" + reinforce/weaken/modify |
| **Audit Any Developer** | Review commits from Claude Code or other team members |
| **Claude Code Specific Feedback** | Generate CLAUDE.md additions based on patterns |

### Vision Statement

> "An AI that doesn't just generate code, but understands your architecture, learns from your decisions, catches your mistakes, and grows smarter with every commit."

---

## Architecture

```
draagon-forge/
├── src/
│   ├── extension/              # VS Code extension (TypeScript)
│   │   ├── watcher/            # File/terminal/git observation
│   │   ├── learner/            # Pattern extraction, correction detection
│   │   ├── panel/              # UI panels (chat, context, beliefs)
│   │   ├── curiosity/          # Question generation
│   │   ├── monitor/            # Real-time watchlist
│   │   └── audit/              # Commit auditing
│   ├── mcp/                    # MCP server (Python)
│   │   ├── server.py           # FastMCP entry point
│   │   ├── tools/              # MCP tool implementations
│   │   ├── resources/          # MCP resources
│   │   └── prompts/            # MCP prompts
│   ├── agents/                 # Autonomous agents (Python)
│   │   ├── code_review.py
│   │   ├── pr_analyzer.py
│   │   ├── architectural_auditor.py
│   │   └── research.py
│   └── webview/                # Extension webview UI
├── tests/                      # Test suites
├── .specify/                   # Spec kit
│   ├── constitution.md
│   ├── requirements/
│   ├── plans/
│   └── tasks/
├── .vscode/                    # VS Code config
├── .github/                    # GitHub Actions
├── CLAUDE.md                   # This file
├── package.json                # Extension manifest
└── tsconfig.json               # TypeScript config
```

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DRAAGON FORGE                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         VS CODE EXTENSION                                │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │   Watcher   │ │  Learner    │ │ Interactive │ │    Curiosity    │   │   │
│  │  │  (observe)  │ │ (patterns)  │ │   Panel     │ │     Engine      │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────────┐   │   │
│  │  │   Belief    │ │  Watchlist  │ │        Commit Auditor           │   │   │
│  │  │  Manager    │ │  Monitor    │ │   (Claude Code + Developers)    │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────────────────────────┘   │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                        MCP CONTEXT SERVER                                │   │
│  │  ┌─────────────┐ ┌─────────────┐ │ ┌─────────────┐ ┌─────────────────┐  │   │
│  │  │   Search    │ │  Conflict   │ │ │  Learning   │ │    Feedback     │  │   │
│  │  │   Context   │ │  Detection  │ │ │   Storage   │ │      Loop       │  │   │
│  │  └─────────────┘ └─────────────┘ │ └─────────────┘ └─────────────────┘  │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐   │
│  │                       AUTONOMOUS AGENTS                                  │   │
│  │  ┌─────────────┐ ┌─────────────┐ │ ┌─────────────┐ ┌─────────────────┐  │   │
│  │  │   Code      │ │    PR       │ │ │ Architectural│ │    Research     │  │   │
│  │  │  Reviewer   │ │  Analyzer   │ │ │   Auditor    │ │     Agent       │  │   │
│  │  └─────────────┘ └─────────────┘ │ └─────────────┘ └─────────────────┘  │   │
│  └──────────────────────────────────┼──────────────────────────────────────┘   │
│                                     │                                           │
│  ┌──────────────────────────────────┴──────────────────────────────────────┐   │
│  │                         SEMANTIC KNOWLEDGE BASE                          │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐     │   │
│  │  │      Neo4j Graph        │    │         Qdrant Vectors          │     │   │
│  │  │  - Principles           │    │  - Embeddings (mxbai-embed)     │     │   │
│  │  │  - Patterns             │    │  - Semantic search              │     │   │
│  │  │  - Learnings            │    │  - Code similarity              │     │   │
│  │  └─────────────────────────┘    └─────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### LLM-First Architecture (CRITICAL)

**NEVER use regex or keyword patterns for semantic understanding.** The LLM handles ALL semantic analysis:

| Task | WRONG | RIGHT |
|------|-------|-------|
| Detect user corrections | Regex patterns | LLM analyzes intent semantically |
| Classify intents | Keyword matching | LLM decision prompt |
| Parse natural language rules | Regex extraction | LLM structured extraction |
| Detect anti-patterns | Pattern matching alone | Semantic + pattern hybrid |

**Exception (Non-Semantic Tasks):**
- Security blocklist patterns (watch rule patterns for fast matching)
- Structural detection (AST-based checks)
- URL/email validation

### XML Output Format for LLM Prompts

**ALWAYS use XML format for LLM output, NOT JSON.**

```xml
<response>
  <action>action_name</action>
  <reasoning>Why this action was chosen</reasoning>
  <content>The extracted or generated content</content>
  <confidence>0.9</confidence>
</response>
```

### Belief System

All learned knowledge is stored as beliefs with conviction scores:

- **Conviction**: 0.0 - 1.0 (how strongly held)
- **Reinforcement**: +0.05 per positive outcome
- **Weakening**: -0.08 per negative outcome
- **Threshold**: 0.9+ for blocking actions

### Watch Rule Severity Levels

| Severity | Action | Use Case |
|----------|--------|----------|
| `block` | Prevent save, require fix | Critical violations |
| `warn` | Notification, allow proceed | Best practice deviations |
| `suggest` | Inline hint only | Style/improvement suggestions |

---

## Development Guidelines

### VS Code Extension (TypeScript)

#### Project Structure

```
src/extension/
├── extension.ts          # Entry point, activation/deactivation
├── constants.ts          # Extension-wide constants
├── watcher/
│   ├── index.ts          # Watcher module entry
│   ├── fileWatcher.ts    # File save/change observation
│   ├── terminalWatcher.ts# Terminal command observation
│   └── gitWatcher.ts     # Git operation observation
├── learner/
│   ├── index.ts
│   ├── correctionDetector.ts
│   └── patternExtractor.ts
├── panel/
│   ├── ChatPanel.ts      # Main chat interface
│   ├── BeliefPanel.ts    # Belief manager UI
│   ├── WatchlistPanel.ts # Watch rule configuration
│   └── AuditPanel.ts     # Commit audit dashboard
├── curiosity/
│   └── engine.ts
├── monitor/
│   ├── realTimeMonitor.ts
│   └── watchlistManager.ts
├── audit/
│   └── commitAuditor.ts
└── mcp/
    └── client.ts         # MCP client for server communication
```

#### Activation Best Practices

```typescript
// extension.ts
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        // 1. Initialize core services first
        const mcpClient = await initializeMCPClient();

        // 2. Register disposables
        context.subscriptions.push(
            mcpClient,
            new FileWatcher(mcpClient),
            new RealTimeMonitor(mcpClient),
            ...registerCommands(mcpClient),
        );

        // 3. Lazy-load heavy modules
        // Don't block activation with expensive operations

    } catch (error) {
        vscode.window.showErrorMessage(`Draagon Forge activation failed: ${error}`);
        throw error;
    }
}
```

#### Disposable Pattern

**ALWAYS** push disposables to `context.subscriptions`:

```typescript
// GOOD
context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(handler),
    vscode.commands.registerCommand('draagon-forge.search', commandHandler),
);

// BAD - Will leak resources
vscode.workspace.onDidSaveTextDocument(handler);
```

#### Webview Security

```typescript
// Enable security headers
const webview = panel.webview;
webview.options = {
    enableScripts: true,
    localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
    ],
};

// Use nonce for scripts
const nonce = getNonce();
return `
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src 'nonce-${nonce}';
        style-src ${webview.cspSource};
    ">
`;
```

### MCP Server (Python)

#### Project Structure

```
src/mcp/
├── __init__.py
├── server.py             # FastMCP entry point
├── tools/
│   ├── __init__.py
│   ├── search.py         # search_context tool
│   ├── principles.py     # get_principles tool
│   ├── conflicts.py      # check_conflicts tool
│   ├── patterns.py       # get_patterns, find_examples
│   ├── feedback.py       # report_outcome tool
│   ├── learning.py       # store_learning tool
│   ├── beliefs.py        # query_beliefs, adjust_belief, add_belief
│   ├── watchlist.py      # Watch rule management
│   └── review.py         # get_review_queue, resolve_review
├── resources/
│   └── project.py        # Project context resource
├── prompts/
│   └── workflows.py      # Workflow prompts
└── memory/
    ├── neo4j.py          # Graph database
    └── qdrant.py         # Vector database
```

#### FastMCP Tool Pattern

```python
from fastmcp import FastMCP

mcp = FastMCP("draagon-forge")

@mcp.tool
async def search_context(
    query: str,
    limit: int = 10,
    domain: str | None = None,
) -> list[dict]:
    """Search semantic memory for relevant context.

    Args:
        query: The search query
        limit: Maximum results to return
        domain: Optional domain filter (e.g., 'architecture', 'testing')

    Returns:
        List of relevant context items with scores
    """
    results = await memory.search(query, limit=limit, domain=domain)
    return [
        {
            "id": r.id,
            "content": r.content,
            "score": r.score,
            "conviction": r.metadata.get("conviction", 0.5),
            "source": r.metadata.get("source"),
        }
        for r in results
    ]
```

#### Belief Management

```python
@mcp.tool
async def adjust_belief(
    belief_id: str,
    action: str,  # "reinforce" | "weaken" | "modify" | "delete"
    new_content: str | None = None,
    reason: str | None = None,
) -> dict:
    """Adjust a belief based on user feedback."""

    # Implementation validates action, updates conviction, logs change
    ...
```

### Autonomous Agents (Python)

```
src/agents/
├── __init__.py
├── base.py               # BaseAgent class
├── code_review.py        # CodeReviewAgent
├── pr_analyzer.py        # PRAnalyzerAgent
├── architectural_auditor.py
├── research.py           # ResearchAgent
└── commit_auditor.py     # DeveloperCommitAuditor
```

#### Agent Pattern

```python
from draagon_ai.orchestration import Agent

class CodeReviewAgent(Agent):
    """Autonomous agent that reviews code changes."""

    async def review_changes(
        self,
        files_changed: list[str],
        diff: str,
    ) -> ReviewResult:
        """Review code changes for issues."""

        # 1. Load relevant principles for affected domains
        # 2. Check each change against principles
        # 3. Check for cross-file architectural issues
        # 4. Check for test coverage
        # 5. Return structured result
```

---

## Testing Guidelines

### Test Structure

```
tests/
├── extension/            # VS Code extension tests
│   ├── unit/
│   │   ├── watcher.test.ts
│   │   ├── learner.test.ts
│   │   └── monitor.test.ts
│   └── integration/
│       └── e2e.test.ts
├── mcp/                  # MCP server tests
│   ├── unit/
│   │   ├── test_search.py
│   │   ├── test_beliefs.py
│   │   └── test_watchlist.py
│   └── integration/
│       └── test_tools.py
└── agents/               # Agent tests
    ├── test_code_review.py
    ├── test_pr_analyzer.py
    └── test_commit_auditor.py
```

### Testing Principles

1. **Test Outcomes, Not Implementation** - Validate behavior, not internal details
2. **Use Real Systems in Integration Tests** - No mocks for semantic operations
3. **Never Weaken Tests to Pass** - Fix bugs, don't lower thresholds

### Running Tests

```bash
# Extension tests
npm test

# MCP server tests
pytest tests/mcp -v

# Agent tests
pytest tests/agents -v

# All tests
npm run test:all
```

---

## Configuration

### VS Code Settings

```json
{
    "draagon-forge.enabled": true,
    "draagon-forge.mcpServerPath": "python -m draagon_forge.mcp.server",
    "draagon-forge.neo4jUri": "bolt://localhost:7687",
    "draagon-forge.qdrantUrl": "http://localhost:6333",
    "draagon-forge.watchlist.defaultSeverity": "warn",
    "draagon-forge.curiosity.maxQuestionsPerDay": 3,
    "draagon-forge.audit.enableContinuousMonitoring": true
}
```

### MCP Server Configuration

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

## Dependencies

### Required

- **Python 3.11+** - MCP server, agents
- **Node.js 18+** - VS Code extension
- **Neo4j 5.x** - Graph database for entities/relationships
- **Qdrant** - Vector database for semantic search
- **Ollama** - Local embeddings (mxbai-embed-large)
- **FastMCP** - MCP server framework
- **draagon-ai** - Core AI framework (consumed as dependency)

### Optional

- **Groq/OpenAI** - LLM provider for analysis
- **Redis** - Caching layer
- **GitHub App** - Webhook integration

---

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+D` | Open Draagon Forge panel |
| `Ctrl+Shift+B` | Query beliefs |
| `Ctrl+Shift+W` | Open watchlist configuration |
| `Ctrl+Shift+A` | Open commit audit dashboard |

---

## Common Commands

```bash
# Start MCP server
python -m draagon_forge.mcp.server

# Seed knowledge from CLAUDE.md
python -m draagon_forge.mcp.seed --claude-md ./CLAUDE.md

# Run extension in development
npm run watch

# Package extension
npm run package

# Run all tests
npm run test:all
```

---

## Troubleshooting

### Extension Not Activating

1. Check Output panel: `Draagon Forge` channel
2. Verify MCP server is running
3. Check Neo4j/Qdrant connections

### MCP Server Connection Failed

1. Verify server is running: `ps aux | grep draagon_forge`
2. Check Claude Code MCP configuration
3. Verify database connections

### Beliefs Not Persisting

1. Check Neo4j is running
2. Verify database URI in configuration
3. Check for errors in MCP server logs

---

## Related Projects

- **[draagon-ai](../draagon-ai/)** - Core AI framework (dependency)
- **[roxy-voice-assistant](../roxy-voice-assistant/)** - Voice assistant using draagon-ai
- **[draagon-healthcare](../draagon-healthcare/)** - Healthcare domain extension

---

**End of CLAUDE.md**
