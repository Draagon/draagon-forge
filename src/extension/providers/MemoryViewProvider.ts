/**
 * Memory View Provider
 *
 * Compact belief browser with expandable list.
 */

import * as vscode from 'vscode';

interface MemoryItem {
    id: string;
    content: string;
    type: string;
    domain?: string;
    category?: string;
    conviction?: number;
    score?: number;
    source?: string;
    created_at?: string;
}

type ApiStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy' | 'error';

interface ApiStatusInfo {
    status: ApiStatus;
    message: string;
    details?: string;
}

export class MemoryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon-forge.memoryView';

    private _view?: vscode.WebviewView;
    private _memories: MemoryItem[] = [];
    private _isLoading = false;
    private _lastError: string | null = null;
    private _apiStatus: ApiStatusInfo = { status: 'unknown', message: 'Checking API status...' };

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
                case 'checkHealth':
                    await this._checkApiHealth();
                    break;
                case 'retry':
                    await this._checkApiHealth();
                    if (this._apiStatus.status === 'healthy') {
                        await this.refresh();
                    }
                    break;
                case 'search':
                    await this.search(message.query);
                    break;
                case 'reinforce':
                    await this.adjustConviction(message.id, 0.05);
                    break;
                case 'weaken':
                    await this.adjustConviction(message.id, -0.08);
                    break;
                case 'delete':
                    await this.deleteMemory(message.id);
                    break;
                case 'addBelief':
                    await this._showAddBeliefDialog();
                    break;
                case 'openBeliefGraph':
                    await vscode.commands.executeCommand('draagon-forge.openBeliefGraph');
                    break;
                case 'openCodeMesh':
                    await vscode.commands.executeCommand('draagon-forge.openCodeMesh');
                    break;
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this._memories.length === 0 && !this._isLoading) {
                this.refresh();
            }
        });

        if (webviewView.visible) {
            this.refresh();
        }
    }

    /**
     * Check API health and update status.
     */
    private async _checkApiHealth(): Promise<boolean> {
        this._apiStatus = { status: 'checking', message: 'Checking API...' };
        this._updateView();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this._apiUrl}/health`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json() as { status?: string };
                if (data.status === 'healthy') {
                    this._apiStatus = { status: 'healthy', message: 'API connected' };
                    this._updateView();
                    return true;
                }
            }

            this._apiStatus = {
                status: 'unhealthy',
                message: 'API server not responding correctly',
                details: `Server returned status ${response.status}`,
            };
            this._updateView();
            return false;
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);

            // Parse error type for user-friendly message
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to fetch')) {
                this._apiStatus = {
                    status: 'error',
                    message: 'Cannot connect to API server',
                    details: 'The Forge API server is not running.',
                };
            } else if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
                this._apiStatus = {
                    status: 'error',
                    message: 'API server timed out',
                    details: 'Server may be starting up or overloaded.',
                };
            } else {
                this._apiStatus = {
                    status: 'error',
                    message: 'API connection error',
                    details: errorMessage,
                };
            }
            this._updateView();
            return false;
        }
    }

    public async refresh(): Promise<void> {
        if (this._isLoading) return;

        // Check API health first
        const healthy = await this._checkApiHealth();
        if (!healthy) {
            this._memories = [];
            return;
        }

        this._isLoading = true;
        this._lastError = null;
        this._updateView();

        try {
            const response = await fetch(`${this._apiUrl}/beliefs/all`);
            if (!response.ok) {
                // Parse specific HTTP errors
                if (response.status === 500) {
                    throw new Error('Server error - memory backend may not be initialized');
                } else if (response.status === 503) {
                    throw new Error('Service temporarily unavailable');
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as { beliefs?: Record<string, unknown>[] };
            this._memories = (data.beliefs || []).map((r: Record<string, unknown>, i: number) => ({
                id: String(r.id || i),
                content: String(r.content || ''),
                type: 'belief',
                domain: r.domain as string | undefined,
                category: r.category as string | undefined,
                conviction: typeof r.conviction === 'number' ? r.conviction : undefined,
                score: typeof r.conviction === 'number' ? r.conviction : undefined,
                source: r.source as string | undefined,
                created_at: r.created_at as string | undefined,
            }));
            this._apiStatus = { status: 'healthy', message: 'API connected' };
        } catch (e) {
            this._lastError = e instanceof Error ? e.message : String(e);
            this._memories = [];
        } finally {
            this._isLoading = false;
            this._updateView();
        }
    }

    public async search(query: string): Promise<void> {
        if (!query.trim()) {
            await this.refresh();
            return;
        }

        this._isLoading = true;
        this._updateView();

        try {
            const response = await fetch(`${this._apiUrl}/search?query=${encodeURIComponent(query)}&limit=50`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json() as { results?: Record<string, unknown>[] };
            this._memories = (data.results || []).map((r: Record<string, unknown>, i: number) => ({
                id: String(r.id || i),
                content: String(r.content || ''),
                type: String(r.type || 'memory'),
                domain: r.domain as string | undefined,
                category: r.category as string | undefined,
                conviction: typeof r.conviction === 'number' ? r.conviction : typeof r.score === 'number' ? r.score : undefined,
                score: typeof r.score === 'number' ? r.score : undefined,
                source: r.source as string | undefined,
            }));
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            this._isLoading = false;
            this._updateView();
        }
    }

    public async adjustConviction(memoryId: string, delta: number): Promise<boolean> {
        try {
            const action = delta > 0 ? 'reinforce' : 'weaken';
            const response = await fetch(`${this._apiUrl}/beliefs/${encodeURIComponent(memoryId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, reason: `Manual (${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%)` }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json() as { success: boolean };
            if (result.success) {
                await this.refresh();
                return true;
            }
            return false;
        } catch (e) {
            vscode.window.showErrorMessage(`Failed: ${e}`);
            return false;
        }
    }

    public async deleteMemory(memoryId: string, reason?: string): Promise<boolean> {
        if (!reason) {
            const confirm = await vscode.window.showWarningMessage('Delete this belief?', { modal: true }, 'Delete');
            if (confirm !== 'Delete') return false;
        }

        try {
            const response = await fetch(`${this._apiUrl}/beliefs/${encodeURIComponent(memoryId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', reason: reason || 'Deleted via UI' }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json() as { success: boolean };
            if (result.success) {
                await this.refresh();
                return true;
            }
            return false;
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to delete: ${e}`);
            return false;
        }
    }

    public async addBelief(
        content: string,
        options?: { type?: 'principle' | 'pattern' | 'learning' | 'insight'; category?: string; domain?: string; conviction?: number; rationale?: string; }
    ): Promise<boolean> {
        try {
            const response = await fetch(`${this._apiUrl}/beliefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    belief_type: options?.type || 'learning',
                    category: options?.category,
                    domain: options?.domain,
                    conviction: options?.conviction ?? 0.7,
                    rationale: options?.rationale,
                }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await this.refresh();
            return true;
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to add belief: ${e}`);
            return false;
        }
    }

    private async _showAddBeliefDialog(): Promise<void> {
        const content = await vscode.window.showInputBox({
            prompt: 'Enter belief content',
            placeHolder: 'e.g., Always use TypeScript for VS Code extensions',
        });
        if (content) {
            await this.addBelief(content);
        }
    }

    private _updateView(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'update',
                memories: this._memories,
                isLoading: this._isLoading,
                error: this._lastError,
                apiStatus: this._apiStatus,
                apiUrl: this._apiUrl,
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
        .summary-row {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            gap: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            flex-shrink: 0;
        }
        .count {
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        .label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .conviction-bar {
            flex: 1;
            height: 4px;
            background: var(--vscode-input-background);
            border-radius: 2px;
            overflow: hidden;
            display: flex;
        }
        .bar-high { background: var(--vscode-terminal-ansiGreen); }
        .bar-med { background: var(--vscode-terminal-ansiYellow); }
        .bar-low { background: var(--vscode-terminal-ansiRed); }
        .beliefs-list {
            flex: 1;
            overflow-y: auto;
        }
        .belief-row {
            display: flex;
            align-items: center;
            padding: 3px 8px;
            gap: 6px;
            border-bottom: 1px solid var(--vscode-widget-border);
            cursor: pointer;
        }
        .belief-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .conviction-badge {
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
            min-width: 28px;
            text-align: center;
            flex-shrink: 0;
        }
        .conviction-high {
            background: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
        }
        .conviction-med {
            background: var(--vscode-terminal-ansiYellow);
            color: var(--vscode-editor-background);
        }
        .conviction-low {
            background: var(--vscode-terminal-ansiRed);
            color: white;
        }
        .belief-content {
            flex: 1;
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .belief-actions {
            display: flex;
            gap: 2px;
            opacity: 0;
            flex-shrink: 0;
        }
        .belief-row:hover .belief-actions {
            opacity: 1;
        }
        .belief-actions button {
            padding: 1px 4px;
            font-size: 10px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            cursor: pointer;
            opacity: 0.6;
        }
        .belief-actions button:hover {
            opacity: 1;
            background: var(--vscode-button-secondaryBackground);
        }
        .belief-actions button.danger:hover {
            background: var(--vscode-terminal-ansiRed);
            color: white;
        }
        .belief-details {
            display: none;
            padding: 4px 8px 4px 40px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-textBlockQuote-background);
        }
        .belief-row.open + .belief-details {
            display: block;
        }
        .empty, .loading, .error {
            padding: 12px;
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .error { color: var(--vscode-errorForeground); }

        /* API Status Styles */
        .api-status {
            padding: 16px;
            text-align: center;
        }
        .api-status-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }
        .api-status-icon.error { color: var(--vscode-errorForeground); }
        .api-status-icon.checking { color: var(--vscode-textLink-foreground); }
        .api-status-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        .api-status-message {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
        }
        .retry-btn {
            margin-top: 12px;
            padding: 6px 14px;
            font-size: 11px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .retry-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .api-url {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
            opacity: 0.7;
        }

        /* Launcher buttons section */
        .launchers {
            display: flex;
            gap: 4px;
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            flex-shrink: 0;
        }
        .launcher-btn {
            flex: 1;
            padding: 6px 8px;
            font-size: 11px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        .launcher-btn:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .launcher-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .launcher-btn .icon {
            font-size: 12px;
        }

        /* Search and add section */
        .controls {
            display: flex;
            gap: 4px;
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            flex-shrink: 0;
        }
        .controls.disabled {
            opacity: 0.5;
            pointer-events: none;
        }
        .search-input {
            flex: 1;
            padding: 4px 8px;
            font-size: 11px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }
        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .add-btn {
            padding: 4px 8px;
            font-size: 11px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .add-btn:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }
        .add-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* API status indicator in header */
        .api-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            font-size: 10px;
            background: var(--vscode-inputValidation-errorBackground);
            border-bottom: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        .api-indicator.healthy {
            display: none;
        }
        .api-indicator .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-errorForeground);
        }
        .api-indicator.checking .dot {
            background: var(--vscode-textLink-foreground);
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const root = document.getElementById('root');
        let memories = [];
        let apiStatus = { status: 'unknown', message: 'Checking...' };
        let apiUrl = '';
        let searchQuery = '';

        window.addEventListener('message', e => {
            if (e.data.type === 'update') {
                memories = e.data.memories || [];
                apiStatus = e.data.apiStatus || { status: 'unknown', message: 'Unknown' };
                apiUrl = e.data.apiUrl || '';
                render(e.data.isLoading, e.data.error);
            }
        });

        function toggleBelief(idx) {
            const row = document.querySelector('.belief-row[data-idx="' + idx + '"]');
            if (row) row.classList.toggle('open');
        }

        function isApiHealthy() {
            return apiStatus.status === 'healthy';
        }

        function renderLaunchers() {
            const disabled = !isApiHealthy();
            const disabledAttr = disabled ? ' disabled' : '';

            let html = '<div class="launchers">';
            html += '<button class="launcher-btn" data-action="openBeliefGraph"' + disabledAttr + '>';
            html += '<span class="icon">◉</span> Belief Graph';
            html += '</button>';
            html += '<button class="launcher-btn" data-action="openCodeMesh"' + disabledAttr + '>';
            html += '<span class="icon">⬡</span> Code Mesh';
            html += '</button>';
            html += '</div>';
            return html;
        }

        function renderApiIndicator() {
            if (isApiHealthy()) {
                return '';
            }
            const isChecking = apiStatus.status === 'checking';
            const cls = isChecking ? 'checking' : '';
            const msg = isChecking ? 'Connecting...' : apiStatus.message;

            let html = '<div class="api-indicator ' + cls + '">';
            html += '<span class="dot"></span>';
            html += '<span>' + escapeHtml(msg) + '</span>';
            if (!isChecking) {
                html += ' <a href="#" data-action="retry" style="margin-left:auto;color:var(--vscode-textLink-foreground);">Retry</a>';
            }
            html += '</div>';
            return html;
        }

        function renderControls() {
            const disabled = !isApiHealthy();
            const disabledCls = disabled ? ' disabled' : '';
            const disabledAttr = disabled ? ' disabled' : '';

            let html = '<div class="controls' + disabledCls + '">';
            html += '<input type="text" class="search-input" placeholder="Search beliefs..." value="' + escapeHtml(searchQuery) + '"' + disabledAttr + '>';
            html += '<button class="add-btn" data-action="addBelief"' + disabledAttr + '>+ Add</button>';
            html += '</div>';
            return html;
        }

        function renderOfflineMessage() {
            let html = '<div class="api-status">';
            html += '<div class="api-status-icon error">⚠</div>';
            html += '<div class="api-status-title">' + escapeHtml(apiStatus.message) + '</div>';

            if (apiStatus.details) {
                html += '<div class="api-status-message">' + escapeHtml(apiStatus.details) + '</div>';
            }

            html += '<button class="retry-btn" data-action="retry">Retry Connection</button>';

            if (apiUrl) {
                html += '<div class="api-url">' + escapeHtml(apiUrl) + '</div>';
            }

            html += '</div>';
            return html;
        }

        function render(isLoading, error) {
            let html = '';

            // Always show launchers at top (but disabled if API down)
            html += renderLaunchers();

            // Show API indicator if not healthy
            html += renderApiIndicator();

            // Show controls (disabled if API down)
            html += renderControls();

            // Content area
            if (apiStatus.status === 'checking') {
                html += '<div class="loading">Connecting to API...</div>';
                root.innerHTML = html;
                return;
            }

            if (apiStatus.status === 'error' || apiStatus.status === 'unhealthy') {
                html += renderOfflineMessage();
                root.innerHTML = html;
                return;
            }

            if (isLoading) {
                html += '<div class="loading">Loading beliefs...</div>';
                root.innerHTML = html;
                return;
            }

            if (error) {
                html += '<div class="api-status">';
                html += '<div class="api-status-icon error">⚠</div>';
                html += '<div class="api-status-title">Error Loading Beliefs</div>';
                html += '<div class="api-status-message">' + escapeHtml(error) + '</div>';
                html += '<button class="retry-btn" data-action="retry">Retry</button>';
                html += '</div>';
                root.innerHTML = html;
                return;
            }

            const total = memories.length;
            const high = memories.filter(m => (m.conviction || 0) >= 0.8).length;
            const med = memories.filter(m => (m.conviction || 0) >= 0.5 && (m.conviction || 0) < 0.8).length;
            const low = memories.filter(m => (m.conviction || 0) < 0.5).length;
            const highPct = total > 0 ? (high / total * 100) : 0;
            const medPct = total > 0 ? (med / total * 100) : 0;
            const lowPct = total > 0 ? (low / total * 100) : 0;

            html += '<div class="summary-row">';
            html += '<span class="count">' + total + '</span>';
            html += '<span class="label">Beliefs</span>';
            html += '<div class="conviction-bar">';
            html += '<div class="bar-high" style="width:' + highPct + '%"></div>';
            html += '<div class="bar-med" style="width:' + medPct + '%"></div>';
            html += '<div class="bar-low" style="width:' + lowPct + '%"></div>';
            html += '</div>';
            html += '</div>';

            html += '<div class="beliefs-list">';
            if (memories.length === 0) {
                html += '<div class="empty">No beliefs yet</div>';
            } else {
                const sorted = [...memories].sort((a, b) => (b.conviction || 0) - (a.conviction || 0));
                sorted.forEach((m, i) => {
                    const conv = m.conviction !== undefined ? Math.round(m.conviction * 100) : 50;
                    const cls = conv >= 80 ? 'high' : conv >= 50 ? 'med' : 'low';
                    html += '<div class="belief-row" data-idx="' + i + '" data-action="toggleBelief">';
                    html += '<span class="conviction-badge conviction-' + cls + '">' + conv + '%</span>';
                    html += '<span class="belief-content">' + escapeHtml(m.content) + '</span>';
                    html += '<div class="belief-actions">';
                    html += '<button data-action="reinforce" data-id="' + m.id + '" title="+5%">▲</button>';
                    html += '<button data-action="weaken" data-id="' + m.id + '" title="-8%">▼</button>';
                    html += '<button class="danger" data-action="deleteBelief" data-id="' + m.id + '" title="Delete">✕</button>';
                    html += '</div>';
                    html += '</div>';
                    html += '<div class="belief-details">';
                    if (m.domain) html += 'Domain: ' + m.domain + '<br>';
                    if (m.category) html += 'Category: ' + m.category + '<br>';
                    if (m.source) html += 'Source: ' + m.source;
                    html += '</div>';
                });
            }
            html += '</div>';

            root.innerHTML = html;
        }

        function escapeHtml(t) {
            const d = document.createElement('div');
            d.textContent = t;
            return d.innerHTML;
        }

        // Event delegation for all clicks
        root.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            // Don't handle disabled buttons
            if (target.disabled || target.closest('.disabled')) return;
            e.stopPropagation();
            e.preventDefault();
            const action = target.dataset.action;
            if (action === 'toggleBelief') {
                toggleBelief(parseInt(target.dataset.idx));
            } else if (action === 'retry') {
                vscode.postMessage({ command: 'retry' });
            } else if (action === 'openBeliefGraph') {
                vscode.postMessage({ command: 'openBeliefGraph' });
            } else if (action === 'openCodeMesh') {
                vscode.postMessage({ command: 'openCodeMesh' });
            } else if (action === 'addBelief') {
                vscode.postMessage({ command: 'addBelief' });
            } else if (action === 'reinforce') {
                vscode.postMessage({ command: 'reinforce', id: target.dataset.id });
            } else if (action === 'weaken') {
                vscode.postMessage({ command: 'weaken', id: target.dataset.id });
            } else if (action === 'deleteBelief') {
                vscode.postMessage({ command: 'delete', id: target.dataset.id });
            }
        });

        // Search input handler
        root.addEventListener('input', function(e) {
            if (e.target.classList.contains('search-input')) {
                searchQuery = e.target.value;
                // Debounce search
                clearTimeout(window.searchTimeout);
                window.searchTimeout = setTimeout(function() {
                    vscode.postMessage({ command: 'search', query: searchQuery });
                }, 300);
            }
        });

        // Enter key for search
        root.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.classList.contains('search-input')) {
                clearTimeout(window.searchTimeout);
                vscode.postMessage({ command: 'search', query: e.target.value });
            }
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

    public getMemory(memoryId: string): MemoryItem | undefined {
        return this._memories.find(m => m.id === memoryId);
    }

    public dispose(): void {}
}
