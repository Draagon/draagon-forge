/**
 * ChatViewProvider - Sidebar webview provider for the Draagon Forge chat interface
 */

import * as vscode from 'vscode';

/**
 * Chat response interface (common for API and MCP clients)
 */
interface ChatResponse {
    response: string;
    conversation_id?: string;
    beliefs_used?: string[];
    actions_taken?: string[];
    confidence?: number;
}

/**
 * Chat client interface - abstracts API vs MCP client
 */
export interface IChatClient {
    chat(message: string, context?: Record<string, unknown>): Promise<ChatResponse>;
}

/**
 * Provides the chat webview for the sidebar.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon-forge.chatView';

    private _view?: vscode.WebviewView;
    private messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly chatClient: IChatClient
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'ready':
                    // Send initial state
                    this.updateMessages();
                    break;
            }
        });
    }

    /**
     * Handle a message from the user.
     */
    private async handleUserMessage(message: string): Promise<void> {
        // Add user message
        this.messages.push({ role: 'user', content: message });
        this.updateMessages();

        // Show typing indicator
        this.messages.push({ role: 'assistant', content: '...' });
        this.updateMessages();

        try {
            // Chat with Forge - the AI companion with personality
            const result = await this.chatClient.chat(message);

            // Remove typing indicator and add real response
            this.messages.pop();
            this.messages.push({ role: 'assistant', content: result.response });
            this.updateMessages();
        } catch (error) {
            // Remove typing indicator
            this.messages.pop();

            const errorMessage = error instanceof Error ? error.message : String(error);
            this.messages.push({
                role: 'system',
                content: `Error: ${errorMessage}`,
            });
            this.updateMessages();
        }
    }

    /**
     * Update the messages in the webview.
     */
    private updateMessages(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages,
            });
        }
    }

    /**
     * Generate the HTML for the webview.
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Draagon Forge</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .header h2 {
            font-size: 14px;
            font-weight: 600;
        }
        .status {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-testing-iconPassed);
        }
        .status.disconnected {
            background-color: var(--vscode-testing-iconFailed);
        }
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .message {
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 90%;
            word-wrap: break-word;
            white-space: pre-wrap;
        }
        .message.user {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
        }
        .message.assistant {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            align-self: flex-start;
        }
        .message.system {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            align-self: center;
            font-size: 12px;
        }
        .input-area {
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        .input-area input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            outline: none;
        }
        .input-area input:focus {
            border-color: var(--vscode-focusBorder);
        }
        .input-area button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .input-area button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        .empty-state p {
            margin-top: 8px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="status" id="status"></div>
        <h2>Draagon Forge</h2>
    </div>
    <div class="messages" id="messages">
        <div class="empty-state">
            <strong>🔥 Forge - Your Dev Companion</strong>
            <p>I'm an opinionated AI that learns from your decisions. Ask me about architecture, patterns, or best practices.</p>
        </div>
    </div>
    <div class="input-area">
        <input type="text" id="input" placeholder="Ask something..." />
        <button id="send">Send</button>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('send');
        const statusEl = document.getElementById('status');

        let messages = [];

        function renderMessages() {
            if (messages.length === 0) {
                messagesEl.innerHTML = \`
                    <div class="empty-state">
                        <strong>🔥 Forge - Your Dev Companion</strong>
                        <p>I'm an opinionated AI that learns from your decisions. Ask me about architecture, patterns, or best practices.</p>
                    </div>
                \`;
                return;
            }

            messagesEl.innerHTML = messages.map(msg => \`
                <div class="message \${msg.role}">\${escapeHtml(msg.content)}</div>
            \`).join('');

            // Scroll to bottom
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function sendMessage() {
            const message = inputEl.value.trim();
            if (!message) return;

            inputEl.value = '';
            vscode.postMessage({ type: 'sendMessage', message });
        }

        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        window.addEventListener('message', (event) => {
            const data = event.data;
            switch (data.type) {
                case 'updateMessages':
                    messages = data.messages;
                    renderMessages();
                    break;
                case 'updateStatus':
                    statusEl.className = 'status' + (data.connected ? '' : ' disconnected');
                    break;
            }
        });

        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}

/**
 * Generate a nonce for CSP.
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
