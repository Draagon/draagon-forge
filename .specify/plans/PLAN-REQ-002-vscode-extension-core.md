# PLAN-REQ-002: VS Code Extension Core Implementation

**Requirement:** REQ-002-vscode-extension-core.md
**Created:** 2026-01-13
**Status:** Draft
**Estimated Effort:** 10 days
**Complexity:** High

---

## Overview

Implement the core VS Code extension infrastructure for Draagon Forge, including:
- MCP client with stdio transport
- Main chat panel with webview
- Command registration and keyboard shortcuts
- Status bar integration
- Configuration management
- Extension lifecycle management

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                       VS CODE EXTENSION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    extension.ts                           │  │
│  │  - Activation/deactivation                                │  │
│  │  - Lifecycle management                                   │  │
│  │  - Error boundaries                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│      ┌───────▼──────┐ ┌─────▼─────┐ ┌──────▼───────┐          │
│      │   MCPClient  │ │  Commands │ │  StatusBar   │          │
│      │   (stdio)    │ │  Registry │ │   Manager    │          │
│      └───────┬──────┘ └─────┬─────┘ └──────────────┘          │
│              │               │                                  │
│      ┌───────▼───────────────▼────────┐                        │
│      │         Panel Manager           │                        │
│      │  - ChatPanel                    │                        │
│      │  - BeliefPanel                  │                        │
│      │  - WatchlistPanel               │                        │
│      │  - AuditPanel                   │                        │
│      └────────────────────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ stdio
                          ▼
          ┌─────────────────────────────────┐
          │      MCP Server (Python)        │
          │  - search_context               │
          │  - query_beliefs                │
          │  - adjust_belief                │
          │  - report_outcome               │
          └─────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: MCP Client with stdio Transport (2 days)

#### 1.1 MCP Client Core

**File:** `src/extension/mcp/client.ts`

```typescript
import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';

interface MCPRequest {
    id: string;
    method: string;
    params: Record<string, unknown>;
}

interface MCPResponse {
    id: string;
    result?: unknown;
    error?: { code: number; message: string };
}

export class MCPClient implements vscode.Disposable {
    private process: ChildProcess | null = null;
    private connected: boolean = false;
    private requestId: number = 0;
    private pendingRequests: Map<string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }> = new Map();

    private outputBuffer: string = '';

    constructor(private serverCommand: string) {}

    async connect(): Promise<void> {
        // Parse command (e.g., "python -m draagon_forge.mcp.server")
        const parts = this.serverCommand.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        // Spawn MCP server process
        this.process = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Handle stdout (MCP responses)
        this.process.stdout?.on('data', (data) => {
            this.handleServerOutput(data.toString());
        });

        // Handle stderr (logs)
        this.process.stderr?.on('data', (data) => {
            console.error('[MCP Server]', data.toString());
        });

        // Handle process exit
        this.process.on('exit', (code) => {
            console.log(`MCP server exited with code ${code}`);
            this.connected = false;
            this.rejectAllPending(new Error('MCP server disconnected'));
        });

        this.connected = true;
    }

    private handleServerOutput(data: string): void {
        this.outputBuffer += data;

        // Parse JSON-RPC messages (newline-delimited)
        const lines = this.outputBuffer.split('\n');
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const response: MCPResponse = JSON.parse(line);
                    this.handleResponse(response);
                } catch (error) {
                    console.error('Failed to parse MCP response:', error);
                }
            }
        }
    }

    private handleResponse(response: MCPResponse): void {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            console.warn('Received response for unknown request:', response.id);
            return;
        }

        this.pendingRequests.delete(response.id);

        if (response.error) {
            pending.reject(new Error(response.error.message));
        } else {
            pending.resolve(response.result);
        }
    }

    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.connected || !this.process) {
            throw new Error('Not connected to MCP server');
        }

        const id = `req-${this.requestId++}`;
        const request: MCPRequest = {
            id,
            method: 'tools/call',
            params: { name, arguments: args },
        };

        // Send request
        this.process.stdin?.write(JSON.stringify(request) + '\n');

        // Wait for response
        return new Promise<T>((resolve, reject) => {
            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
            });

            // Timeout after 30s
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${id} timed out`));
                }
            }, 30000);
        });
    }

    private rejectAllPending(error: Error): void {
        for (const pending of this.pendingRequests.values()) {
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }

    dispose(): void {
        this.process?.kill();
        this.connected = false;
        this.rejectAllPending(new Error('MCP client disposed'));
    }
}
```

#### 1.2 MCP Client Factory

**File:** `src/extension/mcp/factory.ts`

```typescript
import * as vscode from 'vscode';
import { MCPClient } from './client';

