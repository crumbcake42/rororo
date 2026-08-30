import type { OfficeConfig } from "./config.js";

export interface Notification {
  issueNumber: number;
  title: string;
  message: string;
  url: string;
}

export async function notify(
  config: OfficeConfig,
  notification: Notification,
): Promise<void> {
  if (config.notification_mode === "afk") {
    await notifyAfk(config, notification);
  } else {
    notifyWatch(notification);
  }
}

function notifyWatch(notification: Notification): void {
  console.log("\n" + "=".repeat(60));
  console.log(`BLOCKED: #${notification.issueNumber} — ${notification.title}`);
  console.log("-".repeat(60));
  console.log(notification.message);
  console.log(`\nIssue: ${notification.url}`);
  console.log("=".repeat(60) + "\n");
}

async function notifyAfk(
  config: OfficeConfig,
  notification: Notification,
): Promise<void> {
  if (config.afk.slack_webhook_url) {
    await sendSlack(config.afk.slack_webhook_url, notification);
  }

  if (config.afk.twilio_sid && config.afk.twilio_token) {
    await sendSms(config, notification);
  }
}

async function sendSlack(
  webhookUrl: string,
  notification: Notification,
): Promise<void> {
  const payload = {
    text: `*Blocked: #${notification.issueNumber} — ${notification.title}*\n${notification.message}\n<${notification.url}|View Issue>`,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(
      `Slack notification failed: ${response.status} ${response.statusText}`,
    );
  }
}

async function sendSms(
  config: OfficeConfig,
  notification: Notification,
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.afk.twilio_sid}/Messages.json`;
  const body = new URLSearchParams({
    To: config.afk.twilio_to,
    From: config.afk.twilio_from,
    Body: `Agent Office — Blocked: #${notification.issueNumber} ${notification.title}\n${notification.message}\n${notification.url}`,
  });

  const credentials = Buffer.from(
    `${config.afk.twilio_sid}:${config.afk.twilio_token}`,
  ).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    console.error(
      `SMS notification failed: ${response.status} ${response.statusText}`,
    );
  }
}
