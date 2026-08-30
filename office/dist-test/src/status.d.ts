import { type GitHubIssue } from "./github.js";
export interface StatusReport {
    ready: GitHubIssue[];
    inProgress: GitHubIssue[];
    review: GitHubIssue[];
    blockedHuman: GitHubIssue[];
    blockedDependency: GitHubIssue[];
    blockedUnclassified: GitHubIssue[];
    done: GitHubIssue[];
    backlog: GitHubIssue[];
}
export declare function getStatus(): Promise<StatusReport>;
export declare function formatStatus(report: StatusReport, projectRoot: string): string;
//# sourceMappingURL=status.d.ts.map