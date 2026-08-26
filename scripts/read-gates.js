import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import yaml from "js-yaml";

const config = yaml.load(readFileSync("office.config.yml", "utf-8"));
const gates = config.quality_gates ?? {};
const output = process.env.GITHUB_OUTPUT;

for (const [key, gate] of Object.entries(gates)) {
  const cmd = gate?.command ?? "";
  appendFileSync(output, `${key}_cmd=${cmd}\n`);
}
