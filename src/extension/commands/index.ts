/**
 * Command registration for Draagon Forge extension
 */

import * as vscode from 'vscode';
import { ForgeAPIClient } from '../api/client';
import { AccountViewProvider } from '../providers/AccountViewProvider';
import { MemoryViewProvider } from '../providers/MemoryViewProvider';

/**
 * Panel manager interface (to avoid circular dependencies)
 */
export interface IPanelManager {
    openChatPanel(): void;
    openBeliefPanel(): void;
    openBeliefGraphPanel(): void;
    openWatchlistPanel(): void;
    openAuditPanel(): void;
}

/**
 * Memory item interface for showMemoryDetail command
 */
interface MemoryItem {
    id: string;
    content: string;
    type: string;
    domain?: string;
    category?: string;
    conviction?: number;
    score?: number;
    source?: string;
}

/**
 * Register all Draagon Forge commands.
 *
 * @param context - VS Code extension context
 * @param apiClient - The Forge API client for chat
 * @param _mcpClient - The MCP client for context tools (optional, reserved for future use)
 * @param panelManager - The panel manager instance
 * @param memoryViewProvider - The memory tree view provider
 * @param accountViewProvider - The account webview provider
 * @returns Array of disposables for registered commands
 */
export function registerCommands(
    _context: vscode.ExtensionContext,
    apiClient: ForgeAPIClient,
    _mcpClient: unknown,
    panelManager: IPanelManager,
    memoryViewProvider?: MemoryViewProvider,
    accountViewProvider?: AccountViewProvider
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
                    // Use API client for beliefs
                    const results = await apiClient.queryBeliefs(query);

                    if (results.length === 0) {
                        vscode.window.showInformationMessage('No beliefs found matching your query');
                        return;
                    }

                    // Show results in quick pick
                    const items = results.map(belief => ({
                        label: belief.content.substring(0, 60) + (belief.content.length > 60 ? '...' : ''),
                        description: `${(belief.score * 100).toFixed(0)}% relevance`,
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
                    // Use API client for context search
                    const results = await apiClient.searchContext(query, { limit: 10 });

                    if (results.length === 0) {
                        vscode.window.showInformationMessage('No context found matching your query');
                        return;
                    }

                    // Show results in quick pick
                    const items = results.map(result => ({
                        label: result.content.substring(0, 60) + (result.content.length > 60 ? '...' : ''),
                        description: `${(result.score * 100).toFixed(0)}% relevant`,
                        detail: result.category || 'general',
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

        // Open belief manager panel
        vscode.commands.registerCommand('draagon-forge.openBeliefPanel', () => {
            panelManager.openBeliefPanel();
        }),

        // Open belief graph visualization
        vscode.commands.registerCommand('draagon-forge.openBeliefGraph', () => {
            panelManager.openBeliefGraphPanel();
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
                // TODO: Implement feedback reporting via API
                // For now, just show acknowledgment
                vscode.window.showInformationMessage(
                    `Feedback recorded: ${outcome.label}. Thank you!`
                );
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
            if (memoryViewProvider) {
                await memoryViewProvider.refresh();
            }
        }),

        // =================================================================
        // Memory Commands
        // =================================================================

        // Refresh memory tree
        vscode.commands.registerCommand('draagon-forge.refreshMemory', async () => {
            if (memoryViewProvider) {
                await memoryViewProvider.refresh();
                vscode.window.showInformationMessage('Memory refreshed');
            }
        }),

        // Search memory
        vscode.commands.registerCommand('draagon-forge.searchMemory', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search memories',
                placeHolder: 'e.g., "authentication patterns"',
            });

            if (query && memoryViewProvider) {
                await memoryViewProvider.search(query);
            }
        }),

        // Add new belief
        vscode.commands.registerCommand('draagon-forge.addBelief', async () => {
            const content = await vscode.window.showInputBox({
                prompt: 'Belief content',
                placeHolder: 'e.g., "Always use parameterized queries for SQL"',
            });

            if (!content) return;

            const typeChoice = await vscode.window.showQuickPick(
                [
                    { label: 'Principle', value: 'principle' as const, description: 'Architectural rules' },
                    { label: 'Pattern', value: 'pattern' as const, description: 'Code examples' },
                    { label: 'Learning', value: 'learning' as const, description: 'Extracted insights' },
                    { label: 'Insight', value: 'insight' as const, description: 'Observations' },
                ],
                { placeHolder: 'Select belief type' }
            );

            if (!typeChoice) return;

            const domain = await vscode.window.showInputBox({
                prompt: 'Domain (optional)',
                placeHolder: 'e.g., "security", "architecture", "testing"',
            });

            const convictionStr = await vscode.window.showInputBox({
                prompt: 'Initial conviction (0.0 - 1.0)',
                value: '0.7',
                validateInput: (val) => {
                    const num = parseFloat(val);
                    if (isNaN(num) || num < 0 || num > 1) {
                        return 'Must be a number between 0 and 1';
                    }
                    return null;
                },
            });

            const conviction = parseFloat(convictionStr || '0.7');

            if (memoryViewProvider) {
                await memoryViewProvider.addBelief(content, {
                    type: typeChoice.value,
                    domain: domain || undefined,
                    conviction,
                });
            }
        }),

        // Show memory detail
        vscode.commands.registerCommand('draagon-forge.showMemoryDetail', (memory: MemoryItem) => {
            const panel = vscode.window.createWebviewPanel(
                'memoryDetail',
                `Memory: ${memory.content.substring(0, 30)}...`,
                vscode.ViewColumn.Beside,
                {}
            );

            const convictionBar = memory.conviction !== undefined
                ? '█'.repeat(Math.round(memory.conviction * 10)) + '░'.repeat(10 - Math.round(memory.conviction * 10))
                : 'N/A';

            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            padding: 20px;
                            font-family: var(--vscode-font-family);
                            color: var(--vscode-foreground);
                            background: var(--vscode-editor-background);
                        }
                        .type-badge {
                            display: inline-block;
                            padding: 2px 8px;
                            border-radius: 4px;
                            font-size: 12px;
                            margin-bottom: 10px;
                        }
                        .type-belief { background: #4a90d9; color: white; }
                        .type-insight { background: #7e57c2; color: white; }
                        .type-knowledge { background: #26a69a; color: white; }
                        .type-skill { background: #ff7043; color: white; }
                        .content {
                            font-size: 16px;
                            line-height: 1.5;
                            margin: 20px 0;
                            padding: 15px;
                            background: var(--vscode-textBlockQuote-background);
                            border-radius: 4px;
                        }
                        .meta {
                            color: var(--vscode-descriptionForeground);
                            font-size: 13px;
                        }
                        .meta-row {
                            margin: 5px 0;
                        }
                        .conviction-bar {
                            font-family: monospace;
                            font-size: 14px;
                        }
                    </style>
                </head>
                <body>
                    <span class="type-badge type-${memory.type || 'memory'}">${memory.type || 'Memory'}</span>
                    <div class="content">${memory.content}</div>
                    <div class="meta">
                        ${memory.conviction !== undefined ? `
                            <div class="meta-row">
                                <strong>Conviction:</strong>
                                <span class="conviction-bar">${convictionBar}</span>
                                ${(memory.conviction * 100).toFixed(0)}%
                            </div>
                        ` : ''}
                        ${memory.domain ? `<div class="meta-row"><strong>Domain:</strong> ${memory.domain}</div>` : ''}
                        ${memory.category ? `<div class="meta-row"><strong>Category:</strong> ${memory.category}</div>` : ''}
                        ${memory.source ? `<div class="meta-row"><strong>Source:</strong> ${memory.source}</div>` : ''}
                        <div class="meta-row"><strong>ID:</strong> ${memory.id}</div>
                    </div>
                </body>
                </html>
            `;
        }),

        // Reinforce belief (+5% conviction)
        vscode.commands.registerCommand('draagon-forge.reinforceBelief', async (item: MemoryItem) => {
            if (memoryViewProvider && item?.id) {
                await memoryViewProvider.adjustConviction(item.id, 0.05);
            }
        }),

        // Weaken belief (-8% conviction)
        vscode.commands.registerCommand('draagon-forge.weakenBelief', async (item: MemoryItem) => {
            if (memoryViewProvider && item?.id) {
                await memoryViewProvider.adjustConviction(item.id, -0.08);
            }
        }),

        // Delete belief
        vscode.commands.registerCommand('draagon-forge.deleteBelief', async (item: MemoryItem) => {
            if (memoryViewProvider && item?.id) {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete belief: "${item.content.substring(0, 50)}..."?`,
                    { modal: true },
                    'Delete'
                );

                if (confirm === 'Delete') {
                    await memoryViewProvider.deleteMemory(item.id, 'Deleted via command palette');
                }
            }
        }),

        // =================================================================
        // Account Commands
        // =================================================================

        // Refresh account
        vscode.commands.registerCommand('draagon-forge.refreshAccount', async () => {
            if (accountViewProvider) {
                await accountViewProvider.refresh();
                vscode.window.showInformationMessage('Account info refreshed');
            }
        }),
    ];
}
