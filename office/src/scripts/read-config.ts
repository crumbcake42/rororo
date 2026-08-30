import { loadConfig } from "../config.js";

const args = process.argv.slice(2);
const projectRoot = process.cwd();

try {
  const config = loadConfig(projectRoot);

  if (args.length > 0) {
    const key = args[0];
    const value = key.split(".").reduce<unknown>((obj, k) => {
      if (obj && typeof obj === "object") {
        return (obj as Record<string, unknown>)[k];
      }
      return undefined;
    }, config);

    if (value === undefined) {
      console.error(`Config key not found: ${key}`);
      process.exit(1);
    }
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
} catch (error) {
  console.error(
    `Failed to read config: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
