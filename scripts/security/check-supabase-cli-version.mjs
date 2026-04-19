#!/usr/bin/env node
import { execSync } from "node:child_process";

const MIN_VERSION = "2.81.3";

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
  try {
    output = execSync("npx supabase --version", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail("unable to run `npx supabase --version`");
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
