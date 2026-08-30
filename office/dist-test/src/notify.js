export async function notify(config, notification) {
    if (config.notification_mode === "afk") {
        await notifyAfk(config, notification);
    }
    else {
        notifyWatch(notification);
    }
}
function notifyWatch(notification) {
    console.log("\n" + "=".repeat(60));
    console.log(`BLOCKED: #${notification.issueNumber} — ${notification.title}`);
    console.log("-".repeat(60));
    console.log(notification.message);
    console.log(`\nIssue: ${notification.url}`);
    console.log("=".repeat(60) + "\n");
}
async function notifyAfk(config, notification) {
    if (config.afk.slack_webhook_url) {
        await sendSlack(config.afk.slack_webhook_url, notification);
    }
    if (config.afk.twilio_sid && config.afk.twilio_token) {
        await sendSms(config, notification);
    }
}
async function sendSlack(webhookUrl, notification) {
    const payload = {
        text: `*Blocked: #${notification.issueNumber} — ${notification.title}*\n${notification.message}\n<${notification.url}|View Issue>`,
    };
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        console.error(`Slack notification failed: ${response.status} ${response.statusText}`);
    }
}
async function sendSms(config, notification) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.afk.twilio_sid}/Messages.json`;
    const body = new URLSearchParams({
        To: config.afk.twilio_to,
        From: config.afk.twilio_from,
        Body: `Agent Office — Blocked: #${notification.issueNumber} ${notification.title}\n${notification.message}\n${notification.url}`,
    });
    const credentials = Buffer.from(`${config.afk.twilio_sid}:${config.afk.twilio_token}`).toString("base64");
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });
    if (!response.ok) {
        console.error(`SMS notification failed: ${response.status} ${response.statusText}`);
    }
}
//# sourceMappingURL=notify.js.map