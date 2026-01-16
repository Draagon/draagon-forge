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
 * Issue from code review
 */
export interface ReviewIssue {
    file_path: string;
    line?: number;
    message: string;
    severity: 'blocking' | 'warning' | 'suggestion';
    suggestion?: string;
}

/**
 * Principle violation detected during review
 */
export interface PrincipleViolation {
    principle: string;
    conviction: number;
    issue: ReviewIssue;
}

/**
 * Full code review result
 */
export interface CodeReviewResult {
    mode: string;
    overall_assessment: 'approve' | 'request_changes' | 'needs_discussion';
    summary: string;
    blocking_issues: ReviewIssue[];
    warnings: ReviewIssue[];
    suggestions: ReviewIssue[];
    principle_violations: PrincipleViolation[];
    new_patterns_detected: string[];
    files_reviewed: number;
    files_skipped: number;
    total_lines_changed: number;
    review_duration_ms: number;
    tokens_used: number;
    estimated_cost_cents: number;
}

/**
 * Quick summary of changes without full review
 */
export interface ReviewSummary {
    mode_detected: string;
    files_changed: number;
    total_additions: number;
    total_deletions: number;
    critical_files: number;
    important_files: number;
    minor_files: number;
    noise_files: number;
    file_list: Array<{
        path: string;
        lines_added: number;
        lines_deleted: number;
        classification: string;
    }>;
}

/**
 * Graph node for visualization
 */
export interface GraphNode {
    id: string;
    type: 'belief' | 'entity' | 'pattern' | 'principle';
    label: string;
    full_content?: string;
    conviction?: number;
    category?: string;
    domain?: string;
    color: string;
    size: number;
}

/**
 * Graph edge for visualization
 */
export interface GraphEdge {
    source: string;
    target: string;
    type: string;
    color: string;
}

/**
 * Graph data structure for visualization
 */
export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: {
        node_count: number;
        edge_count: number;
        belief_count: number;
        entity_count: number;
        avg_conviction: number;
    };
}

/**
 * Entity context with related beliefs
 */
