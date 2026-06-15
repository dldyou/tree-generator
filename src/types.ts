export type TreeNodeType = 'directory' | 'file';

export interface TreeNode {
    name: string;
    path: string;
    type: TreeNodeType;
    excluded?: boolean;
    children?: TreeNode[];
}
