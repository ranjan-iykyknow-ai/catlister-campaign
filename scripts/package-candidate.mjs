import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "dist");
const archivePath = path.join(outputDirectory, "technical-interview-starter.tar.gz");
const candidatePaths = [
  ".python-version",
  ".nvmrc",
  ".gitignore",
  "AGENTS.md",
  "Makefile",
  "README.md",
  "package.json",
  "scripts",
  "database",
  "backend",
  "frontend",
];

mkdirSync(outputDirectory, { recursive: true });
rmSync(archivePath, { force: true });

const archive = spawnSync(
  "tar",
  [
    "-czf",
    archivePath,
    "--exclude=backend/.venv",
    "--exclude=backend/.ruff_cache",
    "--exclude=backend/.pytest_cache",
    "--exclude=frontend/node_modules",
    "--exclude=frontend/dist",
    "--exclude=database/app.db",
    "--exclude=__pycache__",
    ...candidatePaths,
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);

if (archive.status !== 0) process.exit(archive.status ?? 1);

const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
if (listing.status !== 0) process.exit(listing.status ?? 1);

const forbidden = listing.stdout
  .split("\n")
  .filter(
    (entry) =>
      entry.includes("interviewer") ||
      entry.includes(".git/") ||
      entry.includes(".claude/") ||
      entry.includes(".ruff_cache/") ||
      entry.includes("node_modules/") ||
      entry.includes("/app.db"),
  );

if (forbidden.length > 0) {
  console.error(`Candidate archive contains internal paths:\n${forbidden.join("\n")}`);
  process.exit(1);
}

console.log(`Created ${archivePath}`);
