import * as assert from 'assert';
import * as path from 'path';
import { shouldScheduleFileTreeRefresh } from '../extension';
import { TREE_METADATA_FILE_NAME } from '../treeMetaStore';

suite('File watcher filtering', () => {
	test('ignores internal root files without hiding nested tree ignore files', () => {
		const rootPath = path.resolve('workspace', 'project');

		assert.strictEqual(
			shouldScheduleFileTreeRefresh(
				rootPath,
				path.join(rootPath, TREE_METADATA_FILE_NAME),
			),
			false,
		);
		assert.strictEqual(
			shouldScheduleFileTreeRefresh(
				rootPath,
				path.join(rootPath, '.tree-generatorignore'),
			),
			false,
		);
		assert.strictEqual(
			shouldScheduleFileTreeRefresh(
				rootPath,
				path.join(rootPath, 'nested', '.tree-generatorignore'),
			),
			true,
		);
		assert.strictEqual(
			shouldScheduleFileTreeRefresh(
				rootPath,
				path.join(rootPath, 'nested', '.gitignore'),
			),
			false,
		);
	});
});
