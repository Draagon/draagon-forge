/**
 * Chat Panel - Main chat interface for Draagon Forge
 */

import * as vscode from 'vscode';
import { ForgeAPIClient } from '../api/client';

/**
 * Message structure for chat
 */
interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

/**
 * Chat panel for conversing with Draagon.
 * Opens as a standalone webview panel.
 */
export class ChatPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private messages: Message[] = [];
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        context: vscode.ExtensionContext,
        private apiClient: ForgeAPIClient
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

    /**
     * Handle a message from the user.
     */
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
            } : undefined;

            // Call Forge API for chat response
            const response = await this.apiClient.chat(content, fileContext);

            this.messages.push({
                role: 'assistant',
                content: response.response,
                timestamp: new Date(),
            });
            this.updateWebview();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process message: ${error}`);
            this.messages.push({
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error}`,
                timestamp: new Date(),
            });
            this.updateWebview();
        }
    }

    /**
     * Update the webview with current messages.
     */
    private updateWebview(): void {
        this.panel.webview.postMessage({
            type: 'updateMessages',
            messages: this.messages,
        });
    }

    /**
     * Get the HTML content for the webview.
     */
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
            padding: 10px;
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
        .message-header {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .message-content {
            white-space: pre-wrap;
        }
        #input-container {
            display: flex;
            gap: 5px;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
        }
        #message-input {
            flex: 1;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
        }
        #send-button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        #send-button:hover {
            background: var(--vscode-button-hoverBackground);
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
                    <div class="message-header">\${msg.role === 'user' ? 'You' : 'Draagon'}:</div>
                    <div class="message-content">\${escapeHtml(msg.content)}</div>
                </div>
            \`).join('');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP.
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Reveal the panel if it's hidden.
     */
    reveal(): void {
        this.panel.reveal();
    }

    /**
     * Dispose of the panel and clean up resources.
     */
    dispose(): void {
        this.onDidDisposeEmitter.fire();
        this.onDidDisposeEmitter.dispose();
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
