export interface WorktreeInfo {
    path: string;
    branch: string;
    issueNumber: number;
}
export declare function branchName(issueNumber: number, title: string, pipeline: string): string;
export declare function createWorktree(projectRoot: string, baseBranch: string, branch: string, issueNumber: number): WorktreeInfo;
export declare function cleanupWorktree(projectRoot: string, worktreePath: string, branch: string): void;
export declare function listWorktrees(projectRoot: string): WorktreeInfo[];
//# sourceMappingURL=worktree.d.ts.map