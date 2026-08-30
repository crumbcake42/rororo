import type { OfficeConfig } from "./config.js";
export declare function pause(projectRoot: string): void;
export declare function resume(projectRoot: string): void;
export declare function isDaemonPaused(projectRoot: string): boolean;
export declare function daemonStatus(projectRoot: string): Promise<void>;
export declare function runDaemon(config: OfficeConfig, projectRoot: string, _pollIntervalMs?: number): Promise<void>;
//# sourceMappingURL=daemon.d.ts.map