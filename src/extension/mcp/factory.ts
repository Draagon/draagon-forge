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

    const client = new MCPClient({ serverCommand });

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
