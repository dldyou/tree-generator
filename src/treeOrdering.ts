import { TreeNode } from './types';

interface NodeLocation {
    node: TreeNode;
    parent?: TreeNode;
}

function findNode(
    root: TreeNode,
    nodePath: string,
    parent?: TreeNode,
): NodeLocation | undefined {
    if (root.path === nodePath) {
        return { node: root, parent };
    }

    for (const child of root.children ?? []) {
        const match = findNode(child, nodePath, root);
        if (match) {
            return match;
        }
    }

    return undefined;
}

export function reorderChildren(
    root: TreeNode,
    parentPath: string,
    orderedChildPaths: string[],
): boolean {
    const parent = findNode(root, parentPath)?.node;
    if (!parent?.children || parent.children.length !== orderedChildPaths.length) {
        return false;
    }

    const childrenByPath = new Map(
        parent.children.map(child => [child.path, child]),
    );

    if (
        childrenByPath.size !== orderedChildPaths.length
        || new Set(orderedChildPaths).size !== orderedChildPaths.length
        || orderedChildPaths.some(childPath => !childrenByPath.has(childPath))
    ) {
        return false;
    }

    const orderedChildren = orderedChildPaths.map(
        childPath => childrenByPath.get(childPath)!,
    );
    parent.children = [
        ...orderedChildren.filter(child => !child.excluded),
        ...orderedChildren.filter(child => child.excluded),
    ];
    return true;
}

export function setNodeExcluded(
    root: TreeNode,
    nodePath: string,
    excluded: boolean,
): boolean {
    const location = findNode(root, nodePath);
    if (!location?.parent?.children) {
        return false;
    }

    const siblings = location.parent.children.filter(
        sibling => sibling.path !== nodePath,
    );
    location.node.excluded = excluded || undefined;

    if (excluded) {
        location.parent.children = [...siblings, location.node];
        return true;
    }

    const firstExcludedIndex = siblings.findIndex(sibling => sibling.excluded);
    const insertIndex = firstExcludedIndex === -1
        ? siblings.length
        : firstExcludedIndex;
    siblings.splice(insertIndex, 0, location.node);
    location.parent.children = siblings;
    return true;
}
