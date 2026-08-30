import type { OfficeConfig } from "./config.js";
import { type GitHubIssue } from "./github.js";
export interface PipelineStep {
    role: string;
    description: string;
    mode?: string;
    variant?: string;
    instance?: string;
    directive_index?: number;
    rounds?: number;
    blocking?: boolean;
    outputs?: string[];
    inputs?: string[];
}
export interface Pipeline {
    name: string;
    description: string;
    adversarial?: boolean;
    steps: PipelineStep[];
}
export declare function dispatchNext(config: OfficeConfig, projectRoot: string, issueNumber?: number): Promise<boolean>;
export declare function dispatchIssue(config: OfficeConfig, projectRoot: string, issue: GitHubIssue, pipelineName: string): Promise<void>;
//# sourceMappingURL=dispatch.d.ts.map