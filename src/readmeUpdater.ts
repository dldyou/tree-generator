import * as fs from 'fs/promises';
import * as path from 'path';

export const README_TREE_START_MARKER = '<!-- tree-generator:start -->';
export const README_TREE_END_MARKER = '<!-- tree-generator:end -->';

export interface ReadmeUpdateResult {
    found: boolean;
    updated: boolean;
}

export interface ReadmeCheckResult {
    found: boolean;
    matches: boolean;
}

export function renderReadmeTreeBlock(treeString: string): string {
    return [
        README_TREE_START_MARKER,
        '```text',
        treeString.trimEnd(),
        '```',
        README_TREE_END_MARKER,
    ].join('\n');
}

export function replaceReadmeTreeBlock(
    readme: string,
    treeString: string,
): { content: string; found: boolean } {
    const startIndex = readme.indexOf(README_TREE_START_MARKER);
    if (startIndex === -1) {
        return { content: readme, found: false };
    }

    const endIndex = readme.indexOf(
        README_TREE_END_MARKER,
        startIndex + README_TREE_START_MARKER.length,
    );
    if (endIndex === -1) {
        return { content: readme, found: false };
    }

    const blockEndIndex = endIndex + README_TREE_END_MARKER.length;
    return {
        content: [
            readme.slice(0, startIndex),
            renderReadmeTreeBlock(treeString),
            readme.slice(blockEndIndex),
        ].join(''),
        found: true,
    };
}

export async function updateReadmeTreeBlock(
    rootPath: string,
    treeString: string,
): Promise<ReadmeUpdateResult> {
    const readmePath = path.join(rootPath, 'README.md');
    let readme: string;

    try {
        readme = await fs.readFile(readmePath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { found: false, updated: false };
        }
        throw error;
    }

    const replacement = replaceReadmeTreeBlock(readme, treeString);
    if (!replacement.found) {
        return { found: false, updated: false };
    }

    if (replacement.content === readme) {
        return { found: true, updated: false };
    }

    await fs.writeFile(readmePath, replacement.content, 'utf8');
    return { found: true, updated: true };
}

export async function checkReadmeTreeBlock(
    rootPath: string,
    treeString: string,
): Promise<ReadmeCheckResult> {
    let readme: string;

    try {
        readme = await fs.readFile(path.join(rootPath, 'README.md'), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { found: false, matches: false };
        }
        throw error;
    }

    const replacement = replaceReadmeTreeBlock(readme, treeString);
    return {
        found: replacement.found,
        matches: replacement.found && replacement.content === readme,
    };
}
