import { listAllIssues, getStatusLabel, getPipelineLabel, } from "./github.js";
import { listWorktrees } from "./worktree.js";
export async function getStatus() {
    const issues = await listAllIssues();
    const report = {
        ready: [],
        inProgress: [],
        review: [],
        blockedHuman: [],
        blockedDependency: [],
        blockedUnclassified: [],
        done: [],
        backlog: [],
    };
    for (const issue of issues) {
        if (issue.state === "closed") {
            report.done.push(issue);
            continue;
        }
        const status = getStatusLabel(issue);
        switch (status) {
            case "ready":
                report.ready.push(issue);
                break;
            case "in-progress":
                report.inProgress.push(issue);
                break;
            case "review":
                report.review.push(issue);
                break;
            case "blocked-human":
                report.blockedHuman.push(issue);
                break;
            case "blocked-dependency":
                report.blockedDependency.push(issue);
                break;
            case "blocked-unclassified":
                report.blockedUnclassified.push(issue);
                break;
            case "done":
                report.done.push(issue);
                break;
            case "backlog":
                report.backlog.push(issue);
                break;
        }
    }
    return report;
}
function formatIssue(issue) {
    const pipeline = getPipelineLabel(issue);
    const pipelineTag = pipeline ? ` [${pipeline}]` : "";
    return `  #${issue.number} — ${issue.title}${pipelineTag}`;
}
export function formatStatus(report, projectRoot) {
    const lines = [];
    const worktrees = listWorktrees(projectRoot);
    lines.push("# Office Status\n");
    if (report.inProgress.length > 0) {
        lines.push(`## In Progress (${report.inProgress.length})`);
        for (const issue of report.inProgress) {
            const wt = worktrees.find((w) => w.issueNumber === issue.number);
            const branch = wt ? ` → ${wt.branch}` : "";
            lines.push(`${formatIssue(issue)}${branch}`);
        }
        lines.push("");
    }
    if (report.review.length > 0) {
        lines.push(`## In Review (${report.review.length})`);
        for (const issue of report.review) {
            lines.push(formatIssue(issue));
        }
        lines.push("");
    }
    const totalBlocked = report.blockedHuman.length +
        report.blockedDependency.length +
        report.blockedUnclassified.length;
    if (totalBlocked > 0) {
        lines.push(`## Blocked (${totalBlocked})`);
        for (const issue of report.blockedHuman) {
            lines.push(`${formatIssue(issue)} (human)`);
        }
        for (const issue of report.blockedDependency) {
            lines.push(`${formatIssue(issue)} (dependency)`);
        }
        for (const issue of report.blockedUnclassified) {
            lines.push(`${formatIssue(issue)} (unclassified)`);
        }
        lines.push("");
    }
    if (report.ready.length > 0) {
        lines.push(`## Ready (${report.ready.length})`);
        for (const issue of report.ready) {
            lines.push(formatIssue(issue));
        }
        lines.push("");
    }
    if (report.backlog.length > 0) {
        lines.push(`## Backlog (${report.backlog.length})`);
        for (const issue of report.backlog) {
            lines.push(formatIssue(issue));
        }
        lines.push("");
    }
    if (report.done.length > 0) {
        lines.push(`## Done (${report.done.length})`);
        for (const issue of report.done.slice(0, 10)) {
            lines.push(formatIssue(issue));
        }
        if (report.done.length > 10) {
            lines.push(`  ... and ${report.done.length - 10} more`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=status.js.map