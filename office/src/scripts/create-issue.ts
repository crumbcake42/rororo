import { createIssue } from "../github.js";

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: create-issue <title> <body> [label1,label2,...]");
  process.exit(1);
}

const [title, body, labelsArg] = args;
const labels = labelsArg ? labelsArg.split(",").map((l) => l.trim()) : [];

try {
  const issue = await createIssue(title, body, labels);
  console.log(
    JSON.stringify({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      labels: issue.labels,
    }),
  );
} catch (error) {
  console.error(
    `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
