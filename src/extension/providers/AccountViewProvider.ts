/**
 * Account View Provider
 *
 * Provides a webview showing Claude Code account information and
 * Draagon Forge identity/stats.
 */

import * as vscode from 'vscode';

interface ClaudeAccountInfo {
    authenticated: boolean;
    authType: 'oauth' | 'api_key' | 'none';
    email?: string;
    displayName?: string;
    organizationName?: string;
    organizationRole?: string;
    hasSubscription?: boolean;
    hasExtraUsage?: boolean;
    numStartups?: number;
    promptCount?: number;
    memberSince?: string;
    accountUuid?: string;
    workspaceUuid?: string;
}

interface ForgeAccountInfo {
    userId: string;
    agentId: string;
    projectName: string;
    memoryCount: number;
    beliefCount: number;
}

interface ModelUsage {
    modelId: string;
    provider: string;
    callCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostCents: number;
}

interface SessionUsage {
    sessionId: string;
    userId: string;
    startedAt: string;
    durationSeconds: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCostCents: number;
    totalCalls: number;
    models: Record<string, ModelUsage>;
}

interface CombinedAccountInfo {
    claude: ClaudeAccountInfo;
    forge: ForgeAccountInfo;
    usage?: SessionUsage;
}

export class AccountViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon-forge.accountView';

    private _view?: vscode.WebviewView;
    private _accountInfo: CombinedAccountInfo | null = null;
    private _isLoading = false;
    private _error: string | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _apiUrl: string
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    await this.refresh();
                    break;
                case 'resetUsage':
                    await this._resetUsage();
                    break;
                case 'openClaude':
                    vscode.env.openExternal(vscode.Uri.parse('https://claude.ai'));
                    break;
                case 'openDocs':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/draagon-ai/draagon-forge'));
                    break;
            }
        });

        // Initial load when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && !this._accountInfo && !this._isLoading) {
                this.refresh();
            }
        });

        // Initial load
        if (webviewView.visible) {
            this.refresh();
        }
    }

    public async refresh(): Promise<void> {
        if (this._isLoading) {
            return;
        }

        this._isLoading = true;
        this._error = null;
        this._updateView();

        try {
            // Fetch account and usage data in parallel
            const [accountResponse, usageResponse] = await Promise.all([
                fetch(`${this._apiUrl}/account`),
                fetch(`${this._apiUrl}/account/usage`),
            ]);

            if (!accountResponse.ok) {
                throw new Error(`HTTP ${accountResponse.status}`);
            }

            const accountData = await accountResponse.json() as { claude: ClaudeAccountInfo; forge: ForgeAccountInfo };
            let usageData: SessionUsage | undefined;

            if (usageResponse.ok) {
                usageData = await usageResponse.json() as SessionUsage;
            }

            this._accountInfo = {
                ...accountData,
                usage: usageData,
            };
            this._error = null;
        } catch (e) {
            this._error = e instanceof Error ? e.message : String(e);
            console.error('Failed to fetch account info:', e);
        } finally {
            this._isLoading = false;
            this._updateView();
        }
    }

    private async _resetUsage(): Promise<void> {
        try {
            const response = await fetch(`${this._apiUrl}/account/usage/reset`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            vscode.window.showInformationMessage('Session usage has been reset');
            await this.refresh();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`Failed to reset usage: ${message}`);
        }
    }

    private _updateView(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'update',
                data: this._accountInfo,
                isLoading: this._isLoading,
                error: this._error,
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Account</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, system-ui);
        }
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .container {
            padding: 12px;
        }
        .section {
            margin-bottom: 16px;
            padding: 12px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
        }
        .section-title {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .info-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .info-icon {
            width: 16px;
            text-align: center;
            flex-shrink: 0;
        }
        .info-label {
            color: var(--vscode-descriptionForeground);
            min-width: 60px;
        }
        .info-value {
            flex: 1;
            font-weight: 500;
        }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
        }
        .badge.success {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        .badge.warning {
            background: var(--vscode-testing-iconQueued);
            color: black;
        }
        .badge.error {
            background: var(--vscode-testing-iconFailed);
            color: white;
        }
        .badge.info {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 8px;
        }
        .stat-box {
            background: var(--vscode-input-background);
            border-radius: 4px;
            padding: 8px;
            text-align: center;
        }
        .stat-value {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        .actions button {
            flex: 1;
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        .actions button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .actions button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .actions button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.small {
            padding: 4px 8px;
            font-size: 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        button.small:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }
        .error {
            text-align: center;
            padding: 20px;
            color: var(--vscode-errorForeground);
        }
        .not-authenticated {
            text-align: center;
            padding: 20px;
        }
        .not-authenticated p {
            margin-bottom: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .toolbar {
            display: flex;
            justify-content: flex-end;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .toolbar button {
            padding: 4px 8px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.7;
        }
        .toolbar button:hover {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="refreshBtn" title="Refresh">&#x21bb;</button>
    </div>
    <div class="container" id="content">
        <div class="loading">Loading account information...</div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const content = document.getElementById('content');
        const refreshBtn = document.getElementById('refreshBtn');

        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.type === 'update') {
                renderAccount(message.data, message.isLoading, message.error);
            }
        });

        function renderAccount(data, isLoading, error) {
            if (isLoading) {
                content.innerHTML = '<div class="loading">Loading account information...</div>';
                return;
            }

            if (error) {
                content.innerHTML = \`
                    <div class="error">
                        <p>Failed to load account: \${error}</p>
                        <button onclick="vscode.postMessage({ command: 'refresh' })">Retry</button>
                    </div>
                \`;
                return;
            }

            if (!data) {
                content.innerHTML = '<div class="loading">Waiting for data...</div>';
                return;
            }

            const claude = data.claude || {};
            const forge = data.forge || {};

            let html = '';

            // Claude Code Section
            html += '<div class="section">';
            html += '<div class="section-title">Claude Code</div>';

            if (claude.authenticated) {
                if (claude.displayName || claude.email) {
                    html += \`
                        <div class="info-row">
                            <span class="info-icon">&#x1F464;</span>
                            <span class="info-value">\${claude.displayName || claude.email}</span>
                        </div>
                    \`;
                }

                if (claude.email && claude.displayName) {
                    html += \`
                        <div class="info-row">
                            <span class="info-icon">&#x2709;</span>
                            <span class="info-value">\${claude.email}</span>
                        </div>
                    \`;
                }

                if (claude.organizationName) {
                    html += \`
                        <div class="info-row">
                            <span class="info-icon">&#x1F3E2;</span>
                            <span class="info-value">\${claude.organizationName}</span>
                            \${claude.organizationRole ? \`<span class="badge info">\${claude.organizationRole}</span>\` : ''}
                        </div>
                    \`;
                }

                html += \`
                    <div class="info-row">
                        <span class="info-icon">&#x1F512;</span>
                        <span class="info-label">Auth:</span>
                        <span class="info-value">\${claude.authType === 'oauth' ? 'OAuth' : claude.authType === 'api_key' ? 'API Key' : 'Unknown'}</span>
                        <span class="badge \${claude.hasSubscription ? 'success' : 'warning'}">\${claude.hasSubscription ? 'Pro' : 'Free'}</span>
                    </div>
                \`;

                // Stats grid
                html += '<div class="stats-grid">';
                html += \`
                    <div class="stat-box">
                        <div class="stat-value">\${formatNumber(claude.numStartups || 0)}</div>
                        <div class="stat-label">Sessions</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">\${formatNumber(claude.promptCount || 0)}</div>
                        <div class="stat-label">Prompts</div>
                    </div>
                \`;
                html += '</div>';
            } else {
                html += \`
                    <div class="not-authenticated">
                        <p>Not authenticated with Claude Code</p>
                        <button class="primary" onclick="vscode.postMessage({ command: 'openClaude' })">Sign In</button>
                    </div>
                \`;
            }

            html += '</div>'; // End Claude section

            // Forge Section
            html += '<div class="section">';
            html += '<div class="section-title">Draagon Forge</div>';

            html += \`
                <div class="info-row">
                    <span class="info-icon">&#x1F525;</span>
                    <span class="info-label">User:</span>
                    <span class="info-value">\${forge.userId || 'unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-icon">&#x1F916;</span>
                    <span class="info-label">Agent:</span>
                    <span class="info-value">\${forge.agentId || 'draagon-forge'}</span>
                </div>
                <div class="info-row">
                    <span class="info-icon">&#x1F4C1;</span>
                    <span class="info-label">Project:</span>
                    <span class="info-value">\${forge.projectName || 'default'}</span>
                </div>
            \`;

            // Forge stats grid
            html += '<div class="stats-grid">';
            html += \`
                <div class="stat-box">
                    <div class="stat-value">\${forge.memoryCount || 0}</div>
                    <div class="stat-label">Memories</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">\${forge.beliefCount || 0}</div>
                    <div class="stat-label">Beliefs</div>
                </div>
            \`;
            html += '</div>';

            html += '</div>'; // End Forge section

            // Usage Section
            const usage = data.usage;
            if (usage) {
                html += '<div class="section">';
                html += '<div class="section-title">Session Usage</div>';

                // Token totals
                html += '<div class="stats-grid">';
                html += \`
                    <div class="stat-box">
                        <div class="stat-value">\${formatNumber(usage.totalTokens || 0)}</div>
                        <div class="stat-label">Tokens</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">\${usage.totalCalls || 0}</div>
                        <div class="stat-label">Calls</div>
                    </div>
                \`;
                html += '</div>';

                // Cost
                const costDollars = (usage.totalCostCents || 0) / 100;
                html += \`
                    <div class="info-row" style="margin-top: 10px;">
                        <span class="info-icon">&#x1F4B0;</span>
                        <span class="info-label">Est. Cost:</span>
                        <span class="info-value">\${costDollars < 0.01 ? 'Free' : '$' + costDollars.toFixed(2)}</span>
                    </div>
                \`;

                // Model breakdown
                const models = usage.models || {};
                const modelEntries = Object.entries(models);
                if (modelEntries.length > 0) {
                    html += '<div style="margin-top: 10px; font-size: 10px; color: var(--vscode-descriptionForeground);">Models:</div>';
                    html += '<div style="margin-top: 4px;">';
                    for (const [modelId, model] of modelEntries) {
                        const modelCost = (model.estimatedCostCents || 0) / 100;
                        const icon = model.provider === 'groq' ? '&#x26A1;' : model.provider === 'anthropic' ? '&#x1F9E0;' : '&#x1F916;';
                        html += \`
                            <div class="info-row" style="font-size: 11px;">
                                <span class="info-icon" style="font-size: 10px;">\${icon}</span>
                                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${modelId.split('/').pop() || modelId}</span>
                                <span style="color: var(--vscode-descriptionForeground);">\${model.callCount}x</span>
                                <span style="min-width: 50px; text-align: right;">\${modelCost < 0.01 ? 'Free' : '$' + modelCost.toFixed(2)}</span>
                            </div>
                        \`;
                    }
                    html += '</div>';
                }

                // Reset button
                html += \`
                    <div style="margin-top: 10px;">
                        <button class="small" onclick="vscode.postMessage({ command: 'resetUsage' })">Reset Session</button>
                    </div>
                \`;

                html += '</div>'; // End Usage section
            }

            // Actions
            html += \`
                <div class="actions">
                    <button onclick="vscode.postMessage({ command: 'openClaude' })">Open Claude</button>
                    <button onclick="vscode.postMessage({ command: 'openDocs' })">Docs</button>
                </div>
            \`;

            content.innerHTML = html;
        }

        function formatNumber(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            }
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toString();
        }

        // Request initial data
        vscode.postMessage({ command: 'refresh' });
    </script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        // Cleanup if needed
    }
}
