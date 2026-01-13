/**
 * Draagon Forge VS Code Extension
 *
 * Entry point for the extension. Handles activation, command registration,
 * and cleanup.
 */

import * as vscode from 'vscode';
import { createMCPClient, MCPClient } from './mcp';
import { PanelManager } from './panel';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { validateConfig } from './utils/config';
import { withRetry } from './utils/errorHandler';

let statusBar: StatusBarManager;
let mcpClient: MCPClient;
let panelManager: PanelManager;

/**
 * Called when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Draagon Forge is activating...');

    const startTime = Date.now();

    try {
        // Validate configuration
        const configErrors = validateConfig();
        if (configErrors.length > 0) {
            vscode.window.showWarningMessage(
                `Draagon Forge configuration issues: ${configErrors.join(', ')}`
            );
        }

        // 1. Initialize status bar immediately
        statusBar = new StatusBarManager();
        context.subscriptions.push(statusBar);

        // 2. Connect to MCP server with retry logic
        statusBar.update('disconnected', 'Connecting to MCP server...');

        try {
            mcpClient = await withRetry(
                () => createMCPClient(context),
                3,  // Max retries
                2000  // Initial delay 2s
            );
            statusBar.update('connected');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            statusBar.update('error', `Failed to connect: ${message}`);

            const selection = await vscode.window.showWarningMessage(
                'Draagon Forge: MCP server unavailable. Some features will be disabled.',
                'Retry',
                'View Logs'
            );

            if (selection === 'Retry') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
                return;
            } else if (selection === 'View Logs') {
                vscode.commands.executeCommand('workbench.action.output.show');
            }

            // Continue activation in degraded mode
            return;
        }

        // 3. Initialize panel manager
        panelManager = new PanelManager(context, mcpClient);
        context.subscriptions.push(panelManager);

        // 4. Register commands
        const commands = registerCommands(context, mcpClient, panelManager);
        context.subscriptions.push(...commands);

        // 5. Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('draagon-forge')) {
                    const selection = vscode.window.showInformationMessage(
                        'Draagon Forge settings changed. Reload to apply.',
                        'Reload'
                    );

                    selection.then(choice => {
                        if (choice === 'Reload') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            })
        );

        const elapsed = Date.now() - startTime;
        console.log(`Draagon Forge activated in ${elapsed}ms`);

        // Show welcome message on first activation
        const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
        if (!hasShownWelcome) {
            const selection = await vscode.window.showInformationMessage(
                'Welcome to Draagon Forge! Open the chat panel with Ctrl+Shift+D.',
                'Open Panel',
                'Don\'t Show Again'
            );

            if (selection === 'Open Panel') {
                vscode.commands.executeCommand('draagon-forge.openPanel');
            }

            context.globalState.update('hasShownWelcome', true);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statusBar?.update('error');
        vscode.window.showErrorMessage(`Draagon Forge activation failed: ${message}`);
        console.error('Activation error:', error);
        throw error;
    }
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
    console.log('Draagon Forge is deactivating...');
    // Disposables are handled automatically by VS Code via context.subscriptions
}
