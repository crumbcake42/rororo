import type { OfficeConfig } from "./config.js";
export interface Notification {
    issueNumber: number;
    title: string;
    message: string;
    url: string;
}
export declare function notify(config: OfficeConfig, notification: Notification): Promise<void>;
//# sourceMappingURL=notify.d.ts.map