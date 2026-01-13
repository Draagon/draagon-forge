/**
 * MCP Client - Communicates with the Draagon Forge MCP server via stdio
 *
 * Implements the MCP (Model Context Protocol) JSON-RPC protocol with proper
 * initialization handshake.
 */

import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC notification structure (no id, no response expected)
 */
interface MCPNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

/**
 * Options for creating an MCP client
 */
export interface MCPClientOptions {
    serverCommand: string;
    env?: Record<string, string>;
}

/**
 * MCP Client that communicates with the server via stdio transport.
 * Spawns the MCP server as a child process and uses JSON-RPC over stdin/stdout.
 */
export class MCPClient implements vscode.Disposable {
    private process: ChildProcess | null = null;
    private connected: boolean = false;
    private initialized: boolean = false;
    private requestId: number = 0;
    private pendingRequests: Map<string | number, {
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

        // Parse command (e.g., "python3.11 -m draagon_forge.mcp.server")
        const parts = this.options.serverCommand.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        this.outputChannel.appendLine(`Starting MCP server: ${this.options.serverCommand}`);

        try {
            // Spawn MCP server process with custom env vars
            this.process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...this.options.env },
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
                this.initialized = false;
                this.rejectAllPending(new Error('MCP server disconnected'));
            });

            // Handle process errors
            this.process.on('error', (error: Error) => {
                this.outputChannel.appendLine(`MCP server error: ${error.message}`);
                this.connected = false;
                this.initialized = false;
                this.rejectAllPending(error);
            });

            this.connected = true;
            this.outputChannel.appendLine('MCP server process started');

            // Initialize the MCP connection with handshake
            await this.initialize();

        } catch (error) {
            this.outputChannel.appendLine(`Failed to start MCP server: ${error}`);
            throw error;
        }
    }

    /**
     * Perform MCP initialization handshake.
     */
    private async initialize(): Promise<void> {
        this.outputChannel.appendLine('Initializing MCP connection...');

        // Send initialize request
        const initResult = await this.sendRequest<{
            protocolVersion: string;
            serverInfo: { name: string; version: string };
            capabilities: Record<string, unknown>;
        }>('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                roots: { listChanged: true },
            },
            clientInfo: {
                name: 'draagon-forge-vscode',
                version: '0.1.0',
            },
        });

        this.outputChannel.appendLine(`Server: ${initResult.serverInfo.name} v${initResult.serverInfo.version}`);
        this.outputChannel.appendLine(`Protocol: ${initResult.protocolVersion}`);

        // Send initialized notification
        this.sendNotification('notifications/initialized');

        this.initialized = true;
        this.outputChannel.appendLine('MCP connection initialized');
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
                        const message = JSON.parse(trimmed);

                        // Check if it's a response (has id and result/error)
                        if ('id' in message && (message.result !== undefined || message.error !== undefined)) {
                            this.handleResponse(message as MCPResponse);
                        } else if ('method' in message) {
                            // It's a notification from the server
                            this.handleNotification(message);
                        } else {
                            this.outputChannel.appendLine(`Unknown message: ${trimmed}`);
                        }
                    } else {
                        // Non-JSON output (server logs)
                        this.outputChannel.appendLine(`[Server] ${trimmed}`);
                    }
                } catch (error) {
                    // Don't log parse errors for ANSI escape sequences and other non-JSON
                    if (!trimmed.includes('\x1b') && !trimmed.includes('╭') && !trimmed.includes('│')) {
                        this.outputChannel.appendLine(`Failed to parse: ${trimmed.substring(0, 100)}`);
                    }
                }
            }
        }
    }

    /**
     * Handle a notification from the server.
     */
    private handleNotification(notification: { method: string; params?: unknown }): void {
        this.outputChannel.appendLine(`< Notification: ${notification.method}`);
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
            this.outputChannel.appendLine(`< Error: ${response.error.message}`);
            pending.reject(new Error(response.error.message));
        } else {
            this.outputChannel.appendLine(`< Response for ${response.id}`);
            pending.resolve(response.result);
        }
    }

    /**
     * Send a JSON-RPC request to the server.
     */
    private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.connected || !this.process) {
            throw new Error('Not connected to MCP server');
        }

        const id = this.requestId++;
        const request: MCPRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        this.outputChannel.appendLine(`> ${method} (id: ${id})`);

        // Send request
        const requestStr = JSON.stringify(request) + '\n';
        this.process.stdin?.write(requestStr);

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
     * Send a JSON-RPC notification to the server (no response expected).
     */
    private sendNotification(method: string, params?: Record<string, unknown>): void {
        if (!this.connected || !this.process) {
            return;
        }

        const notification: MCPNotification = {
            jsonrpc: '2.0',
            method,
            params,
        };

        this.outputChannel.appendLine(`> Notification: ${method}`);
        this.process.stdin?.write(JSON.stringify(notification) + '\n');
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
        this.initialized = false;
        this.rejectAllPending(new Error('MCP client disconnected'));
    }

    /**
     * Check if connected to the server.
     */
    isConnected(): boolean {
        return this.connected && this.initialized;
    }

    /**
     * Call an MCP tool with the given name and arguments.
     */
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.initialized) {
            throw new Error('MCP connection not initialized');
        }

        const result = await this.sendRequest<{ content: Array<{ type: string; text?: string }> }>(
            'tools/call',
            { name, arguments: args }
        );

        // Extract text content from the result
        if (result.content && Array.isArray(result.content)) {
            const textContent = result.content.find(c => c.type === 'text');
            if (textContent?.text) {
                try {
                    return JSON.parse(textContent.text) as T;
                } catch {
                    return textContent.text as unknown as T;
                }
            }
        }

        return result as unknown as T;
    }

    /**
     * List available tools.
     */
    async listTools(): Promise<Array<{ name: string; description?: string }>> {
        if (!this.initialized) {
            throw new Error('MCP connection not initialized');
        }

        const result = await this.sendRequest<{ tools: Array<{ name: string; description?: string }> }>(
            'tools/list'
        );

        return result.tools || [];
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
     * Query beliefs using the query_beliefs_tool MCP tool.
     */
    async queryBeliefs(query: string): Promise<Array<{
        id: string;
        content: string;
        conviction: number;
        category?: string;
        domain?: string;
    }>> {
        return this.callTool('query_beliefs_tool', { query });
    }

    /**
     * Adjust a belief using the adjust_belief_tool MCP tool.
     */
    async adjustBelief(
        beliefId: string,
        action: 'reinforce' | 'weaken' | 'modify' | 'delete',
        options?: { new_content?: string; reason?: string }
    ): Promise<{
        id: string;
        conviction: number;
    }> {
        return this.callTool('adjust_belief_tool', {
            belief_id: beliefId,
            action,
            ...options,
        });
    }

    /**
     * Report an outcome for learning using the report_outcome_tool MCP tool.
     */
    async reportOutcome(outcome: {
        context_ids: string[];
        outcome: 'helpful' | 'not_helpful' | 'misleading' | 'outdated';
        reason?: string;
    }): Promise<void> {
        await this.callTool('report_outcome_tool', outcome);
    }

    /**
     * Chat with Forge - the AI development companion.
     * This provides a conversational interface with personality and opinions.
     */
    async chatWithForge(
        message: string,
        options?: { conversationId?: string; context?: Record<string, unknown> }
    ): Promise<{
        response: string;
        beliefs_used: string[];
        actions_taken: string[];
        confidence: number;
    }> {
        return this.callTool('chat_with_forge', {
            message,
            conversation_id: options?.conversationId,
            context: options?.context,
        });
    }

    /**
     * Dispose of the client and clean up resources.
     */
    dispose(): void {
        this.disconnect();
        this.outputChannel.dispose();
    }
}