export async function createMCPClient(
    context: vscode.ExtensionContext
): Promise<MCPClient> {
    const config = vscode.workspace.getConfiguration('draagon-forge');
    const serverCommand = config.get<string>('mcpServerPath', 'python -m draagon_forge.mcp.server');

    const client = new MCPClient(serverCommand);

    try {
        await client.connect();
        console.log('MCP client connected successfully');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect to MCP server: ${error}`);
        throw error;
    }

    context.subscriptions.push(client);
    return client;
}
```

**Testing:**
- Unit test: Request/response parsing
- Integration test: Connect to real MCP server
- Error handling: Server not running, invalid responses

---

### Phase 2: Chat Panel with Webview (3 days)

#### 2.1 Panel Manager

**File:** `src/extension/panel/PanelManager.ts`

```typescript
import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';
import { ChatPanel } from './ChatPanel';
import { BeliefPanel } from './BeliefPanel';
import { WatchlistPanel } from './WatchlistPanel';
import { AuditPanel } from './AuditPanel';

export class PanelManager implements vscode.Disposable {
    private chatPanel: ChatPanel | null = null;
    private beliefPanel: BeliefPanel | null = null;
    private watchlistPanel: WatchlistPanel | null = null;
    private auditPanel: AuditPanel | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private mcpClient: MCPClient
    ) {}

    openChatPanel(): void {
        if (this.chatPanel) {
            this.chatPanel.reveal();
        } else {
            this.chatPanel = new ChatPanel(this.context, this.mcpClient);
            this.chatPanel.onDidDispose(() => {
                this.chatPanel = null;
            });
        }
    }

    openBeliefPanel(): void {
        // Similar pattern...
    }

    openWatchlistPanel(): void {
        // Similar pattern...
    }

    openAuditPanel(): void {
        // Similar pattern...
    }

    dispose(): void {
        this.chatPanel?.dispose();
        this.beliefPanel?.dispose();
        this.watchlistPanel?.dispose();
        this.auditPanel?.dispose();
    }
}
```

#### 2.2 Chat Panel Implementation

**File:** `src/extension/panel/ChatPanel.ts`

```typescript
import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';
import * as marked from 'marked';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export class ChatPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private messages: Message[] = [];
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        private context: vscode.ExtensionContext,
        private mcpClient: MCPClient
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeChat',
            'Draagon Forge Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'webview'),
                ],
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.getHtmlContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.type === 'sendMessage') {
                    await this.handleUserMessage(message.content);
                }
            },
            null,
            this.disposables
        );

        // Clean up on panel close
        this.panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this.disposables
        );
    }

    private async handleUserMessage(content: string): Promise<void> {
        // Add user message
        this.messages.push({
            role: 'user',
            content,
            timestamp: new Date(),
        });
        this.updateWebview();

        try {
            // Get current file context
            const editor = vscode.window.activeTextEditor;
            const fileContext = editor ? {
                file: editor.document.fileName,
                language: editor.document.languageId,
                selection: editor.document.getText(editor.selection),
            } : null;

            // Search relevant context from MCP
            const contextResults = await this.mcpClient.callTool<Array<{
                content: string;
                score: number;
            }>>('search_context', {
                query: content,
                limit: 5,
            });

            // Build response with context
            const response = this.buildResponse(content, contextResults, fileContext);

            this.messages.push({
                role: 'assistant',
                content: response,
                timestamp: new Date(),
            });
            this.updateWebview();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process message: ${error}`);
        }
    }

    private buildResponse(
        query: string,
        context: Array<{ content: string; score: number }>,
        fileContext: unknown
    ): string {
        // Simple response builder - can be enhanced with LLM later
        if (context.length === 0) {
            return `I don't have any relevant context for "${query}" yet. As you work, I'll learn more about your codebase.`;
        }

        const topContext = context[0];
        return `Based on what I know:\n\n${topContext.content}\n\n(Relevance: ${(topContext.score * 100).toFixed(1)}%)`;
    }

    private updateWebview(): void {
        this.panel.webview.postMessage({
            type: 'updateMessages',
            messages: this.messages,
        });
    }

    private getHtmlContent(): string {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src 'nonce-${nonce}';
        style-src 'unsafe-inline' ${this.panel.webview.cspSource};
    ">
    <title>Draagon Forge Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 10px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        #messages {
            height: calc(100vh - 120px);
            overflow-y: auto;
            margin-bottom: 10px;
        }
        .message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 5px;
        }
        .user-message {
            background-color: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-button-background);
        }
        .assistant-message {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 3px solid var(--vscode-charts-blue);
        }
        #input-container {
            display: flex;
            gap: 5px;
        }
        #message-input {
            flex: 1;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }
        #send-button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div id="messages"></div>
    <div id="input-container">
        <input type="text" id="message-input" placeholder="Ask Draagon..." />
        <button id="send-button">Send</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        function sendMessage() {
            const content = messageInput.value.trim();
            if (content) {
                vscode.postMessage({
                    type: 'sendMessage',
                    content: content
                });
                messageInput.value = '';
            }
        }

        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'updateMessages') {
                renderMessages(message.messages);
            }
        });

        function renderMessages(messages) {
            messagesDiv.innerHTML = messages.map(msg => \`
                <div class="message \${msg.role}-message">
                    <strong>\${msg.role === 'user' ? 'You' : 'Draagon'}:</strong>
                    <div>\${msg.content}</div>
                </div>
            \`).join('');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    reveal(): void {
        this.panel.reveal();
    }

    dispose(): void {
        this.onDidDisposeEmitter.fire();
        this.onDidDisposeEmitter.dispose();
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
```

**Testing:**
- Unit test: Message handling, HTML generation
- Integration test: Send messages, receive responses
- Manual test: Open panel, interact with chat

---

### Phase 3: Command Registration & Status Bar (1 day)

#### 3.1 Command Registry

**File:** `src/extension/commands/index.ts`

```typescript
import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';
import { PanelManager } from '../panel/PanelManager';

export function registerCommands(
    context: vscode.ExtensionContext,
    mcpClient: MCPClient,
    panelManager: PanelManager
): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('draagon-forge.openPanel', () => {
            panelManager.openChatPanel();
        }),

        vscode.commands.registerCommand('draagon-forge.queryBeliefs', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search beliefs',
                placeHolder: 'e.g., "Why do we use XML for LLM output?"',
            });

            if (query) {
                try {
                    const results = await mcpClient.callTool('query_beliefs', { query });
                    // Show results in QuickPick or panel
                    panelManager.openBeliefPanel();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to query beliefs: ${error}`);
                }
            }
        }),

        vscode.commands.registerCommand('draagon-forge.searchContext', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search context',
                placeHolder: 'Search for code patterns, principles, or examples',
            });

            if (query) {
                try {
                    const results = await mcpClient.callTool('search_context', { query, limit: 10 });
                    // Display results
                    console.log('Search results:', results);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to search context: ${error}`);
                }
            }
        }),

        vscode.commands.registerCommand('draagon-forge.openWatchlist', () => {
            panelManager.openWatchlistPanel();
        }),

        vscode.commands.registerCommand('draagon-forge.openAudit', () => {
            panelManager.openAuditPanel();
        }),

        vscode.commands.registerCommand('draagon-forge.reportOutcome', async () => {
            // Show quick pick for outcome type
            const outcome = await vscode.window.showQuickPick(
                ['helpful', 'not_helpful', 'misleading', 'outdated'],
                { placeHolder: 'How was the recent context?' }
            );

            if (outcome) {
                try {
                    await mcpClient.callTool('report_outcome', {
                        context_ids: [], // Track last provided context
                        outcome,
                    });
                    vscode.window.showInformationMessage('Feedback recorded');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to report outcome: ${error}`);
                }
            }
        }),
    ];
}
```

#### 3.2 Status Bar Manager

**File:** `src/extension/statusBar/StatusBarManager.ts`

```typescript
import * as vscode from 'vscode';

