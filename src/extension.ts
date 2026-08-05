import * as path from 'path';
import * as vscode from 'vscode';
import { updateReadmeTreeBlock } from './readmeUpdater';
import { scanDirectory, ScanOptions } from './scanner';
import { deleteTreeStateFile, loadTreeStateFile, saveTreeStateFile } from './treeMetaStore';
import { generateTreeString, TreeGeneratorOptions } from './treeGenerator';
import { reorderChildren, setNodeDescription, setNodeExcluded } from './treeOrdering';
import { applyTreeState, captureTreeState, PersistedTreeState } from './treeState';
import { TreeNode } from './types';
import { getTreeEditorHtml } from './webview';

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

    const saveTree = async (): Promise<void> => {
        await saveTreeStateFile(rootPath, captureTreeState(tree));
    };

    const sendUpdate = async (status?: string): Promise<void> => {
        const treeString = generateTreeString(tree, getGeneratorOptions(rootPath));
        let readmeUpdateError: string | undefined;

        try {
            await updateReadmeTreeBlock(rootPath, treeString, getReadmePath(rootPath));
        } catch (error) {
            readmeUpdateError = `Failed to update markdown file: ${String(error)}`;
        }

        await panel.webview.postMessage({
            type: 'update',
            tree,
            treeString,
            respectGitignore: scanOptions.respectGitignore,
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

    const scheduleFileTreeRefresh = (uri: vscode.Uri): void => {
        if (path.basename(uri.fsPath) === '.gitignore') {
            return;
        }

        scheduleRefresh('Workspace files changed; tree refreshed');
    };

    const gitignoreWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, '**/.gitignore'),
    );
    const fileTreeWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, '**/*'),
    );
    const watcherDisposables = [
        gitignoreWatcher.onDidCreate(() => scheduleRefresh('.gitignore changed; tree refreshed')),
        gitignoreWatcher.onDidChange(() => scheduleRefresh('.gitignore changed; tree refreshed')),
        gitignoreWatcher.onDidDelete(() => scheduleRefresh('.gitignore changed; tree refreshed')),
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

                    await saveTree();
                    await sendUpdate('Order updated');
                    break;
                case 'setExcluded':
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

                    await saveTree();
                    await sendUpdate(
                        message.excluded
                            ? 'Item excluded from output'
                            : 'Item included in output',
                    );
                    break;
                case 'setDescription':
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
                    await deleteTreeStateFile(rootPath);
                    await context.workspaceState.update(stateKey, undefined);
                    tree = await scanDirectory(rootPath, scanOptions);
                    await sendUpdate('Default order restored');
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
        fileTreeWatcher.dispose();
    });
    panel.webview.html = getTreeEditorHtml(panel.webview);
    context.subscriptions.push(panel);
}

export function deactivate() { }
