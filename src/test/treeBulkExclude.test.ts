import * as assert from 'assert';
import { setDescendantsExcluded } from '../treeOrdering';
import { TreeNode } from '../types';

suite('Bulk exclusion', () => {
	test('updates a directory descendants without changing the directory itself', () => {
		const tree: TreeNode = {
			name: 'root',
			path: '/root',
			type: 'directory',
			children: [{
				name: 'src',
				path: '/root/src',
				type: 'directory',
				children: [
					{ name: 'a.ts', path: '/root/src/a.ts', type: 'file' },
					{
						name: 'nested',
						path: '/root/src/nested',
						type: 'directory',
						children: [{
							name: 'b.ts',
							path: '/root/src/nested/b.ts',
							type: 'file',
						}],
					},
				],
			}],
		};

		assert.strictEqual(setDescendantsExcluded(tree, '/root/src', true), true);
		assert.strictEqual(tree.children?.[0].excluded, undefined);
		assert.deepStrictEqual(
			tree.children?.[0].children?.map(child => child.name),
			['a.ts', 'nested'],
		);
		assert.deepStrictEqual(tree.children?.[0].children?.map(child => child.excluded), [true, true]);
		assert.strictEqual(tree.children?.[0].children?.[1].children?.[0].excluded, true);

		assert.strictEqual(setDescendantsExcluded(tree, '/root/src', false), true);
		assert.deepStrictEqual(tree.children?.[0].children?.map(child => child.excluded), [undefined, undefined]);
		assert.strictEqual(tree.children?.[0].children?.[1].children?.[0].excluded, undefined);
	});
});
