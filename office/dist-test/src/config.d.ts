export interface QualityGate {
    description: string;
    command: string;
}
export interface AdversarialConfig {
    max_rounds: number;
    architect_directives: string[];
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
    models: {
        opus: string;
        sonnet: string;
    };
    role_models: Record<string, string>;
    quality_gates: Record<string, QualityGate>;
    adversarial: AdversarialConfig;
    standup: StandupConfig;
}
export declare function loadConfig(projectRoot?: string): OfficeConfig;
export declare function getBaseBranch(config: OfficeConfig): string;
export declare function getModelForRole(config: OfficeConfig, role: string): string;
//# sourceMappingURL=config.d.ts.map