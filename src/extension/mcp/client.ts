/**
 * MCP Client - Communicates with the Draagon Forge MCP server via stdio
 */

import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
    id: string;
    method: string;
    params: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse {
    id: string;
    result?: unknown;
    error?: { code: number; message: string };
}

/**
 * Options for creating an MCP client
 */
export interface MCPClientOptions {
    serverCommand: string;
}

/**
 * MCP Client that communicates with the server via stdio transport.
 * Spawns the MCP server as a child process and uses JSON-RPC over stdin/stdout.
 */
export class MCPClient implements vscode.Disposable {
    private process: ChildProcess | null = null;
    private connected: boolean = false;
    private requestId: number = 0;
    private pendingRequests: Map<string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    private outputBuffer: string = '';
    private readonly options: MCPClientOptions;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(options: MCPClientOptions) {
        this.options = options;
        this.outputChannel = vscode.window.createOutputChannel('Draagon Forge MCP');
    }

    /**
     * Get the server command.
     */
    getServerCommand(): string {
        return this.options.serverCommand;
    }

    /**
     * Connect to the MCP server by spawning it as a child process.
     */
    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        // Parse command (e.g., "python -m draagon_forge.mcp.server")
        const parts = this.options.serverCommand.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        this.outputChannel.appendLine(`Starting MCP server: ${this.options.serverCommand}`);

        try {
            // Spawn MCP server process
            this.process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // Handle stdout (MCP responses)
            this.process.stdout?.on('data', (data: Buffer) => {
                this.handleServerOutput(data.toString());
            });

            // Handle stderr (logs)
            this.process.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                this.outputChannel.appendLine(`[Server] ${text}`);
            });

            // Handle process exit
            this.process.on('exit', (code: number | null) => {
                this.outputChannel.appendLine(`MCP server exited with code ${code}`);
                this.connected = false;
                this.rejectAllPending(new Error('MCP server disconnected'));
            });

            // Handle process errors
            this.process.on('error', (error: Error) => {
                this.outputChannel.appendLine(`MCP server error: ${error.message}`);
                this.connected = false;
                this.rejectAllPending(error);
            });

            this.connected = true;
            this.outputChannel.appendLine('MCP server connected');

        } catch (error) {
            this.outputChannel.appendLine(`Failed to start MCP server: ${error}`);
            throw error;
        }
    }

    /**
     * Handle output from the server (JSON-RPC responses).
     */
    private handleServerOutput(data: string): void {
        this.outputBuffer += data;

        // Parse JSON-RPC messages (newline-delimited)
        const lines = this.outputBuffer.split('\n');
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                try {
                    // Check if it's JSON (starts with {)
                    if (trimmed.startsWith('{')) {
                        const response: MCPResponse = JSON.parse(trimmed);
                        this.handleResponse(response);
                    } else {
                        // Non-JSON output (server logs)
                        this.outputChannel.appendLine(`[Server] ${trimmed}`);
                    }
                } catch (error) {
                    this.outputChannel.appendLine(`Failed to parse response: ${error}`);
                    this.outputChannel.appendLine(`Raw: ${trimmed}`);
                }
            }
        }
    }

    /**
     * Handle a JSON-RPC response from the server.
     */
    private handleResponse(response: MCPResponse): void {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            this.outputChannel.appendLine(`Received response for unknown request: ${response.id}`);
            return;
        }

        // Clear timeout
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
            pending.reject(new Error(response.error.message));
        } else {
            pending.resolve(response.result);
        }
    }

    /**
     * Disconnect from the MCP server.
     */
    async disconnect(): Promise<void> {
        if (!this.connected) {
            return;
        }

        this.outputChannel.appendLine('Disconnecting from MCP server');
        this.process?.kill();
        this.connected = false;
        this.rejectAllPending(new Error('MCP client disconnected'));
    }

    /**
     * Check if connected to the server.
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Call an MCP tool with the given name and arguments.
     */
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.connected || !this.process) {
            throw new Error('Not connected to MCP server');
        }

        const id = `req-${this.requestId++}`;
        const request: MCPRequest = {
            id,
            method: 'tools/call',
            params: { name, arguments: args },
        };

        this.outputChannel.appendLine(`> ${request.method} ${name}`);

        // Send request
        this.process.stdin?.write(JSON.stringify(request) + '\n');

        // Wait for response with timeout
        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${id} timed out after 30s`));
                }
            }, 30000); // 30 second timeout

            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout,
            });
        });
    }

    /**
     * Reject all pending requests with the given error.
     */
    private rejectAllPending(error: Error): void {
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }

    /**
     * Search context using the search_context MCP tool.
     */
    async searchContext(
        query: string,
        options?: { limit?: number; domain?: string }
    ): Promise<Array<{
        id: string;
        content: string;
        score: number;
        conviction: number;
        source: string;
        type: string;
    }>> {
        return this.callTool('search_context', { query, ...options });
    }

    /**
     * Query beliefs using the query_beliefs MCP tool.
     */
    async queryBeliefs(query: string): Promise<Array<{
        id: string;
        content: string;
        conviction: number;
        category?: string;
        domain?: string;
    }>> {
        return this.callTool('query_beliefs', { query });
    }

    /**
     * Adjust a belief using the adjust_belief MCP tool.
     */
    async adjustBelief(
        beliefId: string,
        action: 'reinforce' | 'weaken' | 'modify' | 'delete',
        options?: { new_content?: string; reason?: string }
    ): Promise<{
        id: string;
        conviction: number;
    }> {
        return this.callTool('adjust_belief', {
            belief_id: beliefId,
            action,
            ...options,
        });
    }

    /**
     * Report an outcome for learning using the report_outcome MCP tool.
     */
    async reportOutcome(outcome: {
        context_ids: string[];
        outcome: 'helpful' | 'not_helpful' | 'misleading' | 'outdated';
        reason?: string;
    }): Promise<void> {
        await this.callTool('report_outcome', outcome);
    }

    /**
     * Dispose of the client and clean up resources.
     */
    dispose(): void {
        this.disconnect();
        this.outputChannel.dispose();
    }
}
