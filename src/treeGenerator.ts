import { TreeNode } from './types';

function generateNodeString(
    node: TreeNode,
    prefix: string,
    isLast: boolean,
): string {
    const connector = isLast ? '└── ' : '├── ';
    const name = node.type === 'directory' ? `${node.name}/` : node.name;

    let result = `${prefix}${connector}${name}\n`;

    if (node.children && node.children.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');

        node.children.forEach((child, index) => {
            result += generateNodeString(
                child,
                nextPrefix,
                index === node.children!.length - 1
            );
        });
    }

    return result;
}

export function generateTreeString(root: TreeNode): string {
    let result = `${root.name}/\n`;

    if (!root.children) {
        return result;
    }

    root.children.forEach((child, index) => {
        result += generateNodeString(
            child,
            '',
            index === root.children!.length - 1
        );
    });

    return result;
}