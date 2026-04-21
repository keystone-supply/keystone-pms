#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIN_VERSION = "2.81.3";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "..");
const LOCAL_SUPABASE_BIN = path.join(ROOT, "node_modules", ".bin", "supabase");

function parseSemver(input) {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function fail(message) {
  console.error(`supabase:preflight: ${message}`);
  process.exit(1);
}

function main() {
  let output = "";
  if (!fs.existsSync(LOCAL_SUPABASE_BIN)) {
    fail(`missing local Supabase CLI at ${LOCAL_SUPABASE_BIN}; run npm install`);
  }

  try {
    output = execFileSync(LOCAL_SUPABASE_BIN, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail(`unable to run \`${LOCAL_SUPABASE_BIN} --version\``);
  }

  const current = parseSemver(output);
  const minimum = parseSemver(MIN_VERSION);
  if (!current || !minimum) {
    fail(`unable to parse Supabase CLI version from output: "${output}"`);
  }

  if (compareSemver(current, minimum) < 0) {
    fail(`Supabase CLI ${output} is below required minimum ${MIN_VERSION}`);
  }

  console.log(`supabase:preflight: ok (version ${output}, minimum ${MIN_VERSION})`);
}

main();
