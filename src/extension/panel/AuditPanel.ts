/**
 * Audit Panel - Commit audit dashboard
 */

import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';

/**
 * Audit panel for reviewing commits.
 * Opens as a standalone webview panel.
 */
export class AuditPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        _context: vscode.ExtensionContext,
        _mcpClient: MCPClient
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeAudit',
            'Draagon Forge Audit',
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
    <title>Audit</title>
</head>
<body>
    <h2>Audit Panel</h2>
    <p>Commit audit - coming soon!</p>
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