export interface EntityContext {
    entity: GraphNode;
    beliefs: GraphNode[];
    belief_count: number;
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
        options?: {
            type?: 'principle' | 'pattern' | 'learning' | 'insight';
            category?: string;
            domain?: string;
            conviction?: number;
            rationale?: string;
        }
    ): Promise<{ id: string; success: boolean }> {
        return this.fetch('/beliefs', {
            method: 'POST',
            body: JSON.stringify({
                content,
                belief_type: options?.type || 'learning',
                category: options?.category,
                domain: options?.domain,
                conviction: options?.conviction,
                rationale: options?.rationale,
            }),
        });
    }

    /**
     * Adjust a belief (reinforce, weaken, modify, or delete).
     */
    async adjustBelief(
        beliefId: string,
        options: {
            action: 'reinforce' | 'weaken' | 'modify' | 'delete';
            content?: string;
            reason?: string;
        }
    ): Promise<{ success: boolean; conviction?: number; message?: string }> {
        return this.fetch(`/beliefs/${encodeURIComponent(beliefId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                action: options.action,
                new_content: options.content,
                reason: options.reason,
            }),
        });
    }

    /**
     * Delete a belief.
     */
    async deleteBelief(
        beliefId: string,
        reason?: string
    ): Promise<{ success: boolean; message?: string }> {
        return this.adjustBelief(beliefId, { action: 'delete', reason });
    }

    /**
     * Reset the conversation.
     */
    resetConversation(): void {
        this.conversationId = null;
    }

    // =========================================================================
    // Graph Visualization API
    // =========================================================================

    /**
     * Get belief graph data for visualization.
     */
    async getBeliefGraph(options?: {
        centerId?: string;
        depth?: number;
        includeEntities?: boolean;
        minConviction?: number;
        domains?: string[];
    }): Promise<GraphData> {
        const params = new URLSearchParams();
        if (options?.centerId) params.set('center_id', options.centerId);
        if (options?.depth !== undefined) params.set('depth', String(options.depth));
        if (options?.includeEntities !== undefined) params.set('include_entities', String(options.includeEntities));
        if (options?.minConviction !== undefined) params.set('min_conviction', String(options.minConviction));
        if (options?.domains) params.set('domains', options.domains.join(','));

        const query = params.toString();
        return this.fetch<GraphData>(`/beliefs/graph${query ? `?${query}` : ''}`);
    }

    /**
     * Find path between two nodes in the belief graph.
     */
    async findGraphPath(
        sourceId: string,
        targetId: string,
        maxHops?: number
    ): Promise<GraphNode[]> {
        const params = new URLSearchParams({
            source_id: sourceId,
            target_id: targetId,
        });
        if (maxHops !== undefined) params.set('max_hops', String(maxHops));

        const response = await this.fetch<{ path: GraphNode[] }>(
            `/beliefs/graph/path?${params.toString()}`
        );
        return response.path;
    }

    /**
     * Get context for a specific entity.
     */
    async getEntityContext(entityId: string): Promise<EntityContext> {
        return this.fetch<EntityContext>(
            `/beliefs/graph/entity/${encodeURIComponent(entityId)}`
        );
    }

    /**
     * List all beliefs with optional filtering.
     */
    async listAllBeliefs(options?: {
        domain?: string;
        category?: string;
        minConviction?: number;
    }): Promise<{ beliefs: SearchResult[]; count: number }> {
        const params = new URLSearchParams();
        if (options?.domain) params.set('domain', options.domain);
        if (options?.category) params.set('category', options.category);
        if (options?.minConviction !== undefined) params.set('min_conviction', String(options.minConviction));

        const query = params.toString();
        return this.fetch(`/beliefs/all${query ? `?${query}` : ''}`);
    }

    // =========================================================================
    // Code Mesh API
    // =========================================================================

    /**
     * Project info from the mesh store
     */
    async getMeshProjects(query?: string): Promise<Array<{
        project_id: string;
        branches: string[];
        last_extraction: string;
        total_nodes: number;
    }>> {
        const params = new URLSearchParams();
        if (query) params.set('q', query);

        const queryString = params.toString();
        const response = await this.fetch<{ projects: Array<{
            project_id: string;
            branches: string[];
            last_extraction: string;
            total_nodes: number;
        }> }>(`/mesh/projects${queryString ? `?${queryString}` : ''}`);
        return response.projects;
    }

    /**
     * Get mesh data for a specific project.
     */
    async getMeshData(projectId: string, branch?: string): Promise<{
        project_id: string;
        branch: string;
        results: Array<{
            file: string;
            nodes: Array<{
                id: string;
                type: string;
                name: string;
                source: { file: string; line_start: number; line_end: number };
                properties: Record<string, unknown>;
            }>;
            edges: Array<{
                type: string;
                from_id: string;
                to_id: string;
            }>;
        }>;
        statistics: {
            total_nodes: number;
            total_edges: number;
            files: number;
        };
    }> {
        const params = new URLSearchParams();
        if (branch) params.set('branch', branch);

        const queryString = params.toString();
        return this.fetch(`/mesh/projects/${encodeURIComponent(projectId)}${queryString ? `?${queryString}` : ''}`);
    }

    // =========================================================================
    // Code Review API
    // =========================================================================

    /**
     * Review code changes using the Code Review Agent.
     */
    async reviewCodeChanges(options?: {
        mode?: 'auto' | 'staged' | 'unstaged' | 'branch';
        baseBranch?: string;
        maxFiles?: number;
        includeSuggestions?: boolean;
        repoPath?: string;
    }): Promise<CodeReviewResult> {
        const params = new URLSearchParams();
        if (options?.mode) params.set('mode', options.mode);
        if (options?.baseBranch) params.set('base_branch', options.baseBranch);
        if (options?.maxFiles !== undefined) params.set('max_files', String(options.maxFiles));
        if (options?.includeSuggestions !== undefined) params.set('include_suggestions', String(options.includeSuggestions));
        if (options?.repoPath) params.set('repo_path', options.repoPath);

        const query = params.toString();
        return this.fetch<CodeReviewResult>(`/review${query ? `?${query}` : ''}`, {
            method: 'POST',
        });
    }

    /**
     * Get a quick summary of changes without full review.
     */
    async getReviewSummary(options?: {
        mode?: 'auto' | 'staged' | 'unstaged' | 'branch';
        baseBranch?: string;
        repoPath?: string;
    }): Promise<ReviewSummary> {
        const params = new URLSearchParams();
        if (options?.mode) params.set('mode', options.mode);
        if (options?.baseBranch) params.set('base_branch', options.baseBranch);
        if (options?.repoPath) params.set('repo_path', options.repoPath);

        const query = params.toString();
        return this.fetch<ReviewSummary>(`/review/summary${query ? `?${query}` : ''}`);
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
