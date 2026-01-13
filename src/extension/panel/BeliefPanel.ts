/**
 * Belief Panel - Belief manager UI
 */

import * as vscode from "vscode";

export class BeliefPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = "draagon-forge.beliefsView";

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
                case "queryBelief":
                    // TODO: Implement belief query
                    break;
                case "adjustBelief":
                    // TODO: Implement belief adjustment
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
                <title>Beliefs</title>
            </head>
            <body>
                <h2>Beliefs</h2>
                <p>Belief management - coming soon</p>
            </body>
            </html>
        `;
    }
}