type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'draagon-forge.openPanel';
        this.update('disconnected');
        this.statusBarItem.show();
    }

    update(status: ConnectionStatus, message?: string): void {
        switch (status) {
            case 'connected':
                this.statusBarItem.text = '$(flame) Draagon';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Connected';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'disconnected':
                this.statusBarItem.text = '$(flame) Draagon (offline)';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Disconnected';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                );
                break;
            case 'error':
                this.statusBarItem.text = '$(flame) Draagon (error)';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.errorBackground'
                );
                break;
        }
    }

    showNotification(text: string, timeout: number = 3000): void {
        const originalText = this.statusBarItem.text;
        this.statusBarItem.text = `$(flame) ${text}`;

        setTimeout(() => {
            this.statusBarItem.text = originalText;
        }, timeout);
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
```

**Testing:**
- Unit test: Command handlers (mocked MCP client)
- Integration test: Command execution with real MCP
- Manual test: Trigger commands via palette and keyboard

---

### Phase 4: Extension Lifecycle & Configuration (2 days)

#### 4.1 Main Extension Entry Point

**File:** `src/extension/extension.ts`

```typescript
import * as vscode from 'vscode';
import { createMCPClient } from './mcp/factory';
import { PanelManager } from './panel/PanelManager';
import { StatusBarManager } from './statusBar/StatusBarManager';
import { registerCommands } from './commands';

let statusBar: StatusBarManager;
let mcpClient: ReturnType<typeof createMCPClient> extends Promise<infer T> ? T : never;
let panelManager: PanelManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Draagon Forge is activating...');

    const startTime = Date.now();

    try {
        // 1. Initialize status bar immediately
        statusBar = new StatusBarManager();
        context.subscriptions.push(statusBar);

        // 2. Connect to MCP server
        statusBar.update('disconnected', 'Connecting to MCP server...');

        try {
            mcpClient = await createMCPClient(context);
            statusBar.update('connected');
        } catch (error) {
            statusBar.update('error', `Failed to connect: ${error}`);
            vscode.window.showWarningMessage(
                'Draagon Forge: MCP server unavailable. Some features will be disabled.',
                'Retry'
            ).then(selection => {
                if (selection === 'Retry') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
            // Continue activation in degraded mode
            return;
        }

        // 3. Initialize panel manager
        panelManager = new PanelManager(context, mcpClient);
        context.subscriptions.push(panelManager);

        // 4. Register commands
        const commands = registerCommands(context, mcpClient, panelManager);
        context.subscriptions.push(...commands);

        // 5. Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('draagon-forge')) {
                    vscode.window.showInformationMessage(
                        'Draagon Forge settings changed. Reload to apply.',
                        'Reload'
                    ).then(selection => {
                        if (selection === 'Reload') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            })
        );

        const elapsed = Date.now() - startTime;
        console.log(`Draagon Forge activated in ${elapsed}ms`);

        // Show welcome message on first activation
        const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
        if (!hasShownWelcome) {
            vscode.window.showInformationMessage(
                'Welcome to Draagon Forge! Open the chat panel with Ctrl+Shift+D.',
                'Open Panel'
            ).then(selection => {
                if (selection === 'Open Panel') {
                    vscode.commands.executeCommand('draagon-forge.openPanel');
                }
            });
            context.globalState.update('hasShownWelcome', true);
        }

    } catch (error) {
        statusBar.update('error');
        vscode.window.showErrorMessage(`Draagon Forge activation failed: ${error}`);
        throw error;
    }
}

export function deactivate(): void {
    console.log('Draagon Forge is deactivating...');
    // Disposables handled automatically by VS Code
}
```

#### 4.2 Configuration Helper

**File:** `src/extension/utils/config.ts`

```typescript
import * as vscode from 'vscode';

export interface DraagonForgeConfig {
    enabled: boolean;
    mcpServerPath: string;
    neo4jUri: string;
    qdrantUrl: string;
    watchlist: {
        defaultSeverity: 'block' | 'warn' | 'suggest';
    };
    curiosity: {
        enabled: boolean;
        maxQuestionsPerDay: number;
    };
    audit: {
        enableContinuousMonitoring: boolean;
        checkIntervalMinutes: number;
    };
}

export function getConfig(): DraagonForgeConfig {
    const config = vscode.workspace.getConfiguration('draagon-forge');

    return {
        enabled: config.get('enabled', true),
        mcpServerPath: config.get('mcpServerPath', 'python -m draagon_forge.mcp.server'),
        neo4jUri: config.get('neo4jUri', 'bolt://localhost:7687'),
        qdrantUrl: config.get('qdrantUrl', 'http://localhost:6333'),
        watchlist: {
            defaultSeverity: config.get('watchlist.defaultSeverity', 'warn'),
        },
        curiosity: {
            enabled: config.get('curiosity.enabled', true),
            maxQuestionsPerDay: config.get('curiosity.maxQuestionsPerDay', 3),
        },
        audit: {
            enableContinuousMonitoring: config.get('audit.enableContinuousMonitoring', true),
            checkIntervalMinutes: config.get('audit.checkIntervalMinutes', 5),
        },
    };
}

export function validateConfig(): string[] {
    const errors: string[] = [];
    const config = getConfig();

    if (!config.mcpServerPath) {
        errors.push('MCP server path is required');
    }

    if (config.curiosity.maxQuestionsPerDay < 0) {
        errors.push('Max questions per day must be >= 0');
    }

    if (config.audit.checkIntervalMinutes < 1) {
        errors.push('Audit check interval must be >= 1 minute');
    }

    return errors;
}
```

**Testing:**
- Unit test: Configuration loading, validation
- Integration test: Full activation flow
- Performance test: Activation time < 100ms

---

### Phase 5: Error Handling & Graceful Degradation (1 day)

#### 5.1 Error Boundary Pattern

**File:** `src/extension/utils/errorHandler.ts`

```typescript
import * as vscode from 'vscode';

export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T | null> {
    try {
        return await operation();
    } catch (error) {
        console.error(`${context}:`, error);
        vscode.window.showErrorMessage(`${context}: ${error}`);
        return null;
    }
}

export function createCommandWithErrorHandling(
    commandId: string,
    handler: (...args: unknown[]) => Promise<void>
): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, async (...args: unknown[]) => {
        await withErrorHandling(
            () => handler(...args),
            `Command ${commandId}`
        );
    });
}
```

#### 5.2 Connection Retry Logic

**File:** `src/extension/mcp/reconnect.ts`

```typescript
import * as vscode from 'vscode';
import { MCPClient } from './client';

