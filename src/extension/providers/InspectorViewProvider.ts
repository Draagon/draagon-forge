/**
 * Inspector View Provider
 *
 * Provides a real-time event inspector for monitoring MCP tool calls,
 * memory operations, and agent decisions.
 */

import * as vscode from 'vscode';

interface ForgeEvent {
    event: string;
    timestamp: string;
    source: string;
    data: Record<string, unknown>;
    duration_ms?: number;
    request_id?: string;
    user_id?: string;
}

export class InspectorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'draagon-forge.inspectorView';

    private _view?: vscode.WebviewView;
    private _ws?: WebSocket;
    private _reconnectTimer?: NodeJS.Timeout;
    private _events: ForgeEvent[] = [];
    private _maxEvents = 500;
    private _isPaused = false;
    private _filter: Set<string> | null = null;

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
                case 'connect':
                    this._connectWebSocket();
                    break;
                case 'disconnect':
                    this._disconnectWebSocket();
                    break;
                case 'pause':
                    this._isPaused = true;
                    break;
                case 'resume':
                    this._isPaused = false;
                    break;
                case 'clear':
                    this._events = [];
                    this._postMessage({ type: 'cleared' });
                    break;
                case 'setFilter':
                    if (message.filter && message.filter.length > 0) {
                        this._filter = new Set(message.filter);
                    } else {
                        this._filter = null;
                    }
                    break;
                case 'getHistory':
                    await this._fetchHistory();
                    break;
            }
        });

        // Connect when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._connectWebSocket();
            }
        });

        // Initial connection
        if (webviewView.visible) {
            this._connectWebSocket();
        }
    }

    private _connectWebSocket(): void {
        if (this._ws?.readyState === WebSocket.OPEN) {
            return;
        }

        // Clear any existing reconnect timer
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }

        const wsUrl = this._apiUrl.replace(/^http/, 'ws') + '/ws/events';
        console.log(`Inspector connecting to ${wsUrl}`);

        try {
            this._ws = new WebSocket(wsUrl);

            this._ws.onopen = () => {
                console.log('Inspector WebSocket connected');
                this._postMessage({ type: 'connected' });

                // Request recent history
                this._ws?.send(JSON.stringify({
                    type: 'get_history',
                    limit: 100,
                }));
            };

            this._ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'connected') {
                        // Server acknowledged connection
                        return;
                    }

                    if (data.type === 'history') {
                        // Received history
                        this._events = data.events || [];
                        this._postMessage({
                            type: 'history',
                            events: this._events,
                        });
                        return;
                    }

                    if (data.type === 'pong' || data.type === 'ping') {
                        // Keep-alive
                        if (data.type === 'ping') {
                            this._ws?.send(JSON.stringify({ type: 'pong' }));
                        }
                        return;
                    }

                    // It's an event
                    if (data.event && !this._isPaused) {
                        const forgeEvent: ForgeEvent = data;

                        // Check filter
                        if (this._filter) {
                            const matches = Array.from(this._filter).some(f =>
                                forgeEvent.event.startsWith(f) || forgeEvent.source === f
                            );
                            if (!matches) {
                                return;
                            }
                        }

                        // Add to events
                        this._events.push(forgeEvent);
                        if (this._events.length > this._maxEvents) {
                            this._events = this._events.slice(-this._maxEvents);
                        }

                        // Send to webview
                        this._postMessage({
                            type: 'event',
                            event: forgeEvent,
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            this._ws.onclose = () => {
                console.log('Inspector WebSocket disconnected');
                this._postMessage({ type: 'disconnected' });

                // Attempt reconnect after 5 seconds
                this._reconnectTimer = setTimeout(() => {
                    if (this._view?.visible) {
                        this._connectWebSocket();
                    }
                }, 5000);
            };

            this._ws.onerror = (error) => {
                console.error('Inspector WebSocket error:', error);
                this._postMessage({ type: 'error', message: 'Connection error' });
            };
        } catch (e) {
            console.error('Failed to create WebSocket:', e);
            this._postMessage({ type: 'error', message: String(e) });
        }
    }

    private _disconnectWebSocket(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }

        if (this._ws) {
            this._ws.close();
            this._ws = undefined;
        }

        this._postMessage({ type: 'disconnected' });
    }

    private async _fetchHistory(): Promise<void> {
        try {
            const response = await fetch(`${this._apiUrl}/events/history?limit=100`);
            if (response.ok) {
                const data = await response.json() as { events?: ForgeEvent[] };
                this._events = data.events || [];
                this._postMessage({
                    type: 'history',
                    events: this._events,
                });
            }
        } catch (e) {
            console.error('Failed to fetch history:', e);
        }
    }

    private _postMessage(message: unknown): void {
        this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Inspector</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, monospace);
        }
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .toolbar {
            display: flex;
            gap: 4px;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
            align-items: center;
        }
        .toolbar button {
            padding: 4px 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        .toolbar button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar button.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .toolbar .status {
            margin-left: auto;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
        }
        .toolbar .status.connected {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        .toolbar .status.disconnected {
            background: var(--vscode-testing-iconFailed);
            color: white;
        }
        .filter-row {
            display: flex;
            gap: 4px;
            padding: 4px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }
        .filter-row label {
            display: flex;
            align-items: center;
            gap: 2px;
            font-size: 10px;
            cursor: pointer;
        }
        .filter-row input[type="checkbox"] {
            width: 12px;
            height: 12px;
        }
        .search-box {
            flex: 1;
            min-width: 100px;
            padding: 2px 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: 11px;
        }
        .events-container {
            height: calc(100vh - 90px);
            overflow-y: auto;
        }
        .event-item {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
        }
        .event-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .event-item.expanded {
            background: var(--vscode-list-activeSelectionBackground);
        }
        .event-header {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .event-time {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            min-width: 70px;
        }
        .event-source {
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .event-source.mcp { background: #4a90d9; color: white; }
        .event-source.memory { background: #7e57c2; color: white; }
        .event-source.agent { background: #26a69a; color: white; }
        .event-source.api { background: #ff7043; color: white; }
        .event-name {
            flex: 1;
            font-weight: 500;
        }
        .event-duration {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
        }
        .event-details {
            display: none;
            margin-top: 8px;
            padding: 8px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 300px;
            overflow-y: auto;
        }
        .event-item.expanded .event-details {
            display: block;
        }
        .empty-state {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="playPauseBtn" class="active" title="Play/Pause">▶</button>
        <button id="clearBtn" title="Clear">🗑</button>
        <span class="status disconnected" id="statusBadge">Disconnected</span>
    </div>
    <div class="filter-row">
        <label><input type="checkbox" id="filterMcp" checked> MCP</label>
        <label><input type="checkbox" id="filterMemory" checked> Memory</label>
        <label><input type="checkbox" id="filterAgent" checked> Agent</label>
        <label><input type="checkbox" id="filterApi" checked> API</label>
        <input type="text" class="search-box" id="searchBox" placeholder="Search events...">
    </div>
    <div class="events-container" id="eventsContainer">
        <div class="empty-state">Waiting for events...</div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const eventsContainer = document.getElementById('eventsContainer');
        const playPauseBtn = document.getElementById('playPauseBtn');
        const clearBtn = document.getElementById('clearBtn');
        const statusBadge = document.getElementById('statusBadge');
        const searchBox = document.getElementById('searchBox');
        const filterMcp = document.getElementById('filterMcp');
        const filterMemory = document.getElementById('filterMemory');
        const filterAgent = document.getElementById('filterAgent');
        const filterApi = document.getElementById('filterApi');

        let isPaused = false;
        let events = [];
        let autoScroll = true;

        // Connect on load
        vscode.postMessage({ command: 'connect' });

        // Play/Pause button
        playPauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            playPauseBtn.textContent = isPaused ? '▶' : '⏸';
            playPauseBtn.classList.toggle('active', !isPaused);
            vscode.postMessage({ command: isPaused ? 'pause' : 'resume' });
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            events = [];
            renderEvents();
            vscode.postMessage({ command: 'clear' });
        });

        // Filter checkboxes
        function updateFilter() {
            const filter = [];
            if (filterMcp.checked) filter.push('mcp');
            if (filterMemory.checked) filter.push('memory');
            if (filterAgent.checked) filter.push('agent');
            if (filterApi.checked) filter.push('api');
            vscode.postMessage({ command: 'setFilter', filter: filter.length === 4 ? [] : filter });
            renderEvents();
        }

        filterMcp.addEventListener('change', updateFilter);
        filterMemory.addEventListener('change', updateFilter);
        filterAgent.addEventListener('change', updateFilter);
        filterApi.addEventListener('change', updateFilter);

        // Search box
        searchBox.addEventListener('input', () => {
            renderEvents();
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'connected':
                    statusBadge.textContent = 'Connected';
                    statusBadge.className = 'status connected';
                    break;

                case 'disconnected':
                    statusBadge.textContent = 'Disconnected';
                    statusBadge.className = 'status disconnected';
                    break;

                case 'error':
                    statusBadge.textContent = 'Error';
                    statusBadge.className = 'status disconnected';
                    break;

                case 'history':
                    events = message.events || [];
                    renderEvents();
                    break;

                case 'event':
                    if (!isPaused) {
                        events.push(message.event);
                        if (events.length > 500) {
                            events = events.slice(-500);
                        }
                        renderEvents();
                    }
                    break;

                case 'cleared':
                    events = [];
                    renderEvents();
                    break;
            }
        });

        function renderEvents() {
            const searchTerm = searchBox.value.toLowerCase();
            const activeFilters = [];
            if (filterMcp.checked) activeFilters.push('mcp');
            if (filterMemory.checked) activeFilters.push('memory');
            if (filterAgent.checked) activeFilters.push('agent');
            if (filterApi.checked) activeFilters.push('api');

            const filteredEvents = events.filter(e => {
                // Source filter
                if (!activeFilters.includes(e.source)) return false;

                // Search filter
                if (searchTerm) {
                    const searchable = JSON.stringify(e).toLowerCase();
                    if (!searchable.includes(searchTerm)) return false;
                }

                return true;
            });

            if (filteredEvents.length === 0) {
                eventsContainer.innerHTML = '<div class="empty-state">No events matching filters</div>';
                return;
            }

            // Render events (newest first)
            const html = filteredEvents.slice().reverse().map((e, idx) => {
                const time = new Date(e.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3
                });

                const eventName = e.event.split('.').slice(1).join('.') || e.event;
                const duration = e.duration_ms ? e.duration_ms.toFixed(0) + 'ms' : '';

                return \`
                    <div class="event-item" data-idx="\${idx}">
                        <div class="event-header">
                            <span class="event-time">\${time}</span>
                            <span class="event-source \${e.source}">\${e.source}</span>
                            <span class="event-name">\${eventName}</span>
                            <span class="event-duration">\${duration}</span>
                        </div>
                        <div class="event-details">\${JSON.stringify(e.data, null, 2)}</div>
                    </div>
                \`;
            }).join('');

            eventsContainer.innerHTML = html;

            // Add click handlers for expanding
            eventsContainer.querySelectorAll('.event-item').forEach(item => {
                item.addEventListener('click', () => {
                    item.classList.toggle('expanded');
                });
            });

            // Auto-scroll to top (newest) if enabled
            if (autoScroll) {
                eventsContainer.scrollTop = 0;
            }
        }

        // Detect manual scrolling to disable auto-scroll
        eventsContainer.addEventListener('scroll', () => {
            autoScroll = eventsContainer.scrollTop < 50;
        });
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
        this._disconnectWebSocket();
    }
}
