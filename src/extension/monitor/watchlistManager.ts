/**
 * Watchlist Manager - Manages watch rules
 */

export type WatchRuleSeverity = "block" | "warn" | "suggest";

export interface WatchRule {
    id: string;
    name: string;
    description: string;
    pattern: string; // Natural language pattern
    severity: WatchRuleSeverity;
    enabled: boolean;
    domains?: string[];
    createdAt: Date;
    updatedAt: Date;
}

export class WatchlistManager {
    private rules: Map<string, WatchRule> = new Map();

    /**
     * Add a new watch rule.
     */
    async addRule(rule: Omit<WatchRule, "id" | "createdAt" | "updatedAt">): Promise<WatchRule> {
        const newRule: WatchRule = {
            ...rule,
            id: this.generateId(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.rules.set(newRule.id, newRule);

        // TODO: Persist to MCP server
        return newRule;
    }

    /**
     * Remove a watch rule.
     */
    async removeRule(id: string): Promise<boolean> {
        const deleted = this.rules.delete(id);
        // TODO: Persist to MCP server
        return deleted;
    }

    /**
     * Toggle a watch rule's enabled state.
     */
    async toggleRule(id: string): Promise<WatchRule | null> {
        const rule = this.rules.get(id);
        if (!rule) {
            return null;
        }

        rule.enabled = !rule.enabled;
        rule.updatedAt = new Date();
        // TODO: Persist to MCP server
        return rule;
    }

    /**
     * Get all watch rules.
     */
    getRules(): WatchRule[] {
        return Array.from(this.rules.values());
    }

    /**
     * Get enabled watch rules.
     */
    getEnabledRules(): WatchRule[] {
        return this.getRules().filter((r) => r.enabled);
    }

    private generateId(): string {
        return `wr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
