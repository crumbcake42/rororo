import { readFileSync, appendFileSync } from "node:fs";
import yaml from "js-yaml";

const config = yaml.load(readFileSync("office.config.yml", "utf-8")) as Record<
  string,
  unknown
>;

const templateGates = (config.template_gates ?? {}) as Record<
  string,
  { command?: string }
>;
const projectGates = (config.project_gates ?? {}) as Record<
  string,
  { command?: string }
>;

const output = process.env.GITHUB_OUTPUT;

if (!output) {
  console.error("GITHUB_OUTPUT not set");
  process.exit(1);
}

for (const [key, gate] of Object.entries(templateGates)) {
  const cmd = gate?.command ?? "";
  appendFileSync(output, `template_${key}_cmd=${cmd}\n`);
}

for (const [key, gate] of Object.entries(projectGates)) {
  const cmd = gate?.command ?? "";
  appendFileSync(output, `project_${key}_cmd=${cmd}\n`);
}
