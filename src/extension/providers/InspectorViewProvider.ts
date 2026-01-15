/**
 * Inspector View Provider
 *
 * Compact real-time event inspector with expandable details.
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
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._connectWebSocket();
            }
        });

        if (webviewView.visible) {
            this._connectWebSocket();
        }
    }

    private _connectWebSocket(): void {
        if (this._ws?.readyState === WebSocket.OPEN) return;

        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }

        const wsUrl = this._apiUrl.replace(/^http/, 'ws') + '/ws/events';

        try {
            this._ws = new WebSocket(wsUrl);

            this._ws.onopen = () => {
                this._postMessage({ type: 'connected' });
                this._ws?.send(JSON.stringify({ type: 'get_history', limit: 100 }));
            };

            this._ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'connected') return;
                    if (data.type === 'history') {
                        this._events = data.events || [];
                        this._postMessage({ type: 'history', events: this._events });
                        return;
                    }
                    if (data.type === 'pong' || data.type === 'ping') {
                        if (data.type === 'ping') this._ws?.send(JSON.stringify({ type: 'pong' }));
                        return;
                    }

                    if (data.event && !this._isPaused) {
                        const forgeEvent: ForgeEvent = data;

                        if (this._filter) {
                            const matches = Array.from(this._filter).some(f =>
                                forgeEvent.event.startsWith(f) || forgeEvent.source === f
                            );
                            if (!matches) return;
                        }

                        this._events.push(forgeEvent);
                        if (this._events.length > this._maxEvents) {
                            this._events = this._events.slice(-this._maxEvents);
                        }

                        this._postMessage({ type: 'event', event: forgeEvent });
                    }
                } catch (e) {
                    console.error('WebSocket parse error:', e);
                }
            };

            this._ws.onclose = () => {
                this._postMessage({ type: 'disconnected' });
                this._reconnectTimer = setTimeout(() => {
                    if (this._view?.visible) this._connectWebSocket();
                }, 5000);
            };

            this._ws.onerror = () => {
                this._postMessage({ type: 'error', message: 'Connection error' });
            };
        } catch (e) {
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
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: transparent;
        }
        .status-row {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            gap: 8px;
            cursor: pointer;
        }
        .status-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .dots {
            display: flex;
            gap: 4px;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-input-background);
            transition: all 0.2s;
        }
        .dot.active { animation: pulse 0.8s ease-out; }
        .dot.mcp { background: var(--vscode-terminal-ansiBlue); }
        .dot.memory { background: var(--vscode-terminal-ansiMagenta); }
        .dot.agent { background: var(--vscode-terminal-ansiCyan); }
        .dot.api { background: var(--vscode-terminal-ansiYellow); }
        @keyframes pulse {
            0% { transform: scale(1.5); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }
        .status-info {
            flex: 1;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .badge {
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-live {
            background: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
        }
        .badge-off {
            background: var(--vscode-terminal-ansiRed);
            color: white;
        }
        .expand-icon {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            transition: transform 0.15s;
        }
        .expanded .expand-icon {
            transform: rotate(180deg);
        }
        .events-panel {
            display: none;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .expanded .events-panel {
            display: block;
        }
        .controls {
            display: flex;
            gap: 4px;
            padding: 4px 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            align-items: center;
        }
        .controls button {
            padding: 2px 6px;
            font-size: 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
        }
        .controls button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .controls button.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .filter-dots {
            display: flex;
            gap: 4px;
            margin-left: auto;
        }
        .filter-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            cursor: pointer;
            opacity: 0.3;
        }
        .filter-dot.active { opacity: 1; }
        .filter-dot.mcp { background: var(--vscode-terminal-ansiBlue); }
        .filter-dot.memory { background: var(--vscode-terminal-ansiMagenta); }
        .filter-dot.agent { background: var(--vscode-terminal-ansiCyan); }
        .filter-dot.api { background: var(--vscode-terminal-ansiYellow); }
        .events-list {
            max-height: 250px;
            overflow-y: auto;
        }
        .event-row {
            display: flex;
            align-items: center;
            padding: 3px 8px;
            gap: 6px;
            font-size: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
            cursor: pointer;
        }
        .event-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .event-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .event-time {
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
            min-width: 50px;
        }
        .event-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .event-dur {
            color: var(--vscode-descriptionForeground);
            font-size: 9px;
        }
        .event-details {
            display: none;
            padding: 4px 8px 4px 20px;
            font-size: 9px;
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textBlockQuote-background);
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 100px;
            overflow-y: auto;
        }
        .event-row.open + .event-details {
            display: block;
        }
        .empty {
            padding: 12px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const root = document.getElementById('root');
        let expanded = false;
        let isPaused = false;
        let events = [];
        let filters = { mcp: true, memory: true, agent: true, api: true };
        let connected = false;

        vscode.postMessage({ command: 'connect' });

        window.addEventListener('message', e => {
            const msg = e.data;
            switch (msg.type) {
                case 'connected': connected = true; render(); break;
                case 'disconnected': connected = false; render(); break;
                case 'error': connected = false; render(); break;
                case 'history': events = msg.events || []; render(); break;
                case 'event':
                    if (!isPaused) {
                        events.push(msg.event);
                        if (events.length > 500) events = events.slice(-500);
                        flashDot(msg.event.source);
                        render();
                    }
                    break;
                case 'cleared': events = []; render(); break;
            }
        });

        function toggle() {
            expanded = !expanded;
            render();
        }

        function togglePause() {
            isPaused = !isPaused;
            vscode.postMessage({ command: isPaused ? 'pause' : 'resume' });
            render();
        }

        function clearEvents() {
            events = [];
            vscode.postMessage({ command: 'clear' });
            render();
        }

        function toggleFilter(src) {
            filters[src] = !filters[src];
            const active = Object.entries(filters).filter(([,v]) => v).map(([k]) => k);
            vscode.postMessage({ command: 'setFilter', filter: active.length === 4 ? [] : active });
            render();
        }

        function toggleEvent(idx) {
            const row = document.querySelector('.event-row[data-idx="' + idx + '"]');
            if (row) row.classList.toggle('open');
        }

        function flashDot(src) {
            const dot = document.getElementById('dot-' + src);
            if (dot) {
                dot.classList.remove('active');
                void dot.offsetWidth;
                dot.classList.add('active');
            }
        }

        function render() {
            let html = '<div class="inspector' + (expanded ? ' expanded' : '') + '">';
            html += '<div class="status-row" data-action="toggle">';
            html += '<div class="dots">';
            html += '<div class="dot mcp" id="dot-mcp"></div>';
            html += '<div class="dot memory" id="dot-memory"></div>';
            html += '<div class="dot agent" id="dot-agent"></div>';
            html += '<div class="dot api" id="dot-api"></div>';
            html += '</div>';
            html += '<span class="status-info">Events: ' + events.length + '</span>';
            html += '<span class="badge ' + (connected ? 'badge-live' : 'badge-off') + '">' + (connected ? 'LIVE' : 'OFF') + '</span>';
            html += '<span class="expand-icon">▼</span>';
            html += '</div>';

            html += '<div class="events-panel">';
            html += '<div class="controls">';
            html += '<button class="' + (isPaused ? '' : 'active') + '" data-action="togglePause">' + (isPaused ? '▶' : '⏸') + '</button>';
            html += '<button data-action="clear">🗑</button>';
            html += '<div class="filter-dots">';
            html += '<div class="filter-dot mcp ' + (filters.mcp ? 'active' : '') + '" data-action="filter" data-filter="mcp" title="MCP"></div>';
            html += '<div class="filter-dot memory ' + (filters.memory ? 'active' : '') + '" data-action="filter" data-filter="memory" title="Memory"></div>';
            html += '<div class="filter-dot agent ' + (filters.agent ? 'active' : '') + '" data-action="filter" data-filter="agent" title="Agent"></div>';
            html += '<div class="filter-dot api ' + (filters.api ? 'active' : '') + '" data-action="filter" data-filter="api" title="API"></div>';
            html += '</div>';
            html += '</div>';

            html += '<div class="events-list">';
            const filtered = events.filter(e => filters[e.source]);
            if (filtered.length === 0) {
                html += '<div class="empty">No events</div>';
            } else {
                filtered.slice(-50).reverse().forEach((e, i) => {
                    const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const name = e.event.split('.').slice(1).join('.') || e.event;
                    const dur = e.duration_ms ? e.duration_ms.toFixed(0) + 'ms' : '';
                    html += '<div class="event-row" data-idx="' + i + '" data-action="toggleEvent">';
                    html += '<div class="event-dot ' + e.source + '"></div>';
                    html += '<span class="event-time">' + time + '</span>';
                    html += '<span class="event-name">' + name + '</span>';
                    html += '<span class="event-dur">' + dur + '</span>';
                    html += '</div>';
                    html += '<div class="event-details">' + JSON.stringify(e.data, null, 2) + '</div>';
                });
            }
            html += '</div></div></div>';

            root.innerHTML = html;
        }

        // Event delegation for all clicks
        root.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'toggle') {
                toggle();
            } else if (action === 'togglePause') {
                togglePause();
            } else if (action === 'clear') {
                clearEvents();
            } else if (action === 'filter') {
                toggleFilter(target.dataset.filter);
            } else if (action === 'toggleEvent') {
                toggleEvent(parseInt(target.dataset.idx));
            }
        });

        render();
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
