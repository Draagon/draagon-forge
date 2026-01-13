/**
 * Belief Panel - Belief manager UI for Draagon Forge
 */

import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';

/**
 * Belief panel for managing and browsing beliefs.
 * Opens as a standalone webview panel.
 */
export class BeliefPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        _context: vscode.ExtensionContext,
        _mcpClient: MCPClient
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeBeliefs',
            'Draagon Forge Beliefs',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.getHtmlContent();

        this.panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this.disposables
        );
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Beliefs</title>
</head>
<body>
    <h2>Beliefs Panel</h2>
    <p>Belief management - coming soon!</p>
</body>
</html>`;
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
