import * as assert from 'assert';
import { resetDirectory } from '../treeOrdering';
import { TreeNode } from '../types';

suite('Directory reset', () => {
	test('resets only the selected directory subtree', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [
				{
					name: 'src',
					path: '/root/src',
					type: 'directory',
					description: 'source',
					children: [
						{ name: 'z.ts', path: '/root/src/z.ts', type: 'file', excluded: true },
						{ name: 'a.ts', path: '/root/src/a.ts', type: 'file', description: 'entry' },
						{
							name: 'lib',
							path: '/root/src/lib',
							type: 'directory',
							excluded: true,
							children: [],
						},
					],
				},
				{
					name: 'docs',
					path: '/root/docs',
					type: 'directory',
					children: [
						{ name: 'z.md', path: '/root/docs/z.md', type: 'file' },
						{ name: 'a.md', path: '/root/docs/a.md', type: 'file', excluded: true },
					],
				},
			],
		};

		assert.strictEqual(resetDirectory(tree, '/root/src'), true);
		const src = tree.children?.[0];
		assert.strictEqual(src?.description, undefined);
		assert.deepStrictEqual(src?.children?.map(child => child.name), ['lib', 'a.ts', 'z.ts']);
		assert.ok(src?.children?.every(child => !child.excluded && !child.description));
		assert.deepStrictEqual(
			tree.children?.[1].children?.map(child => [child.name, child.excluded]),
			[['z.md', undefined], ['a.md', true]],
		);
	});

	test('rejects files and unknown paths', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [{ name: 'a.ts', path: '/root/a.ts', type: 'file' }],
		};

		assert.strictEqual(resetDirectory(tree, '/root/a.ts'), false);
		assert.strictEqual(resetDirectory(tree, '/root/missing'), false);
	});
});
