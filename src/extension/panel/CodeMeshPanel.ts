/**
 * Code Mesh Panel - Interactive visualization of code structure diagrams
 *
 * Displays Mermaid diagrams generated from the Code Knowledge Mesh:
 * - Class diagrams
 * - Call graphs
 * - Dependency flowcharts
 * - Module dependencies
 * - API sequence diagrams
 * - ER diagrams (for data models)
 *
 * Features:
 * - Automatically extracts from the current workspace/git project
 * - Browse and search all previously processed projects
 * - Projects ordered by most recent extraction time
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ForgeAPIClient } from '../api/client';

const execAsync = promisify(exec);

/**
 * Diagram type options
 */
type DiagramType = 'class' | 'callGraph' | 'flowchart' | 'moduleDeps' | 'sequence' | 'er';

/**
 * Extraction state
 */
interface ExtractionState {
    isExtracting: boolean;
    lastExtraction: Date | null;
    projectPath: string | null;
    error: string | null;
}

/**
 * Project info from the mesh store
 */
interface MeshProject {
    project_id: string;
    branches: string[];
    last_extraction: string;
    total_nodes: number;
}

/**
 * Code Mesh Panel - Visualizes code structure using Mermaid diagrams.
 */
export class CodeMeshPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private onDidDisposeEmitter = new vscode.EventEmitter<void>();

    private diagrams: Record<string, string> = {};
    private currentDiagram: DiagramType = 'class';
    private extractionState: ExtractionState = {
        isExtracting: false,
        lastExtraction: null,
        projectPath: null,
        error: null,
    };
    private meshFilePath: string | null = null;

    // Project browser state
    private projects: MeshProject[] = [];
    private selectedProject: MeshProject | null = null;
    private selectedBranch: string | null = null;
    private projectSearchQuery: string = '';
    private isLoadingProjects: boolean = false;
    private showProjectBrowser: boolean = true;
    private apiClient: ForgeAPIClient | null = null;

    // Current workspace info (detected from git)
    private currentWorkspace: {
        name: string;
        path: string;
        branch: string | null;
    } | null = null;

    readonly onDidDispose = this.onDidDisposeEmitter.event;

    constructor(private context: vscode.ExtensionContext, apiClient?: ForgeAPIClient) {
        this.apiClient = apiClient || null;
        this.panel = vscode.window.createWebviewPanel(
            'draagonForgeCodeMesh',
            'Code Mesh Diagrams',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'resources'),
                ],
            }
        );

        // Set up webview message handler
        this.panel.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this.disposables
        );

        // Detect current workspace and load projects
        this.initializeWorkspace();
    }

    /**
     * Initialize by detecting current workspace and loading projects.
     */
    private async initializeWorkspace(): Promise<void> {
        // Detect current workspace git info
        await this.detectCurrentWorkspace();
        this.updatePanel();

        // Load projects from API (may be empty if API unavailable)
        await this.loadProjects();

        // Try to auto-select current workspace
        if (this.currentWorkspace) {
            // Check if project exists in mesh store
            const matchingProject = this.projects.find(
                p => p.project_id === this.currentWorkspace?.name ||
                     p.project_id.endsWith('/' + this.currentWorkspace?.name)
            );

            if (matchingProject) {
                // Project exists in store - select it with current branch if available
                const branch = this.currentWorkspace.branch && matchingProject.branches.includes(this.currentWorkspace.branch)
                    ? this.currentWorkspace.branch
                    : matchingProject.branches[0];
                await this.selectProject(matchingProject.project_id, branch);
            } else {
                // Project not in store - auto-extract from current workspace
                this.showProjectBrowser = false;
                await this.extractCurrentProject();
            }
        }
    }

    /**
     * Detect current workspace's git project name and branch.
     */
    private async detectCurrentWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.currentWorkspace = null;
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const workspaceName = path.basename(workspacePath);

        // Try to get current git branch
        let branch: string | null = null;
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
                cwd: workspacePath,
                timeout: 5000,
            });
            branch = stdout.trim() || null;
        } catch {
            // Not a git repo or git not available
            branch = null;
        }

        this.currentWorkspace = {
            name: workspaceName,
            path: workspacePath,
            branch,
        };
    }

    /**
     * Reveal the panel if hidden.
     */
    reveal(): void {
        this.panel.reveal();
    }

    /**
     * Handle messages from the webview.
     */
    private async handleMessage(message: {
        command: string;
        [key: string]: unknown;
    }): Promise<void> {
        switch (message.command) {
            case 'refresh':
                await this.extractCurrentProject();
                break;

            case 'selectDiagram':
                this.currentDiagram = message.type as DiagramType;
                this.updatePanel();
                break;

            case 'exportMermaid':
                await this.exportMermaid();
                break;

            case 'exportMarkdown':
                await this.exportMarkdown();
                break;

            case 'copyToClipboard':
                await this.copyDiagramToClipboard();
                break;

            case 'openInPreview':
                await this.openInMarkdownPreview();
                break;

            case 'searchProjects':
                this.projectSearchQuery = (message.query as string) || '';
                await this.loadProjects();
                break;

            case 'selectProject':
                await this.selectProject(message.projectId as string, message.branch as string);
                break;

            case 'toggleProjectBrowser':
                this.showProjectBrowser = !this.showProjectBrowser;
                this.updatePanel();
                break;

            case 'extractCurrentWorkspace':
                await this.extractCurrentProject();
                break;
        }
    }

    /**
     * Load projects from the API (ordered by most recent).
     */
    private async loadProjects(): Promise<void> {
        this.isLoadingProjects = true;
        this.updatePanel();

        try {
            if (this.apiClient) {
                this.projects = await this.apiClient.getMeshProjects(this.projectSearchQuery || undefined);
            } else {
                // No API client, show current workspace only
                this.projects = [];
            }
        } catch (error) {
            // API may not be available - still allow local extraction
            this.projects = [];
        }

        this.isLoadingProjects = false;
        this.updatePanel();
    }

    /**
     * Select a project from the list and load its mesh data.
     */
    private async selectProject(projectId: string, branch?: string): Promise<void> {
        const project = this.projects.find(p => p.project_id === projectId);
        if (!project) return;

        this.selectedProject = project;
        this.selectedBranch = branch || project.branches[0] || null;
        this.showProjectBrowser = false;
        this.extractionState = {
            isExtracting: true,
            lastExtraction: null,
            projectPath: projectId,
            error: null,
        };
        this.updatePanel();

        try {
            if (this.apiClient) {
                const meshData = await this.apiClient.getMeshData(projectId, this.selectedBranch || undefined);
                this.diagrams = this.generateMermaidDiagrams(meshData);
                this.extractionState = {
                    isExtracting: false,
                    lastExtraction: new Date(project.last_extraction),
                    projectPath: projectId,
                    error: null,
                };
            }
        } catch (error) {
            this.extractionState = {
                isExtracting: false,
                lastExtraction: null,
                projectPath: projectId,
                error: `Failed to load mesh: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        this.updatePanel();
    }

    /**
     * Extract mesh from the current workspace project.
     */
    private async extractCurrentProject(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.extractionState.error = 'No workspace folder open';
            this.updatePanel();
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;
        this.extractionState = {
            isExtracting: true,
            lastExtraction: null,
            projectPath,
            error: null,
        };
        this.updatePanel();

        try {
            // Create temp file for mesh output
            const tempDir = this.context.globalStorageUri.fsPath;
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
            const meshFile = path.join(tempDir, `mesh-${Date.now()}.json`);

            // Run mesh-builder extract command
            // Try multiple locations in order of preference
            const possiblePaths = [
                // Production: installed as npm package
                path.join(this.context.extensionPath, 'node_modules', '@draagon-forge', 'mesh-builder', 'dist', 'cli', 'index.js'),
                // Development: built CLI in src/mesh-builder
                path.join(this.context.extensionPath, 'src', 'mesh-builder', 'dist', 'cli', 'index.js'),
                // Development: if extension is in a subdirectory
                path.join(this.context.extensionPath, '..', 'mesh-builder', 'dist', 'cli', 'index.js'),
            ];

            let extractCmd: string | null = null;
            for (const meshBuilderPath of possiblePaths) {
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(meshBuilderPath));
                    extractCmd = `node "${meshBuilderPath}" extract "${projectPath}" -o "${meshFile}" --no-ai`;
                    break;
                } catch {
                    // Try next path
                }
            }

            if (!extractCmd) {
                throw new Error('mesh-builder CLI not found. Run "npm run build" in src/mesh-builder first.');
            }

            // Execute extraction (with timeout)
            await execAsync(extractCmd, {
                cwd: projectPath,
                timeout: 120000, // 2 minute timeout
            });

            this.meshFilePath = meshFile;

            // Generate diagrams
            await this.generateDiagrams(meshFile);

            this.extractionState = {
                isExtracting: false,
                lastExtraction: new Date(),
                projectPath,
                error: null,
            };
        } catch (error) {
            this.extractionState = {
                isExtracting: false,
                lastExtraction: null,
                projectPath,
                error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        this.updatePanel();
    }

    /**
     * Generate all diagram types from the mesh file.
     */
    private async generateDiagrams(meshFile: string): Promise<void> {
        try {
            // Read mesh file
            const meshContent = await vscode.workspace.fs.readFile(vscode.Uri.file(meshFile));
            const mesh = JSON.parse(Buffer.from(meshContent).toString('utf-8'));

            // Import MermaidGenerator dynamically (we can't import it directly since it's in mesh-builder)
            // For now, we'll generate diagrams using the CLI and parse the output
            // Or we can inline the generation logic here

            this.diagrams = this.generateMermaidDiagrams(mesh);
        } catch (error) {
            this.extractionState.error = `Failed to generate diagrams: ${error}`;
        }
    }

    /**
     * Generate Mermaid diagrams from mesh data.
     * This is a simplified version - in production, use the full MermaidGenerator.
     */
    private generateMermaidDiagrams(mesh: {
        results?: Array<{
            nodes: Array<{
                id: string;
                type: string;
                name: string;
                source: { file: string; line_start: number };
                properties: Record<string, unknown>;
            }>;
            edges: Array<{
                type: string;
                from_id: string;
                to_id: string;
            }>;
        }>;
    }): Record<string, string> {
        const diagrams: Record<string, string> = {};
        const allNodes = mesh.results?.flatMap(r => r.nodes) || [];
        const allEdges = mesh.results?.flatMap(r => r.edges) || [];

        // Build lookup maps
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));

        // Class Diagram
        const classes = allNodes.filter(n => n.type === 'Class' || n.type === 'Interface');
        const classLines = ['classDiagram'];
        for (const cls of classes.slice(0, 30)) {
            const id = this.sanitizeId(cls.name);
            classLines.push(`    class ${id} {`);

            // Find methods
            const containEdges = allEdges.filter(
                e => e.type === 'CONTAINS' && e.from_id === cls.id
            );
            for (const edge of containEdges.slice(0, 10)) {
                const method = nodeMap.get(edge.to_id);
                if (method && (method.type === 'Method' || method.type === 'Function')) {
                    classLines.push(`        +${this.sanitizeId(method.name)}()`);
                }
            }
            classLines.push('    }');
        }

        // Inheritance edges
        for (const edge of allEdges) {
            if (edge.type === 'INHERITS' || edge.type === 'IMPLEMENTS') {
                const from = nodeMap.get(edge.from_id);
                const to = nodeMap.get(edge.to_id);
                if (from && to && classes.includes(from) && classes.includes(to)) {
                    const fromId = this.sanitizeId(from.name);
                    const toId = this.sanitizeId(to.name);
                    classLines.push(`    ${toId} <|-- ${fromId}`);
                }
            }
        }
        // Only add diagram if it has content beyond the header
        if (classLines.length > 1) {
            diagrams.class = classLines.join('\n');
        } else {
            diagrams.class = 'classDiagram\n    class NoClassesFound {\n        +noData()\n    }';
        }

        // Call Graph
        const callEdges = allEdges.filter(e => e.type === 'CALLS');
        const callLines = ['flowchart TB'];
        const calledNodes = new Set<string>();

        for (const edge of callEdges.slice(0, 50)) {
            const from = nodeMap.get(edge.from_id);
            const to = nodeMap.get(edge.to_id);
            if (from && to) {
                calledNodes.add(from.id);
                calledNodes.add(to.id);
            }
        }

        for (const nodeId of Array.from(calledNodes).slice(0, 30)) {
            const node = nodeMap.get(nodeId);
            if (node) {
                const id = this.sanitizeId(node.name);
                callLines.push(`    ${id}["${this.escapeLabel(node.name)}"]`);
            }
        }

        for (const edge of callEdges.slice(0, 50)) {
            const from = nodeMap.get(edge.from_id);
            const to = nodeMap.get(edge.to_id);
            if (from && to && calledNodes.has(from.id) && calledNodes.has(to.id)) {
                const fromId = this.sanitizeId(from.name);
                const toId = this.sanitizeId(to.name);
                callLines.push(`    ${fromId} --> ${toId}`);
            }
        }
        if (callLines.length > 1) {
            diagrams.callGraph = callLines.join('\n');
        } else {
            diagrams.callGraph = 'flowchart TB\n    NoCallsFound["No call relationships found"]';
        }

        // Dependency Flowchart
        const flowLines = ['flowchart TB'];
        const depEdges = allEdges.filter(
            e => e.type === 'CALLS' || e.type === 'IMPORTS' || e.type === 'USES'
        );
        const depNodes = new Set<string>();

        for (const edge of depEdges.slice(0, 60)) {
            depNodes.add(edge.from_id);
            depNodes.add(edge.to_id);
        }

        for (const nodeId of Array.from(depNodes).slice(0, 30)) {
            const node = nodeMap.get(nodeId);
            if (node) {
                const id = this.sanitizeId(node.name);
                flowLines.push(`    ${id}["${this.escapeLabel(node.name)}"]`);
            }
        }

        for (const edge of depEdges.slice(0, 60)) {
            const from = nodeMap.get(edge.from_id);
            const to = nodeMap.get(edge.to_id);
            if (from && to && depNodes.has(from.id) && depNodes.has(to.id)) {
                const fromId = this.sanitizeId(from.name);
                const toId = this.sanitizeId(to.name);
                const arrow = edge.type === 'IMPORTS' ? '-.->': '-->';
                flowLines.push(`    ${fromId} ${arrow} ${toId}`);
            }
        }
        if (flowLines.length > 1) {
            diagrams.flowchart = flowLines.join('\n');
        } else {
            diagrams.flowchart = 'flowchart TB\n    NoDepsFound["No dependencies found"]';
        }

        // Module Dependencies
        const imports = allNodes.filter(n => n.type === 'Import');
        const moduleLines = ['flowchart LR'];
        const fileModules = new Map<string, Set<string>>();

        for (const imp of imports) {
            const file = this.getShortFileName(imp.source.file);
            const module = (imp.properties.module as string) || imp.name;
            if (!fileModules.has(file)) {
                fileModules.set(file, new Set());
            }
            fileModules.get(file)!.add(module);
        }

        for (const [file, modules] of Array.from(fileModules.entries()).slice(0, 15)) {
            const fileId = this.sanitizeId(file);
            moduleLines.push(`    ${fileId}["${this.escapeLabel(file)}"]`);
            for (const mod of Array.from(modules).slice(0, 5)) {
                const modId = this.sanitizeId(mod);
                moduleLines.push(`    ${fileId} -.-> ${modId}["${this.escapeLabel(mod)}"]`);
            }
        }
        if (moduleLines.length > 1) {
            diagrams.moduleDeps = moduleLines.join('\n');
        } else {
            diagrams.moduleDeps = 'flowchart LR\n    NoImportsFound["No module imports found"]';
        }

        // Sequence Diagram (API endpoints)
        const endpoints = allNodes.filter(n => n.type === 'ApiEndpoint');
        const seqLines = ['sequenceDiagram'];
        seqLines.push('    participant Client');
        seqLines.push('    participant API');

        for (const endpoint of endpoints.slice(0, 10)) {
            const method = (endpoint.properties.method as string) || 'GET';
            const endpointPath = (endpoint.properties.path as string) || endpoint.name;
            seqLines.push(`    Client->>API: ${this.escapeLabel(method + ' ' + endpointPath)}`);
            seqLines.push(`    API-->>Client: 200 OK`);
        }
        if (seqLines.length > 3) {
            diagrams.sequence = seqLines.join('\n');
        } else {
            diagrams.sequence = 'sequenceDiagram\n    participant Client\n    participant API\n    Note over Client,API: No API endpoints found';
        }

        // ER Diagram (models)
        const models = allNodes.filter(n => n.type === 'Model' || n.type === 'Table');
        const erLines = ['erDiagram'];

        for (const model of models.slice(0, 20)) {
            const id = this.sanitizeId(model.name);
            erLines.push(`    ${id} {`);
            const fields = model.properties.fields;
            if (Array.isArray(fields)) {
                for (const field of fields.slice(0, 10)) {
                    if (typeof field === 'object' && field !== null) {
                        const f = field as Record<string, unknown>;
                        erLines.push(`        ${f.type || 'string'} ${this.sanitizeId(String(f.name || 'field'))}`);
                    } else if (typeof field === 'string') {
                        erLines.push(`        string ${this.sanitizeId(field)}`);
                    }
                }
            }
            erLines.push('    }');
        }
        if (erLines.length > 1) {
            diagrams.er = erLines.join('\n');
        } else {
            diagrams.er = 'erDiagram\n    NO_MODELS {\n        string noDataModelsFound\n    }';
        }

        return diagrams;
    }

    /**
     * Sanitize identifier for Mermaid (must start with letter, only alphanumeric and underscore).
     */
    private sanitizeId(id: string): string {
        let sanitized = id
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^_+/, '')
            .replace(/_+$/, '')
            .replace(/_+/g, '_')
            .substring(0, 30);

        // Must start with a letter
        if (!sanitized || !/^[a-zA-Z]/.test(sanitized)) {
            sanitized = 'n_' + sanitized;
        }

        return sanitized || 'node';
    }

    /**
     * Escape label text for Mermaid (used inside quotes or brackets).
     */
    private escapeLabel(text: string): string {
        return text
            .replace(/"/g, "'")
            .replace(/\[/g, '(')
            .replace(/\]/g, ')')
            .replace(/[<>{}]/g, '')
            .substring(0, 50);
    }

    /**
     * Get short file name from path.
     */
    private getShortFileName(filePath: string): string {
        const parts = filePath.split(/[/\\]/);
        return parts[parts.length - 1] || filePath;
    }

    /**
     * Export current diagram as Mermaid file.
     */
    private async exportMermaid(): Promise<void> {
        const diagram = this.diagrams[this.currentDiagram];
        if (!diagram) return;

        const doc = await vscode.workspace.openTextDocument({
            content: diagram,
            language: 'mermaid',
        });
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Export all diagrams as Markdown.
     */
    private async exportMarkdown(): Promise<void> {
        const sections: string[] = ['# Code Mesh Diagrams\n'];

        const diagramNames: Record<string, string> = {
            class: 'Class Diagram',
            callGraph: 'Call Graph',
            flowchart: 'Dependency Flowchart',
            moduleDeps: 'Module Dependencies',
            sequence: 'API Sequence Diagram',
            er: 'ER Diagram',
        };

        for (const [key, title] of Object.entries(diagramNames)) {
            if (this.diagrams[key]) {
                sections.push(`## ${title}\n`);
                sections.push('```mermaid');
                sections.push(this.diagrams[key]);
                sections.push('```\n');
            }
        }

        const doc = await vscode.workspace.openTextDocument({
            content: sections.join('\n'),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Copy current diagram to clipboard.
     */
    private async copyDiagramToClipboard(): Promise<void> {
        const diagram = this.diagrams[this.currentDiagram];
        if (diagram) {
            await vscode.env.clipboard.writeText(diagram);
            vscode.window.showInformationMessage('Diagram copied to clipboard');
        }
    }

    /**
     * Open diagram in VS Code's Markdown preview.
     */
    private async openInMarkdownPreview(): Promise<void> {
        const diagram = this.diagrams[this.currentDiagram];
        if (!diagram) return;

        const content = `# ${this.getDiagramTitle()}\n\n\`\`\`mermaid\n${diagram}\n\`\`\``;

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown',
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        await vscode.commands.executeCommand('markdown.showPreviewToSide');
    }

    /**
     * Get display title for current diagram.
     */
    private getDiagramTitle(): string {
        const titles: Record<string, string> = {
            class: 'Class Diagram',
            callGraph: 'Call Graph',
            flowchart: 'Dependency Flowchart',
            moduleDeps: 'Module Dependencies',
            sequence: 'API Sequence Diagram',
            er: 'ER Diagram',
        };
        return titles[this.currentDiagram] || 'Diagram';
    }

    /**
     * Update the panel HTML.
     */
    private updatePanel(): void {
        this.panel.webview.html = this.getHtmlContent();
    }

    /**
     * Generate a nonce for CSP.
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Generate the webview HTML content with Mermaid.
     */
    private getHtmlContent(): string {
        const nonce = this.getNonce();
        const currentDiagramCode = this.diagrams[this.currentDiagram] || '';

        const diagramTabs = [
            { id: 'class', label: 'Classes', icon: '📦' },
            { id: 'callGraph', label: 'Call Graph', icon: '🔗' },
            { id: 'flowchart', label: 'Dependencies', icon: '➡️' },
            { id: 'moduleDeps', label: 'Modules', icon: '📁' },
            { id: 'sequence', label: 'API Sequence', icon: '🔄' },
            { id: 'er', label: 'Data Models', icon: '🗄️' },
        ];

        const tabsHtml = diagramTabs
            .map(
                tab =>
                    `<button class="tab ${this.currentDiagram === tab.id ? 'active' : ''}"
                     data-type="${tab.id}">${tab.icon} ${tab.label}</button>`
            )
            .join('');

        const statusHtml = this.extractionState.isExtracting
            ? '<span class="status extracting">⏳ Loading...</span>'
            : this.extractionState.error
            ? `<span class="status error">❌ ${this.escapeHtml(this.extractionState.error)}</span>`
            : this.extractionState.lastExtraction
            ? `<span class="status success">✅ ${this.formatRelativeTime(this.extractionState.lastExtraction)}</span>`
            : '<span class="status">Ready to extract</span>';

        // Current workspace info for sidebar
        const currentWorkspaceHtml = this.currentWorkspace
            ? `<div class="current-workspace-info">
                <div class="workspace-label">Current Workspace</div>
                <div class="workspace-name">${this.escapeHtml(this.currentWorkspace.name)}</div>
                ${this.currentWorkspace.branch ? `<span class="workspace-branch">${this.escapeHtml(this.currentWorkspace.branch)}</span>` : ''}
            </div>`
            : '<div class="current-workspace-info"><div class="workspace-label">No workspace folder open</div></div>';

        // Project browser HTML
        const projectListHtml = this.projects.length > 0
            ? this.projects.map(p => {
                const isSelected = this.selectedProject?.project_id === p.project_id;
                const isCurrent = this.currentWorkspace && (
                    p.project_id === this.currentWorkspace.name ||
                    p.project_id.endsWith('/' + this.currentWorkspace.name)
                );
                const relTime = this.formatRelativeTime(new Date(p.last_extraction));
                return `
                    <div class="project-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}" data-project-id="${this.escapeHtml(p.project_id)}">
                        <div class="project-name">${this.escapeHtml(p.project_id)}${isCurrent ? ' <span class="current-badge">current</span>' : ''}</div>
                        <div class="project-meta">
                            <span title="Total nodes">${p.total_nodes} nodes</span>
                            <span title="Last extraction">${relTime}</span>
                        </div>
                        <div class="project-branches">
                            ${p.branches.map(b => `<span class="branch${this.currentWorkspace?.branch === b ? ' current-branch' : ''}" data-branch="${this.escapeHtml(b)}">${this.escapeHtml(b)}</span>`).join('')}
                        </div>
                    </div>
                `;
            }).join('')
            : this.isLoadingProjects
            ? '<div class="empty-projects">Loading projects...</div>'
            : `<div class="empty-projects">No projects in mesh store yet.</div>`;

        const currentProjectHtml = this.selectedProject
            ? `<div class="current-project">
                <span class="project-label">Project:</span>
                <span class="project-value">${this.escapeHtml(this.selectedProject.project_id)}</span>
                ${this.selectedBranch ? `<span class="branch-badge">${this.escapeHtml(this.selectedBranch)}</span>` : ''}
                <button id="change-project" title="Browse projects">📂</button>
            </div>`
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src data: https:;">
    <title>Code Mesh Diagrams</title>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --sidebar-bg: var(--vscode-sideBar-background);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --tab-active: var(--vscode-tab-activeBackground);
            --tab-inactive: var(--vscode-tab-inactiveBackground);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --input-fg: var(--vscode-input-foreground);
            --list-hover: var(--vscode-list-hoverBackground);
            --list-active: var(--vscode-list-activeSelectionBackground);
            --badge-bg: var(--vscode-badge-background);
            --badge-fg: var(--vscode-badge-foreground);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg);
            background: var(--bg);
            height: 100vh;
            overflow: hidden;
        }
        .main-layout {
            display: flex;
            height: 100vh;
        }
        /* Project Browser Sidebar */
        .project-browser {
            width: 280px;
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }
        .project-browser.hidden {
            display: none;
        }
        .browser-header {
            padding: 12px;
            border-bottom: 1px solid var(--border);
        }
        .browser-header h3 {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 8px;
        }
        .search-box {
            display: flex;
            gap: 4px;
        }
        .search-box input {
            flex: 1;
            padding: 6px 8px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            color: var(--input-fg);
            font-size: 12px;
        }
        .search-box input:focus {
            outline: 1px solid var(--button-bg);
        }
        .project-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px;
        }
        .project-item {
            padding: 10px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 4px;
        }
        .project-item:hover {
            background: var(--list-hover);
        }
        .project-item.selected {
            background: var(--list-active);
        }
        .project-name {
            font-weight: 500;
            font-size: 12px;
            margin-bottom: 4px;
            word-break: break-all;
        }
        .project-meta {
            display: flex;
            gap: 12px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
        }
        .project-branches {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .branch {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--badge-bg);
            color: var(--badge-fg);
            border-radius: 10px;
            cursor: pointer;
        }
        .branch:hover {
            opacity: 0.8;
        }
        .empty-projects {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .current-workspace-info {
            padding: 12px;
            background: var(--list-hover);
            border-bottom: 1px solid var(--border);
        }
        .workspace-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .workspace-name {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 4px;
        }
        .workspace-branch {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--button-bg);
            color: var(--button-fg);
            border-radius: 10px;
        }
        .current-badge {
            font-size: 9px;
            padding: 1px 4px;
            background: var(--button-bg);
            color: var(--button-fg);
            border-radius: 8px;
            margin-left: 4px;
        }
        .project-item.current {
            border-left: 2px solid var(--button-bg);
        }
        .branch.current-branch {
            background: var(--button-bg);
            color: var(--button-fg);
        }
        .browser-footer {
            padding: 12px;
            border-top: 1px solid var(--border);
        }
        .browser-footer button {
            width: 100%;
        }
        /* Main Content */
        .content-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            padding: 12px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--border);
            align-items: center;
            flex-wrap: wrap;
        }
        .toolbar-group {
            display: flex;
            gap: 4px;
        }
        .current-project {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }
        .current-project .project-label {
            color: var(--vscode-descriptionForeground);
        }
        .current-project .project-value {
            font-weight: 500;
        }
        .branch-badge {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--badge-bg);
            color: var(--badge-fg);
            border-radius: 10px;
        }
        .current-project button {
            padding: 4px 8px;
            font-size: 11px;
        }
        .tabs {
            display: flex;
            gap: 4px;
            padding: 8px 12px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
        }
        .tab {
            padding: 8px 16px;
            background: var(--tab-inactive);
            border: 1px solid var(--border);
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            color: var(--fg);
            font-size: 12px;
            white-space: nowrap;
        }
        .tab:hover {
            background: var(--tab-active);
        }
        .tab.active {
            background: var(--tab-active);
            border-bottom-color: var(--tab-active);
        }
        button {
            padding: 6px 12px;
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        button:hover {
            background: var(--button-hover);
        }
        .status {
            font-size: 11px;
            margin-left: auto;
            padding: 4px 8px;
            border-radius: 4px;
        }
        .status.extracting { color: #f0ad4e; }
        .status.error { color: #d9534f; }
        .status.success { color: #5cb85c; }
        .diagram-container {
            flex: 1;
            overflow: auto;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }
        .mermaid {
            background: var(--bg);
            min-width: 100%;
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state h2 {
            margin-bottom: 8px;
        }
        .empty-state p {
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="main-layout">
        <div class="project-browser ${this.showProjectBrowser ? '' : 'hidden'}" id="project-browser">
            <div class="browser-header">
                <h3>Code Mesh Projects</h3>
                <div class="search-box">
                    <input type="text" id="project-search" placeholder="Search projects..." value="${this.escapeHtml(this.projectSearchQuery)}">
                </div>
            </div>
            ${currentWorkspaceHtml}
            <div class="project-list" id="project-list">
                ${projectListHtml}
            </div>
            <div class="browser-footer">
                <button id="extract-workspace">${this.currentWorkspace ? `Extract ${this.escapeHtml(this.currentWorkspace.name)}` : 'Extract Current Workspace'}</button>
            </div>
        </div>
        <div class="content-area">
            <div class="toolbar">
                ${!this.showProjectBrowser ? '<button id="show-browser" title="Browse projects">📂 Projects</button>' : ''}
                ${currentProjectHtml}
                <div class="toolbar-group">
                    <button id="refresh" title="Re-extract from project">🔄 Refresh</button>
                    <button id="export-md" title="Export as Markdown">📄 Export MD</button>
                    <button id="copy" title="Copy to clipboard">📋 Copy</button>
                    <button id="preview" title="Open in Markdown Preview">👁️ Preview</button>
                </div>
                ${statusHtml}
            </div>
            <div class="tabs">
                ${tabsHtml}
            </div>
            <div class="diagram-container" id="diagram-container">
                ${
                    currentDiagramCode
                        ? `<pre class="mermaid">${this.escapeHtml(currentDiagramCode)}</pre>`
                        : `<div class="empty-state">
                            <h2>${this.showProjectBrowser ? 'Select a Project' : 'No Diagram Available'}</h2>
                            <p>${
                                this.extractionState.isExtracting
                                    ? 'Loading code structure...'
                                    : this.showProjectBrowser
                                    ? 'Choose a project from the sidebar or extract from your current workspace.'
                                    : this.extractionState.error
                                    ? 'Loading failed. Click Refresh to try again.'
                                    : 'Click Refresh to extract code structure from the workspace.'
                            }</p>
                            ${!this.extractionState.isExtracting && !this.showProjectBrowser ? '<button id="extract-btn">🔄 Extract Now</button>' : ''}
                        </div>`
                }
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Initialize Mermaid
        mermaid.initialize({
            startOnLoad: true,
            theme: document.body.classList.contains('vscode-dark') ? 'dark' : 'default',
            securityLevel: 'loose',
            flowchart: { curve: 'basis' },
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                vscode.postMessage({ command: 'selectDiagram', type: tab.dataset.type });
            });
        });

        // Toolbar buttons
        document.getElementById('refresh')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });

        document.getElementById('export-md')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'exportMarkdown' });
        });

        document.getElementById('copy')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard' });
        });

        document.getElementById('preview')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'openInPreview' });
        });

        document.getElementById('extract-btn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });

        // Project browser
        document.getElementById('show-browser')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'toggleProjectBrowser' });
        });

        document.getElementById('change-project')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'toggleProjectBrowser' });
        });

        document.getElementById('extract-workspace')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'extractCurrentWorkspace' });
        });

        // Project search
        let searchTimeout;
        document.getElementById('project-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                vscode.postMessage({ command: 'searchProjects', query: e.target.value });
            }, 300);
        });

        // Project selection
        document.querySelectorAll('.project-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const projectId = item.dataset.projectId;
                const branch = e.target.closest('.branch')?.dataset.branch || null;
                vscode.postMessage({ command: 'selectProject', projectId, branch });
            });
        });

        // Re-render Mermaid when content updates
        mermaid.run();
    </script>
</body>
</html>`;
    }

    /**
     * Escape HTML special characters.
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Format a date as relative time (e.g., "2 hours ago").
     */
    private formatRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffDay > 0) {
            return diffDay === 1 ? 'yesterday' : `${diffDay} days ago`;
        } else if (diffHour > 0) {
            return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
        } else if (diffMin > 0) {
            return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
        } else {
            return 'just now';
        }
    }

    /**
     * Dispose of the panel.
     */
    dispose(): void {
        this.onDidDisposeEmitter.fire();
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Clean up temp mesh file
        if (this.meshFilePath) {
            vscode.workspace.fs.delete(vscode.Uri.file(this.meshFilePath)).then(
                () => {},
                () => {}
            );
        }
    }
}
