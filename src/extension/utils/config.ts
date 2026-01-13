/**
 * Configuration utilities for Draagon Forge extension
 */

import * as vscode from 'vscode';

/**
 * Draagon Forge configuration interface
 */
export interface DraagonForgeConfig {
    enabled: boolean;
    mcpServerPath: string;
    neo4jUri: string;
    qdrantUrl: string;
    watchlist: {
        defaultSeverity: 'block' | 'warn' | 'suggest';
    };
    curiosity: {
        enabled: boolean;
        maxQuestionsPerDay: number;
    };
    audit: {
        enableContinuousMonitoring: boolean;
        checkIntervalMinutes: number;
    };
}

/**
 * Get the current Draagon Forge configuration from VS Code settings.
 *
 * @returns The current configuration
 */
export function getConfig(): DraagonForgeConfig {
    const config = vscode.workspace.getConfiguration('draagon-forge');

    return {
        enabled: config.get('enabled', true),
        mcpServerPath: config.get('mcpServerPath', 'python -m draagon_forge.mcp.server'),
        neo4jUri: config.get('neo4jUri', 'bolt://localhost:7687'),
        qdrantUrl: config.get('qdrantUrl', 'http://localhost:6333'),
        watchlist: {
            defaultSeverity: config.get('watchlist.defaultSeverity', 'warn'),
        },
        curiosity: {
            enabled: config.get('curiosity.enabled', true),
            maxQuestionsPerDay: config.get('curiosity.maxQuestionsPerDay', 3),
        },
        audit: {
            enableContinuousMonitoring: config.get('audit.enableContinuousMonitoring', true),
            checkIntervalMinutes: config.get('audit.checkIntervalMinutes', 5),
        },
    };
}

/**
 * Validate the current configuration and return any errors.
 *
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConfig(): string[] {
    const errors: string[] = [];
    const config = getConfig();

    if (!config.mcpServerPath) {
        errors.push('MCP server path is required');
    }

    if (config.curiosity.maxQuestionsPerDay < 0) {
        errors.push('Max questions per day must be >= 0');
    }

    if (config.audit.checkIntervalMinutes < 1) {
        errors.push('Audit check interval must be >= 1 minute');
    }

    return errors;
}
