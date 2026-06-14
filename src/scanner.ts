import * as fs from 'fs/promises';
import * as path from 'path';
import { TreeNode } from './types';

const DEFAULT_EXCLUDE_DIRS = [
    '.git',
    'node_modules',
    'dist',
    'build',
    'out',
    '.vscode',
];

export async function scanDirectory(dirPath: string): Promise<TreeNode> {
    const name = path.basename(dirPath);

    const root: TreeNode = {
        name,
        path: dirPath,
        type: 'directory',
        children: [],
    };

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const filteredEntries = entries.filter(entry => {
        return !DEFAULT_EXCLUDE_DIRS.includes(entry.name);
    });

    filteredEntries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1; // Directories first
        }
        return a.name.localeCompare(b.name); // Then sort alphabetically
    });

    for (const entry of filteredEntries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const childNode = await scanDirectory(fullPath);
            root.children!.push(childNode);
        } else if (entry.isFile()) {
            root.children!.push({
                name: entry.name,
                path: fullPath,
                type: 'file',
            });
        }
    }

    return root;
}