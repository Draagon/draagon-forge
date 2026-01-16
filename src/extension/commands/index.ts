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
    openCodeMeshPanel(): void;
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

        // Open code mesh diagrams panel
        vscode.commands.registerCommand('draagon-forge.openCodeMesh', () => {
            panelManager.openCodeMeshPanel();
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

        // =================================================================
        // Code Review Commands
        // =================================================================

        // Review changes (auto-detect mode)
        vscode.commands.registerCommand('draagon-forge.reviewChanges', async () => {
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Auto-detect', value: 'auto' as const, description: 'Detect most relevant mode' },
                    { label: 'Staged changes', value: 'staged' as const, description: 'Review git diff --cached' },
                    { label: 'Unstaged changes', value: 'unstaged' as const, description: 'Review working directory changes' },
                    { label: 'Branch vs main', value: 'branch' as const, description: 'Review all changes since main' },
                ],
                { placeHolder: 'What changes do you want to review?' }
            );

            if (!mode) return;

            await runCodeReview(apiClient, mode.value);
        }),

        // Review staged changes directly
        vscode.commands.registerCommand('draagon-forge.reviewStagedChanges', async () => {
            await runCodeReview(apiClient, 'staged');
        }),

        // Review branch changes directly
        vscode.commands.registerCommand('draagon-forge.reviewBranchChanges', async () => {
            const baseBranch = await vscode.window.showInputBox({
                prompt: 'Base branch to compare against',
                value: 'main',
                placeHolder: 'main',
            });

            if (!baseBranch) return;

            await runCodeReview(apiClient, 'branch', baseBranch);
        }),
    ];
}

/**
 * Run a code review and display results.
 */
