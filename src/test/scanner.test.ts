import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { scanDirectory } from '../scanner';

suite('Scanner Test Suite', () => {
	test('Always applies root .tree-generatorignore rules', async () => {
		const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-generator-'));

		try {
			await fs.writeFile(path.join(rootPath, '.tree-generatorignore'), '*.log\n');
			await fs.writeFile(path.join(rootPath, '.gitignore'), '*.tmp\n');
			await fs.writeFile(path.join(rootPath, 'hidden.log'), '');
			await fs.writeFile(path.join(rootPath, 'included.tmp'), '');

			const tree = await scanDirectory(rootPath, { respectGitignore: false });

			assert.deepStrictEqual(
				tree.children?.map(child => child.name),
				['.gitignore', '.tree-generatorignore', 'included.tmp'],
			);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});
});
