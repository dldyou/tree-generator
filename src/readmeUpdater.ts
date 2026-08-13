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

export type ReadmeSetupStatus =
    | 'ready'
    | 'missing-file'
    | 'missing-markers'
    | 'incomplete-markers';

function resolveReadmePath(rootPath: string, targetPath = 'README.md'): string {
    if (path.isAbsolute(targetPath)) {
        throw new Error('README target path must be relative and within the root path.');
    }

    const resolvedRootPath = path.resolve(rootPath);
    const resolvedTargetPath = path.resolve(resolvedRootPath, targetPath);
    const relativePath = path.relative(resolvedRootPath, resolvedTargetPath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error('README target path must be relative and within the root path.');
    }

    return resolvedTargetPath;
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

function getSetupStatus(readme: string): ReadmeSetupStatus {
    const startIndex = readme.indexOf(README_TREE_START_MARKER);
    const anyEndIndex = readme.indexOf(README_TREE_END_MARKER);
    if (startIndex === -1 && anyEndIndex === -1) {
        return 'missing-markers';
    }

    const matchingEndIndex = startIndex === -1
        ? -1
        : readme.indexOf(
            README_TREE_END_MARKER,
            startIndex + README_TREE_START_MARKER.length,
        );
    if (matchingEndIndex !== -1) {
        return 'ready';
    }
    return 'incomplete-markers';
}

export async function inspectReadmeTreeBlock(
    rootPath: string,
    targetPath?: string,
): Promise<ReadmeSetupStatus> {
    try {
        return getSetupStatus(
            await fs.readFile(resolveReadmePath(rootPath, targetPath), 'utf8'),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 'missing-file';
        }
        throw error;
    }
}

export async function ensureReadmeTreeBlock(
    rootPath: string,
    treeString: string,
    targetPath?: string,
): Promise<void> {
    const target = resolveReadmePath(rootPath, targetPath);
    let readme = '';
    try {
        readme = await fs.readFile(target, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
    }

    const status = getSetupStatus(readme);
    if (status === 'incomplete-markers') {
        throw new Error('Markdown target does not contain an ordered tree marker pair. Fix the markers and try again.');
    }

    if (status === 'ready') {
        await updateReadmeTreeBlock(rootPath, treeString, targetPath);
        return;
    }

    const separator = readme.length === 0 || readme.endsWith('\n\n')
        ? ''
        : readme.endsWith('\n') ? '\n' : '\n\n';
    await fs.writeFile(
        target,
        `${readme}${separator}${renderReadmeTreeBlock(treeString)}\n`,
        'utf8',
    );
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
    targetPath?: string,
): Promise<ReadmeUpdateResult> {
    const readmePath = resolveReadmePath(rootPath, targetPath);
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
    targetPath?: string,
): Promise<ReadmeCheckResult> {
    let readme: string;

    try {
        readme = await fs.readFile(resolveReadmePath(rootPath, targetPath), 'utf8');
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
