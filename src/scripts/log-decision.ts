import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { addComment, setLabels } from "../github.js";

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error("Usage: log-decision <adr-number> <title> <context> <decision> [consequences] [issue-number]");
  process.exit(1);
}

const [adrNumber, title, context, decision, consequences, issueNumberArg] = args;
const projectRoot = process.cwd();

try {
  const decisionsPath = resolve(projectRoot, "DECISIONS.md");
  let existing = "";
  if (existsSync(decisionsPath)) {
    existing = readFileSync(decisionsPath, "utf-8");
  }

  const date = new Date().toISOString().split("T")[0];
  const entry = [
    "",
    `## ADR-${adrNumber}: ${title}`,
    "",
    `**Date:** ${date}`,
    `**Status:** accepted`,
    `**Context:** ${context}`,
    `**Decision:** ${decision}`,
    `**Consequences:** ${consequences ?? "To be determined based on implementation."}`,
    "",
  ].join("\n");

  writeFileSync(decisionsPath, existing.trimEnd() + "\n" + entry, "utf-8");

  const result: Record<string, unknown> = {
    adr: `ADR-${adrNumber}`,
    title,
    logged: true,
  };

  if (issueNumberArg) {
    const issueNumber = parseInt(issueNumberArg, 10);
    if (!isNaN(issueNumber)) {
      await addComment(
        issueNumber,
        `Architecture decision logged as ADR-${adrNumber}: ${title}\n\nSee DECISIONS.md for full details.`
      );
      await setLabels(issueNumber, [], ["status:blocked-human"]);
      result.issue_updated = issueNumber;
    }
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    `Failed to log decision: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
