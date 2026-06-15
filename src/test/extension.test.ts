import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { generateTreeString } from '../treeGenerator';
import { reorderChildren, setNodeExcluded } from '../treeOrdering';
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
});
