/**
 * Belief Panel - Belief manager UI for Draagon Forge
 *
 * Implements REQ-005: Belief Manager
 * Provides UI for querying, viewing, and adjusting beliefs through a webview.
 */

import * as vscode from 'vscode';
import { ForgeAPIClient } from '../api/client';

/**
 * Belief item from the API
 */
interface Belief {
    id: string;
    content: string;
    type: string;  // principle, pattern, learning, insight
    conviction: number;
    confidence?: number;
    domain?: string;
    category?: string;
    source?: string;
    usage_count?: number;
    last_used?: string;
    created_at?: string;
}

/**
 * Belief panel for managing and browsing beliefs.
 * Opens as a standalone webview panel with full CRUD operations.
 */
export class BeliefPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();
    private beliefs: Belief[] = [];
    private selectedBelief: Belief | null = null;
    private currentFilter: { query: string; type: string; domain: string } = {
        query: '',
        type: 'all',
        domain: 'all',
    };

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        context: vscode.ExtensionContext,
        private apiClient: ForgeAPIClient
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeBeliefs',
            'Draagon Forge Beliefs',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'resources'),
                ],
            }
        );

        // Set up webview message handler
        this.panel.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this.disposables
        );

        // Initial load
        this.loadBeliefs();
    }

    /**
     * Handle messages from the webview.
     */
    private async handleMessage(message: {
        command: string;
        [key: string]: unknown;
    }): Promise<void> {
        switch (message.command) {
            case 'refresh':
                await this.loadBeliefs();
                break;

            case 'search':
                this.currentFilter.query = message.query as string;
                await this.loadBeliefs();
                break;

            case 'filterType':
                this.currentFilter.type = message.type as string;
                await this.loadBeliefs();
                break;

            case 'filterDomain':
                this.currentFilter.domain = message.domain as string;
                await this.loadBeliefs();
                break;

            case 'selectBelief':
                this.selectedBelief = this.beliefs.find(b => b.id === message.id) || null;
                this.updatePanel();
                break;

            case 'addBelief':
                await this.addBelief(message as {
                    command: string;
                    content: string;
                    type: string;
                    domain?: string;
                    conviction: number;
                });
                break;

            case 'reinforce':
                await this.adjustConviction(message.id as string, 0.05);
                break;

            case 'weaken':
                await this.adjustConviction(message.id as string, -0.08);
                break;

            case 'modify':
                await this.modifyBelief(message.id as string, message.content as string);
                break;

            case 'delete':
                await this.deleteBelief(message.id as string);
                break;
        }
    }

    /**
     * Load beliefs from the API.
     */
    private async loadBeliefs(): Promise<void> {
        try {
            const results = await this.apiClient.queryBeliefs(
                this.currentFilter.query || undefined,
                { limit: 100 }
            );

            // Transform API results to Belief type
            this.beliefs = results.map((r, i) => ({
                id: r.id || String(i),
                content: r.content,
                type: (r as unknown as { type?: string }).type || r.category || 'belief',
                conviction: r.score || 0.7,
                domain: r.domain,
                category: r.category,
            }));

            // Apply local filters
            if (this.currentFilter.type !== 'all') {
                this.beliefs = this.beliefs.filter(
                    b => b.type === this.currentFilter.type
                );
            }
            if (this.currentFilter.domain !== 'all') {
                this.beliefs = this.beliefs.filter(
                    b => b.domain === this.currentFilter.domain
                );
            }

            this.updatePanel();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load beliefs: ${error}`);
        }
    }

    /**
     * Add a new belief.
     */
    private async addBelief(message: {
        content: string;
        type: string;
        domain?: string;
        conviction: number;
    }): Promise<void> {
        try {
            await this.apiClient.addBelief(message.content, {
                category: message.type,
                domain: message.domain,
                conviction: message.conviction,
            });
            vscode.window.showInformationMessage('Belief added successfully');
            await this.loadBeliefs();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add belief: ${error}`);
        }
    }

    /**
     * Adjust belief conviction.
     */
    private async adjustConviction(beliefId: string, delta: number): Promise<void> {
        try {
            await this.apiClient.adjustBelief(beliefId, {
                action: delta > 0 ? 'reinforce' : 'weaken',
            });

            // Update local state
            const belief = this.beliefs.find(b => b.id === beliefId);
            if (belief) {
                belief.conviction = Math.max(0, Math.min(1, belief.conviction + delta));
            }

            vscode.window.showInformationMessage(
                `Belief ${delta > 0 ? 'reinforced' : 'weakened'}: ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`
            );
            this.updatePanel();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to adjust conviction: ${error}`);
        }
    }

    /**
     * Modify belief content.
     */
    private async modifyBelief(beliefId: string, newContent: string): Promise<void> {
        try {
            await this.apiClient.adjustBelief(beliefId, {
                action: 'modify',
                content: newContent,
            });
            vscode.window.showInformationMessage('Belief modified successfully');
            await this.loadBeliefs();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to modify belief: ${error}`);
        }
    }

    /**
     * Delete a belief.
     */
    private async deleteBelief(beliefId: string): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this belief?',
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.apiClient.adjustBelief(beliefId, {
                action: 'delete',
            });
            vscode.window.showInformationMessage('Belief deleted');
            this.selectedBelief = null;
            await this.loadBeliefs();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete belief: ${error}`);
        }
    }

    /**
     * Update the panel HTML.
     */
    private updatePanel(): void {
        this.panel.webview.html = this.getHtmlContent();
    }

    /**
     * Generate the webview HTML content.
     */
    private getHtmlContent(): string {
        const nonce = this.getNonce();

        // Extract unique domains for filter
        const domains = [...new Set(this.beliefs.map(b => b.domain).filter(Boolean))];

        // Sort beliefs by conviction
        const sortedBeliefs = [...this.beliefs].sort((a, b) => b.conviction - a.conviction);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Beliefs</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --list-hover: var(--vscode-list-hoverBackground);
            --list-active: var(--vscode-list-activeSelectionBackground);
            --badge-principle: #4a90d9;
            --badge-pattern: #26a69a;
            --badge-learning: #7e57c2;
            --badge-insight: #ff7043;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg);
            background: var(--bg);
            padding: 16px;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            height: calc(100vh - 32px);
        }
        .panel {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--border);
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .panel-header {
            padding: 12px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }
        .panel-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        input, select {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            color: var(--fg);
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 13px;
        }
        input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        input[type="search"] {
            flex: 1;
            min-width: 200px;
        }
        button {
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        button:hover {
            background: var(--button-hover);
        }
        button.secondary {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--fg);
        }
        button.danger {
            background: #d9534f;
        }
        button.danger:hover {
            background: #c9302c;
        }
        .belief-list {
            list-style: none;
        }
        .belief-item {
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 4px;
            cursor: pointer;
            border: 1px solid transparent;
        }
        .belief-item:hover {
            background: var(--list-hover);
        }
        .belief-item.selected {
            background: var(--list-active);
            border-color: var(--vscode-focusBorder);
        }
        .belief-content {
            font-size: 13px;
            line-height: 1.4;
            margin-bottom: 6px;
        }
        .belief-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-principle { background: var(--badge-principle); color: white; }
        .badge-pattern { background: var(--badge-pattern); color: white; }
        .badge-learning { background: var(--badge-learning); color: white; }
        .badge-insight { background: var(--badge-insight); color: white; }
        .badge-belief { background: #555; color: white; }
        .conviction-bar {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .conviction-track {
            width: 60px;
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            overflow: hidden;
        }
        .conviction-fill {
            height: 100%;
            background: var(--vscode-progressBar-background);
            transition: width 0.3s ease;
        }
        .detail-section {
            margin-bottom: 16px;
        }
        .detail-section h3 {
            font-size: 12px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .detail-content {
            background: var(--vscode-textBlockQuote-background);
            padding: 12px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1.5;
        }
        .detail-meta {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 8px 12px;
            font-size: 13px;
        }
        .detail-meta dt {
            color: var(--vscode-descriptionForeground);
        }
        .action-buttons {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px 20px;
        }
        .form-group {
            margin-bottom: 12px;
        }
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .form-group input, .form-group select, .form-group textarea {
            width: 100%;
        }
        textarea {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            color: var(--fg);
            padding: 8px;
            border-radius: 4px;
            font-family: inherit;
            font-size: 13px;
            resize: vertical;
            min-height: 80px;
        }
        .conviction-input {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .conviction-input input[type="range"] {
            flex: 1;
        }
        .add-form {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .add-form-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .add-form h3 {
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Left panel: Belief list -->
        <div class="panel">
            <div class="panel-header">
                Beliefs (${this.beliefs.length})
            </div>
            <div class="panel-content">
                <div class="toolbar">
                    <input type="search" id="searchInput" placeholder="Search beliefs..."
                           value="${this.escapeHtml(this.currentFilter.query)}">
                    <select id="typeFilter">
                        <option value="all" ${this.currentFilter.type === 'all' ? 'selected' : ''}>All Types</option>
                        <option value="principle" ${this.currentFilter.type === 'principle' ? 'selected' : ''}>Principles</option>
                        <option value="pattern" ${this.currentFilter.type === 'pattern' ? 'selected' : ''}>Patterns</option>
                        <option value="learning" ${this.currentFilter.type === 'learning' ? 'selected' : ''}>Learnings</option>
                        <option value="insight" ${this.currentFilter.type === 'insight' ? 'selected' : ''}>Insights</option>
                    </select>
                    <select id="domainFilter">
                        <option value="all" ${this.currentFilter.domain === 'all' ? 'selected' : ''}>All Domains</option>
                        ${domains.map(d => `<option value="${d}" ${this.currentFilter.domain === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                    <button onclick="refresh()">↻ Refresh</button>
                </div>

                ${sortedBeliefs.length === 0 ? `
                    <div class="empty-state">
                        <p>No beliefs found</p>
                        <p>Add a new belief or adjust your filters</p>
                    </div>
                ` : `
                    <ul class="belief-list">
                        ${sortedBeliefs.map(belief => `
                            <li class="belief-item ${this.selectedBelief?.id === belief.id ? 'selected' : ''}"
                                onclick="selectBelief('${belief.id}')">
                                <div class="belief-content">${this.escapeHtml(this.truncate(belief.content, 100))}</div>
                                <div class="belief-meta">
                                    <span class="badge badge-${belief.type}">${belief.type}</span>
                                    ${belief.domain ? `<span>${belief.domain}</span>` : ''}
                                    <div class="conviction-bar">
                                        <div class="conviction-track">
                                            <div class="conviction-fill" style="width: ${belief.conviction * 100}%"></div>
                                        </div>
                                        <span>${(belief.conviction * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                `}
            </div>
        </div>

        <!-- Right panel: Detail/Add -->
        <div class="panel">
            <div class="panel-header">
                ${this.selectedBelief ? 'Belief Details' : 'Add New Belief'}
            </div>
            <div class="panel-content">
                ${this.selectedBelief ? this.renderBeliefDetail(this.selectedBelief) : this.renderAddForm()}
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            vscode.postMessage({ command: 'search', query: e.target.value });
        });

        // Filters
        document.getElementById('typeFilter').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'filterType', type: e.target.value });
        });

        document.getElementById('domainFilter').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'filterDomain', domain: e.target.value });
        });

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function selectBelief(id) {
            vscode.postMessage({ command: 'selectBelief', id: id });
        }

        function reinforce(id) {
            vscode.postMessage({ command: 'reinforce', id: id });
        }

        function weaken(id) {
            vscode.postMessage({ command: 'weaken', id: id });
        }

        function deleteBelief(id) {
            vscode.postMessage({ command: 'delete', id: id });
        }

        function clearSelection() {
            vscode.postMessage({ command: 'selectBelief', id: null });
        }

        function addBelief() {
            const content = document.getElementById('newContent').value;
            const type = document.getElementById('newType').value;
            const domain = document.getElementById('newDomain').value;
            const conviction = parseFloat(document.getElementById('newConviction').value);

            if (!content.trim()) {
                alert('Please enter belief content');
                return;
            }

            vscode.postMessage({
                command: 'addBelief',
                content: content,
                type: type,
                domain: domain || undefined,
                conviction: conviction
            });

            // Clear form
            document.getElementById('newContent').value = '';
            document.getElementById('newDomain').value = '';
        }

        function updateConvictionLabel(value) {
            document.getElementById('convictionLabel').textContent = (value * 100).toFixed(0) + '%';
        }
    </script>
</body>
</html>`;
    }

    /**
     * Render belief detail view.
     */
    private renderBeliefDetail(belief: Belief): string {
        return `
            <div class="detail-section">
                <h3>Content</h3>
                <div class="detail-content">${this.escapeHtml(belief.content)}</div>
            </div>

            <div class="detail-section">
                <h3>Metadata</h3>
                <dl class="detail-meta">
                    <dt>Type</dt>
                    <dd><span class="badge badge-${belief.type}">${belief.type}</span></dd>

                    <dt>Conviction</dt>
                    <dd>
                        <div class="conviction-bar">
                            <div class="conviction-track" style="width: 100px;">
                                <div class="conviction-fill" style="width: ${belief.conviction * 100}%"></div>
                            </div>
                            <span>${(belief.conviction * 100).toFixed(0)}%</span>
                        </div>
                    </dd>

                    ${belief.domain ? `<dt>Domain</dt><dd>${this.escapeHtml(belief.domain)}</dd>` : ''}
                    ${belief.category ? `<dt>Category</dt><dd>${this.escapeHtml(belief.category)}</dd>` : ''}
                    ${belief.source ? `<dt>Source</dt><dd>${this.escapeHtml(belief.source)}</dd>` : ''}
                    ${belief.usage_count !== undefined ? `<dt>Usage Count</dt><dd>${belief.usage_count}</dd>` : ''}

                    <dt>ID</dt>
                    <dd style="font-family: monospace; font-size: 11px;">${belief.id}</dd>
                </dl>
            </div>

            <div class="action-buttons">
                <button onclick="reinforce('${belief.id}')">↑ Reinforce (+5%)</button>
                <button onclick="weaken('${belief.id}')" class="secondary">↓ Weaken (-8%)</button>
                <button onclick="deleteBelief('${belief.id}')" class="danger">✕ Delete</button>
                <button onclick="clearSelection()" class="secondary">← Back</button>
            </div>
        `;
    }

    /**
     * Render add belief form.
     */
    private renderAddForm(): string {
        return `
            <div class="add-form">
                <div class="add-form-header">
                    <h3>Add New Belief</h3>
                </div>

                <div class="form-group">
                    <label for="newContent">Content *</label>
                    <textarea id="newContent" placeholder="Enter the belief content..."></textarea>
                </div>

                <div class="form-group">
                    <label for="newType">Type</label>
                    <select id="newType">
                        <option value="principle">Principle (architectural rule)</option>
                        <option value="pattern">Pattern (code example)</option>
                        <option value="learning">Learning (extracted insight)</option>
                        <option value="insight">Insight (observation)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="newDomain">Domain (optional)</label>
                    <input type="text" id="newDomain" placeholder="e.g., security, architecture, testing">
                </div>

                <div class="form-group">
                    <label for="newConviction">Initial Conviction</label>
                    <div class="conviction-input">
                        <input type="range" id="newConviction" min="0" max="1" step="0.05" value="0.7"
                               oninput="updateConvictionLabel(this.value)">
                        <span id="convictionLabel">70%</span>
                    </div>
                </div>

                <button onclick="addBelief()">Add Belief</button>
            </div>

            <div class="empty-state" style="margin-top: 40px;">
                <p>Select a belief from the list to view details</p>
                <p>or add a new belief using the form above</p>
            </div>
        `;
    }

    /**
     * Generate a nonce for CSP.
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Escape HTML entities.
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Truncate text to a maximum length.
     */
    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
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
