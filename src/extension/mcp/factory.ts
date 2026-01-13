/**
 * MCP Client Factory - Creates and initializes MCP client instances
 */

import * as vscode from 'vscode';
import { MCPClient } from './client';

/**
 * Create and connect an MCP client using VS Code configuration.
 *
 * @param context - VS Code extension context
 * @returns Connected MCP client
 * @throws Error if connection fails
 */
export async function createMCPClient(
    context: vscode.ExtensionContext
): Promise<MCPClient> {
    const config = vscode.workspace.getConfiguration('draagon-forge');
    const serverCommand = config.get<string>(
        'mcpServerPath',
        'python -m draagon_forge.mcp.server'
    );

    // Build environment variables for the MCP server
    const env: Record<string, string> = {};

    // Pass GROQ API key if configured
    const groqApiKey = config.get<string>('groqApiKey', '');
    if (groqApiKey) {
        env['GROQ_API_KEY'] = groqApiKey;
    }

    // Pass database configuration
    const neo4jUri = config.get<string>('neo4jUri', 'bolt://localhost:7687');
    const qdrantUrl = config.get<string>('qdrantUrl', 'http://localhost:6333');
    env['NEO4J_URI'] = neo4jUri;
    env['QDRANT_URL'] = qdrantUrl;

    const client = new MCPClient({ serverCommand, env });

    try {
        await client.connect();
        console.log('MCP client connected successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
            `Failed to connect to MCP server: ${message}`,
            'View Logs'
        ).then(selection => {
            if (selection === 'View Logs') {
                vscode.commands.executeCommand('workbench.action.output.show');
            }
        });
        throw error;
    }

    context.subscriptions.push(client);
    return client;
}
