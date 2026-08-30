import { setLabels } from "../github.js";
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: set-labels <issue-number> <add-labels> [remove-labels]");
    console.error("  Labels are comma-separated. Use empty string for none.");
    process.exit(1);
}
const issueNumber = parseInt(args[0], 10);
if (isNaN(issueNumber)) {
    console.error("Issue number must be a valid integer.");
    process.exit(1);
}
const labelsToAdd = args[1]
    ? args[1]
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
const labelsToRemove = args[2]
    ? args[2]
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
try {
    await setLabels(issueNumber, labelsToAdd, labelsToRemove);
    console.log(JSON.stringify({
        issue: issueNumber,
        added: labelsToAdd,
        removed: labelsToRemove,
    }));
}
catch (error) {
    console.error(`Failed to set labels: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
//# sourceMappingURL=set-labels.js.map