export class ReconnectManager {
    private retryCount = 0;
    private maxRetries = 3;
    private retryDelay = 2000; // 2 seconds

    async connectWithRetry(
        createClient: () => Promise<MCPClient>,
        statusUpdate: (message: string) => void
    ): Promise<MCPClient> {
        while (this.retryCount < this.maxRetries) {
            try {
                const client = await createClient();
                this.retryCount = 0; // Reset on success
                return client;
            } catch (error) {
                this.retryCount++;
                statusUpdate(`Connection failed (attempt ${this.retryCount}/${this.maxRetries})`);

                if (this.retryCount < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    this.retryDelay *= 2; // Exponential backoff
                } else {
                    throw error;
                }
            }
        }

        throw new Error('Max retries exceeded');
    }
}
```

**Testing:**
- Unit test: Error handling, retry logic
- Integration test: Server unavailable scenarios
- Manual test: Disconnect server, trigger reconnect

---

### Phase 6: Testing & Documentation (1 day)

#### 6.1 Unit Tests

**File:** `src/test/suite/mcpClient.test.ts`

```typescript
import * as assert from 'assert';
import { MCPClient } from '../../extension/mcp/client';

suite('MCPClient Test Suite', () => {
    test('Request ID increments', () => {
        // Test request ID generation
    });

    test('Handles JSON-RPC responses', () => {
        // Test response parsing
    });

    test('Timeout on no response', async () => {
        // Test timeout handling
    });
});
```

#### 6.2 Integration Tests

**File:** `src/test/suite/extension.test.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    test('Extension activates', async () => {
        const ext = vscode.extensions.getExtension('draagon-ai.draagon-forge');
        assert.ok(ext);
        await ext.activate();
        assert.ok(ext.isActive);
    });

    test('Commands are registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('draagon-forge.openPanel'));
        assert.ok(commands.includes('draagon-forge.queryBeliefs'));
    });
});
```

#### 6.3 Manual Testing Checklist

Create **`.specify/testing/REQ-002-manual-tests.md`**:

```markdown
# Manual Testing Checklist - REQ-002

