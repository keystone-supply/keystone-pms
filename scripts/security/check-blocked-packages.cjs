/**
 * Fail the build if package-lock.json resolves any blocked package@version.
 * Keep BLOCKED in sync with security advisories (e.g. compromised npm publishes).
 */
const fs = require("fs");
const path = require("path");

/** @type {{ name: string; version: string; reason?: string }[]} */
const BLOCKED = [
  {
    name: "axios",
    version: "1.14.1",
    reason:
      "compromised publish — see axios security deprecation workflow; use 1.13.6+ safe line per upstream guidance",
  },
];

const ROOT = path.join(__dirname, "..", "..");
const LOCK = path.join(ROOT, "package-lock.json");

function packageNameFromLockKey(key) {
  const marker = "node_modules/";
  const idx = key.lastIndexOf(marker);
  if (idx === -1) return null;
  return key.slice(idx + marker.length);
}

function loadLockPackages() {
  if (!fs.existsSync(LOCK)) {
    console.error(`security:blocked-deps: missing ${LOCK}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(LOCK, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("security:blocked-deps: invalid JSON in package-lock.json");
    process.exit(1);
  }
  if (!data.packages || typeof data.packages !== "object") {
    console.error(
      "security:blocked-deps: expected lockfileVersion 2/3 with packages field",
    );
    process.exit(1);
  }
  return data.packages;
}

function collectResolvedVersions(packages) {
  /** @type {Map<string, Set<string>>} */
  const byName = new Map();
  for (const key of Object.keys(packages)) {
    if (key === "") continue;
    const entry = packages[key];
    if (!entry || typeof entry.version !== "string") continue;
    const name = packageNameFromLockKey(key);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(entry.version);
  }
  return byName;
}

function main() {
  const packages = loadLockPackages();
  const resolved = collectResolvedVersions(packages);
  let failed = false;

  for (const rule of BLOCKED) {
    const versions = resolved.get(rule.name);
    if (!versions) continue;
    if (versions.has(rule.version)) {
      failed = true;
      const msg = rule.reason ? ` (${rule.reason})` : "";
      console.error(
        `security:blocked-deps: BLOCKED ${rule.name}@${rule.version} found in package-lock.json${msg}`,
      );
    }
  }

  if (failed) {
    console.error(
      "security:blocked-deps: remove blocked versions and regenerate package-lock.json",
    );
    process.exit(1);
  }
  console.log("security:blocked-deps: ok");
}

main();
