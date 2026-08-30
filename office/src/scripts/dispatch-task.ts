import { loadConfig } from "../config.js";
import { dispatchIssue } from "../dispatch.js";
import { getIssue, getPipelineLabel } from "../github.js";

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error("Usage: dispatch-task <issue-number>");
  process.exit(1);
}

const issueNumber = parseInt(args[0], 10);
if (isNaN(issueNumber)) {
  console.error("Issue number must be a valid integer.");
  process.exit(1);
}

const projectRoot = process.cwd();

try {
  const config = loadConfig(projectRoot);
  const issue = await getIssue(issueNumber);
  const pipelineName = getPipelineLabel(issue);

  if (!pipelineName) {
    console.error(`Issue #${issueNumber} has no pipeline label.`);
    process.exit(1);
  }

  await dispatchIssue(config, projectRoot, issue, pipelineName);
  console.log(
    JSON.stringify({
      dispatched: true,
      issue: issueNumber,
      pipeline: pipelineName,
    }),
  );
} catch (error) {
  console.error(
    `Dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
