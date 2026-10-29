import { spawn } from "node:child_process";

// Live deployment verification: two successful, distinct five-minute cron ticks.
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "tail",
    "--config",
    "workers/pbi-priority/wrangler.jsonc",
    "--format",
    "json",
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
let buffer = "";
const times = new Set();
let verified = false;
const timeout = setTimeout(() => {
  console.error(
    "Two successful cron ticks were not observed within 25 minutes",
  );
  child.kill("SIGTERM");
}, 25 * 60_000);
child.stdout.on("data", (data) => {
  buffer += data.toString();
  let end = buffer.indexOf("\n}");
  while (end !== -1) {
    const record = buffer.slice(buffer.indexOf("{"), end + 2);
    buffer = buffer.slice(end + 2);
    end = buffer.indexOf("\n}");
    const event = JSON.parse(record);
    console.log(JSON.stringify(event));
    if (event.outcome !== "ok") continue;
    for (const log of event.logs ?? []) {
      for (const message of log.message ?? []) {
        const value =
          typeof message === "string"
            ? (() => {
                try {
                  return JSON.parse(message);
                } catch {
                  return null;
                }
              })()
            : message;
        if (
          value?.event === "pbi_priority_synced" &&
          Number.isFinite(value.scheduledTime)
        )
          times.add(value.scheduledTime);
      }
    }
    const sorted = [...times].sort((a, b) => a - b);
    if (
      sorted.some(
        (time, index) => index > 0 && time - sorted[index - 1] === 300_000,
      )
    ) {
      verified = true;
      console.log("Verified: two successful cron ticks five minutes apart");
      child.kill("SIGTERM");
    }
  }
});
child.on("error", (error) => {
  console.error(error.message);
});
child.on("close", () => {
  clearTimeout(timeout);
  process.exitCode = verified ? 0 : 1;
});
