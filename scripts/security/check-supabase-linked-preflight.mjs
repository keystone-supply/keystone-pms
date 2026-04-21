#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "..");
const SUPABASE_BIN = path.join(ROOT, "node_modules", ".bin", "supabase");
const PROJECT_REF_FILE = path.join(ROOT, "supabase", ".temp", "project-ref");
const AUTH_TIMEOUT_MS = 20000;

function fail(message) {
  console.error(`supabase:linked-preflight: ${message}`);
  process.exit(1);
}

function readLinkedProjectRef() {
  if (!fs.existsSync(PROJECT_REF_FILE)) {
    fail(
      `missing ${path.relative(ROOT, PROJECT_REF_FILE)}. Run supabase link for this repo first.`,
    );
  }

  const projectRef = fs.readFileSync(PROJECT_REF_FILE, "utf8").trim();
  if (!/^[a-z0-9]{20}$/i.test(projectRef)) {
    fail(
      `invalid linked project ref in ${path.relative(ROOT, PROJECT_REF_FILE)}: "${projectRef}"`,
    );
  }
  return projectRef;
}

function verifyAuth(projectRef) {
  const result = spawnSync(
    SUPABASE_BIN,
    ["--agent", "no", "projects", "list", "--output", "json", "--workdir", "."],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: "",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: AUTH_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.error && result.error.code === "ETIMEDOUT") {
    fail(
      `Supabase auth check timed out after ${AUTH_TIMEOUT_MS}ms. Re-run with ./node_modules/.bin/supabase --debug projects list --output json`,
    );
  }

  if (result.status !== 0) {
    const suffix = output ? `\n${output}` : "";
    fail(
      `unable to access Supabase management API. Re-run supabase login and supabase link (project ${projectRef}).${suffix}`,
    );
  }

  try {
    const parsed = JSON.parse(result.stdout || "[]");
    if (!Array.isArray(parsed)) {
      fail("unexpected projects list output format; expected JSON array");
    }
  } catch {
    fail("unable to parse JSON output from supabase projects list");
  }
}

function main() {
  if (!fs.existsSync(SUPABASE_BIN)) {
    fail(`missing local Supabase CLI at ${SUPABASE_BIN}; run npm install`);
  }

  const projectRef = readLinkedProjectRef();
  verifyAuth(projectRef);
  console.log(`supabase:linked-preflight: ok (project ${projectRef})`);
}

main();
