import * as path from 'path';
import { TreeNode } from './types';

export interface PersistedDirectoryState {
    order: string[];
    excluded: string[];
}

export interface PersistedTreeState {
    version: 1;
    directories: Record<string, PersistedDirectoryState>;
    descriptions?: Record<string, string>;
}

function relativePath(rootPath: string, nodePath: string): string {
    return path.relative(rootPath, nodePath).split(path.sep).join('/');
}

function insertAlphabetically(nodes: TreeNode[], newNode: TreeNode): void {
    const insertIndex = nodes.findIndex(
        node => node.name.localeCompare(newNode.name) > 0,
    );
    nodes.splice(insertIndex === -1 ? nodes.length : insertIndex, 0, newNode);
}

export function captureTreeState(root: TreeNode): PersistedTreeState {
    const directories: Record<string, PersistedDirectoryState> = {};
    const descriptions: Record<string, string> = {};

    const visit = (directory: TreeNode): void => {
        const children = directory.children ?? [];
        if (directory.description) {
            descriptions[relativePath(root.path, directory.path)] = directory.description;
        }
        directories[relativePath(root.path, directory.path)] = {
            order: children.map(child => relativePath(root.path, child.path)),
            excluded: children
                .filter(child => child.excluded)
                .map(child => relativePath(root.path, child.path)),
        };

        for (const child of children) {
            if (child.description) {
                descriptions[relativePath(root.path, child.path)] = child.description;
            }
            if (child.type === 'directory') {
                visit(child);
            }
        }
    };

    visit(root);
    return { version: 1, directories, descriptions };
}

export function applyTreeState(
    root: TreeNode,
    state: PersistedTreeState,
): TreeNode {
    const descriptions = state.descriptions ?? {};

    const visit = (directory: TreeNode): void => {
        directory.description = descriptions[
            relativePath(root.path, directory.path)
        ];
        const children = directory.children ?? [];
        const directoryState = state.directories?.[
            relativePath(root.path, directory.path)
        ];

        if (
            directoryState
            && Array.isArray(directoryState.order)
            && Array.isArray(directoryState.excluded)
        ) {
            const childrenByPath = new Map(
                children.map(child => [relativePath(root.path, child.path), child]),
            );
            const excludedPaths = new Set(directoryState.excluded);
            const orderedPaths = new Set(directoryState.order);
            const active: TreeNode[] = [];
            const excluded: TreeNode[] = [];

            for (const childPath of directoryState.order) {
                const child = childrenByPath.get(childPath);
                if (!child) {
                    continue;
                }

                if (excludedPaths.has(childPath)) {
                    child.excluded = true;
                    excluded.push(child);
                } else {
                    child.excluded = undefined;
                    active.push(child);
                }
            }

            for (const childPath of directoryState.excluded) {
                const child = childrenByPath.get(childPath);
                if (!child || orderedPaths.has(childPath)) {
                    continue;
                }

                child.excluded = true;
                excluded.push(child);
            }

            const newNodes = children
                .filter(child => {
                    const childPath = relativePath(root.path, child.path);
                    return !orderedPaths.has(childPath) && !excludedPaths.has(childPath);
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            for (const newNode of newNodes) {
                newNode.excluded = undefined;
                insertAlphabetically(active, newNode);
            }

            directory.children = [...active, ...excluded];
        }

        for (const child of directory.children ?? []) {
            child.description = descriptions[relativePath(root.path, child.path)];
            if (child.type === 'directory') {
                visit(child);
            }
        }
    };

    visit(root);
    return root;
}
