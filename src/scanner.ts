import * as fs from 'fs/promises';
import * as path from 'path';
import ignore = require('ignore');
import { TreeNode } from './types';

interface IgnoreScope {
    basePath: string;
    matcher: ignore.Ignore;
}

async function loadIgnoreScopes(
    dirPath: string,
    inheritedScopes: IgnoreScope[],
): Promise<IgnoreScope[]> {
    try {
        const patterns = await fs.readFile(path.join(dirPath, '.gitignore'), 'utf8');
        return [
            ...inheritedScopes,
            {
                basePath: dirPath,
                matcher: ignore().add(patterns),
            },
        ];
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return inheritedScopes;
        }
        throw error;
    }
}

function isIgnored(
    entryPath: string,
    isDirectory: boolean,
    scopes: IgnoreScope[],
): boolean {
    let ignored = false;

    for (const scope of scopes) {
        const relativeEntryPath = path.relative(scope.basePath, entryPath)
            .split(path.sep)
            .join('/');
        const result = scope.matcher.test(
            isDirectory ? `${relativeEntryPath}/` : relativeEntryPath,
        );

        if (result.ignored) {
            ignored = true;
        } else if (result.unignored) {
            ignored = false;
        }
    }

    return ignored;
}

async function scanDirectoryWithScopes(
    dirPath: string,
    inheritedScopes: IgnoreScope[],
): Promise<TreeNode> {
    const name = path.basename(dirPath);
    const scopes = await loadIgnoreScopes(dirPath, inheritedScopes);

    const root: TreeNode = {
        name,
        path: dirPath,
        type: 'directory',
        children: [],
    };

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const filteredEntries = entries.filter(entry => {
        if (entry.name === '.git') {
            return false;
        }

        return !isIgnored(
            path.join(dirPath, entry.name),
            entry.isDirectory(),
            scopes,
        );
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
            const childNode = await scanDirectoryWithScopes(fullPath, scopes);
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

export async function scanDirectory(dirPath: string): Promise<TreeNode> {
    return scanDirectoryWithScopes(dirPath, []);
}
