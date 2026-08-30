import { execSync } from "node:child_process";
import { loadConfig } from "../config.js";
import { getStatus } from "../status.js";
import { listRecentPRs } from "../github.js";
const projectRoot = process.cwd();
try {
    const config = loadConfig(projectRoot);
    const report = await getStatus();
    let recentCommits = [];
    if (config.standup.include_recent_commits) {
        try {
            const output = execSync('git log --oneline --since="24 hours ago" -20', {
                cwd: projectRoot,
                encoding: "utf-8",
            }).trim();
            if (output) {
                recentCommits = output.split("\n");
            }
        }
        catch {
            // No git history
        }
    }
    let recentPRs = [];
    try {
        const prs = await listRecentPRs("all", 10);
        recentPRs = prs.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.merged,
        }));
    }
    catch {
        // GitHub API not available
    }
    const standup = {
        generated_at: new Date().toISOString(),
        completed: report.done.map((i) => ({ number: i.number, title: i.title })),
        in_progress: report.inProgress.map((i) => ({
            number: i.number,
            title: i.title,
        })),
        blocked: {
            human: report.blockedHuman.map((i) => ({
                number: i.number,
                title: i.title,
            })),
            dependency: report.blockedDependency.map((i) => ({
                number: i.number,
                title: i.title,
            })),
            unclassified: report.blockedUnclassified.map((i) => ({
                number: i.number,
                title: i.title,
            })),
        },
        ready_queue: report.ready.map((i) => ({
            number: i.number,
            title: i.title,
        })),
        review: report.review.map((i) => ({ number: i.number, title: i.title })),
        recent_commits: recentCommits,
        recent_prs: recentPRs,
        backlog: report.backlog.map((i) => ({ number: i.number, title: i.title })),
    };
    console.log(JSON.stringify(standup, null, 2));
}
catch (error) {
    console.error(`Failed to generate standup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
//# sourceMappingURL=standup-report.js.map