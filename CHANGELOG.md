# Changelog

Notable changes to Tree Generator are listed by release.

## [0.4.0] - 2026-08-13

### Added

- Extension icon and Marketplace package metadata.
- Markdown target diagnostics and one-click tree block setup.
- Markdown target, output style, and maximum depth controls in the Webview.
- Undo and redo for tree ordering, exclusions, descriptions, and bulk actions.
- Root `.tree-generatorignore` support independent of `.gitignore` settings.
- Directory-level metadata reset.
- Package validation workflow for a self-hosted GitHub Actions runner.

## [0.3.0] - 2026-08-12

### Added

- Configurable Markdown target file and automatic update toggle.
- Unicode and ASCII output styles with an optional maximum depth.
- Webview search with matching-path expansion and highlighting.
- Directory-wide include and exclude actions.
- Workspace folder selection for multi-root workspaces.
- CLI options: `--readme`, `--style`, and `--max-depth`.

### Changed

- Simplified README and changelog documentation.

## [0.2.1] - 2026-07-12

### Fixed

- Allowed `tree-generator.respectGitignore` to be saved per workspace folder.

## [0.2.0] - 2026-07-12

### Added

- Project-level tree metadata persistence in `.tree-generator.json`.
- Automatic updates for marked README tree blocks.
- CLI commands: `print`, `write`, and `check`.
- Webview and VS Code setting to include or exclude `.gitignore` matches.

## [0.1.0] - 2026-06-25

### Added

- Automatic tree refresh when files or folders are created or deleted.

## [0.0.1] - 2026-06-15

### Added

- Initial VS Code Tree Editor and live preview.
- Directory-first alphabetical scanning.
- Drag-and-drop ordering and move controls.
- Manual file and directory exclusions.
- File and directory descriptions rendered as aligned `#` comments.
- Root and nested `.gitignore` support with change detection.
- Clipboard copy and default-order reset actions.