async function runCodeReview(
    apiClient: ForgeAPIClient,
    mode: 'auto' | 'staged' | 'unstaged' | 'branch',
    baseBranch?: string
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }

    const repoPath = workspaceFolders[0].uri.fsPath;

    // Show progress
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Reviewing code changes...',
            cancellable: false,
        },
        async (progress) => {
            try {
                // First get a quick summary
                progress.report({ message: 'Analyzing changes...' });
                const summary = await apiClient.getReviewSummary({
                    mode,
                    baseBranch,
                    repoPath,
                });

                if (summary.files_changed === 0) {
                    vscode.window.showInformationMessage('No changes to review');
                    return;
                }

                progress.report({
                    message: `Reviewing ${summary.files_changed} files (${summary.critical_files} critical)...`,
                });

                // Run full review
                const result = await apiClient.reviewCodeChanges({
                    mode,
                    baseBranch,
                    repoPath,
                    includeSuggestions: true,
                });

                // Show results
                showReviewResults(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Code review failed: ${message}`);
            }
        }
    );
}

/**
 * Display code review results in a webview panel.
 */
function showReviewResults(result: import('../api/client').CodeReviewResult): void {
    const panel = vscode.window.createWebviewPanel(
        'codeReviewResults',
        `Code Review: ${result.overall_assessment}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    const assessmentIcon = result.overall_assessment === 'approve'
        ? '✅'
        : result.overall_assessment === 'request_changes'
            ? '❌'
            : '⚠️';

    const assessmentClass = result.overall_assessment === 'approve'
        ? 'approve'
        : result.overall_assessment === 'request_changes'
            ? 'reject'
            : 'discuss';

    const issuesList = (issues: import('../api/client').ReviewIssue[], severityClass: string) =>
        issues.length === 0
            ? '<p class="empty">None</p>'
            : issues.map(issue => `
                <div class="issue ${severityClass}">
                    <div class="issue-header">
                        <span class="file">${issue.file_path}${issue.line ? `:${issue.line}` : ''}</span>
                    </div>
                    <div class="message">${issue.message}</div>
                    ${issue.suggestion ? `<div class="suggestion">💡 ${issue.suggestion}</div>` : ''}
                </div>
            `).join('');

    const violationsList = result.principle_violations.length === 0
        ? '<p class="empty">None</p>'
        : result.principle_violations.map(v => `
            <div class="violation">
                <div class="principle">"${v.principle}" (${(v.conviction * 100).toFixed(0)}% conviction)</div>
                <div class="issue">
                    <span class="file">${v.issue.file_path}${v.issue.line ? `:${v.issue.line}` : ''}</span>
                    <span class="message">${v.issue.message}</span>
                </div>
            </div>
        `).join('');

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
                .header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .assessment {
                    font-size: 24px;
                    font-weight: bold;
                }
                .assessment.approve { color: #4caf50; }
                .assessment.reject { color: #f44336; }
                .assessment.discuss { color: #ff9800; }
                .summary {
                    background: var(--vscode-textBlockQuote-background);
                    padding: 15px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                .stats {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                    margin-bottom: 20px;
                    font-size: 13px;
                    color: var(--vscode-descriptionForeground);
                }
                .stat { display: flex; gap: 5px; }
                .section { margin-bottom: 25px; }
                .section h2 {
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                    color: var(--vscode-descriptionForeground);
                }
                .issue {
                    padding: 10px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    background: var(--vscode-inputValidation-infoBackground);
                }
                .issue.blocking { border-left: 3px solid #f44336; }
                .issue.warning { border-left: 3px solid #ff9800; }
                .issue.suggestion { border-left: 3px solid #2196f3; }
                .issue-header { margin-bottom: 5px; }
                .file {
                    font-family: monospace;
                    font-size: 12px;
                    color: var(--vscode-textLink-foreground);
                }
                .message { margin-bottom: 5px; }
                .suggestion {
                    font-size: 13px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                .violation {
                    padding: 10px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    background: var(--vscode-inputValidation-warningBackground);
                    border-left: 3px solid #ff9800;
                }
                .principle {
                    font-style: italic;
                    margin-bottom: 5px;
                }
                .empty {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                .count {
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 11px;
                    margin-left: 5px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <span style="font-size: 32px">${assessmentIcon}</span>
                <span class="assessment ${assessmentClass}">${result.overall_assessment.replace('_', ' ').toUpperCase()}</span>
            </div>

            <div class="summary">${result.summary}</div>

            <div class="stats">
                <div class="stat"><strong>Mode:</strong> ${result.mode}</div>
                <div class="stat"><strong>Files reviewed:</strong> ${result.files_reviewed}</div>
                <div class="stat"><strong>Files skipped:</strong> ${result.files_skipped}</div>
                <div class="stat"><strong>Lines changed:</strong> ${result.total_lines_changed}</div>
                <div class="stat"><strong>Duration:</strong> ${(result.review_duration_ms / 1000).toFixed(1)}s</div>
                <div class="stat"><strong>Est. cost:</strong> $${(result.estimated_cost_cents / 100).toFixed(3)}</div>
            </div>

            <div class="section">
                <h2>Blocking Issues <span class="count">${result.blocking_issues.length}</span></h2>
                ${issuesList(result.blocking_issues, 'blocking')}
            </div>

            <div class="section">
                <h2>Warnings <span class="count">${result.warnings.length}</span></h2>
                ${issuesList(result.warnings, 'warning')}
            </div>

            <div class="section">
                <h2>Suggestions <span class="count">${result.suggestions.length}</span></h2>
                ${issuesList(result.suggestions, 'suggestion')}
            </div>

            <div class="section">
                <h2>Principle Violations <span class="count">${result.principle_violations.length}</span></h2>
                ${violationsList}
            </div>

            ${result.new_patterns_detected.length > 0 ? `
                <div class="section">
                    <h2>New Patterns Detected <span class="count">${result.new_patterns_detected.length}</span></h2>
                    <ul>
                        ${result.new_patterns_detected.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </body>
        </html>
    `;
}
