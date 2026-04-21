#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "..");
const SUPABASE_BIN = path.join(ROOT, "node_modules", ".bin", "supabase");
const TIMEOUT_MS = 20000;

function fail(message) {
  console.error(`supabase:migration:new:safe: ${message}`);
  process.exit(1);
}

function parseCreatedPath(output) {
  const match = output.match(/Created new migration at (.+?\.sql)\.?$/m);
  if (!match) return null;
  const relative = match[1].trim();
  if (path.isAbsolute(relative)) return relative;
  return path.join(ROOT, relative);
}

function ensureMigrationName() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    fail("usage: npm run supabase:migration:new -- <migration_name>");
  }

  const migrationName = args[0].trim();
  if (!migrationName) {
    fail("migration name must be non-empty");
  }
  if (!/^[a-z0-9_-]+$/i.test(migrationName)) {
    fail("migration name must use letters, numbers, underscores, or hyphens");
  }
  return migrationName;
}

function main() {
  const migrationName = ensureMigrationName();
  if (!fs.existsSync(SUPABASE_BIN)) {
    fail(`missing local Supabase CLI at ${SUPABASE_BIN}; run npm install`);
  }

  const result = spawnSync(
    SUPABASE_BIN,
    [
      "--agent",
      "no",
      "migration",
      "new",
      migrationName,
      "--yes",
      "--workdir",
      ".",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: "",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output.trim()) {
    process.stdout.write(output);
  }

  const createdPath = parseCreatedPath(output);
  const createdExists = createdPath ? fs.existsSync(createdPath) : false;

  if (result.error && result.error.code === "ETIMEDOUT") {
    if (createdExists) {
      console.warn(
        `supabase:migration:new:safe: command timed out after creating ${path.relative(ROOT, createdPath)}`,
      );
      process.exit(0);
    }
    fail(`timed out after ${TIMEOUT_MS}ms before creating migration file`);
  }

  if (result.status === 0) {
    if (!createdExists) {
      fail("command returned success but migration file path was not found");
    }
    console.log(
      `supabase:migration:new:safe: ok (${path.relative(ROOT, createdPath)})`,
    );
    return;
  }

  if (createdExists) {
    console.warn(
      `supabase:migration:new:safe: treating as success because migration file exists (${path.relative(ROOT, createdPath)})`,
    );
    return;
  }

  const signalInfo = result.signal ? ` (signal ${result.signal})` : "";
  fail(`supabase exited with code ${result.status ?? "unknown"}${signalInfo}`);
}

main();
