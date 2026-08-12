# Tree Generator

Tree Generator is a VS Code extension that creates and maintains a project tree in a marked block of a Markdown document.

## Features

- Scans the workspace directory-first, then alphabetically; `.gitignore` rules apply by default and `.git` is always excluded.
- Lets you reorder entries, add descriptions, and exclude entries without changing the filesystem. Choices are stored in `.tree-generator.json`.
- Searches the Webview tree and includes or excludes all descendants of a directory at once.
- Refreshes open editors when files, folders, or `.gitignore` files change.
- Updates a configurable marked Markdown block automatically, with a Webview toggle to disable updates.
- Supports Unicode or ASCII connectors, a maximum output depth, and multi-root workspace folder selection.
- Provides a CLI to print, write, or check the generated tree.

```text
tree-generator/
├── src/                 # Extension source
│   ├── extension.ts      # Extension entry point
│   └── treeGenerator.ts  # Tree renderer
├── package.json          # Extension manifest
└── README.md
```

## Use

1. Open a workspace and run `Tree Generator: Open Tree Editor` from the Command Palette. Select a folder when using a multi-root workspace.
2. Search or edit descriptions, order, and exclusions; copy the preview when needed.
3. Add the following marked block to the Markdown file Tree Generator should maintain.

The marker comments below are escaped so this README is not updated. Remove the backslashes within the comments when copying them into your document. Only the content between the markers is replaced.

````md
<\!-- tree-generator:start -->
```text
tree-generator/
└── README.md
```
<\!-- tree-generator:end -->
````

## CLI

```sh
tree-generator print
tree-generator write
tree-generator check
```

- `print` writes the tree to stdout.
- `write` updates the marked block; `check` exits with code `1` when the block is missing or outdated.
- `--include-gitignored` includes `.gitignore`-matched entries; `--respect-gitignore` restores the default.
- `--readme <path>` selects the Markdown target.
- `--style unicode|ascii` selects tree characters.
- `--max-depth <depth>` limits output depth; `0` prints only the root.

## Unreleased: 0.3.0

- Configurable automatic Markdown updates and target file.
- Unicode and ASCII output styles with a maximum depth.
- Webview search and directory-wide include/exclude actions.
- Folder selection for multi-root workspaces.
- Reorganized README and changelog documentation.

## Settings

- `tree-generator.respectGitignore` — apply `.gitignore` rules (default: `true`).
- `tree-generator.readmePath` — Markdown file to update, relative to the workspace folder (default: `README.md`).
- `tree-generator.autoUpdateReadme` — automatically update the marked Markdown block (default: `true`).
- `tree-generator.outputStyle` — `unicode` or `ascii` tree characters (default: `unicode`).
- `tree-generator.maxDepth` — maximum depth; `-1` means unlimited and `0` shows only the root.

## Requirements

- VS Code 1.120.0 or later.
- An open workspace folder.

## Known limitations

- File content-only edits do not refresh the tree because they do not change the project structure.
- Commit `.tree-generator.json` to share ordering, descriptions, and exclusions with collaborators.

See [CHANGELOG.md](CHANGELOG.md) for release history.
