# Draagon Forge

> An AI that doesn't just generate code, but understands your architecture, learns from your decisions, catches your mistakes, and grows smarter with every commit.

**Draagon Forge** is an AI Development Companion that provides intelligent, learning, proactive assistance throughout the software development lifecycle.

## Features

### MCP Context Server
Semantic memory for Claude Code integration, providing:
- `search_context` - Semantic search across learned knowledge
- `get_principles` - Domain-specific architectural principles
- `check_conflicts` - Detect principle violations
- `query_beliefs` - Explore and adjust learned beliefs
- `report_outcome` - Feedback loop for reinforcement learning

### VS Code Extension
A living presence in the IDE:
- **Watcher** - Observes file saves, edits, terminal commands, git operations
- **Learner** - Extracts patterns from developer corrections
- **Chat Panel** - Natural language conversation with Draagon
- **Belief Manager** - Query, view, and adjust beliefs
- **Watchlist Monitor** - Real-time alerts for violations

### Autonomous Agents
Cross-check code and catch issues:
- **Code Review Agent** - Review changes against principles
- **PR Analyzer** - Deep analysis of pull requests
- **Commit Auditor** - Audit any developer's commits (including Claude Code)
- **Research Agent** - Proactively fill knowledge gaps

### Curiosity Engine
Proactive learning and questioning:
- Identifies knowledge gaps
- Asks targeted clarifying questions
- Researches topics independently
- Synthesizes findings into beliefs

### Watch Rules
Tell Draagon what to watch for:
```
"Prevent using regex for semantic tasks"
"Block hardcoded API keys or secrets"
"Warn on functions exceeding 50 lines"
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Neo4j 5.x
- Qdrant
- Ollama with mxbai-embed-large

### Installation

1. Clone the repository:
```bash
git clone https://github.com/draagon-ai/draagon-forge.git
cd draagon-forge
```

2. Install Python dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

3. Install Node.js dependencies:
```bash
npm install
```

4. Start the databases:
```bash
# Neo4j
docker run -d --name neo4j -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/password neo4j:5

# Qdrant
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

5. Seed initial knowledge:
```bash
python -m draagon_forge.mcp.seed --claude-md ./CLAUDE.md
```

6. Configure Claude Code:
```json
// ~/.config/claude-code/mcp.json
{
    "mcpServers": {
        "draagon-forge": {
            "command": "python",
            "args": ["-m", "draagon_forge.mcp.server"],
            "env": {
                "NEO4J_URI": "bolt://localhost:7687",
                "QDRANT_URL": "http://localhost:6333"
            }
        }
    }
}
```

7. Launch VS Code extension (development):
```bash
npm run watch
# Then press F5 to launch Extension Development Host
```

## Architecture

```
draagon-forge/
├── src/
│   ├── extension/          # VS Code extension (TypeScript)
│   ├── mcp/                # MCP server (Python)
│   ├── agents/             # Autonomous agents (Python)
│   └── webview/            # Extension UI
├── tests/
├── .specify/               # Specifications
└── .claude/commands/       # Spec kit commands
```

## Key Commands

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+D` | Open Draagon Forge panel |
| `Ctrl+Shift+B` | Query beliefs |
| `Ctrl+Shift+W` | Open watchlist |
| `Ctrl+Shift+A` | Open commit audit |

## Development

### Running Tests
```bash
# Python tests
pytest tests/ -v

# TypeScript tests
npm test
```

### Building
```bash
npm run compile
```

### Packaging
```bash
npm run package
```

## Configuration

See [VS Code Settings](./CLAUDE.md#configuration) for all available options.

## Related Projects

- [draagon-ai](https://github.com/draagon-ai/draagon-ai) - Core AI framework
- [roxy-voice-assistant](https://github.com/draagon-ai/roxy-voice-assistant) - Voice assistant using draagon-ai

## License

MIT

---

Built with [draagon-ai](https://github.com/draagon-ai/draagon-ai)
