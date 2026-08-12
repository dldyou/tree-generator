import { TreeNode } from './types';

export interface TreeGeneratorOptions {
    style?: 'unicode' | 'ascii';
    maxDepth?: number;
}

interface TreeLine {
    content: string;
    description?: string;
}

function isWideCharacter(codePoint: number): boolean {
    return (
        codePoint >= 0x1100
        && (
            codePoint <= 0x115f
            || codePoint === 0x2329
            || codePoint === 0x232a
            || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
            || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
            || (codePoint >= 0xf900 && codePoint <= 0xfaff)
            || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
            || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
            || (codePoint >= 0xff00 && codePoint <= 0xff60)
            || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
            || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
            || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
        )
    );
}

function displayWidth(value: string): number {
    return Array.from(value).reduce((width, character) => {
        return width + (isWideCharacter(character.codePointAt(0)!) ? 2 : 1);
    }, 0);
}

function generateNodeLines(
    node: TreeNode,
    prefix: string,
    isLast: boolean,
    depth: number,
    maxDepth: number,
    style: NonNullable<TreeGeneratorOptions['style']>,
): TreeLine[] {
    const ascii = style === 'ascii';
    const connector = isLast
        ? (ascii ? '`-- ' : '\u2514\u2500\u2500 ')
        : (ascii ? '|-- ' : '\u251c\u2500\u2500 ');
    const name = node.type === 'directory' ? `${node.name}/` : node.name;
    const lines: TreeLine[] = [{
        content: `${prefix}${connector}${name}`,
        description: node.description,
    }];

    const includedChildren = node.children?.filter(child => !child.excluded) ?? [];
    if (depth < maxDepth && includedChildren.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : (ascii ? '|   ' : '\u2502   '));

        includedChildren.forEach((child, index) => {
            lines.push(
                ...generateNodeLines(
                    child,
                    nextPrefix,
                    index === includedChildren.length - 1,
                    depth + 1,
                    maxDepth,
                    style,
                ),
            );
        });
    }

    return lines;
}

export function generateTreeString(
    root: TreeNode,
    options: TreeGeneratorOptions = {},
): string {
    const style = options.style ?? 'unicode';
    const maxDepth = options.maxDepth ?? Infinity;
    const lines: TreeLine[] = [{
        content: `${root.name}/`,
        description: root.description,
    }];

    const includedChildren = root.children?.filter(child => !child.excluded) ?? [];
    if (maxDepth > 0) {
        includedChildren.forEach((child, index) => {
            lines.push(
                ...generateNodeLines(
                    child,
                    '',
                    index === includedChildren.length - 1,
                    1,
                    maxDepth,
                    style,
                ),
            );
        });
    }

    const longestLineLength = Math.max(...lines.map(line => displayWidth(line.content)));
    const descriptionColumn = Math.ceil((longestLineLength + 1) / 4) * 4;

    return lines
        .map(line => {
            if (!line.description) {
                return line.content;
            }

            const padding = ' '.repeat(descriptionColumn - displayWidth(line.content));
            return `${line.content}${padding}# ${line.description}`;
        })
        .join('\n') + '\n';
}
