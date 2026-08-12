import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	checkReadmeTreeBlock,
	README_TREE_END_MARKER,
	README_TREE_START_MARKER,
	updateReadmeTreeBlock,
} from '../readmeUpdater';
import { runCli } from '../cli';

suite('README target file', () => {
	test('updates nested targets, defaults to README.md, and rejects unsafe paths', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));
		const nestedReadmePath = path.join(rootPath, 'docs', 'guide.md');
		const outsidePath = path.join(path.dirname(rootPath), 'outside.md');
		const markedReadme = [README_TREE_START_MARKER, 'old tree', README_TREE_END_MARKER].join('\n');

		try {
			await fs.mkdir(path.dirname(nestedReadmePath));
			await fs.writeFile(path.join(rootPath, 'README.md'), markedReadme);
			await fs.writeFile(nestedReadmePath, markedReadme);

			assert.deepStrictEqual(
				await updateReadmeTreeBlock(rootPath, 'nested/', 'docs/guide.md'),
				{ found: true, updated: true },
			);
			assert.deepStrictEqual(
				await checkReadmeTreeBlock(rootPath, 'nested/', 'docs/guide.md'),
				{ found: true, matches: true },
			);
			assert.deepStrictEqual(
				await checkReadmeTreeBlock(rootPath, 'default/'),
				{ found: true, matches: false },
			);
			await assert.rejects(updateReadmeTreeBlock(rootPath, 'tree', outsidePath));
			await assert.rejects(checkReadmeTreeBlock(rootPath, 'tree', '../outside.md'));
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	test('CLI writes a configured markdown target', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));
		const targetPath = path.join(rootPath, 'docs', 'structure.md');

		try {
			await fs.mkdir(path.dirname(targetPath));
			await fs.writeFile(
				targetPath,
				[README_TREE_START_MARKER, 'old tree', README_TREE_END_MARKER].join('\n'),
			);

			const result = await runCli(['write', '--readme', 'docs/structure.md'], rootPath);
			assert.strictEqual(result.exitCode, 0);
			assert.match(result.stdout, /docs\/structure\.md tree block updated/);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});
});
