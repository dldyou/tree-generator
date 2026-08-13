import * as path from 'path';
import * as vscode from 'vscode';
import {
    ensureReadmeTreeBlock,
    inspectReadmeTreeBlock,
    ReadmeSetupStatus,
    updateReadmeTreeBlock,
} from './readmeUpdater';
import { scanDirectory, ScanOptions } from './scanner';
import { deleteTreeStateFile, loadTreeStateFile, saveTreeStateFile } from './treeMetaStore';
import { generateTreeString, TreeGeneratorOptions } from './treeGenerator';
import {
    reorderChildren,
    resetDirectory,
    setDescendantsExcluded,
    setNodeDescription,
    setNodeExcluded,
} from './treeOrdering';
import { applyTreeState, captureTreeState, PersistedTreeState } from './treeState';
import { TreeNode } from './types';
import { getTreeEditorHtml } from './webview';

function cloneTree(node: TreeNode): TreeNode {
    return {
        ...node,
        children: node.children?.map(cloneTree),
    };
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('tree-generator.generateTree', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }

        let workspaceFolder: vscode.WorkspaceFolder | undefined = workspaceFolders[0];
        if (workspaceFolders.length > 1) {
            const selectedFolder = await vscode.window.showQuickPick(
                workspaceFolders.map(folder => ({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    folder,
                })),
                { placeHolder: 'Select a workspace folder' },
            );
            workspaceFolder = selectedFolder?.folder;
        }
        if (!workspaceFolder) {
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;
        const stateKey = `treeGenerator.treeState:${workspaceFolder.uri.toString()}`;

        try {
            const scanOptions = getScanOptions(rootPath);
            const tree = await scanDirectory(rootPath, scanOptions);
            const savedState = await loadSavedTreeState(context, rootPath, stateKey);
            if (savedState?.version === 1) {
                applyTreeState(tree, savedState);
            }
            openTreeEditor(context, rootPath, stateKey, tree, scanOptions);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to generate project tree: ${String(error)}`
            );
        }
    });

    context.subscriptions.push(disposable);
}

function getScanOptions(rootPath: string): Required<ScanOptions> {
    return {
        respectGitignore: vscode.workspace
            .getConfiguration('tree-generator', vscode.Uri.file(rootPath))
            .get<boolean>('respectGitignore', true),
    };
}

function getReadmePath(rootPath: string): string {
    return vscode.workspace
        .getConfiguration('tree-generator', vscode.Uri.file(rootPath))
        .get<string>('readmePath', 'README.md');
}

function getAutoUpdateReadme(rootPath: string): boolean {
    return vscode.workspace
        .getConfiguration('tree-generator', vscode.Uri.file(rootPath))
        .get<boolean>('autoUpdateReadme', true);
}

function getGeneratorOptions(rootPath: string): TreeGeneratorOptions {
    const configuration = vscode.workspace.getConfiguration(
        'tree-generator',
        vscode.Uri.file(rootPath),
    );
    const maxDepth = configuration.get<number>('maxDepth', -1);
    return {
        style: configuration.get<'unicode' | 'ascii'>('outputStyle', 'unicode'),
        maxDepth: maxDepth < 0 ? undefined : maxDepth,
    };
}

function getReadmeDiagnostic(
    status: ReadmeSetupStatus,
    autoUpdateReadme: boolean,
    targetPath: string,
): { text: string; canSetup: boolean; isError: boolean } {
    switch (status) {
        case 'missing-file':
            return {
                text: `${targetPath} does not exist. Set it up to create the Markdown tree block.`,
                canSetup: true,
                isError: false,
            };
        case 'missing-markers':
            return {
                text: `${targetPath} has no tree markers, so automatic updates cannot run.`,
                canSetup: true,
                isError: false,
            };
        case 'incomplete-markers':
            return {
                text: `${targetPath} contains only one tree marker. Remove the incomplete marker before setup.`,
                canSetup: false,
                isError: true,
            };
        default:
            return {
                text: autoUpdateReadme
                    ? `${targetPath} is ready for automatic updates.`
                    : 'Automatic Markdown updates are disabled.',
                canSetup: false,
                isError: false,
            };
    }
}

async function loadSavedTreeState(
    context: vscode.ExtensionContext,
    rootPath: string,
    stateKey: string,
): Promise<PersistedTreeState | undefined> {
    const projectState = await loadTreeStateFile(rootPath);
    if (projectState) {
        return projectState;
    }

    const workspaceState = context.workspaceState.get<PersistedTreeState>(stateKey);
    if (workspaceState?.version === 1) {
        await saveTreeStateFile(rootPath, workspaceState);
        await context.workspaceState.update(stateKey, undefined);
        return workspaceState;
    }

    return undefined;
}

function openTreeEditor(
    context: vscode.ExtensionContext,
    rootPath: string,
    stateKey: string,
    initialTree: TreeNode,
    initialScanOptions: Required<ScanOptions>,
): void {
    const panel = vscode.window.createWebviewPanel(
        'treeGenerator.editor',
        'Tree Generator',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );

    let tree = initialTree;
    let scanOptions = initialScanOptions;
    let refreshTimer: NodeJS.Timeout | undefined;
    let pendingRefreshStatus = 'Tree refreshed';
    const undoStack: TreeNode[] = [];
    const redoStack: TreeNode[] = [];

    const recordMutation = (previousTree: TreeNode): void => {
        undoStack.push(previousTree);
        if (undoStack.length > 50) {
            undoStack.shift();
        }
        redoStack.length = 0;
    };

    const saveTree = async (): Promise<void> => {
        await saveTreeStateFile(rootPath, captureTreeState(tree));
    };

    const sendUpdate = async (status?: string): Promise<void> => {
        const generatorOptions = getGeneratorOptions(rootPath);
        const treeString = generateTreeString(tree, generatorOptions);
        let readmeUpdateError: string | undefined;

        const autoUpdateReadme = getAutoUpdateReadme(rootPath);
        const readmePath = getReadmePath(rootPath);
        if (autoUpdateReadme) {
            try {
                await updateReadmeTreeBlock(rootPath, treeString, readmePath);
            } catch (error) {
                readmeUpdateError = `Failed to update markdown file: ${String(error)}`;
            }
        }

        let readmeDiagnostic;
        try {
            readmeDiagnostic = getReadmeDiagnostic(
                await inspectReadmeTreeBlock(rootPath, readmePath),
                autoUpdateReadme,
                readmePath,
            );
        } catch (error) {
            readmeDiagnostic = {
                text: `Could not inspect ${readmePath}: ${String(error)}`,
                canSetup: false,
                isError: true,
            };
        }

        await panel.webview.postMessage({
            type: 'update',
            tree,
            treeString,
            respectGitignore: scanOptions.respectGitignore,
            autoUpdateReadme,
            readmeDiagnostic,
            readmePath,
            outputStyle: generatorOptions.style ?? 'unicode',
            maxDepth: generatorOptions.maxDepth ?? -1,
            canUndo: undoStack.length > 0,
            canRedo: redoStack.length > 0,
            status,
        });

        if (readmeUpdateError) {
            await panel.webview.postMessage({
                type: 'status',
                text: readmeUpdateError,
                isError: true,
            });
        }
    };

    const refreshFromFileSystem = async (status: string): Promise<void> => {
        try {
            const refreshedTree = await scanDirectory(rootPath, scanOptions);
            const savedState = await loadTreeStateFile(rootPath);
            if (savedState?.version === 1) {
                applyTreeState(refreshedTree, savedState);
            }

            tree = refreshedTree;
            undoStack.length = 0;
            redoStack.length = 0;
            await sendUpdate(status);
        } catch (error) {
            await panel.webview.postMessage({
                type: 'status',
                text: `Failed to refresh tree: ${String(error)}`,
                isError: true,
            });
        }
    };

    const scheduleRefresh = (status: string): void => {
        pendingRefreshStatus = status;
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void refreshFromFileSystem(pendingRefreshStatus);
        }, 150);
    };

    const updateRespectGitignore = async (respectGitignore: boolean): Promise<void> => {
        await vscode.workspace
            .getConfiguration('tree-generator', vscode.Uri.file(rootPath))
            .update(
                'respectGitignore',
                respectGitignore,
                vscode.ConfigurationTarget.WorkspaceFolder,
            );
    };

    const updateAutoUpdateReadme = async (autoUpdateReadme: boolean): Promise<void> => {
        await vscode.workspace
            .getConfiguration('tree-generator', vscode.Uri.file(rootPath))
            .update(
                'autoUpdateReadme',
                autoUpdateReadme,
                vscode.ConfigurationTarget.WorkspaceFolder,
            );
    };

    const updateOutputSettings = async (
        readmePath: string,
        outputStyle: 'unicode' | 'ascii',
        maxDepth: number,
    ): Promise<void> => {
        const configuration = vscode.workspace.getConfiguration(
            'tree-generator',
            vscode.Uri.file(rootPath),
        );
        await configuration.update(
            'readmePath',
            readmePath,
            vscode.ConfigurationTarget.WorkspaceFolder,
        );
        await configuration.update(
            'outputStyle',
            outputStyle,
            vscode.ConfigurationTarget.WorkspaceFolder,
        );
        await configuration.update(
            'maxDepth',
            maxDepth,
            vscode.ConfigurationTarget.WorkspaceFolder,
        );
    };

    const scheduleFileTreeRefresh = (uri: vscode.Uri): void => {
        if (
            path.basename(uri.fsPath) === '.gitignore'
            || path.basename(uri.fsPath) === '.tree-generatorignore'
        ) {
            return;
        }

        scheduleRefresh('Workspace files changed; tree refreshed');
    };

    const gitignoreWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, '**/.gitignore'),
    );
    const treeIgnoreWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, '.tree-generatorignore'),
    );
    const fileTreeWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, '**/*'),
    );
    const watcherDisposables = [
        gitignoreWatcher.onDidCreate(() => scheduleRefresh('.gitignore changed; tree refreshed')),
        gitignoreWatcher.onDidChange(() => scheduleRefresh('.gitignore changed; tree refreshed')),
        gitignoreWatcher.onDidDelete(() => scheduleRefresh('.gitignore changed; tree refreshed')),
        treeIgnoreWatcher.onDidCreate(() => scheduleRefresh('.tree-generatorignore changed; tree refreshed')),
        treeIgnoreWatcher.onDidChange(() => scheduleRefresh('.tree-generatorignore changed; tree refreshed')),
        treeIgnoreWatcher.onDidDelete(() => scheduleRefresh('.tree-generatorignore changed; tree refreshed')),
        fileTreeWatcher.onDidCreate(scheduleFileTreeRefresh),
        fileTreeWatcher.onDidDelete(scheduleFileTreeRefresh),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration(
                    'tree-generator.respectGitignore',
                    vscode.Uri.file(rootPath),
                )
            ) {
                scanOptions = getScanOptions(rootPath);
                scheduleRefresh('Scan setting changed; tree refreshed');
            }
            if (
                event.affectsConfiguration(
                    'tree-generator.readmePath',
                    vscode.Uri.file(rootPath),
                )
            ) {
                void sendUpdate('README target changed');
            }
            if (
                event.affectsConfiguration(
                    'tree-generator.autoUpdateReadme',
                    vscode.Uri.file(rootPath),
                )
            ) {
                void sendUpdate('README auto update setting changed');
            }
            if (
                event.affectsConfiguration(
                    'tree-generator.outputStyle',
                    vscode.Uri.file(rootPath),
                )
            ) {
                void sendUpdate('Tree output style changed');
            }
            if (
                event.affectsConfiguration(
                    'tree-generator.maxDepth',
                    vscode.Uri.file(rootPath),
                )
            ) {
                void sendUpdate('Tree depth changed');
            }
        }),
    ];

    const messageDisposable = panel.webview.onDidReceiveMessage(async message => {
        try {
            switch (message.type) {
                case 'ready':
                    await sendUpdate();
                    break;
                case 'reorder':
                    const treeBeforeReorder = cloneTree(tree);
                    if (
                        typeof message.parentPath !== 'string'
                        || !Array.isArray(message.orderedChildPaths)
                        || !message.orderedChildPaths.every(
                            (childPath: unknown) => typeof childPath === 'string',
                        )
                        || !reorderChildren(tree, message.parentPath, message.orderedChildPaths)
                    ) {
                        await sendUpdate();
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not apply that order.',
                            isError: true,
                        });
                        break;
                    }

                    recordMutation(treeBeforeReorder);
                    await saveTree();
                    await sendUpdate('Order updated');
                    break;
                case 'setExcluded':
                    const treeBeforeExclusion = cloneTree(tree);
                    if (
                        typeof message.nodePath !== 'string'
                        || typeof message.excluded !== 'boolean'
                        || !setNodeExcluded(tree, message.nodePath, message.excluded)
                    ) {
                        await sendUpdate();
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update that item.',
                            isError: true,
                        });
                        break;
                    }

                    recordMutation(treeBeforeExclusion);
                    await saveTree();
                    await sendUpdate(
                        message.excluded
                            ? 'Item excluded from output'
                            : 'Item included in output',
                    );
                    break;
                case 'setDescendantsExcluded':
                    const treeBeforeBulkExclusion = cloneTree(tree);
                    if (
                        typeof message.directoryPath !== 'string'
                        || typeof message.excluded !== 'boolean'
                        || !setDescendantsExcluded(
                            tree,
                            message.directoryPath,
                            message.excluded,
                        )
                    ) {
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update that directory.',
                            isError: true,
                        });
                        break;
                    }

                    recordMutation(treeBeforeBulkExclusion);
                    await saveTree();
                    await sendUpdate(
                        message.excluded
                            ? 'Directory contents excluded from output'
                            : 'Directory contents included in output',
                    );
                    break;
                case 'setDescription':
                    const treeBeforeDescription = cloneTree(tree);
                    if (
                        typeof message.nodePath !== 'string'
                        || typeof message.description !== 'string'
                        || !setNodeDescription(tree, message.nodePath, message.description)
                    ) {
                        await sendUpdate();
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update that description.',
                            isError: true,
                        });
                        break;
                    }

                    recordMutation(treeBeforeDescription);
                    await saveTree();
                    await sendUpdate('Description updated');
                    break;
                case 'setRespectGitignore':
                    if (typeof message.respectGitignore !== 'boolean') {
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update scan setting.',
                            isError: true,
                        });
                        break;
                    }

                    await updateRespectGitignore(message.respectGitignore);
                    break;
                case 'setAutoUpdateReadme':
                    if (typeof message.autoUpdateReadme !== 'boolean') {
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update README setting.',
                            isError: true,
                        });
                        break;
                    }

                    await updateAutoUpdateReadme(message.autoUpdateReadme);
                    break;
                case 'setupMarkdown':
                    await ensureReadmeTreeBlock(
                        rootPath,
                        generateTreeString(tree, getGeneratorOptions(rootPath)),
                        getReadmePath(rootPath),
                    );
                    await sendUpdate('Markdown tree block created');
                    break;
                case 'setOutputSettings':
                    if (
                        typeof message.readmePath !== 'string'
                        || message.readmePath.trim().length === 0
                        || (message.outputStyle !== 'unicode' && message.outputStyle !== 'ascii')
                        || !Number.isInteger(message.maxDepth)
                        || message.maxDepth < -1
                    ) {
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not update output settings.',
                            isError: true,
                        });
                        break;
                    }

                    await updateOutputSettings(
                        message.readmePath.trim(),
                        message.outputStyle,
                        message.maxDepth,
                    );
                    await sendUpdate('Output settings updated');
                    break;
                case 'copy':
                    await vscode.env.clipboard.writeText(
                        generateTreeString(tree, getGeneratorOptions(rootPath)),
                    );
                    await panel.webview.postMessage({
                        type: 'status',
                        text: 'Copied to clipboard',
                    });
                    break;
                case 'reset':
                    const treeBeforeReset = cloneTree(tree);
                    const defaultTree = await scanDirectory(rootPath, scanOptions);
                    await deleteTreeStateFile(rootPath);
                    await context.workspaceState.update(stateKey, undefined);
                    tree = defaultTree;
                    recordMutation(treeBeforeReset);
                    await sendUpdate('Default order restored');
                    break;
                case 'resetDirectory':
                    if (typeof message.directoryPath !== 'string') {
                        break;
                    }
                    const treeBeforeDirectoryReset = cloneTree(tree);
                    if (!resetDirectory(tree, message.directoryPath)) {
                        await panel.webview.postMessage({
                            type: 'status',
                            text: 'Could not reset that directory.',
                            isError: true,
                        });
                        break;
                    }
                    recordMutation(treeBeforeDirectoryReset);
                    await saveTree();
                    await sendUpdate('Directory restored to default');
                    break;
                case 'undo':
                    const previousTree = undoStack.pop();
                    if (!previousTree) {
                        await sendUpdate();
                        break;
                    }
                    redoStack.push(cloneTree(tree));
                    tree = previousTree;
                    await saveTree();
                    await sendUpdate('Change undone');
                    break;
                case 'redo':
                    const nextTree = redoStack.pop();
                    if (!nextTree) {
                        await sendUpdate();
                        break;
                    }
                    undoStack.push(cloneTree(tree));
                    tree = nextTree;
                    await saveTree();
                    await sendUpdate('Change restored');
                    break;
            }
        } catch (error) {
            await panel.webview.postMessage({
                type: 'status',
                text: `Failed: ${String(error)}`,
                isError: true,
            });
        }
    });

    panel.onDidDispose(() => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        messageDisposable.dispose();
        watcherDisposables.forEach(disposable => disposable.dispose());
        gitignoreWatcher.dispose();
        treeIgnoreWatcher.dispose();
        fileTreeWatcher.dispose();
    });
    panel.webview.html = getTreeEditorHtml(panel.webview);
    context.subscriptions.push(panel);
}

export function deactivate() { }
