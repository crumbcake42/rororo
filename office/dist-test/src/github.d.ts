export interface GitHubIssue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    state: string;
    created_at: string;
    updated_at: string;
    html_url: string;
}
export interface GitHubComment {
    id: number;
    body: string;
    user: string;
    created_at: string;
}
export interface GitHubPR {
    number: number;
    title: string;
    head_branch: string;
    base_branch: string;
    state: string;
    merged: boolean;
    html_url: string;
}
export declare function listIssuesByLabel(label: string): Promise<GitHubIssue[]>;
export declare function listAllIssues(): Promise<GitHubIssue[]>;
export declare function getIssue(issueNumber: number): Promise<GitHubIssue>;
export declare function getIssueComments(issueNumber: number): Promise<GitHubComment[]>;
export declare function addComment(issueNumber: number, body: string): Promise<void>;
export declare function setLabels(issueNumber: number, labelsToAdd: string[], labelsToRemove: string[]): Promise<void>;
export declare function createIssue(title: string, body: string, labels: string[]): Promise<GitHubIssue>;
export declare function listRecentPRs(state?: "open" | "closed" | "all", limit?: number): Promise<GitHubPR[]>;
export declare function createPR(headBranch: string, baseBranch: string, title: string, body: string): Promise<GitHubPR>;
export declare function getPipelineLabel(issue: GitHubIssue): string | null;
export declare function getStatusLabel(issue: GitHubIssue): string | null;
//# sourceMappingURL=github.d.ts.map