#!/usr/bin/env node

import * as path from 'path';
import {
    checkReadmeTreeBlock,
    updateReadmeTreeBlock,
} from './readmeUpdater';
import { scanDirectory } from './scanner';
import { loadTreeStateFile } from './treeMetaStore';
import { generateTreeString } from './treeGenerator';
import { applyTreeState } from './treeState';

export interface CliResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

const USAGE = `Usage: tree-generator <command> [workspace]

Commands:
  print   Print the generated tree to stdout.
  write   Update the marked README.md tree block.
  check   Verify README.md contains the current generated tree.
`;

async function generateTreeForWorkspace(rootPath: string): Promise<string> {
    const tree = await scanDirectory(rootPath);
    const state = await loadTreeStateFile(rootPath);
    if (state?.version === 1) {
        applyTreeState(tree, state);
    }

    return generateTreeString(tree);
}

export async function runCli(
    args: string[],
    cwd = process.cwd(),
): Promise<CliResult> {
    const [command, workspaceArg] = args;

    if (!command || command === '--help' || command === '-h') {
        return { exitCode: 0, stdout: USAGE, stderr: '' };
    }

    const rootPath = path.resolve(cwd, workspaceArg ?? '.');
    const treeString = await generateTreeForWorkspace(rootPath);

    switch (command) {
        case 'print':
            return { exitCode: 0, stdout: treeString, stderr: '' };
        case 'write': {
            const result = await updateReadmeTreeBlock(rootPath, treeString);
            if (!result.found) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: 'README.md tree markers were not found.\n',
                };
            }

            return {
                exitCode: 0,
                stdout: result.updated
                    ? 'README.md tree block updated.\n'
                    : 'README.md tree block is already up to date.\n',
                stderr: '',
            };
        }
        case 'check': {
            const result = await checkReadmeTreeBlock(rootPath, treeString);
            if (!result.found) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: 'README.md tree markers were not found.\n',
                };
            }
            if (!result.matches) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: 'README.md tree block is out of date. Run `tree-generator write`.\n',
                };
            }

            return {
                exitCode: 0,
                stdout: 'README.md tree block is up to date.\n',
                stderr: '',
            };
        }
        default:
            return {
                exitCode: 1,
                stdout: '',
                stderr: `Unknown command: ${command}\n\n${USAGE}`,
            };
    }
}

if (require.main === module) {
    runCli(process.argv.slice(2)).then(result => {
        if (result.stdout) {
            process.stdout.write(result.stdout);
        }
        if (result.stderr) {
            process.stderr.write(result.stderr);
        }
        process.exitCode = result.exitCode;
    }).catch(error => {
        process.stderr.write(`tree-generator failed: ${String(error)}\n`);
        process.exitCode = 1;
    });
}
