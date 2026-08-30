# Wishlist

Future improvements that aren't on the roadmap yet. Items here are ideas, not commitments.

## Event-driven daemon
Replace the daemon's hibernation polling with a fully event-driven wake mechanism. The daemon would stop entirely when the queue is empty and resume only when a GitHub event (webhook, repository dispatch) signals that a task has become ready — either a human answered a blocking question or a dependency merged. Requires a local webhook receiver or moving the daemon to infrastructure that can receive GitHub webhook POST requests natively (CI runner, cloud host). Blocked by the networking complexity of local-to-GitHub notification paths.
