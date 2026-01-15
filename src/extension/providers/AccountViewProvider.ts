/**
 * Account View Provider
 *
 * Provides a compact account display with expandable details.
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
    principleCount?: number;
    patternCount?: number;
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

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && !this._accountInfo && !this._isLoading) {
                this.refresh();
            }
        });

        if (webviewView.visible) {
            this.refresh();
        }
    }

    public async refresh(): Promise<void> {
        if (this._isLoading) return;

        this._isLoading = true;
        this._error = null;
        this._updateView();

        try {
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

            this._accountInfo = { ...accountData, usage: usageData };
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
            const response = await fetch(`${this._apiUrl}/account/usage/reset`, { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            vscode.window.showInformationMessage('Session usage reset');
            await this.refresh();
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to reset: ${e instanceof Error ? e.message : e}`);
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
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: transparent;
        }
        #root { height: 100%; display: flex; flex-direction: column; }
        .header {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            gap: 8px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .header:hover { background: var(--vscode-list-hoverBackground); }
        .avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 11px;
            flex-shrink: 0;
        }
        .user-info { flex: 1; min-width: 0; }
        .user-name {
            font-weight: 500;
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .user-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .status-dot.online { background: var(--vscode-terminal-ansiGreen); }
        .status-dot.offline { background: var(--vscode-terminal-ansiRed); }
        .expand-icon {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            transition: transform 0.15s;
        }
        .expanded .expand-icon { transform: rotate(180deg); }
        .details {
            display: none;
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        .expanded .details { display: block; }
        .section { margin-bottom: 10px; }
        .section-title {
            font-size: 9px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2px 12px;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            padding: 1px 0;
        }
        .info-label { color: var(--vscode-descriptionForeground); }
        .info-value { font-weight: 500; }
        .actions {
            display: flex;
            gap: 4px;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        button {
            flex: 1;
            padding: 4px 8px;
            font-size: 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        button:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .loading, .error {
            padding: 12px;
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .error { color: var(--vscode-errorForeground); }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const root = document.getElementById('root');
        let expanded = false;
        let lastData = null;

        window.addEventListener('message', e => {
            if (e.data.type === 'update') {
                lastData = e.data;
                render(e.data);
            }
        });

        function toggle() {
            expanded = !expanded;
            if (lastData) render(lastData);
        }

        function render({ data, isLoading, error }) {
            if (isLoading) {
                root.innerHTML = '<div class="loading">Loading...</div>';
                return;
            }
            if (error) {
                root.innerHTML = '<div class="error">' + error + '</div>';
                return;
            }
            if (!data) {
                root.innerHTML = '<div class="loading">Connecting...</div>';
                return;
            }

            const c = data.claude || {};
            const f = data.forge || {};
            const u = data.usage || {};
            const name = c.displayName || (c.email ? c.email.split('@')[0] : null) || 'Developer';
            const initial = name.charAt(0).toUpperCase();

            let html = '<div class="container' + (expanded ? ' expanded' : '') + '">';

            // Compact header
            html += '<div class="header" data-action="toggle">';
            html += '<div class="avatar">' + initial + '</div>';
            html += '<div class="user-info">';
            html += '<div class="user-name">' + name + '</div>';
            html += '<div class="user-meta">' + (c.email || 'Local Mode') + '</div>';
            html += '</div>';
            html += '<div class="status-dot ' + (c.authenticated ? 'online' : 'offline') + '"></div>';
            html += '<span class="expand-icon">▼</span>';
            html += '</div>';

            // Expandable details
            html += '<div class="details">';

            // Claude section
            if (c.email) {
                html += '<div class="section">';
                html += '<div class="section-title">Claude Account</div>';
                html += '<div class="info-grid">';
                html += '<div class="info-item"><span class="info-label">Auth</span><span class="info-value">' + (c.authType === 'oauth' ? 'OAuth' : 'API Key') + '</span></div>';
                html += '<div class="info-item"><span class="info-label">Plan</span><span class="info-value">' + (c.hasSubscription ? 'Pro' : 'Free') + '</span></div>';
                if (c.organizationName) {
                    html += '<div class="info-item"><span class="info-label">Org</span><span class="info-value">' + c.organizationName + '</span></div>';
                }
                html += '<div class="info-item"><span class="info-label">Sessions</span><span class="info-value">' + (c.numStartups || 0) + '</span></div>';
                html += '</div></div>';
            }

            // Forge section
            html += '<div class="section">';
            html += '<div class="section-title">Forge Context</div>';
            html += '<div class="info-grid">';
            html += '<div class="info-item"><span class="info-label">Agent</span><span class="info-value">' + (f.agentId || 'draagon-forge') + '</span></div>';
            html += '<div class="info-item"><span class="info-label">Project</span><span class="info-value">' + (f.projectName || 'default') + '</span></div>';
            html += '<div class="info-item"><span class="info-label">Beliefs</span><span class="info-value">' + (f.beliefCount || 0) + '</span></div>';
            html += '<div class="info-item"><span class="info-label">Memories</span><span class="info-value">' + (f.memoryCount || 0) + '</span></div>';
            html += '</div></div>';

            // Session usage
            if (u.totalTokens > 0 || u.totalCalls > 0) {
                const cost = (u.totalCostCents || 0) / 100;
                html += '<div class="section">';
                html += '<div class="section-title">This Session</div>';
                html += '<div class="info-grid">';
                html += '<div class="info-item"><span class="info-label">Tokens</span><span class="info-value">' + fmt(u.totalTokens || 0) + '</span></div>';
                html += '<div class="info-item"><span class="info-label">Calls</span><span class="info-value">' + (u.totalCalls || 0) + '</span></div>';
                html += '<div class="info-item"><span class="info-label">Cost</span><span class="info-value">' + (cost > 0 ? '$' + cost.toFixed(2) : 'Free') + '</span></div>';
                html += '</div></div>';
            }

            // Action buttons
            html += '<div class="actions">';
            html += '<button data-action="openClaude">Claude.ai</button>';
            html += '<button data-action="openDocs">Docs</button>';
            html += '<button data-action="refresh">Refresh</button>';
            html += '</div>';

            html += '</div></div>';
            root.innerHTML = html;
        }

        function fmt(n) {
            if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
            if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
            return String(n);
        }

        root.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'toggle') toggle();
            else vscode.postMessage({ command: action });
        });

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

    public dispose(): void {}
}
