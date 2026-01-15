# REQ-002: VS Code Extension Core

**Priority:** P0
**Effort:** High (10 days)
**Dependencies:** REQ-001
**Blocks:** REQ-003, REQ-004, REQ-005, REQ-006, REQ-007
**Layer:** 🟢 L3 (draagon-forge) - Programming-specific VS Code extension

---

## Overview

Build the core VS Code extension infrastructure that provides the foundation for all Draagon Forge features including panels, commands, and MCP client integration.

### Purpose

The VS Code extension serves as the primary user interface for Draagon Forge, providing:
- Interactive panels for chat, beliefs, and watchlist
- Real-time observation of developer activity
- Integration with the MCP Context Server
- Command palette access to all features

---

## Requirements

### REQ-002.1: Extension Activation

**Activation Events:**
- On workspace contains `.draagon-forge.json`
- On command invocation (`draagon-forge.*`)
- On file type match (configurable)

**Acceptance Criteria:**
- [ ] Activation completes in < 100ms
- [ ] No blocking operations during activation
- [ ] Graceful degradation if MCP server unavailable
- [ ] All resources pushed to context.subscriptions

### REQ-002.2: MCP Client Integration

```typescript
class MCPClient {
    constructor(serverPath: string);
    async connect(): Promise<void>;
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    dispose(): void;
}
```

**Acceptance Criteria:**
- [ ] Connects to MCP server on activation
- [ ] Handles connection failures gracefully
- [ ] Reconnects automatically on disconnect
- [ ] Properly disposes on deactivation

### REQ-002.3: Main Chat Panel

Interactive panel for conversing with Draagon:

```
┌─────────────────────────────────────────────────────────────────┐
│  DRAAGON FORGE                                         [−][□][×]│
├─────────────────────────────────────────────────────────────────┤
│  💬 Chat                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ You: Why do we use XML instead of JSON for LLM output?  │   │
│  │                                                          │   │
│  │ Draagon: Based on the project principles...             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Ask Draagon...                                    [Send] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  🎯 Current Context                                              │
│  File: src/example.py | Function: process_data                  │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Webview panel opens on command
- [ ] Chat history persists during session
- [ ] Shows current file context
- [ ] Displays relevant principles for current file
- [ ] Input field supports multi-line
- [ ] Messages render markdown

### REQ-002.4: Command Registration

Register the following commands:

| Command | Description | Shortcut |
|---------|-------------|----------|
| `draagon-forge.openPanel` | Open main panel | Ctrl+Shift+D |
| `draagon-forge.searchContext` | Search knowledge base | Ctrl+Shift+S |
| `draagon-forge.queryBeliefs` | Query beliefs | Ctrl+Shift+B |
| `draagon-forge.openBeliefGraph` | Open belief graph visualization | Ctrl+Shift+G |
| `draagon-forge.openWatchlist` | Open watchlist config | Ctrl+Shift+W |
| `draagon-forge.openAudit` | Open commit audit | Ctrl+Shift+A |
| `draagon-forge.reportOutcome` | Report feedback | - |

**Acceptance Criteria:**
- [ ] All commands registered and functional
- [ ] Keyboard shortcuts configurable
- [ ] Commands appear in Command Palette
- [ ] Commands gracefully handle MCP unavailable

### REQ-002.5: Status Bar Integration

```typescript
class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    update(status: 'connected' | 'disconnected' | 'error', message?: string): void;
    showNotification(text: string, timeout?: number): void;
}
```

**Acceptance Criteria:**
- [ ] Shows connection status icon
- [ ] Clicking opens main panel
- [ ] Shows brief notifications
- [ ] Updates on status changes

### REQ-002.6: Configuration Schema

```json
{
    "draagon-forge.enabled": {
        "type": "boolean",
        "default": true
    },
    "draagon-forge.mcpServerPath": {
        "type": "string",
        "default": "python -m draagon_forge.mcp.server"
    },
    "draagon-forge.neo4jUri": {
        "type": "string",
        "default": "bolt://localhost:7687"
    },
    "draagon-forge.qdrantUrl": {
        "type": "string",
        "default": "http://localhost:6333"
    }
}
```

**Acceptance Criteria:**
- [ ] All settings accessible via VS Code settings
- [ ] Settings validated on change
- [ ] Default values work out-of-box
- [ ] Changes take effect without restart

---

## Technical Design

### File Structure

```
src/extension/
├── extension.ts          # Entry point
├── constants.ts          # Extension-wide constants
├── mcpClient.ts          # MCP client wrapper
├── statusBar.ts          # Status bar manager
├── commands/
│   ├── index.ts          # Command registration
│   ├── openPanel.ts
│   ├── searchContext.ts
│   ├── queryBeliefs.ts
│   └── openBeliefGraph.ts
├── panel/
│   ├── ChatPanel.ts      # Main webview panel
│   ├── BeliefPanel.ts    # Belief query/management
│   ├── BeliefGraphPanel.ts  # Semantic graph visualization
│   └── PanelManager.ts   # Panel lifecycle
├── graph/
│   ├── GraphRenderer.ts  # Cytoscape.js wrapper
│   ├── graphStyles.ts    # Node/edge styling
│   └── graphLayout.ts    # Layout algorithms
└── utils/
    ├── webview.ts        # Webview helpers
    └── config.ts         # Configuration helpers
```

### Webview Security

```typescript
webview.options = {
    enableScripts: true,
    localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
    ],
};

// CSP with nonce
const nonce = getNonce();
return `
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src 'nonce-${nonce}';
        style-src ${webview.cspSource};
    ">
`;
```

---

## Testing

### Unit Tests

- Test command handlers
- Test MCP client wrapper
- Test configuration loading

### Integration Tests

- Test extension activation
- Test MCP connection
- Test panel open/close
- Test command invocation

### Manual Testing Checklist

- [ ] Extension activates on workspace open
- [ ] Panel opens with Ctrl+Shift+D
- [ ] Chat interface responsive
- [ ] Status bar shows connection status
- [ ] Settings changes apply correctly

---

## Acceptance Checklist

- [ ] Extension activates in < 100ms
- [ ] All commands registered
- [ ] Main panel functional
- [ ] MCP client connected
- [ ] Status bar working
- [ ] Configuration working
- [ ] Tests passing

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| Protocol-Based Design | ✅ | VS Code API, MCP |
| Async-First Processing | ✅ | All I/O async |
| Test Outcomes | ✅ | Behavior tested |

---

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Extension Capabilities](https://code.visualstudio.com/api/extension-capabilities)

---

**Document Status:** Draft
**Created:** 2026-01-13
**Last Updated:** 2026-01-13
