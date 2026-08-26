import { listAllIssues, listRecentPRs, getStatusLabel, getPipelineLabel } from "../github.js";

try {
  const issues = await listAllIssues();
  const prs = await listRecentPRs("all", 100);

  const blockedCounts = { human: 0, dependency: 0, unclassified: 0 };
  const pipelineCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let totalClosed = 0;
  let totalOpen = 0;

  for (const issue of issues) {
    const status = getStatusLabel(issue);
    const pipeline = getPipelineLabel(issue);

    if (status) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
    if (pipeline) {
      pipelineCounts[pipeline] = (pipelineCounts[pipeline] ?? 0) + 1;
    }
    if (issue.state === "closed") {
      totalClosed++;
    } else {
      totalOpen++;
    }

    if (status === "blocked-human") blockedCounts.human++;
    if (status === "blocked-dependency") blockedCounts.dependency++;
    if (status === "blocked-unclassified") blockedCounts.unclassified++;
  }

  const mergedPRs = prs.filter((pr) => pr.merged);
  const openPRs = prs.filter((pr) => pr.state === "open");
  const closedNotMerged = prs.filter((pr) => pr.state === "closed" && !pr.merged);

  const metrics = {
    generated_at: new Date().toISOString(),
    issue_totals: {
      open: totalOpen,
      closed: totalClosed,
      total: issues.length,
    },
    status_distribution: statusCounts,
    pipeline_distribution: pipelineCounts,
    blocked_rates: {
      total_blocked: blockedCounts.human + blockedCounts.dependency + blockedCounts.unclassified,
      by_category: blockedCounts,
      blocked_percentage: issues.length > 0
        ? Math.round(
            ((blockedCounts.human + blockedCounts.dependency + blockedCounts.unclassified) /
              issues.length) *
              100
          )
        : 0,
    },
    pr_stats: {
      total: prs.length,
      merged: mergedPRs.length,
      open: openPRs.length,
      closed_not_merged: closedNotMerged.length,
    },
  };

  console.log(JSON.stringify(metrics, null, 2));
} catch (error) {
  console.error(
    `Failed to compute retro metrics: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
