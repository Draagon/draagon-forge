/**
 * Forge API Client - HTTP client for the Forge chat API
 *
 * This client communicates with the standalone Forge API server
 * rather than spawning an MCP server as a child process.
 */

import * as vscode from 'vscode';

/**
 * Chat request payload
 */
interface ChatRequest {
    message: string;
    user_id?: string;
    conversation_id?: string;
    context?: Record<string, unknown>;
}

/**
 * Chat response from the API
 */
interface ChatResponse {
    response: string;
    conversation_id?: string;
    beliefs_used: string[];
    actions_taken: string[];
    confidence: number;
}

/**
 * Search result from context search
 */
interface SearchResult {
    id: string;
    content: string;
    score: number;
    category?: string;
    domain?: string;
}

/**
 * Options for creating the API client
 */
export interface ForgeAPIClientOptions {
    baseUrl: string;
}

/**
 * Forge API Client - communicates with the Forge HTTP API server.
 */
export class ForgeAPIClient implements vscode.Disposable {
    private readonly baseUrl: string;
    private readonly outputChannel: vscode.OutputChannel;
    private conversationId: string | null = null;

    constructor(options: ForgeAPIClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.outputChannel = vscode.window.createOutputChannel('Draagon Forge API');
    }

    /**
     * Check if the API server is healthy.
     */
    async isHealthy(): Promise<boolean> {
        try {
            const response = await this.fetch<{ status: string }>('/health');
            return response.status === 'healthy';
        } catch {
            return false;
        }
    }

    /**
     * Get server info.
     */
    async getInfo(): Promise<{
        service: string;
        version: string;
        llm_model: string;
        user_id: string;
    }> {
        return this.fetch('/info');
    }

    /**
     * Chat with Forge.
     */
    async chat(message: string, context?: Record<string, unknown>): Promise<ChatResponse> {
        const request: ChatRequest = {
            message,
            conversation_id: this.conversationId || undefined,
            context,
        };

        const response = await this.fetch<ChatResponse>('/chat', {
            method: 'POST',
            body: JSON.stringify(request),
        });

        // Store conversation ID for continuity
        if (response.conversation_id) {
            this.conversationId = response.conversation_id;
        }

        return response;
    }

    /**
     * Search for relevant context.
     */
    async searchContext(
        query: string,
        options?: { limit?: number; domain?: string }
    ): Promise<SearchResult[]> {
        const params = new URLSearchParams({ query });
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.domain) params.set('domain', options.domain);

        const response = await this.fetch<{ results: SearchResult[] }>(
            `/search?${params.toString()}`
        );
        return response.results;
    }

    /**
     * Query beliefs.
     */
    async queryBeliefs(
        query?: string,
        options?: { limit?: number }
    ): Promise<SearchResult[]> {
        const params = new URLSearchParams();
        if (query) params.set('query', query);
        if (options?.limit) params.set('limit', String(options.limit));

        const response = await this.fetch<{ beliefs: SearchResult[] }>(
            `/beliefs?${params.toString()}`
        );
        return response.beliefs;
    }

    /**
     * Add a belief.
     */
    async addBelief(
        content: string,
        options?: { category?: string; domain?: string; conviction?: number }
    ): Promise<{ id: string }> {
        const params = new URLSearchParams({ content });
        if (options?.category) params.set('category', options.category);
        if (options?.domain) params.set('domain', options.domain);
        if (options?.conviction) params.set('conviction', String(options.conviction));

        return this.fetch('/beliefs', {
            method: 'POST',
            body: params.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
    }

    /**
     * Reset the conversation.
     */
    resetConversation(): void {
        this.conversationId = null;
    }

    /**
     * Make a fetch request to the API.
     */
    private async fetch<T>(
        path: string,
        options?: RequestInit
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options?.headers as Record<string, string> || {}),
        };

        this.outputChannel.appendLine(`API Request: ${options?.method || 'GET'} ${url}`);

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error ${response.status}: ${errorText}`);
            }

            const data = await response.json() as T;
            this.outputChannel.appendLine(`API Response: ${JSON.stringify(data).slice(0, 200)}...`);
            return data;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`API Error: ${message}`);
            throw error;
        }
    }

    /**
     * Dispose of the client.
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * Create a Forge API client from VS Code configuration.
 */
export async function createForgeAPIClient(
    context: vscode.ExtensionContext
): Promise<ForgeAPIClient> {
    const config = vscode.workspace.getConfiguration('draagon-forge');
    const apiUrl = config.get<string>('apiUrl', 'http://localhost:8765');

    const client = new ForgeAPIClient({ baseUrl: apiUrl });

    // Check if server is healthy
    const healthy = await client.isHealthy();
    if (!healthy) {
        throw new Error(
            `Forge API server not available at ${apiUrl}. ` +
            'Make sure the server is running: python -m draagon_forge.api.server'
        );
    }

    context.subscriptions.push(client);
    return client;
}
