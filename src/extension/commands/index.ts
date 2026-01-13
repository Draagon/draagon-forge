/**
 * Command registration for Draagon Forge extension
 */

import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';

/**
 * Panel manager interface (to avoid circular dependencies)
 */
export interface IPanelManager {
    openChatPanel(): void;
    openBeliefPanel(): void;
    openWatchlistPanel(): void;
    openAuditPanel(): void;
}

/**
 * Register all Draagon Forge commands.
 *
 * @param context - VS Code extension context
 * @param mcpClient - The MCP client instance
 * @param panelManager - The panel manager instance
 * @returns Array of disposables for registered commands
 */
export function registerCommands(
    _context: vscode.ExtensionContext,
    mcpClient: MCPClient,
    panelManager: IPanelManager
): vscode.Disposable[] {
    return [
        // Open main chat panel
        vscode.commands.registerCommand('draagon-forge.openPanel', () => {
            panelManager.openChatPanel();
        }),

        // Query beliefs
        vscode.commands.registerCommand('draagon-forge.queryBeliefs', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search beliefs',
                placeHolder: 'e.g., "Why do we use XML for LLM output?"',
            });

            if (query) {
                try {
                    const results = await mcpClient.queryBeliefs(query);

                    if (results.length === 0) {
                        vscode.window.showInformationMessage('No beliefs found matching your query');
                        return;
                    }

                    // Show results in quick pick
                    const items = results.map(belief => ({
                        label: belief.content.substring(0, 60) + (belief.content.length > 60 ? '...' : ''),
                        description: `${(belief.conviction * 100).toFixed(0)}% conviction`,
                        detail: belief.domain || 'general',
                        belief,
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select a belief to view details',
                    });

                    if (selected) {
                        vscode.window.showInformationMessage(selected.belief.content);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to query beliefs: ${error}`);
                }
            }
        }),

        // Search context
        vscode.commands.registerCommand('draagon-forge.searchContext', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search context',
                placeHolder: 'Search for code patterns, principles, or examples',
            });

            if (query) {
                try {
                    const results = await mcpClient.searchContext(query, { limit: 10 });

                    if (results.length === 0) {
                        vscode.window.showInformationMessage('No context found matching your query');
                        return;
                    }

                    // Show results in quick pick
                    const items = results.map(result => ({
                        label: result.content.substring(0, 60) + (result.content.length > 60 ? '...' : ''),
                        description: `${(result.score * 100).toFixed(0)}% relevant`,
                        detail: `${result.type} from ${result.source}`,
                        result,
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select a context item to view details',
                    });

                    if (selected) {
                        vscode.window.showInformationMessage(selected.result.content);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to search context: ${error}`);
                }
            }
        }),

        // Open watchlist
        vscode.commands.registerCommand('draagon-forge.openWatchlist', () => {
            panelManager.openWatchlistPanel();
        }),

        // Open audit panel
        vscode.commands.registerCommand('draagon-forge.openAudit', () => {
            panelManager.openAuditPanel();
        }),

        // Report outcome
        vscode.commands.registerCommand('draagon-forge.reportOutcome', async () => {
            const outcome = await vscode.window.showQuickPick(
                [
                    { label: 'Helpful', value: 'helpful' },
                    { label: 'Not Helpful', value: 'not_helpful' },
                    { label: 'Misleading', value: 'misleading' },
                    { label: 'Outdated', value: 'outdated' },
                ],
                { placeHolder: 'How was the recent context?' }
            );

            if (outcome) {
                try {
                    await mcpClient.reportOutcome({
                        context_ids: [], // TODO: Track last provided context IDs
                        outcome: outcome.value as 'helpful' | 'not_helpful' | 'misleading' | 'outdated',
                    });
                    vscode.window.showInformationMessage('Feedback recorded. Thank you!');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to report outcome: ${error}`);
                }
            }
        }),

        // Add watch rule
        vscode.commands.registerCommand('draagon-forge.addWatchRule', async () => {
            vscode.window.showInformationMessage('Watch rule management coming soon!');
        }),

        // Audit current file
        vscode.commands.registerCommand('draagon-forge.auditCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file is currently open');
                return;
            }

            vscode.window.showInformationMessage(
                `Auditing ${editor.document.fileName} (coming soon!)`
            );
        }),

        // Refresh
        vscode.commands.registerCommand('draagon-forge.refresh', async () => {
            vscode.window.showInformationMessage('Refreshing Draagon Forge...');
            // TODO: Implement refresh logic
        }),
    ];
}
