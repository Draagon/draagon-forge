/**
 * Draagon Forge VS Code Extension
 *
 * Entry point for the extension. Handles activation, command registration,
 * and cleanup.
 */

import * as vscode from 'vscode';

/**
 * Called when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Draagon Forge is activating...');

    try {
        // TODO: Initialize MCP client
        // TODO: Register commands
        // TODO: Initialize panels
        // TODO: Start watchers

        // Register placeholder commands
        context.subscriptions.push(
            vscode.commands.registerCommand('draagon-forge.openPanel', () => {
                vscode.window.showInformationMessage('Draagon Forge: Panel coming soon!');
            }),
            vscode.commands.registerCommand('draagon-forge.queryBeliefs', () => {
                vscode.window.showInformationMessage('Draagon Forge: Beliefs panel coming soon!');
            }),
            vscode.commands.registerCommand('draagon-forge.openWatchlist', () => {
                vscode.window.showInformationMessage('Draagon Forge: Watchlist coming soon!');
            }),
            vscode.commands.registerCommand('draagon-forge.openAudit', () => {
                vscode.window.showInformationMessage('Draagon Forge: Audit panel coming soon!');
            }),
        );

        // Show status bar item
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.text = '$(flame) Draagon Forge';
        statusBarItem.command = 'draagon-forge.openPanel';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        console.log('Draagon Forge activated successfully');
    } catch (error) {
        vscode.window.showErrorMessage(`Draagon Forge activation failed: ${error}`);
        throw error;
    }
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
    console.log('Draagon Forge is deactivating...');
}
