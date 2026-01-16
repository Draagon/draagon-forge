/**
 * Panel Manager - Manages all webview panels for Draagon Forge
 */

import * as vscode from 'vscode';
import { ForgeAPIClient } from '../api/client';
import { ChatPanel } from './ChatPanel';
import { BeliefPanel } from './BeliefPanel';
import { BeliefGraphPanel } from './BeliefGraphPanel';
import { WatchlistPanel } from './WatchlistPanel';
import { AuditPanel } from './AuditPanel';
import { CodeMeshPanel } from './CodeMeshPanel';

/**
 * Manages the lifecycle of all Draagon Forge panels.
 * Ensures only one instance of each panel type exists at a time.
 */
export class PanelManager implements vscode.Disposable {
    private chatPanel: ChatPanel | null = null;
    private beliefPanel: BeliefPanel | null = null;
    private beliefGraphPanel: BeliefGraphPanel | null = null;
    private watchlistPanel: WatchlistPanel | null = null;
    private auditPanel: AuditPanel | null = null;
    private codeMeshPanel: CodeMeshPanel | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private apiClient: ForgeAPIClient,
        _mcpClient?: unknown  // Reserved for future use
    ) {}

    /**
     * Open or reveal the chat panel.
     */
    openChatPanel(): void {
        if (this.chatPanel) {
            this.chatPanel.reveal();
        } else {
            this.chatPanel = new ChatPanel(this.context, this.apiClient);
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
            this.beliefPanel = new BeliefPanel(this.context, this.apiClient);
            this.beliefPanel.onDidDispose(() => {
                this.beliefPanel = null;
            });
        }
    }

    /**
     * Open or reveal the belief graph panel.
     */
    openBeliefGraphPanel(): void {
        if (this.beliefGraphPanel) {
            this.beliefGraphPanel.reveal();
        } else {
            this.beliefGraphPanel = new BeliefGraphPanel(this.context, this.apiClient);
            this.beliefGraphPanel.onDidDispose(() => {
                this.beliefGraphPanel = null;
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
            this.watchlistPanel = new WatchlistPanel(this.context, this.apiClient);
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
            this.auditPanel = new AuditPanel(this.context, this.apiClient);
            this.auditPanel.onDidDispose(() => {
                this.auditPanel = null;
            });
        }
    }

    /**
     * Open or reveal the code mesh panel.
     */
    openCodeMeshPanel(): void {
        if (this.codeMeshPanel) {
            this.codeMeshPanel.reveal();
        } else {
            this.codeMeshPanel = new CodeMeshPanel(this.context, this.apiClient);
            this.codeMeshPanel.onDidDispose(() => {
                this.codeMeshPanel = null;
            });
        }
    }

    /**
     * Dispose of all panels.
     */
    dispose(): void {
        this.chatPanel?.dispose();
        this.beliefPanel?.dispose();
        this.beliefGraphPanel?.dispose();
        this.watchlistPanel?.dispose();
        this.auditPanel?.dispose();
        this.codeMeshPanel?.dispose();
    }
}
