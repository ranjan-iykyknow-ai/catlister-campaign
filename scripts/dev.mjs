import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const database = spawnSync("uv", ["run", "python", "-m", "app.db"], {
  cwd: path.join(repositoryRoot, "backend"),
  stdio: "inherit",
});

if (database.status !== 0) process.exit(database.status ?? 1);

const processes = [
  spawn("uv", ["run", "uvicorn", "app.main:app", "--reload", "--port", "8000"], {
    cwd: path.join(repositoryRoot, "backend"),
    stdio: "inherit",
  }),
  spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
    cwd: path.join(repositoryRoot, "frontend"),
    stdio: "inherit",
  }),
];

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shutdown("SIGTERM");
      process.exitCode = signal ? 1 : (code ?? 1);
    }
  });
}
