import * as fs from 'fs/promises';
import * as path from 'path';
import { PersistedTreeState } from './treeState';

export const TREE_METADATA_FILE_NAME = '.tree-generator.json';

function metadataPath(rootPath: string): string {
    return path.join(rootPath, TREE_METADATA_FILE_NAME);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isPersistedTreeState(value: unknown): value is PersistedTreeState {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const state = value as Partial<PersistedTreeState>;
    if (state.version !== 1 || !state.directories || typeof state.directories !== 'object') {
        return false;
    }

    return Object.values(state.directories).every(directoryState => {
        return Boolean(directoryState)
            && typeof directoryState === 'object'
            && isStringArray(directoryState.order)
            && isStringArray(directoryState.excluded);
    });
}

export async function loadTreeStateFile(
    rootPath: string,
): Promise<PersistedTreeState | undefined> {
    let rawState: string;
    try {
        rawState = await fs.readFile(metadataPath(rootPath), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }

    const parsedState: unknown = JSON.parse(rawState);
    if (!isPersistedTreeState(parsedState)) {
        throw new Error(`${TREE_METADATA_FILE_NAME} has an unsupported format.`);
    }

    return parsedState;
}

export async function saveTreeStateFile(
    rootPath: string,
    state: PersistedTreeState,
): Promise<void> {
    await fs.writeFile(
        metadataPath(rootPath),
        `${JSON.stringify(state, null, 2)}\n`,
        'utf8',
    );
}

export async function deleteTreeStateFile(rootPath: string): Promise<void> {
    await fs.rm(metadataPath(rootPath), { force: true });
}
