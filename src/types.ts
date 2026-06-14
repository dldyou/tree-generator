export type TreeNodeType = 'directory' | 'file';

export interface TreeNode {
    name: string;
    path: string;
    type: TreeNodeType;
    children?: TreeNode[];
}