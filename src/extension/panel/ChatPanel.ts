/**
 * Chat Panel - Main chat interface for Draagon Forge
 */

import * as vscode from "vscode";

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = "draagon-forge.chatView";

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // TODO: Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case "search":
                    // TODO: Implement search
                    break;
                case "askQuestion":
                    // TODO: Implement question handling
                    break;
            }
        });
    }

    private getHtmlContent(_webview: vscode.Webview): string {
        // TODO: Implement proper webview HTML with CSP
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Draagon Forge Chat</title>
            </head>
            <body>
                <h2>Draagon Forge</h2>
                <p>Chat panel - coming soon</p>
            </body>
            </html>
        `;
    }
}
