import { randomBytes } from 'crypto';
import * as vscode from 'vscode';

export function getTreeEditorHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tree Generator</title>
    <style nonce="${nonce}">
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
        }

        button {
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 2px;
            padding: 6px 12px;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            cursor: pointer;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .secondary {
            color: var(--vscode-button-secondaryForeground);
            background: var(--vscode-button-secondaryBackground);
        }

        .secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .hint {
            margin: 0 0 16px;
            color: var(--vscode-descriptionForeground);
        }

        .layout {
            display: grid;
            grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
            gap: 16px;
            min-height: calc(100vh - 110px);
        }

        .panel {
            min-width: 0;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }

        .panel-heading {
            margin: 0;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .tree {
            overflow: auto;
            padding: 10px 8px 20px;
        }

        .children-list {
            margin: 0;
            padding-left: 22px;
            list-style: none;
        }

        .tree > .children-list {
            padding-left: 0;
        }

        .tree-item {
            border-radius: 3px;
        }

        .tree-item.dragging {
            opacity: 0.35;
        }

        .tree-item.excluded {
            opacity: 0.42;
        }

        .tree-item.excluded:hover {
            opacity: 0.68;
        }

        .node-row {
            display: flex;
            align-items: center;
            min-height: 30px;
            padding: 2px 4px;
            border: 1px solid transparent;
            border-radius: 3px;
        }

        .tree-item[draggable="true"] > .node-row {
            cursor: grab;
        }

        .tree-item[draggable="true"] > .node-row:active {
            cursor: grabbing;
        }

        .node-row:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .tree-item.dragging > .node-row {
            border-color: var(--vscode-focusBorder);
        }

        .toggle,
        .move-button,
        .exclude-button {
            flex: 0 0 auto;
            width: 24px;
            height: 24px;
            padding: 0;
            border: 0;
            color: var(--vscode-foreground);
            background: transparent;
        }

        .toggle:hover,
        .move-button:hover,
        .exclude-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .toggle-placeholder {
            display: inline-block;
            width: 24px;
        }

        .node-icon {
            width: 22px;
            color: var(--vscode-symbolIcon-folderForeground);
        }

        .file > .node-row .node-icon {
            color: var(--vscode-symbolIcon-fileForeground);
        }

        .node-name {
            overflow: hidden;
            flex: 1 1 auto;
            padding-right: 8px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .node-actions {
            display: none;
            gap: 2px;
        }

        .node-row:hover .node-actions,
        .node-row:focus-within .node-actions {
            display: flex;
        }

        .collapsed > .children-list {
            display: none;
        }

        .preview {
            overflow: auto;
            margin: 0;
            padding: 12px;
            min-height: 100%;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.5;
            white-space: pre;
        }

        .status {
            min-height: 20px;
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
        }

        .status.error {
            color: var(--vscode-errorForeground);
        }

        @media (max-width: 760px) {
            .layout {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="copy-button" type="button">Copy tree</button>
        <button id="reset-button" class="secondary" type="button">Reset to default</button>
        <span id="status" class="status" role="status"></span>
    </div>
    <p class="hint">Drag items to change their order, or exclude them from the output. Excluded items stay at the bottom and the filesystem is not modified.</p>
    <main class="layout">
        <section class="panel">
            <h2 class="panel-heading">Order</h2>
            <div id="tree" class="tree">Loading...</div>
        </section>
        <section class="panel">
            <h2 class="panel-heading">ASCII tree preview</h2>
            <pre id="preview" class="preview"></pre>
        </section>
    </main>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const treeElement = document.getElementById('tree');
        const previewElement = document.getElementById('preview');
        const statusElement = document.getElementById('status');
        const collapsedPaths = new Set();
        let tree;
        let draggedItem;
        let draggedParentPath;
        let dragCommitted = false;

        document.getElementById('copy-button').addEventListener('click', () => {
            vscode.postMessage({ type: 'copy' });
        });

        document.getElementById('reset-button').addEventListener('click', () => {
            setStatus('Resetting...');
            vscode.postMessage({ type: 'reset' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.type === 'update') {
                tree = message.tree;
                previewElement.textContent = message.treeString;
                renderTree();
                setStatus(message.status ?? '');
            } else if (message.type === 'status') {
                setStatus(message.text, message.isError);
            }
        });

        function setStatus(text, isError = false) {
            statusElement.textContent = text;
            statusElement.classList.toggle('error', isError);
        }

        function renderTree() {
            treeElement.replaceChildren();
            if (!tree) {
                treeElement.textContent = 'Loading...';
                return;
            }

            const rootList = document.createElement('ul');
            rootList.className = 'children-list';
            const rootItem = createTreeItem(tree, true);
            rootList.append(rootItem);
            treeElement.append(rootList);
        }

        function createTreeItem(node, isRoot = false) {
            const item = document.createElement('li');
            item.className = 'tree-item ' + node.type;
            item.dataset.path = node.path;
            item.dataset.excluded = Boolean(node.excluded).toString();
            item.draggable = !isRoot;

            if (collapsedPaths.has(node.path)) {
                item.classList.add('collapsed');
            }
            if (node.excluded) {
                item.classList.add('excluded');
            }

            const row = document.createElement('div');
            row.className = 'node-row';
            item.append(row);

            if (node.type === 'directory' && node.children?.length) {
                const toggle = document.createElement('button');
                toggle.className = 'toggle';
                toggle.type = 'button';
                toggle.title = 'Collapse or expand directory';
                toggle.textContent = collapsedPaths.has(node.path) ? '▸' : '▾';
                toggle.addEventListener('click', event => {
                    event.stopPropagation();
                    const isCollapsed = item.classList.toggle('collapsed');
                    toggle.textContent = isCollapsed ? '▸' : '▾';
                    if (isCollapsed) {
                        collapsedPaths.add(node.path);
                    } else {
                        collapsedPaths.delete(node.path);
                    }
                });
                row.append(toggle);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'toggle-placeholder';
                row.append(placeholder);
            }

            const icon = document.createElement('span');
            icon.className = 'node-icon';
            icon.textContent = node.type === 'directory' ? '▰' : '•';
            row.append(icon);

            const name = document.createElement('span');
            name.className = 'node-name';
            name.textContent = node.name + (node.type === 'directory' ? '/' : '');
            name.title = node.path;
            row.append(name);

            if (!isRoot) {
                row.append(createNodeActions(item, node));
                addDragHandlers(item);
            }

            if (node.children?.length) {
                item.append(createChildrenList(node));
            }

            return item;
        }

        function createChildrenList(parentNode) {
            const list = document.createElement('ul');
            list.className = 'children-list';
            list.dataset.parentPath = parentNode.path;

            for (const child of parentNode.children ?? []) {
                list.append(createTreeItem(child));
            }

            list.addEventListener('dragover', event => {
                if (!draggedItem || draggedParentPath !== list.dataset.parentPath) {
                    return;
                }

                event.preventDefault();
                const target = directTreeItem(event.target, list);
                if (!target) {
                    if (draggedItem.dataset.excluded === 'true') {
                        list.append(draggedItem);
                    } else {
                        const firstExcluded = Array.from(list.children).find(
                            child => child.dataset.excluded === 'true',
                        );
                        list.insertBefore(draggedItem, firstExcluded ?? null);
                    }
                    return;
                }

                if (
                    target === draggedItem
                    || target.dataset.excluded !== draggedItem.dataset.excluded
                ) {
                    return;
                }

                const row = target.querySelector(':scope > .node-row');
                const insertAfter = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
                list.insertBefore(draggedItem, insertAfter ? target.nextSibling : target);
            });

            list.addEventListener('drop', event => {
                if (!draggedItem || draggedParentPath !== list.dataset.parentPath) {
                    return;
                }

                event.preventDefault();
                dragCommitted = true;
                postListOrder(list);
            });

            return list;
        }

        function directTreeItem(target, list) {
            let item = target instanceof Element ? target.closest('.tree-item') : undefined;
            while (item && item.parentElement !== list) {
                item = item.parentElement?.closest('.tree-item');
            }
            return item;
        }

        function addDragHandlers(item) {
            item.addEventListener('dragstart', event => {
                event.stopPropagation();
                draggedItem = item;
                draggedParentPath = item.parentElement.dataset.parentPath;
                dragCommitted = false;
                item.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.dataset.path);
            });

            item.addEventListener('dragend', event => {
                event.stopPropagation();
                item.classList.remove('dragging');
                draggedItem = undefined;
                draggedParentPath = undefined;
                if (!dragCommitted) {
                    renderTree();
                }
            });
        }

        function createNodeActions(item, node) {
            const actions = document.createElement('span');
            actions.className = 'node-actions';
            actions.append(
                createMoveButton('↑', 'Move up', () => moveItem(item, -1)),
                createMoveButton('↓', 'Move down', () => moveItem(item, 1)),
                createExcludeButton(node),
            );
            return actions;
        }

        function createMoveButton(label, title, onClick) {
            const button = document.createElement('button');
            button.className = 'move-button';
            button.type = 'button';
            button.textContent = label;
            button.title = title;
            button.addEventListener('click', event => {
                event.stopPropagation();
                onClick();
            });
            return button;
        }

        function createExcludeButton(node) {
            const button = document.createElement('button');
            button.className = 'exclude-button';
            button.type = 'button';
            button.textContent = node.excluded ? '+' : 'x';
            button.title = node.excluded ? 'Include in output' : 'Exclude from output';
            button.addEventListener('click', event => {
                event.stopPropagation();
                vscode.postMessage({
                    type: 'setExcluded',
                    nodePath: node.path,
                    excluded: !node.excluded,
                });
            });
            return button;
        }

        function moveItem(item, direction) {
            const list = item.parentElement;
            const sibling = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
            if (!sibling || sibling.dataset.excluded !== item.dataset.excluded) {
                return;
            }

            if (direction < 0) {
                list.insertBefore(item, sibling);
            } else {
                list.insertBefore(sibling, item);
            }
            postListOrder(list);
        }

        function postListOrder(list) {
            vscode.postMessage({
                type: 'reorder',
                parentPath: list.dataset.parentPath,
                orderedChildPaths: Array.from(list.children).map(child => child.dataset.path),
            });
        }

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
}
