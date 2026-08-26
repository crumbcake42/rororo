#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { dispatchNext } from "./dispatch.js";
import { getStatus, formatStatus } from "./status.js";
import {
  generateStandup,
  launchInteractiveStandup,
} from "./standup.js";
import { pause, resume, runDaemon } from "./daemon.js";
import { launchCreateSession } from "./create.js";

const program = new Command();
const projectRoot = process.cwd();

program
  .name("office")
  .description("Agent Office — agent-driven software development CLI")
  .version("0.1.0");

program
  .command("dispatch")
  .description(
    "Dispatch the next ready task to an agent pipeline"
  )
  .action(async () => {
    const config = loadConfig(projectRoot);
    const dispatched = await dispatchNext(config, projectRoot);
    if (!dispatched) {
      console.log(
        "No tasks ready for dispatch. Create an issue with status:ready to get started."
      );
    }
  });

program
  .command("create [topic]")
  .description(
    "Create a new issue through an interactive PM session"
  )
  .action(async (topic?: string) => {
    const config = loadConfig(projectRoot);
    await launchCreateSession(config, projectRoot, topic);
  });

program
  .command("status")
  .description("Print current state of all tasks")
  .action(async () => {
    const report = await getStatus();
    console.log(formatStatus(report, projectRoot));
  });

program
  .command("standup")
  .description("Generate a standup report")
  .option("--interactive", "Open a conversational standup with the PM agent")
  .action(async (options: { interactive?: boolean }) => {
    const config = loadConfig(projectRoot);
    const standupData = await generateStandup(config, projectRoot);

    if (options.interactive) {
      launchInteractiveStandup(config, projectRoot, standupData);
    } else {
      console.log(standupData);
    }
  });

program
  .command("pause")
  .description("Pause the daemon dispatch loop")
  .action(() => {
    pause(projectRoot);
  });

program
  .command("resume")
  .description("Resume the daemon dispatch loop")
  .action(() => {
    resume(projectRoot);
  });

program
  .command("start")
  .description("Start the autonomous dispatch daemon")
  .option(
    "--interval <seconds>",
    "Poll interval in seconds",
    "30"
  )
  .action(async (options: { interval: string }) => {
    const config = loadConfig(projectRoot);
    const intervalMs = parseInt(options.interval, 10) * 1000;
    await runDaemon(config, projectRoot, intervalMs);
  });

program
  .command("preset <name>")
  .description(
    "Apply a stack preset (e.g., typescript-node, python)"
  )
  .action((name: string) => {
    const presetPath = resolve(projectRoot, "presets", `${name}.yml`);
    let presetContent: string;
    try {
      presetContent = readFileSync(presetPath, "utf-8");
    } catch {
      console.error(
        `Preset not found: ${name}\nAvailable presets: typescript-node, python`
      );
      process.exit(1);
    }

    const configPath = resolve(projectRoot, "office.config.yml");
    const configContent = readFileSync(configPath, "utf-8");

    const sectionPattern = /^quality_gates:\n(?:[ \t]+.*\n)*/m;
    const match = configContent.match(sectionPattern);

    if (!match) {
      console.error("Could not find quality_gates section in office.config.yml");
      process.exit(1);
    }

    const updated = configContent.replace(sectionPattern, presetContent.trimEnd() + "\n");
    writeFileSync(configPath, updated);
    console.log(`Applied preset: ${name}`);
    console.log("Quality gates updated in office.config.yml");
  });

program.parse();
