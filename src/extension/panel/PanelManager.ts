/**
 * Panel Manager - Manages all webview panels for Draagon Forge
 */

import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';
import { ChatPanel } from './ChatPanel';
import { BeliefPanel } from './BeliefPanel';
import { WatchlistPanel } from './WatchlistPanel';
import { AuditPanel } from './AuditPanel';

/**
 * Manages the lifecycle of all Draagon Forge panels.
 * Ensures only one instance of each panel type exists at a time.
 */
export class PanelManager implements vscode.Disposable {
    private chatPanel: ChatPanel | null = null;
    private beliefPanel: BeliefPanel | null = null;
    private watchlistPanel: WatchlistPanel | null = null;
    private auditPanel: AuditPanel | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private mcpClient: MCPClient
    ) {}

    /**
     * Open or reveal the chat panel.
     */
    openChatPanel(): void {
        if (this.chatPanel) {
            this.chatPanel.reveal();
        } else {
            this.chatPanel = new ChatPanel(this.context, this.mcpClient);
            this.chatPanel.onDidDispose(() => {
                this.chatPanel = null;
            });
        }
    }

    /**
     * Open or reveal the belief panel.
     */
    openBeliefPanel(): void {
        if (this.beliefPanel) {
            this.beliefPanel.reveal();
        } else {
            this.beliefPanel = new BeliefPanel(this.context, this.mcpClient);
            this.beliefPanel.onDidDispose(() => {
                this.beliefPanel = null;
            });
        }
    }

    /**
     * Open or reveal the watchlist panel.
     */
    openWatchlistPanel(): void {
        if (this.watchlistPanel) {
            this.watchlistPanel.reveal();
        } else {
            this.watchlistPanel = new WatchlistPanel(this.context, this.mcpClient);
            this.watchlistPanel.onDidDispose(() => {
                this.watchlistPanel = null;
            });
        }
    }

    /**
     * Open or reveal the audit panel.
     */
    openAuditPanel(): void {
        if (this.auditPanel) {
            this.auditPanel.reveal();
        } else {
            this.auditPanel = new AuditPanel(this.context, this.mcpClient);
            this.auditPanel.onDidDispose(() => {
                this.auditPanel = null;
            });
        }
    }

    /**
     * Dispose of all panels.
     */
    dispose(): void {
        this.chatPanel?.dispose();
        this.beliefPanel?.dispose();
        this.watchlistPanel?.dispose();
        this.auditPanel?.dispose();
    }
}
