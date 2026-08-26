import { listIssuesByLabel, getPipelineLabel } from "../github.js";

try {
  const issues = await listIssuesByLabel("status:ready");
  const result = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    pipeline: getPipelineLabel(issue),
    labels: issue.labels,
    url: issue.html_url,
    created_at: issue.created_at,
  }));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    `Failed to list ready issues: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
