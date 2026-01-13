/**
 * Terminal Watcher - Observes terminal command execution
 */

import * as vscode from "vscode";

export class TerminalWatcher implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // TODO: Implement terminal watching
        // Note: VS Code terminal API has limited access to command history
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
