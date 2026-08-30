import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { config as loadEnv } from "dotenv";

export interface QualityGate {
  description: string;
  command: string;
}

export interface AdversarialConfig {
  max_rounds: number;
  architect_directives: string[];
}

export interface DispatchConfig {
  agent_idle_timeout: number;
  agent_max_timeout: number;
}

export interface AfkConfig {
  slack_webhook_url: string;
  twilio_sid: string;
  twilio_token: string;
  twilio_from: string;
  twilio_to: string;
}

export interface StandupConfig {
  include_completed: boolean;
  include_in_progress: boolean;
  include_blocked: boolean;
  include_recent_commits: boolean;
  include_pm_flags: boolean;
}

export interface OfficeConfig {
  project_name: string;
  branch_strategy: "tiered" | "simple";
  notification_mode: "watch" | "afk";
  afk: AfkConfig;
  dispatch_mode: "manual" | "daemon";
  dispatch: DispatchConfig;
  models: {
    opus: string;
    sonnet: string;
  };
  role_models: Record<string, string>;
  quality_gates: Record<string, QualityGate>;
  adversarial: AdversarialConfig;
  standup: StandupConfig;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function resolveAfkConfig(raw: Record<string, string>): AfkConfig {
  return {
    slack_webhook_url: resolveEnvVars(raw.slack_webhook_url ?? ""),
    twilio_sid: resolveEnvVars(raw.twilio_sid ?? ""),
    twilio_token: resolveEnvVars(raw.twilio_token ?? ""),
    twilio_from: resolveEnvVars(raw.twilio_from ?? ""),
    twilio_to: resolveEnvVars(raw.twilio_to ?? ""),
  };
}

export function loadConfig(projectRoot?: string): OfficeConfig {
  const root = projectRoot ?? process.cwd();

  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
  }

  const configPath = resolve(root, "office.config.yml");
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = yaml.load(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const config: OfficeConfig = {
    project_name: (raw.project_name as string) ?? "",
    branch_strategy: (raw.branch_strategy as "tiered" | "simple") ?? "tiered",
    notification_mode: (raw.notification_mode as "watch" | "afk") ?? "watch",
    afk: resolveAfkConfig((raw.afk as Record<string, string>) ?? {}),
    dispatch_mode: (raw.dispatch_mode as "manual" | "daemon") ?? "manual",
    dispatch: {
      agent_idle_timeout:
        ((raw.dispatch as Record<string, unknown>)
          ?.agent_idle_timeout as number) ?? 300,
      agent_max_timeout:
        ((raw.dispatch as Record<string, unknown>)
          ?.agent_max_timeout as number) ?? 3600,
    },
    models: {
      opus:
        ((raw.models as Record<string, string>)?.opus as string) ??
        "claude-opus-4-6",
      sonnet:
        ((raw.models as Record<string, string>)?.sonnet as string) ??
        "claude-sonnet-4-6",
    },
    role_models: (raw.role_models as Record<string, string>) ?? {},
    quality_gates: (raw.quality_gates as Record<string, QualityGate>) ?? {},
    adversarial: {
      max_rounds:
        ((raw.adversarial as Record<string, unknown>)?.max_rounds as number) ??
        3,
      architect_directives:
        ((raw.adversarial as Record<string, unknown>)
          ?.architect_directives as string[]) ?? [],
    },
    standup: {
      include_completed:
        ((raw.standup as Record<string, unknown>)
          ?.include_completed as boolean) ?? true,
      include_in_progress:
        ((raw.standup as Record<string, unknown>)
          ?.include_in_progress as boolean) ?? true,
      include_blocked:
        ((raw.standup as Record<string, unknown>)
          ?.include_blocked as boolean) ?? true,
      include_recent_commits:
        ((raw.standup as Record<string, unknown>)
          ?.include_recent_commits as boolean) ?? true,
      include_pm_flags:
        ((raw.standup as Record<string, unknown>)
          ?.include_pm_flags as boolean) ?? true,
    },
  };

  return config;
}

export function getBaseBranch(config: OfficeConfig): string {
  return config.branch_strategy === "tiered" ? "dev" : "main";
}

export function getModelForRole(config: OfficeConfig, role: string): string {
  const override = config.role_models[role];
  if (override) {
    const resolved = config.models[override as keyof typeof config.models];
    if (resolved) return resolved;
  }
  const opusRoles = ["pm", "architect", "security-reviewer"];
  return opusRoles.includes(role) ? config.models.opus : config.models.sonnet;
}
