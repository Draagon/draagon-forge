/**
 * Audit Panel - Commit audit dashboard
 */

import * as vscode from "vscode";

export class AuditPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = "draagon-forge.auditView";

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
                case "auditCommit":
                    // TODO: Implement commit audit
                    break;
                case "resolveIssue":
                    // TODO: Implement issue resolution
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
                <title>Commit Audit</title>
            </head>
            <body>
                <h2>Commit Audit</h2>
                <p>Audit dashboard - coming soon</p>
            </body>
            </html>
        `;
    }
}
