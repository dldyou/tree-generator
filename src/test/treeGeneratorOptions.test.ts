import * as assert from 'assert';
import { generateTreeString } from '../treeGenerator';
import { TreeNode } from '../types';

const tree: TreeNode = {
    name: 'root',
    path: '/root',
    type: 'directory',
    description: 'root description',
    children: [{
        name: 'src',
        path: '/root/src',
        type: 'directory',
        description: 'source files',
        children: [{
            name: 'index.ts',
            path: '/root/src/index.ts',
            type: 'file',
            description: 'entry point',
        }],
    }],
};

suite('Tree generator options', () => {
    test('uses Unicode connectors by default and aligns ASCII descriptions', () => {
        assert.strictEqual(
            generateTreeString(tree),
            'root/               # root description\n\u2514\u2500\u2500 src/            # source files\n    \u2514\u2500\u2500 index.ts    # entry point\n',
        );
        assert.strictEqual(
            generateTreeString(tree, { style: 'unicode' }),
            generateTreeString(tree),
        );

        const lines = generateTreeString(tree, { style: 'ascii' }).trimEnd().split('\n');
        assert.deepStrictEqual(
            lines.map(line => line.indexOf('# ')),
            [20, 20, 20],
        );
        assert.ok(lines[1].startsWith('`-- src/'));
        assert.ok(lines[2].startsWith('    `-- index.ts'));
    });

    test('includes the root at depth zero and omits deeper nodes', () => {
        assert.strictEqual(
            generateTreeString(tree, { maxDepth: 0 }),
            'root/   # root description\n',
        );
        assert.strictEqual(
            generateTreeString(tree, { maxDepth: 1 }),
            'root/       # root description\n\u2514\u2500\u2500 src/    # source files\n',
        );
    });
});
