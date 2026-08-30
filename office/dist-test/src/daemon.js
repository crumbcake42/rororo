import yaml from "js-yaml";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchNext } from "./dispatch.js";
import { listIssuesByLabel } from "./github.js";
import { notify } from "./notify.js";
const STATE_FILE = ".office-daemon-state.json";
const DEFAULT_HIBERNATION_INTERVAL_S = 300;
function statePath(projectRoot) {
    return resolve(projectRoot, STATE_FILE);
}
function loadState(projectRoot) {
    const path = statePath(projectRoot);
    if (existsSync(path)) {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        return {
            status: raw.status ?? "active",
            startedAt: raw.startedAt ?? new Date().toISOString(),
            lastDispatch: raw.lastDispatch ?? null,
            tasksDispatched: raw.tasksDispatched ?? 0,
        };
    }
    return {
        status: "active",
        startedAt: new Date().toISOString(),
        lastDispatch: null,
        tasksDispatched: 0,
    };
}
function saveState(projectRoot, state) {
    writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2));
}
function readHibernationIntervalMs(projectRoot) {
    const configPath = resolve(projectRoot, "office.config.yml");
    if (!existsSync(configPath))
        return DEFAULT_HIBERNATION_INTERVAL_S * 1000;
    const raw = yaml.load(readFileSync(configPath, "utf-8"));
    const daemonCfg = raw?.daemon;
    return ((daemonCfg?.hibernation_interval ?? DEFAULT_HIBERNATION_INTERVAL_S) * 1000);
}
async function notifyDaemon(config, message) {
    if (config.notification_mode === "afk") {
        await notify(config, {
            issueNumber: 0,
            title: "Agent Office Daemon",
            message,
            url: "",
        });
    }
    else {
        console.log(`[daemon] ${message}`);
    }
}
export function pause(projectRoot) {
    const state = loadState(projectRoot);
    state.status = "paused";
    saveState(projectRoot, state);
    console.log("Daemon paused.");
}
export function resume(projectRoot) {
    const state = loadState(projectRoot);
    state.status = "active";
    saveState(projectRoot, state);
    console.log("Daemon resumed — will check for ready tasks immediately.");
}
export function isDaemonPaused(projectRoot) {
    return loadState(projectRoot).status === "paused";
}
export async function daemonStatus(projectRoot) {
    const state = loadState(projectRoot);
    const uptimeMs = Date.now() - new Date(state.startedAt).getTime();
    const uptimeStr = formatUptime(uptimeMs);
    const lastDispatch = state.lastDispatch
        ? new Date(state.lastDispatch).toLocaleString()
        : "never";
    let queueDepth = "unknown";
    try {
        const readyIssues = await listIssuesByLabel("status:ready");
        queueDepth = String(readyIssues.length);
    }
    catch {
        // Non-fatal — GitHub may be unavailable
    }
    console.log(`State:            ${state.status}`);
    console.log(`Uptime:           ${uptimeStr}`);
    console.log(`Tasks dispatched: ${state.tasksDispatched}`);
    console.log(`Last dispatch:    ${lastDispatch}`);
    console.log(`Ready queue:      ${queueDepth} tasks`);
}
export async function runDaemon(config, projectRoot, _pollIntervalMs = 30_000) {
    const hibernationIntervalMs = readHibernationIntervalMs(projectRoot);
    console.log("Agent Office daemon starting...");
    console.log(`Hibernation interval: ${hibernationIntervalMs / 1000}s`);
    console.log("Press Ctrl+C to stop.\n");
    saveState(projectRoot, {
        status: "active",
        startedAt: new Date().toISOString(),
        lastDispatch: null,
        tasksDispatched: 0,
    });
    await notifyDaemon(config, "Daemon started.");
    const shutdown = () => {
        console.log("\nDaemon shutting down.");
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    let prevStatus = "active";
    while (true) {
        const state = loadState(projectRoot);
        if (state.status === "paused") {
            if (prevStatus !== "paused") {
                await notifyDaemon(config, "Daemon paused.");
            }
            prevStatus = "paused";
            await sleep(5_000);
            continue;
        }
        if (prevStatus === "paused") {
            await notifyDaemon(config, "Daemon resumed — checking for ready tasks.");
        }
        prevStatus = state.status;
        let dispatched = false;
        try {
            dispatched = await dispatchNext(config, projectRoot);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Dispatch error: ${message}`);
            await notifyDaemon(config, `Dispatch error: ${message}`);
        }
        if (dispatched) {
            state.tasksDispatched++;
            state.lastDispatch = new Date().toISOString();
            if (state.status === "hibernation") {
                state.status = "active";
                console.log("Task found — transitioning to active.");
            }
            saveState(projectRoot, state);
            prevStatus = state.status;
            continue;
        }
        // Queue is empty
        if (state.status === "active") {
            state.status = "hibernation";
            saveState(projectRoot, state);
            await notifyDaemon(config, `Queue empty — hibernating. Polling every ${hibernationIntervalMs / 1000}s.`);
            prevStatus = "hibernation";
        }
        await sleep(hibernationIntervalMs);
    }
}
function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
        return `${hours}h ${minutes}m`;
    if (minutes > 0)
        return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=daemon.js.map