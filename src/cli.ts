#!/usr/bin/env node

import * as path from 'path';
import {
    checkReadmeTreeBlock,
    updateReadmeTreeBlock,
} from './readmeUpdater';
import { scanDirectory, ScanOptions } from './scanner';
import { loadTreeStateFile } from './treeMetaStore';
import { generateTreeString, TreeGeneratorOptions } from './treeGenerator';
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

Options:
  --include-gitignored   Include files and folders matched by .gitignore.
  --respect-gitignore    Exclude files and folders matched by .gitignore. Default.
  --readme <path>        Markdown file to update. Default: README.md.
  --style <style>        Tree characters: unicode or ascii. Default: unicode.
  --max-depth <depth>    Maximum tree depth. 0 prints only the root.
`;

interface ParsedArgs {
    command?: string;
    workspace?: string;
    readmePath: string;
    generatorOptions: TreeGeneratorOptions;
    scanOptions: Required<ScanOptions>;
}

function parseArgs(args: string[]): ParsedArgs | string {
    const parsed: ParsedArgs = {
        readmePath: 'README.md',
        generatorOptions: {},
        scanOptions: { respectGitignore: true },
    };

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--include-gitignored') {
            parsed.scanOptions.respectGitignore = false;
        } else if (arg === '--respect-gitignore') {
            parsed.scanOptions.respectGitignore = true;
        } else if (arg === '--readme') {
            const targetPath = args[++index];
            if (!targetPath || targetPath.startsWith('-')) {
                return 'Missing value for --readme';
            }
            parsed.readmePath = targetPath;
        } else if (arg === '--style') {
            const style = args[++index];
            if (style !== 'unicode' && style !== 'ascii') {
                return '--style must be unicode or ascii';
            }
            parsed.generatorOptions.style = style;
        } else if (arg === '--max-depth') {
            const value = args[++index];
            const maxDepth = Number(value);
            if (!value || !Number.isInteger(maxDepth) || maxDepth < 0) {
                return '--max-depth must be a non-negative integer';
            }
            parsed.generatorOptions.maxDepth = maxDepth;
        } else if (arg.startsWith('-')) {
            return `Unknown option: ${arg}`;
        } else if (!parsed.command) {
            parsed.command = arg;
        } else if (!parsed.workspace) {
            parsed.workspace = arg;
        } else {
            return `Unexpected argument: ${arg}`;
        }
    }

    return parsed;
}

async function generateTreeForWorkspace(
    rootPath: string,
    scanOptions: ScanOptions,
    generatorOptions: TreeGeneratorOptions,
): Promise<string> {
    const tree = await scanDirectory(rootPath, scanOptions);
    const state = await loadTreeStateFile(rootPath);
    if (state?.version === 1) {
        applyTreeState(tree, state);
    }

    return generateTreeString(tree, generatorOptions);
}

export async function runCli(
    args: string[],
    cwd = process.cwd(),
): Promise<CliResult> {
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        return { exitCode: 0, stdout: USAGE, stderr: '' };
    }

    const parsed = parseArgs(args);
    if (typeof parsed === 'string') {
        return {
            exitCode: 1,
            stdout: '',
            stderr: `${parsed}\n\n${USAGE}`,
        };
    }

    const command = parsed.command;
    if (!command || !['print', 'write', 'check'].includes(command)) {
        return {
            exitCode: 1,
            stdout: '',
            stderr: `Unknown command: ${command ?? ''}\n\n${USAGE}`,
        };
    }

    const rootPath = path.resolve(cwd, parsed.workspace ?? '.');
    const treeString = await generateTreeForWorkspace(
        rootPath,
        parsed.scanOptions,
        parsed.generatorOptions,
    );

    switch (command) {
        case 'print':
            return { exitCode: 0, stdout: treeString, stderr: '' };
        case 'write': {
            const result = await updateReadmeTreeBlock(rootPath, treeString, parsed.readmePath);
            if (!result.found) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: `${parsed.readmePath} tree markers were not found.\n`,
                };
            }

            return {
                exitCode: 0,
                stdout: result.updated
                    ? `${parsed.readmePath} tree block updated.\n`
                    : `${parsed.readmePath} tree block is already up to date.\n`,
                stderr: '',
            };
        }
        case 'check': {
            const result = await checkReadmeTreeBlock(rootPath, treeString, parsed.readmePath);
            if (!result.found) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: `${parsed.readmePath} tree markers were not found.\n`,
                };
            }
            if (!result.matches) {
                return {
                    exitCode: 1,
                    stdout: '',
                    stderr: `${parsed.readmePath} tree block is out of date. Run \`tree-generator write\`.\n`,
                };
            }

            return {
                exitCode: 0,
                stdout: `${parsed.readmePath} tree block is up to date.\n`,
                stderr: '',
            };
        }
    }

    return {
        exitCode: 1,
        stdout: '',
        stderr: `Unknown command: ${command}\n\n${USAGE}`,
    };
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
