/**
 * Belief Graph Panel - Interactive graph visualization of beliefs and entities
 *
 * Implements REQ-005.6: Semantic Graph Visualization
 * Uses Cytoscape.js for rendering the belief graph with nodes and edges.
 */

import * as vscode from 'vscode';
import { ForgeAPIClient, GraphData } from '../api/client';

/**
 * Filter state for the graph
 */
interface GraphFilters {
    minConviction: number;
    domains: string[];
    includeEntities: boolean;
    showLabels: boolean;
}

/**
 * Belief Graph Panel - Interactive visualization of beliefs, entities, and their relationships.
 */
export class BeliefGraphPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();
    private graphData: GraphData | null = null;
    private selectedNodeId: string | null = null;
    private filters: GraphFilters = {
        minConviction: 0,
        domains: [],
        includeEntities: true,
        showLabels: true,
    };
    private availableDomains: string[] = [];

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(
        context: vscode.ExtensionContext,
        private apiClient: ForgeAPIClient
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeBeliefGraph',
            'Belief Graph',
            vscode.ViewColumn.One,
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
        this.loadGraph();
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
                await this.loadGraph();
                break;

            case 'nodeSelected':
                this.selectedNodeId = message.nodeId as string;
                this.sendNodeDetails();
                break;

            case 'nodeDeselected':
                this.selectedNodeId = null;
                this.updatePanel();
                break;

            case 'filterConviction':
                this.filters.minConviction = message.value as number;
                await this.loadGraph();
                break;

            case 'filterDomains':
                this.filters.domains = message.domains as string[];
                await this.loadGraph();
                break;

            case 'toggleEntities':
                this.filters.includeEntities = message.enabled as boolean;
                await this.loadGraph();
                break;

            case 'toggleLabels':
                this.filters.showLabels = message.enabled as boolean;
                this.updatePanel();
                break;

            case 'reinforce':
                await this.adjustBelief(message.nodeId as string, 'reinforce');
                break;

            case 'weaken':
                await this.adjustBelief(message.nodeId as string, 'weaken');
                break;

            case 'findPath':
                await this.findPath(message.sourceId as string, message.targetId as string);
                break;

            case 'focusNode':
                this.postMessage({ command: 'centerOnNode', nodeId: message.nodeId });
                break;

            case 'exportGraph':
                await this.exportGraph(message.format as string);
                break;
        }
    }

    /**
     * Load graph data from the API.
     */
    private async loadGraph(): Promise<void> {
        try {
            this.graphData = await this.apiClient.getBeliefGraph({
                minConviction: this.filters.minConviction,
                domains: this.filters.domains.length > 0 ? this.filters.domains : undefined,
                includeEntities: this.filters.includeEntities,
            });

            // Extract available domains
            const domains = new Set<string>();
            for (const node of this.graphData.nodes) {
                if (node.domain) {
                    domains.add(node.domain);
                }
            }
            this.availableDomains = Array.from(domains).sort();

            this.updatePanel();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load belief graph: ${error}`);
        }
    }

    /**
     * Send node details to the webview.
     */
    private sendNodeDetails(): void {
        if (!this.selectedNodeId || !this.graphData) return;

        const node = this.graphData.nodes.find(n => n.id === this.selectedNodeId);
        if (node) {
            this.postMessage({
                command: 'showNodeDetails',
                node,
            });
        }
    }

    /**
     * Adjust belief conviction.
     */
    private async adjustBelief(nodeId: string, action: 'reinforce' | 'weaken'): Promise<void> {
        try {
            await this.apiClient.adjustBelief(nodeId, { action });
            vscode.window.showInformationMessage(
                `Belief ${action === 'reinforce' ? 'reinforced' : 'weakened'}`
            );
            await this.loadGraph();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to adjust belief: ${error}`);
        }
    }

    /**
     * Find and highlight path between two nodes.
     */
    private async findPath(sourceId: string, targetId: string): Promise<void> {
        try {
            const path = await this.apiClient.findGraphPath(sourceId, targetId);
            this.postMessage({
                command: 'highlightPath',
                path: path.map(n => n.id),
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to find path: ${error}`);
        }
    }

    /**
     * Export graph data.
     */
    private async exportGraph(format: string): Promise<void> {
        if (!this.graphData) return;

        if (format === 'json') {
            const doc = await vscode.workspace.openTextDocument({
                content: JSON.stringify(this.graphData, null, 2),
                language: 'json',
            });
            await vscode.window.showTextDocument(doc);
        } else if (format === 'png') {
            this.postMessage({ command: 'exportPng' });
        }
    }

    /**
     * Post message to webview.
     */
    private postMessage(message: unknown): void {
        this.panel.webview.postMessage(message);
    }

    /**
     * Update the panel HTML.
     */
    private updatePanel(): void {
        this.panel.webview.html = this.getHtmlContent();
    }

    /**
     * Generate the webview HTML content with Cytoscape.js.
     */
    private getHtmlContent(): string {
        const nonce = this.getNonce();

        // Convert graph data to Cytoscape format
        const cytoscapeElements = this.graphData ? {
            nodes: this.graphData.nodes.map(node => ({
                data: {
                    id: node.id,
                    label: this.filters.showLabels ? node.label : '',
                    type: node.type,
                    fullContent: node.full_content || node.label,
                    conviction: node.conviction,
                    category: node.category,
                    domain: node.domain,
                    color: node.color,
                    size: node.size,
                },
            })),
            edges: this.graphData.edges.map((edge, i) => ({
                data: {
                    id: `edge-${i}`,
                    source: edge.source,
                    target: edge.target,
                    type: edge.type,
                    color: edge.color,
                },
            })),
        } : { nodes: [], edges: [] };

        const stats = this.graphData?.stats || {
            node_count: 0,
            edge_count: 0,
            belief_count: 0,
            entity_count: 0,
            avg_conviction: 0,
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://unpkg.com; img-src data:;">
    <title>Belief Graph</title>
    <script nonce="${nonce}" src="https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js"></script>
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
            --sidebar-bg: var(--vscode-sideBar-background);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg);
            background: var(--bg);
            height: 100vh;
            overflow: hidden;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr 300px;
            grid-template-rows: auto 1fr auto;
            height: 100vh;
        }
        .toolbar {
            grid-column: 1 / -1;
            display: flex;
            gap: 12px;
            padding: 12px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--border);
            flex-wrap: wrap;
            align-items: center;
        }
        .toolbar-group {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .toolbar-group label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        input, select {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            color: var(--fg);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        input[type="range"] {
            width: 100px;
        }
        input[type="checkbox"] {
            width: auto;
        }
        button {
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        button:hover {
            background: var(--button-hover);
        }
        button.secondary {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--fg);
        }
        #cy {
            grid-column: 1;
            grid-row: 2;
            background: var(--bg);
        }
        .sidebar {
            grid-column: 2;
            grid-row: 2;
            background: var(--sidebar-bg);
            border-left: 1px solid var(--border);
            overflow-y: auto;
            padding: 12px;
        }
        .sidebar h3 {
            font-size: 12px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            margin-top: 16px;
        }
        .sidebar h3:first-child {
            margin-top: 0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .stat-card {
            background: var(--input-bg);
            padding: 8px;
            border-radius: 4px;
            text-align: center;
        }
        .stat-value {
            font-size: 20px;
            font-weight: bold;
        }
        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .node-detail {
            background: var(--input-bg);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 12px;
        }
        .node-type {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .node-type-belief { background: #4CAF50; color: white; }
        .node-type-entity { background: #9C27B0; color: white; }
        .node-content {
            font-size: 13px;
            line-height: 1.4;
            margin-bottom: 8px;
        }
        .node-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .node-meta div {
            margin: 4px 0;
        }
        .conviction-bar {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .conviction-track {
            flex: 1;
            height: 6px;
            background: var(--border);
            border-radius: 3px;
            overflow: hidden;
        }
        .conviction-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .action-buttons {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        .status-bar {
            grid-column: 1 / -1;
            padding: 8px 12px;
            background: var(--sidebar-bg);
            border-top: 1px solid var(--border);
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
        }
        .legend {
            display: flex;
            gap: 16px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
        }
        .domain-filters {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 8px;
        }
        .domain-chip {
            background: var(--input-bg);
            border: 1px solid var(--border);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            cursor: pointer;
        }
        .domain-chip.active {
            background: var(--button-bg);
            color: var(--button-fg);
            border-color: var(--button-bg);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-group">
                <button onclick="refresh()">↻ Refresh</button>
            </div>
            <div class="toolbar-group">
                <label>Min Conviction:</label>
                <input type="range" id="convictionSlider" min="0" max="1" step="0.05"
                       value="${this.filters.minConviction}"
                       oninput="updateConvictionFilter(this.value)">
                <span id="convictionValue">${(this.filters.minConviction * 100).toFixed(0)}%</span>
            </div>
            <div class="toolbar-group">
                <label>
                    <input type="checkbox" id="showEntities"
                           ${this.filters.includeEntities ? 'checked' : ''}
                           onchange="toggleEntities(this.checked)">
                    Show Entities
                </label>
            </div>
            <div class="toolbar-group">
                <label>
                    <input type="checkbox" id="showLabels"
                           ${this.filters.showLabels ? 'checked' : ''}
                           onchange="toggleLabels(this.checked)">
                    Show Labels
                </label>
            </div>
            <div class="toolbar-group">
                <button class="secondary" onclick="fitGraph()">Fit View</button>
                <button class="secondary" onclick="exportJson()">Export JSON</button>
            </div>
        </div>

        <div id="cy"></div>

        <div class="sidebar">
            <h3>Graph Stats</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.belief_count}</div>
                    <div class="stat-label">Beliefs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.entity_count}</div>
                    <div class="stat-label">Entities</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.edge_count}</div>
                    <div class="stat-label">Connections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(stats.avg_conviction * 100).toFixed(0)}%</div>
                    <div class="stat-label">Avg Conviction</div>
                </div>
            </div>

            <h3>Filter by Domain</h3>
            <div class="domain-filters">
                ${this.availableDomains.map(d => `
                    <span class="domain-chip ${this.filters.domains.includes(d) ? 'active' : ''}"
                          onclick="toggleDomain('${d}')">${d}</span>
                `).join('')}
                ${this.availableDomains.length === 0 ? '<span class="empty-state">No domains</span>' : ''}
            </div>

            <h3>Selected Node</h3>
            <div id="nodeDetails">
                <div class="empty-state">Click a node to see details</div>
            </div>
        </div>

        <div class="status-bar">
            <div class="legend">
                <span class="legend-item"><span class="legend-dot" style="background: #4CAF50"></span> High Conviction</span>
                <span class="legend-item"><span class="legend-dot" style="background: #FFC107"></span> Medium</span>
                <span class="legend-item"><span class="legend-dot" style="background: #F44336"></span> Low</span>
                <span class="legend-item"><span class="legend-dot" style="background: #9C27B0"></span> Entity</span>
            </div>
            <div>
                ${stats.node_count} nodes | ${stats.edge_count} edges
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let cy;
        let selectedNode = null;

        // Initialize Cytoscape
        const elements = ${JSON.stringify(cytoscapeElements)};

        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': 'data(color)',
                        'label': 'data(label)',
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'font-size': '10px',
                        'color': '#ffffff',
                        'text-outline-width': 2,
                        'text-outline-color': '#333',
                        'text-valign': 'bottom',
                        'text-margin-y': 5,
                    }
                },
                {
                    selector: 'node[type="entity"]',
                    style: {
                        'shape': 'ellipse',
                    }
                },
                {
                    selector: 'node[type="belief"]',
                    style: {
                        'shape': 'round-rectangle',
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': 'data(color)',
                        'target-arrow-color': 'data(color)',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'opacity': 0.6,
                    }
                },
                {
                    selector: 'edge[type="SAME_DOMAIN"]',
                    style: {
                        'width': 2,
                        'line-style': 'dashed',
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 3,
                        'border-color': '#ffffff',
                    }
                },
                {
                    selector: '.highlighted',
                    style: {
                        'background-color': '#00bcd4',
                        'line-color': '#00bcd4',
                        'target-arrow-color': '#00bcd4',
                        'opacity': 1,
                    }
                },
                {
                    selector: '.faded',
                    style: {
                        'opacity': 0.2,
                    }
                }
            ],
            layout: {
                name: 'cose',
                idealEdgeLength: 100,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                padding: 30,
                randomize: false,
                componentSpacing: 100,
                nodeRepulsion: 400000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0,
            },
        });

        // Node click handler
        cy.on('tap', 'node', function(evt) {
            const node = evt.target;
            selectedNode = node.id();

            // Highlight connected elements
            cy.elements().removeClass('highlighted faded');
            const connected = node.neighborhood().add(node);
            cy.elements().not(connected).addClass('faded');
            connected.addClass('highlighted');

            vscode.postMessage({ command: 'nodeSelected', nodeId: node.id() });
            showNodeDetails(node.data());
        });

        // Background click to deselect
        cy.on('tap', function(evt) {
            if (evt.target === cy) {
                selectedNode = null;
                cy.elements().removeClass('highlighted faded');
                vscode.postMessage({ command: 'nodeDeselected' });
                document.getElementById('nodeDetails').innerHTML =
                    '<div class="empty-state">Click a node to see details</div>';
            }
        });

        // Node double-click to focus
        cy.on('dbltap', 'node', function(evt) {
            cy.fit(evt.target.neighborhood().add(evt.target), 50);
        });

        function showNodeDetails(data) {
            const convictionPercent = ((data.conviction || 0) * 100).toFixed(0);
            const convictionColor = data.conviction >= 0.8 ? '#4CAF50' :
                                   data.conviction >= 0.5 ? '#FFC107' : '#F44336';

            document.getElementById('nodeDetails').innerHTML = \`
                <div class="node-detail">
                    <span class="node-type node-type-\${data.type}">\${data.type}</span>
                    <div class="node-content">\${escapeHtml(data.fullContent || data.label)}</div>
                    <div class="node-meta">
                        \${data.conviction !== undefined ? \`
                            <div class="conviction-bar">
                                <span>Conviction:</span>
                                <div class="conviction-track">
                                    <div class="conviction-fill" style="width: \${convictionPercent}%; background: \${convictionColor}"></div>
                                </div>
                                <span>\${convictionPercent}%</span>
                            </div>
                        \` : ''}
                        \${data.domain ? \`<div><strong>Domain:</strong> \${data.domain}</div>\` : ''}
                        \${data.category ? \`<div><strong>Category:</strong> \${data.category}</div>\` : ''}
                        <div><strong>ID:</strong> <code>\${data.id}</code></div>
                    </div>
                    \${data.type === 'belief' ? \`
                        <div class="action-buttons">
                            <button onclick="reinforceBelief('\${data.id}')">↑ Reinforce</button>
                            <button class="secondary" onclick="weakenBelief('\${data.id}')">↓ Weaken</button>
                        </div>
                    \` : ''}
                </div>
            \`;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function updateConvictionFilter(value) {
            document.getElementById('convictionValue').textContent = (value * 100).toFixed(0) + '%';
            vscode.postMessage({ command: 'filterConviction', value: parseFloat(value) });
        }

        function toggleEntities(enabled) {
            vscode.postMessage({ command: 'toggleEntities', enabled: enabled });
        }

        function toggleLabels(enabled) {
            vscode.postMessage({ command: 'toggleLabels', enabled: enabled });
        }

        function toggleDomain(domain) {
            const chips = document.querySelectorAll('.domain-chip');
            let activeDomains = [];
            chips.forEach(chip => {
                if (chip.textContent === domain) {
                    chip.classList.toggle('active');
                }
                if (chip.classList.contains('active')) {
                    activeDomains.push(chip.textContent);
                }
            });
            vscode.postMessage({ command: 'filterDomains', domains: activeDomains });
        }

        function fitGraph() {
            cy.fit(undefined, 30);
        }

        function exportJson() {
            vscode.postMessage({ command: 'exportGraph', format: 'json' });
        }

        function reinforceBelief(id) {
            vscode.postMessage({ command: 'reinforce', nodeId: id });
        }

        function weakenBelief(id) {
            vscode.postMessage({ command: 'weaken', nodeId: id });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'centerOnNode':
                    const node = cy.getElementById(message.nodeId);
                    if (node.length) {
                        cy.center(node);
                        node.select();
                    }
                    break;
                case 'highlightPath':
                    cy.elements().removeClass('highlighted faded');
                    message.path.forEach(id => {
                        cy.getElementById(id).addClass('highlighted');
                    });
                    break;
                case 'showNodeDetails':
                    showNodeDetails(message.node);
                    break;
            }
        });

        // Initial fit
        setTimeout(() => cy.fit(undefined, 30), 100);
    </script>
</body>
</html>`;
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
