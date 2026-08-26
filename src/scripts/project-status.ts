import { getStatus } from "../status.js";

try {
  const report = await getStatus();
  const summary = {
    counts: {
      ready: report.ready.length,
      in_progress: report.inProgress.length,
      review: report.review.length,
      blocked_human: report.blockedHuman.length,
      blocked_dependency: report.blockedDependency.length,
      blocked_unclassified: report.blockedUnclassified.length,
      done: report.done.length,
      backlog: report.backlog.length,
    },
    issues: {
      ready: report.ready.map((i) => ({ number: i.number, title: i.title })),
      in_progress: report.inProgress.map((i) => ({ number: i.number, title: i.title })),
      review: report.review.map((i) => ({ number: i.number, title: i.title })),
      blocked_human: report.blockedHuman.map((i) => ({ number: i.number, title: i.title })),
      blocked_dependency: report.blockedDependency.map((i) => ({ number: i.number, title: i.title })),
      blocked_unclassified: report.blockedUnclassified.map((i) => ({ number: i.number, title: i.title })),
      done: report.done.map((i) => ({ number: i.number, title: i.title })),
      backlog: report.backlog.map((i) => ({ number: i.number, title: i.title })),
    },
  };
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(
    `Failed to get status: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
