import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkForMatchaUpdate } from "./update-matcha.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requestedMinutes = Number(
  process.env.MATCHA_UPDATE_INTERVAL_MINUTES || 30,
);
const intervalMinutes = Number.isFinite(requestedMinutes)
  ? Math.max(5, requestedMinutes)
  : 30;

async function sync({ quiet = false } = {}) {
  try {
    await checkForMatchaUpdate({ quiet });
  } catch (error) {
    console.warn(
      `Matcha update check skipped: ${error.message}. ` +
        "The current local snapshot will still open.",
    );
  }
}

await sync();

const vite = spawn(
  process.execPath,
  [
    path.join(projectRoot, "node_modules/vite/bin/vite.js"),
    "--host",
    "0.0.0.0",
    "--port",
    "3001",
    "--strictPort",
  ],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

const timer = setInterval(
  () => sync({ quiet: true }),
  intervalMinutes * 60 * 1000,
);

function stop(signal) {
  clearInterval(timer);
  if (!vite.killed) vite.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

vite.on("exit", (code, signal) => {
  clearInterval(timer);
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 0;
  }
});
