/**
 * Memory View Provider
 *
 * Provides a tree view for browsing beliefs, learnings, and insights
 * stored in Forge's semantic memory.
 */

import * as vscode from 'vscode';

interface MemoryItem {
    id: string;
    content: string;
    type: string;  // belief, insight, knowledge, skill
    domain?: string;
    category?: string;
    conviction?: number;
    score?: number;
    source?: string;
    created_at?: string;
}

interface MemoryGroup {
    type: string;
    label: string;
    icon: string;
    items: MemoryItem[];
}

type TreeItemType = MemoryGroup | MemoryItem;

export class MemoryViewProvider implements vscode.TreeDataProvider<TreeItemType> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItemType | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _memories: MemoryItem[] = [];
    private _isLoading = false;
    private _lastError: string | null = null;

    constructor(private readonly _apiUrl: string) {}

    getTreeItem(element: TreeItemType): vscode.TreeItem {
        if (this._isMemoryGroup(element)) {
            return this._createGroupItem(element);
        } else {
            return this._createMemoryItem(element);
        }
    }

    getChildren(element?: TreeItemType): TreeItemType[] {
        if (!element) {
            // Root level - show groups
            return this._getGroups();
        }

        if (this._isMemoryGroup(element)) {
            // Group level - show items in this group
            return element.items;
        }

        // Memory item level - no children
        return [];
    }

    private _isMemoryGroup(element: TreeItemType): element is MemoryGroup {
        return 'items' in element && Array.isArray(element.items);
    }

    private _getGroups(): MemoryGroup[] {
        if (this._isLoading) {
            return [];
        }

        if (this._lastError) {
            return [];
        }

        if (this._memories.length === 0) {
            return [];
        }

        // Group memories by type
        const groups: Map<string, MemoryItem[]> = new Map();

        for (const memory of this._memories) {
            const type = memory.type || 'memory';
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            groups.get(type)!.push(memory);
        }

        // Convert to MemoryGroup array
        const result: MemoryGroup[] = [];

        const typeConfig: Record<string, { label: string; icon: string; order: number }> = {
            belief: { label: 'Beliefs', icon: '💡', order: 1 },
            insight: { label: 'Insights', icon: '🔮', order: 2 },
            knowledge: { label: 'Knowledge', icon: '📚', order: 3 },
            skill: { label: 'Skills', icon: '🛠️', order: 4 },
            memory: { label: 'Memories', icon: '🧠', order: 5 },
        };

        for (const [type, items] of groups) {
            const config = typeConfig[type] || { label: type, icon: '📝', order: 99 };
            result.push({
                type,
                label: `${config.icon} ${config.label} (${items.length})`,
                icon: config.icon,
                items: items.sort((a, b) => (b.conviction || 0) - (a.conviction || 0)),
            });
        }

        // Sort by order
        return result.sort((a, b) => {
            const orderA = typeConfig[a.type]?.order || 99;
            const orderB = typeConfig[b.type]?.order || 99;
            return orderA - orderB;
        });
    }

    private _createGroupItem(group: MemoryGroup): vscode.TreeItem {
        const item = new vscode.TreeItem(
            group.label,
            vscode.TreeItemCollapsibleState.Expanded
        );
        item.contextValue = 'memoryGroup';
        return item;
    }

    private _createMemoryItem(memory: MemoryItem): vscode.TreeItem {
        // Truncate content for display
        const maxLength = 60;
        const displayContent = memory.content.length > maxLength
            ? memory.content.substring(0, maxLength) + '...'
            : memory.content;

        const item = new vscode.TreeItem(displayContent);
        item.id = memory.id;

        // Show conviction as description
        if (memory.conviction !== undefined) {
            const convictionBar = this._getConvictionBar(memory.conviction);
            item.description = `${convictionBar} ${(memory.conviction * 100).toFixed(0)}%`;
        }

        // Tooltip with full details
        item.tooltip = new vscode.MarkdownString();
        item.tooltip.appendMarkdown(`**${this._getTypeLabel(memory.type)}**\n\n`);
        item.tooltip.appendMarkdown(`${memory.content}\n\n`);
        item.tooltip.appendMarkdown(`---\n`);
        if (memory.conviction !== undefined) {
            item.tooltip.appendMarkdown(`*Conviction:* ${(memory.conviction * 100).toFixed(0)}%\n`);
        }
        if (memory.domain) {
            item.tooltip.appendMarkdown(`*Domain:* ${memory.domain}\n`);
        }
        if (memory.category) {
            item.tooltip.appendMarkdown(`*Category:* ${memory.category}\n`);
        }
        if (memory.source) {
            item.tooltip.appendMarkdown(`*Source:* ${memory.source}\n`);
        }

        item.contextValue = 'memoryItem';

        // Command to show detail
        item.command = {
            command: 'draagon-forge.showMemoryDetail',
            title: 'Show Memory Detail',
            arguments: [memory],
        };

        return item;
    }

    private _getConvictionBar(conviction: number): string {
        const filled = Math.round(conviction * 5);
        const empty = 5 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    private _getTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            belief: '💡 Belief',
            insight: '🔮 Insight',
            knowledge: '📚 Knowledge',
            skill: '🛠️ Skill',
            memory: '🧠 Memory',
        };
        return labels[type] || `📝 ${type}`;
    }

    async refresh(): Promise<void> {
        this._isLoading = true;
        this._lastError = null;
        this._onDidChangeTreeData.fire(undefined);

        try {
            const response = await fetch(`${this._apiUrl}/search?query=*&limit=100`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as { results?: Record<string, unknown>[] };
            this._memories = (data.results || []).map((r: Record<string, unknown>, i: number) => ({
                id: String(r.id || i),
                content: String(r.content || ''),
                type: String(r.type || 'memory'),
                domain: r.domain as string | undefined,
                category: r.category as string | undefined,
                conviction: typeof r.conviction === 'number' ? r.conviction :
                           typeof r.score === 'number' ? r.score : undefined,
                score: typeof r.score === 'number' ? r.score : undefined,
                source: r.source as string | undefined,
            }));

            this._isLoading = false;
            this._onDidChangeTreeData.fire(undefined);
        } catch (e) {
            this._isLoading = false;
            this._lastError = e instanceof Error ? e.message : String(e);
            this._memories = [];
            this._onDidChangeTreeData.fire(undefined);
            console.error('Failed to fetch memories:', e);
        }
    }

    async search(query: string): Promise<void> {
        this._isLoading = true;
        this._onDidChangeTreeData.fire(undefined);

        try {
            const response = await fetch(
                `${this._apiUrl}/search?query=${encodeURIComponent(query)}&limit=50`
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as { results?: Record<string, unknown>[] };
            this._memories = (data.results || []).map((r: Record<string, unknown>, i: number) => ({
                id: String(r.id || i),
                content: String(r.content || ''),
                type: String(r.type || 'memory'),
                domain: r.domain as string | undefined,
                category: r.category as string | undefined,
                conviction: typeof r.conviction === 'number' ? r.conviction :
                           typeof r.score === 'number' ? r.score : undefined,
                score: typeof r.score === 'number' ? r.score : undefined,
                source: r.source as string | undefined,
            }));

            this._isLoading = false;
            this._onDidChangeTreeData.fire(undefined);
        } catch (e) {
            this._isLoading = false;
            console.error('Failed to search memories:', e);
        }
    }

    async addBelief(
        content: string,
        category?: string,
        domain?: string,
        conviction: number = 0.7
    ): Promise<boolean> {
        try {
            const params = new URLSearchParams();
            params.set('content', content);
            params.set('conviction', conviction.toString());
            if (category) params.set('category', category);
            if (domain) params.set('domain', domain);

            const response = await fetch(`${this._apiUrl}/beliefs?${params}`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Refresh the tree
            await this.refresh();
            return true;
        } catch (e) {
            console.error('Failed to add belief:', e);
            vscode.window.showErrorMessage(`Failed to add belief: ${e}`);
            return false;
        }
    }

    async adjustConviction(memoryId: string, delta: number): Promise<boolean> {
        // TODO: Implement conviction adjustment API endpoint
        // For now, just show a message
        vscode.window.showInformationMessage(
            `Conviction adjustment: ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}% for ${memoryId}`
        );
        return true;
    }

    async deleteMemory(memoryId: string): Promise<boolean> {
        // TODO: Implement delete API endpoint
        vscode.window.showInformationMessage(`Delete memory: ${memoryId}`);
        return true;
    }

    getMemory(memoryId: string): MemoryItem | undefined {
        return this._memories.find(m => m.id === memoryId);
    }
}
