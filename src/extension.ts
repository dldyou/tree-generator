import * as vscode from 'vscode';
import { scanDirectory } from './scanner';
import { generateTreeString } from './treeGenerator';
import { reorderChildren, setNodeExcluded } from './treeOrdering';
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

        const rootPath = workspaceFolders[0].uri.fsPath;
        const stateKey = `treeGenerator.treeState:${workspaceFolders[0].uri.toString()}`;

        try {
            const tree = await scanDirectory(rootPath);
            const savedState = context.workspaceState.get<PersistedTreeState>(stateKey);
            if (savedState?.version === 1) {
                applyTreeState(tree, savedState);
            }
            await context.workspaceState.update(stateKey, captureTreeState(tree));
            openTreeEditor(context, rootPath, stateKey, tree);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to generate project tree: ${String(error)}`
            );
        }
    });

    context.subscriptions.push(disposable);
}

function openTreeEditor(
    context: vscode.ExtensionContext,
    rootPath: string,
    stateKey: string,
    initialTree: TreeNode,
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

    const saveTree = async (): Promise<void> => {
        await context.workspaceState.update(stateKey, captureTreeState(tree));
    };

    const sendUpdate = async (status?: string): Promise<void> => {
        await panel.webview.postMessage({
            type: 'update',
            tree,
            treeString: generateTreeString(tree),
            status,
        });
    };

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
                case 'copy':
                    await vscode.env.clipboard.writeText(generateTreeString(tree));
                    await panel.webview.postMessage({
                        type: 'status',
                        text: 'Copied to clipboard',
                    });
                    break;
                case 'reset':
                    await context.workspaceState.update(stateKey, undefined);
                    tree = await scanDirectory(rootPath);
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

    panel.onDidDispose(() => messageDisposable.dispose());
    panel.webview.html = getTreeEditorHtml(panel.webview);
    context.subscriptions.push(panel);
}

export function deactivate() { }
