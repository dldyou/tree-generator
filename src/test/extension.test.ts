import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { scanDirectory } from '../scanner';
import {
	deleteTreeStateFile,
	loadTreeStateFile,
	TREE_METADATA_FILE_NAME,
	saveTreeStateFile,
} from '../treeMetaStore';
import { generateTreeString } from '../treeGenerator';
import {
	reorderChildren,
	setNodeDescription,
	setNodeExcluded,
} from '../treeOrdering';
import { applyTreeState, captureTreeState } from '../treeState';
import { TreeNode } from '../types';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Reorders children without changing their parent', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{ name: 'src', path: '/root/src', type: 'directory', children: [] },
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
			],
		};

		assert.strictEqual(
			reorderChildren(tree, '/root', ['/root/README.md', '/root/src']),
			true,
		);
		assert.deepStrictEqual(
			tree.children?.map(child => child.name),
			['README.md', 'src'],
		);
	});

	test('Rejects incomplete child orders', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{ name: 'src', path: '/root/src', type: 'directory', children: [] },
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
			],
		};

		assert.strictEqual(reorderChildren(tree, '/root', ['/root/src']), false);
		assert.deepStrictEqual(
			tree.children?.map(child => child.name),
			['src', 'README.md'],
		);
	});

	test('Moves excluded nodes to the bottom and omits them from output', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{
					name: 'src',
					path: '/root/src',
					type: 'directory',
					children: [
						{ name: 'index.ts', path: '/root/src/index.ts', type: 'file' },
					],
				},
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
				{ name: 'package.json', path: '/root/package.json', type: 'file' },
			],
		};

		assert.strictEqual(setNodeExcluded(tree, '/root/src', true), true);
		assert.deepStrictEqual(
			tree.children?.map(child => child.name),
			['README.md', 'package.json', 'src'],
		);
		assert.strictEqual(tree.children?.at(-1)?.excluded, true);

		const output = generateTreeString(tree);
		assert.ok(output.includes('README.md'));
		assert.ok(!output.includes('src/'));
		assert.ok(!output.includes('index.ts'));
	});

	test('Moves included nodes before the excluded group', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
				{ name: 'dist', path: '/root/dist', type: 'directory', excluded: true },
				{ name: 'notes.txt', path: '/root/notes.txt', type: 'file', excluded: true },
			],
		};

		assert.strictEqual(setNodeExcluded(tree, '/root/dist', false), true);
		assert.deepStrictEqual(
			tree.children?.map(child => child.name),
			['README.md', 'dist', 'notes.txt'],
		);
		assert.strictEqual(tree.children?.[1].excluded, undefined);
	});

	test('Keeps excluded nodes below included nodes when reordered', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
				{ name: 'dist', path: '/root/dist', type: 'directory', excluded: true },
				{ name: 'package.json', path: '/root/package.json', type: 'file' },
			],
		};

		assert.strictEqual(
			reorderChildren(
				tree,
				'/root',
				['/root/dist', '/root/package.json', '/root/README.md'],
			),
			true,
		);
		assert.deepStrictEqual(
			tree.children?.map(child => child.name),
			['package.json', 'README.md', 'dist'],
		);
	});

	test('Aligns node descriptions as comments in generated output', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			description: 'project root',
			children: [
				{
					name: 'src',
					path: '/root/src',
					type: 'directory',
					description: 'source files',
					children: [
						{
							name: 'index.ts',
							path: '/root/src/index.ts',
							type: 'file',
							description: 'entry point',
						},
					],
				},
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
			],
		};

		const linesWithDescriptions = generateTreeString(tree)
			.trimEnd()
			.split('\n')
			.filter(line => line.includes('# '));

		assert.deepStrictEqual(
			linesWithDescriptions.map(line => line.indexOf('# ')),
			[20, 20, 20],
		);
		assert.ok(linesWithDescriptions[0].endsWith('# project root'));
		assert.ok(linesWithDescriptions[2].endsWith('# entry point'));
	});

	test('Aligns descriptions when node names contain wide characters', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			description: 'root',
			children: [
				{
					name: '한글.ts',
					path: '/root/한글.ts',
					type: 'file',
					description: 'wide name',
				},
				{
					name: 'english.ts',
					path: '/root/english.ts',
					type: 'file',
					description: 'ascii name',
				},
			],
		};

		const lines = generateTreeString(tree).trimEnd().split('\n');
		const commentVisualColumns = lines.map(line => {
			const beforeComment = line.slice(0, line.indexOf('# '));
			return Array.from(beforeComment).reduce((width, character) => {
				return width + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3]/u.test(character)
					? 2
					: 1);
			}, 0);
		});

		assert.deepStrictEqual(commentVisualColumns, [16, 16, 16]);
	});

	test('Updates and normalizes node descriptions', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{ name: 'README.md', path: '/root/README.md', type: 'file' },
			],
		};

		assert.strictEqual(
			setNodeDescription(tree, '/root/README.md', '  project   overview  '),
			true,
		);
		assert.strictEqual(tree.children?.[0].description, 'project overview');
		assert.strictEqual(setNodeDescription(tree, '/root/README.md', ' '), true);
		assert.strictEqual(tree.children?.[0].description, undefined);
	});

	test('Restores custom order and exclusions from persisted state', () => {
		const rootPath = path.join('C:', 'workspace', 'project');
		const original: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'README.md', path: path.join(rootPath, 'README.md'), type: 'file' },
				{ name: 'src', path: path.join(rootPath, 'src'), type: 'directory', children: [] },
				{
					name: 'notes.txt',
					path: path.join(rootPath, 'notes.txt'),
					type: 'file',
					excluded: true,
				},
			],
		};
		const state = captureTreeState(original);
		const rescanned: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'src', path: path.join(rootPath, 'src'), type: 'directory', children: [] },
				{ name: 'notes.txt', path: path.join(rootPath, 'notes.txt'), type: 'file' },
				{ name: 'README.md', path: path.join(rootPath, 'README.md'), type: 'file' },
			],
		};

		applyTreeState(rescanned, state);

		assert.deepStrictEqual(
			rescanned.children?.map(child => child.name),
			['README.md', 'src', 'notes.txt'],
		);
		assert.strictEqual(rescanned.children?.at(-1)?.excluded, true);
	});

	test('Inserts new nodes alphabetically among active persisted nodes', () => {
		const rootPath = path.join('C:', 'workspace', 'project');
		const original: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'zebra.ts', path: path.join(rootPath, 'zebra.ts'), type: 'file' },
				{ name: 'alpha.ts', path: path.join(rootPath, 'alpha.ts'), type: 'file' },
				{
					name: 'ignored.ts',
					path: path.join(rootPath, 'ignored.ts'),
					type: 'file',
					excluded: true,
				},
			],
		};
		const state = captureTreeState(original);
		const rescanned: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'alpha.ts', path: path.join(rootPath, 'alpha.ts'), type: 'file' },
				{ name: 'beta.ts', path: path.join(rootPath, 'beta.ts'), type: 'file' },
				{ name: 'ignored.ts', path: path.join(rootPath, 'ignored.ts'), type: 'file' },
				{ name: 'zebra.ts', path: path.join(rootPath, 'zebra.ts'), type: 'file' },
			],
		};

		applyTreeState(rescanned, state);

		assert.deepStrictEqual(
			rescanned.children?.map(child => child.name),
			['beta.ts', 'zebra.ts', 'alpha.ts', 'ignored.ts'],
		);
		assert.strictEqual(rescanned.children?.at(-1)?.excluded, true);
	});

	test('Drops persisted entries that no longer exist', () => {
		const rootPath = path.join('C:', 'workspace', 'project');
		const original: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'deleted.ts', path: path.join(rootPath, 'deleted.ts'), type: 'file' },
				{ name: 'kept.ts', path: path.join(rootPath, 'kept.ts'), type: 'file' },
			],
		};
		const state = captureTreeState(original);
		const rescanned: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [
				{ name: 'kept.ts', path: path.join(rootPath, 'kept.ts'), type: 'file' },
			],
		};

		applyTreeState(rescanned, state);

		assert.deepStrictEqual(
			rescanned.children?.map(child => child.name),
			['kept.ts'],
		);
	});

	test('Restores ordering inside nested directories', () => {
		const rootPath = path.join('C:', 'workspace', 'project');
		const srcPath = path.join(rootPath, 'src');
		const original: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [{
				name: 'src',
				path: srcPath,
				type: 'directory',
				children: [
					{ name: 'z.ts', path: path.join(srcPath, 'z.ts'), type: 'file' },
					{ name: 'a.ts', path: path.join(srcPath, 'a.ts'), type: 'file' },
				],
			}],
		};
		const state = captureTreeState(original);
		const rescanned: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [{
				name: 'src',
				path: srcPath,
				type: 'directory',
				children: [
					{ name: 'a.ts', path: path.join(srcPath, 'a.ts'), type: 'file' },
					{ name: 'z.ts', path: path.join(srcPath, 'z.ts'), type: 'file' },
				],
			}],
		};

		applyTreeState(rescanned, state);

		assert.deepStrictEqual(
			rescanned.children?.[0].children?.map(child => child.name),
			['z.ts', 'a.ts'],
		);
	});

	test('Restores persisted descriptions', () => {
		const rootPath = path.join('C:', 'workspace', 'project');
		const original: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			description: 'project root',
			children: [{
				name: 'README.md',
				path: path.join(rootPath, 'README.md'),
				type: 'file',
				description: 'project overview',
			}],
		};
		const state = captureTreeState(original);
		const rescanned: TreeNode = {
			name: 'project',
			path: rootPath,
			type: 'directory',
			children: [{
				name: 'README.md',
				path: path.join(rootPath, 'README.md'),
				type: 'file',
			}],
		};

		applyTreeState(rescanned, state);

		assert.strictEqual(rescanned.description, 'project root');
		assert.strictEqual(
			rescanned.children?.[0].description,
			'project overview',
		);
	});

	test('Saves and loads tree metadata from the project file', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));
		const state = captureTreeState({
			name: 'project',
			path: rootPath,
			type: 'directory',
			description: 'project root',
			children: [{
				name: 'README.md',
				path: path.join(rootPath, 'README.md'),
				type: 'file',
				excluded: true,
				description: 'project overview',
			}],
		});

		try {
			await saveTreeStateFile(rootPath, state);

			const loadedState = await loadTreeStateFile(rootPath);
			assert.deepStrictEqual(loadedState, state);
			assert.ok(
				await fs.stat(path.join(rootPath, TREE_METADATA_FILE_NAME)),
			);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('Deletes tree metadata project file', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));

		try {
			await saveTreeStateFile(rootPath, {
				version: 1,
				directories: {},
				descriptions: {},
			});
			await deleteTreeStateFile(rootPath);

			assert.strictEqual(await loadTreeStateFile(rootPath), undefined);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('Scans according to the root .gitignore', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));

		try {
			await fs.writeFile(
				path.join(rootPath, '.gitignore'),
				'node_modules/\n*.log\n',
			);
			await fs.mkdir(path.join(rootPath, 'node_modules'));
			await fs.mkdir(path.join(rootPath, 'out'));
			await fs.writeFile(path.join(rootPath, 'debug.log'), '');
			await fs.writeFile(path.join(rootPath, 'out', 'generated.js'), '');

			const tree = await scanDirectory(rootPath);

			assert.deepStrictEqual(
				tree.children?.map(child => child.name),
				['out', '.gitignore'],
			);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('Applies nested .gitignore negation patterns', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));
		const srcPath = path.join(rootPath, 'src');

		try {
			await fs.writeFile(path.join(rootPath, '.gitignore'), '*.log\n');
			await fs.mkdir(srcPath);
			await fs.writeFile(path.join(srcPath, '.gitignore'), '!keep.log\n');
			await fs.writeFile(path.join(srcPath, 'drop.log'), '');
			await fs.writeFile(path.join(srcPath, 'keep.log'), '');

			const tree = await scanDirectory(rootPath);

			assert.deepStrictEqual(
				tree.children?.find(child => child.name === 'src')?.children
					?.map(child => child.name),
				['.gitignore', 'keep.log'],
			);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('Only excludes .git when no .gitignore rules exist', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));

		try {
			await fs.mkdir(path.join(rootPath, '.git'));
			await fs.mkdir(path.join(rootPath, 'dist'));
			await fs.mkdir(path.join(rootPath, 'node_modules'));

			const tree = await scanDirectory(rootPath);

			assert.deepStrictEqual(
				tree.children?.map(child => child.name),
				['dist', 'node_modules'],
			);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('Reflects updated and deleted .gitignore rules when rescanned', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));
		const gitignorePath = path.join(rootPath, '.gitignore');

		try {
			await fs.writeFile(path.join(rootPath, 'debug.log'), '');

			let tree = await scanDirectory(rootPath);
			assert.ok(tree.children?.some(child => child.name === 'debug.log'));

			await fs.writeFile(gitignorePath, '*.log\n');
			tree = await scanDirectory(rootPath);
			assert.ok(!tree.children?.some(child => child.name === 'debug.log'));

			await fs.rm(gitignorePath);
			tree = await scanDirectory(rootPath);
			assert.ok(tree.children?.some(child => child.name === 'debug.log'));
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});
});
