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
2. Open the Command Palette.
3. Run `Tree Generator: Open Tree Editor`.
4. Add descriptions, arrange entries, or exclude them in the left panel.
5. Review the generated ASCII tree in the preview panel.
6. Select `Copy tree` and paste it into your document.

Descriptions, ordering, and exclusion choices are stored for the workspace and restored when the editor is opened again.

When new files or folders are discovered, they are inserted alphabetically among active entries. Existing custom ordering is preserved, and excluded entries remain at the bottom.

## Scan Exclusions

Tree Generator applies root and nested `.gitignore` rules while scanning.

- `.gitignore` negation patterns such as `!keep.log` are supported.
- Git metadata directories named `.git` are always excluded.
- Open Tree Generator editors automatically refresh when a `.gitignore` file is created, changed, or deleted.
- Manual exclusions made in the Webview are separate from `.gitignore` rules.

## Requirements

- VS Code `1.120.0` or later.
- An open workspace folder.

## Extension Settings

Tree Generator does not currently contribute any VS Code settings.

## Known Issues

- In a multi-root workspace, Tree Generator currently scans the first workspace folder.
- General filesystem changes are reflected the next time the Tree Editor is opened. Only `.gitignore` changes trigger an automatic refresh while the editor is open.
- Ordering and exclusion state is stored in VS Code workspace state rather than a project file.

## Release Notes

### 0.0.1

- Added the visual Tree Editor and live ASCII preview.
- Added drag-and-drop ordering and manual exclusions.
- Added workspace-specific ordering and exclusion persistence.
- Added root and nested `.gitignore` support with automatic refresh.
