import { TreeNode } from './types';

function generateNodeString(
    node: TreeNode,
    prefix: string,
    isLast: boolean,
): string {
    const connector = isLast ? '└── ' : '├── ';
    const name = node.type === 'directory' ? `${node.name}/` : node.name;

    let result = `${prefix}${connector}${name}\n`;

    const includedChildren = node.children?.filter(child => !child.excluded) ?? [];
    if (includedChildren.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');

        includedChildren.forEach((child, index) => {
            result += generateNodeString(
                child,
                nextPrefix,
                index === includedChildren.length - 1
            );
        });
    }

    return result;
}

export function generateTreeString(root: TreeNode): string {
    let result = `${root.name}/\n`;

    const includedChildren = root.children?.filter(child => !child.excluded) ?? [];
    if (includedChildren.length === 0) {
        return result;
    }

    includedChildren.forEach((child, index) => {
        result += generateNodeString(
            child,
            '',
            index === includedChildren.length - 1
        );
    });

    return result;
}
