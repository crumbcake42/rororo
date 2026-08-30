import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { config as loadEnv } from "dotenv";
function resolveEnvVars(value) {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}
function resolveAfkConfig(raw) {
    return {
        slack_webhook_url: resolveEnvVars(raw.slack_webhook_url ?? ""),
        twilio_sid: resolveEnvVars(raw.twilio_sid ?? ""),
        twilio_token: resolveEnvVars(raw.twilio_token ?? ""),
        twilio_from: resolveEnvVars(raw.twilio_from ?? ""),
        twilio_to: resolveEnvVars(raw.twilio_to ?? ""),
    };
}
export function loadConfig(projectRoot) {
    const root = projectRoot ?? process.cwd();
    const envPath = resolve(root, ".env");
    if (existsSync(envPath)) {
        loadEnv({ path: envPath });
    }
    const configPath = resolve(root, "office.config.yml");
    if (!existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const raw = yaml.load(readFileSync(configPath, "utf-8"));
    const config = {
        project_name: raw.project_name ?? "",
        branch_strategy: raw.branch_strategy ?? "tiered",
        notification_mode: raw.notification_mode ?? "watch",
        afk: resolveAfkConfig(raw.afk ?? {}),
        dispatch_mode: raw.dispatch_mode ?? "manual",
        models: {
            opus: raw.models?.opus ??
                "claude-opus-4-6",
            sonnet: raw.models?.sonnet ??
                "claude-sonnet-4-6",
        },
        role_models: raw.role_models ?? {},
        quality_gates: raw.quality_gates ?? {},
        adversarial: {
            max_rounds: raw.adversarial?.max_rounds ??
                3,
            architect_directives: raw.adversarial
                ?.architect_directives ?? [],
        },
        standup: {
            include_completed: raw.standup
                ?.include_completed ?? true,
            include_in_progress: raw.standup
                ?.include_in_progress ?? true,
            include_blocked: raw.standup
                ?.include_blocked ?? true,
            include_recent_commits: raw.standup
                ?.include_recent_commits ?? true,
            include_pm_flags: raw.standup
                ?.include_pm_flags ?? true,
        },
    };
    return config;
}
export function getBaseBranch(config) {
    return config.branch_strategy === "tiered" ? "dev" : "main";
}
export function getModelForRole(config, role) {
    const override = config.role_models[role];
    if (override) {
        const resolved = config.models[override];
        if (resolved)
            return resolved;
    }
    const opusRoles = ["pm", "architect", "security-reviewer"];
    return opusRoles.includes(role) ? config.models.opus : config.models.sonnet;
}
//# sourceMappingURL=config.js.map