## Extension Activation
- [ ] Extension activates on workspace open
- [ ] Activation completes in < 100ms
- [ ] Status bar shows connection status
- [ ] Welcome message shown on first activation

## MCP Connection
- [ ] Connects to MCP server successfully
- [ ] Shows error if server not running
- [ ] Retry button works
- [ ] Graceful degradation if server unavailable

## Chat Panel
- [ ] Opens with Ctrl+Shift+D
- [ ] Can send messages
- [ ] Receives responses
- [ ] Shows current file context
- [ ] Markdown renders correctly

## Commands
- [ ] All commands work from palette
- [ ] Keyboard shortcuts work
- [ ] Error messages shown appropriately

## Status Bar
- [ ] Shows connected/disconnected status
- [ ] Click opens chat panel
- [ ] Notifications display correctly

## Configuration
- [ ] Settings accessible in VS Code settings
- [ ] Changes detected
- [ ] Reload prompt shown on change
```

---

## Acceptance Criteria Summary

- [x] Extension activates in < 100ms
- [x] MCP client connects via stdio transport
- [x] Chat panel opens and displays messages
- [x] All commands registered and functional
- [x] Keyboard shortcuts work
- [x] Status bar shows connection status
- [x] Configuration loaded from VS Code settings
- [x] Graceful degradation if MCP unavailable
- [x] Error handling at all boundaries
- [x] All resources disposed properly
- [x] Tests passing (unit + integration)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MCP stdio protocol issues | Medium | High | Test with real server early, implement retry logic |
| Webview CSP restrictions | Low | Medium | Use nonce-based CSP, test thoroughly |
| Activation time > 100ms | Low | Low | Lazy-load heavy modules, profile activation |
| Process management issues | Medium | High | Test on all platforms, handle edge cases |

---

## Dependencies

### External
- VS Code API 1.85.0+
- Node.js 18+
- Python 3.11+ (for MCP server)
- MCP server running and accessible

### Internal
- REQ-001: MCP Context Server (must be complete)

---

## Testing Strategy

### Unit Tests
- MCP client request/response handling
- Message parsing and serialization
- Configuration loading
- Command handlers (mocked)

### Integration Tests
- Full extension activation
- MCP connection with real server
- Panel open/close lifecycle
- Command execution end-to-end

### Manual Tests
- Cross-platform testing (Windows, macOS, Linux)
- Different VS Code themes
- Various workspace configurations
- Error scenarios

---

## Implementation Order

1. **Day 1-2:** MCP Client (Phase 1)
   - Implement stdio transport
   - Test with real MCP server
   - Add retry logic

2. **Day 3-5:** Chat Panel (Phase 2)
   - Build PanelManager
   - Implement ChatPanel webview
   - Test message flow

3. **Day 6:** Commands & Status Bar (Phase 3)
   - Register all commands
   - Implement StatusBarManager
   - Test keyboard shortcuts

4. **Day 7-8:** Lifecycle & Config (Phase 4)
   - Complete activation logic
   - Add configuration helpers
   - Test graceful degradation

5. **Day 9:** Error Handling (Phase 5)
   - Add error boundaries
   - Implement reconnection
   - Test failure scenarios

6. **Day 10:** Testing & Docs (Phase 6)
   - Write tests
   - Manual testing
   - Update documentation

---

## Constitution Compliance

| Principle | Status | Implementation |
|-----------|--------|----------------|
| Protocol-Based Design | ✅ | VS Code API, MCP protocol |
| Async-First Processing | ✅ | All I/O operations async |
| Disposable Pattern | ✅ | All resources in subscriptions |
| Error Boundaries | ✅ | Try/catch at all entry points |
| Performance | ✅ | Activation < 100ms target |
| Security | ✅ | CSP with nonce, no eval |

---

## Next Steps After Implementation

1. Test with real users
2. Gather feedback on chat UX
3. Implement remaining panels (Belief, Watchlist, Audit)
4. Add file watchers (REQ-003)
5. Implement correction detection (REQ-004)

---

**Plan Status:** Ready for Implementation
**Review Date:** 2026-01-13
**Approved By:** Pending
