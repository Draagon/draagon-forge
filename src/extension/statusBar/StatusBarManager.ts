/**
 * Status Bar Manager - Manages the status bar item for Draagon Forge
 */

import * as vscode from 'vscode';

/**
 * Connection status types
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

/**
 * Manages the Draagon Forge status bar item.
 * Shows connection status and provides quick access to the main panel.
 */
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

    /**
     * Update the status bar with the current connection status.
     *
     * @param status - The connection status
     * @param message - Optional tooltip message
     */
    update(status: ConnectionStatus, message?: string): void {
        switch (status) {
            case 'connected':
                this.statusBarItem.text = '$(flame) Draagon';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Connected (click to open)';
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.color = undefined;
                break;

            case 'disconnected':
                this.statusBarItem.text = '$(flame) Draagon (offline)';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Disconnected';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                );
                this.statusBarItem.color = new vscode.ThemeColor(
                    'statusBarItem.warningForeground'
                );
                break;

            case 'error':
                this.statusBarItem.text = '$(flame) Draagon (error)';
                this.statusBarItem.tooltip = message || 'Draagon Forge: Error (click for details)';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.errorBackground'
                );
                this.statusBarItem.color = new vscode.ThemeColor(
                    'statusBarItem.errorForeground'
                );
                break;
        }
    }

    /**
     * Show a temporary notification in the status bar.
     *
     * @param text - The notification text
     * @param timeout - Timeout in milliseconds (default: 3000)
     */
    showNotification(text: string, timeout: number = 3000): void {
        const originalText = this.statusBarItem.text;
        const originalTooltip = this.statusBarItem.tooltip;

        this.statusBarItem.text = `$(flame) ${text}`;
        this.statusBarItem.tooltip = text;

        setTimeout(() => {
            this.statusBarItem.text = originalText;
            this.statusBarItem.tooltip = originalTooltip;
        }, timeout);
    }

    /**
     * Dispose of the status bar item.
     */
    dispose(): void {
        this.statusBarItem.dispose();
    }
}
