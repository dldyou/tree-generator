# Tree Generator

Tree Generator is a VS Code extension for creating an ASCII project tree for documents such as `README.md`.

It starts with a directory-first, alphabetical layout and provides a Webview editor where files and folders can be reordered or excluded without modifying the filesystem.

## Features

- Generates an ASCII tree from the current workspace.
- Sorts directories first, then sorts entries alphabetically by default.
- Reorders sibling files and folders using drag and drop or move buttons.
- Adds descriptions to files and folders as aligned `# description` comments.
- Shows a live ASCII tree preview while editing.
- Excludes files and folders from the generated output.
- Keeps excluded entries visible, dimmed, and at the bottom of their directory.
- Refreshes open editors when files or folders are created or deleted.
- Updates marked README tree blocks automatically when the tree changes.
- Copies the edited ASCII tree to the clipboard.
- Restores the default scanned order with `Reset to default`.

Example output:

```text
tree-generator/              # VS Code extension
├── src/                     # Extension source
│   ├── extension.ts         # Extension entry point
│   └── treeGenerator.ts     # ASCII tree generator
├── package.json             # Extension manifest
└── README.md
```

## Usage

1. Open a workspace folder in VS Code.
2. `Ctrl + Shift + P` to Open the Command Palette.
3. Run `Tree Generator: Open Tree Editor`.
4. Add descriptions, arrange entries, or exclude them in the left panel.
5. Review the generated ASCII tree in the preview panel.
6. Select `Copy tree` and paste it into your document.

Descriptions, ordering, and exclusion choices are stored in `.tree-generator.json` and restored when the editor is opened again.

When new files or folders are discovered, they are inserted alphabetically among active entries. Existing custom ordering is preserved, and excluded entries remain at the bottom.

To let Tree Generator update `README.md` automatically, add a marked block. The marker comments are escaped below so this README is not treated as the generated block; remove the leading backslashes when adding the block to your document.

````md
\<!-- tree-generator:start -->
```text
tree-generator/
└── README.md
```
\<!-- tree-generator:end -->
````

Only the content between these markers is replaced.

## Scan Exclusions

Tree Generator applies root and nested `.gitignore` rules while scanning.

- `.gitignore` negation patterns such as `!keep.log` are supported.
- Git metadata directories named `.git` are always excluded.
- Open Tree Generator editors automatically refresh when a `.gitignore` file is created, changed, or deleted.
- Open Tree Generator editors also refresh when files or folders are created or deleted.
- Manual exclusions made in the Webview are separate from `.gitignore` rules.

## Requirements

- VS Code `1.120.0` or later.
- An open workspace folder.

## Extension Settings

Tree Generator does not currently contribute any VS Code settings.

## Known Issues

- In a multi-root workspace, Tree Generator currently scans the first workspace folder.
- File content-only edits do not trigger a tree refresh because they do not change the project structure.
- `.tree-generator.json` should be committed if you want to share tree metadata with collaborators.

## Release Notes

### 0.0.1

- Added the visual Tree Editor and live ASCII preview.
- Added drag-and-drop ordering and manual exclusions.
- Added workspace-specific ordering and exclusion persistence.
- Added root and nested `.gitignore` support with automatic refresh.

### 0.1.0

- Added detection of created and deleted files and folders.
