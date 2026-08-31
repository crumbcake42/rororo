#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { dispatchNext } from "./dispatch.js";
import { getStatus, formatStatus } from "./status.js";
import { generateStandup, launchInteractiveStandup } from "./standup.js";
import {
  cancelPipeline,
  daemonStatus,
  pauseDaemon,
  pausePipeline,
  resumeDaemon,
  resumePipeline,
  runDaemon,
} from "./daemon.js";
import { launchCreateSession } from "./create.js";
import { reviewPR } from "./review.js";

const program = new Command();
const projectRoot = process.cwd();

program
  .name("office")
  .description("Agent Office — agent-driven software development CLI")
  .version("0.1.0");

program
  .command("dispatch [issue]")
  .description(
    "Dispatch a ready task to an agent pipeline. Optionally specify an issue number.",
  )
  .option("--priority <level>", "Set priority for this dispatch: high or low")
  .action(async (issue: string | undefined, options: { priority?: string }) => {
    const config = loadConfig(projectRoot);
    if (config.dispatch_mode === "daemon") {
      console.warn(
        "Advisory: dispatch_mode is set to 'daemon' — the daemon should be managing dispatch. Run `office start` instead, or change dispatch_mode to 'manual'.",
      );
    }
    const issueNumber = issue ? parseInt(issue, 10) : undefined;
    if (issue && isNaN(issueNumber!)) {
      console.error(`Invalid issue number: ${issue}`);
      process.exit(1);
    }
    const priority = options.priority as "high" | "low" | undefined;
    if (priority && priority !== "high" && priority !== "low") {
      console.error(`Invalid priority: ${priority}. Use "high" or "low".`);
      process.exit(1);
    }
    if (priority && !issueNumber) {
      console.error(`--priority requires an explicit issue number.`);
      process.exit(1);
    }
    const result = await dispatchNext(
      config,
      projectRoot,
      issueNumber,
      priority,
    );
    if (!result) {
      console.log(
        "No tasks ready for dispatch. Create an issue with status:ready to get started.",
      );
    }
  });

program
  .command("review <pr>")
  .description("Review a PR for semantic correctness using the reviewer agent")
  .option("--comment", "Post findings as a PR comment in addition to printing")
  .action(async (pr: string, options: { comment?: boolean }) => {
    const config = loadConfig(projectRoot);
    const prNumber = parseInt(pr, 10);
    if (isNaN(prNumber)) {
      console.error(`Invalid PR number: ${pr}`);
      process.exit(1);
    }
    try {
      await reviewPR(config, projectRoot, prNumber, {
        comment: options.comment ?? false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Review failed: ${message}`);
      process.exit(1);
    }
  });

program
  .command("create [topic]")
  .description("Create a new issue through an interactive PM session")
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
  .command("pause [issue]")
  .description(
    "Pause the daemon (no args), or signal a running pipeline to pause at the next step boundary (with issue number).",
  )
  .action(async (issue?: string) => {
    if (issue) {
      const issueNumber = parseInt(issue, 10);
      if (isNaN(issueNumber)) {
        console.error(`Invalid issue number: ${issue}`);
        process.exit(1);
      }
      await pausePipeline(projectRoot, issueNumber);
    } else {
      pauseDaemon(projectRoot);
    }
  });

program
  .command("cancel <issue>")
  .description(
    "Signal a running pipeline to cancel gracefully at the next step boundary.",
  )
  .action(async (issue: string) => {
    const issueNumber = parseInt(issue, 10);
    if (isNaN(issueNumber)) {
      console.error(`Invalid issue number: ${issue}`);
      process.exit(1);
    }
    await cancelPipeline(projectRoot, issueNumber);
  });

program
  .command("resume [issue]")
  .description(
    "Resume the daemon (no args), or re-label a paused pipeline issue as status:ready (with issue number).",
  )
  .action(async (issue?: string) => {
    if (issue) {
      const issueNumber = parseInt(issue, 10);
      if (isNaN(issueNumber)) {
        console.error(`Invalid issue number: ${issue}`);
        process.exit(1);
      }
      await resumePipeline(projectRoot, issueNumber);
    } else {
      resumeDaemon(projectRoot);
    }
  });

program
  .command("daemon-status")
  .description("Report current daemon state, uptime, and ready-queue depth")
  .action(async () => {
    await daemonStatus(projectRoot);
  });

program
  .command("start")
  .description("Start the autonomous dispatch daemon")
  .option("--interval <seconds>", "Poll interval in seconds", "30")
  .action(async (options: { interval: string }) => {
    const config = loadConfig(projectRoot);
    if (config.dispatch_mode === "manual") {
      console.warn(
        "Advisory: dispatch_mode is set to 'manual' — the daemon is starting anyway. Change dispatch_mode to 'daemon' in office.config.yml to suppress this warning.",
      );
    }
    const intervalMs = parseInt(options.interval, 10) * 1000;
    await runDaemon(config, projectRoot, intervalMs);
  });

program
  .command("preset <name>")
  .description("Apply a stack preset (e.g., typescript-node, python)")
  .action((name: string) => {
    const presetPath = resolve(projectRoot, "presets", `${name}.yml`);
    let presetContent: string;
    try {
      presetContent = readFileSync(presetPath, "utf-8");
    } catch {
      console.error(
        `Preset not found: ${name}\nAvailable presets: typescript-node, python`,
      );
      process.exit(1);
    }

    const configPath = resolve(projectRoot, "office.config.yml");
    const configContent = readFileSync(configPath, "utf-8");

    const sectionPattern = /^quality_gates:\n(?:[ \t]+.*\n)*/m;
    const match = configContent.match(sectionPattern);

    if (!match) {
      console.error(
        "Could not find quality_gates section in office.config.yml",
      );
      process.exit(1);
    }

    const updated = configContent.replace(
      sectionPattern,
      presetContent.trimEnd() + "\n",
    );
    writeFileSync(configPath, updated);
    console.log(`Applied preset: ${name}`);
    console.log("Quality gates updated in office.config.yml");
  });

program.parse();
