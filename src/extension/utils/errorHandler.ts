/**
 * Error handling utilities for Draagon Forge extension
 */

import * as vscode from 'vscode';

/**
 * Execute an async operation with error handling.
 * Catches errors, logs them, and shows user-friendly messages.
 *
 * @param operation - The async operation to execute
 * @param context - Description of the operation for error messages
 * @returns The result of the operation, or null if it failed
 */
export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T | null> {
    try {
        return await operation();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${context}:`, error);
        vscode.window.showErrorMessage(`${context}: ${message}`);
        return null;
    }
}

/**
 * Create a command handler with automatic error handling.
 *
 * @param commandId - The command ID
 * @param handler - The command handler function
 * @returns A disposable for the registered command
 */
export function createCommandWithErrorHandling(
    commandId: string,
    handler: (...args: unknown[]) => Promise<void>
): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, async (...args: unknown[]) => {
        await withErrorHandling(
            () => handler(...args),
            `Command ${commandId}`
        );
    });
}

/**
 * Retry an operation with exponential backoff.
 *
 * @param operation - The operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelay - Initial delay in ms (default: 1000)
 * @returns The result of the operation
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.log(`Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`);

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }

    throw lastError || new Error('Operation failed after retries');
}
