/**
 * Watchlist Panel - Watch rule configuration UI
 */

import * as vscode from "vscode";

export class WatchlistPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = "draagon-forge.watchlistView";

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
                case "addRule":
                    // TODO: Implement add rule
                    break;
                case "removeRule":
                    // TODO: Implement remove rule
                    break;
                case "toggleRule":
                    // TODO: Implement toggle rule
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
                <title>Watchlist</title>
            </head>
            <body>
                <h2>Watchlist</h2>
                <p>Watch rule configuration - coming soon</p>
            </body>
            </html>
        `;
    }
}
