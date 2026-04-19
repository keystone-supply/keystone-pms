/**
 * Fail CI when SQL migrations reintroduce known DB schema security drift:
 * 1) explicit public.citext references in object definitions
 * 2) extensions assigned to the public schema
 * 3) citext/vector extension creation without WITH SCHEMA extensions
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const EMPTY_MIGRATION_ALLOWLIST = new Set([
  "20260419023224_project_files_default_enabled.sql",
  "20260419023351_project_files_default_enabled.sql",
  "20260419023902_project_files_default_enabled.sql",
  "20260419024129_project_files_default_enabled.sql",
]);
const DUPLICATE_INTENT_ALLOWLIST = new Set(["project_files_default_enabled"]);

function fail(message) {
  console.error(`security:db-schema-guard: ${message}`);
  process.exit(1);
}

function collectSqlFiles(dir) {
  if (!fs.existsSync(dir)) {
    fail(`missing migrations directory: ${dir}`);
  }

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(dir, name));
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
}

function parseMigrationFilename(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) return null;
  return {
    fileName,
    version: match[1],
    slug: match[2],
  };
}

function extractCreateExtensionStatements(sql) {
  const matches = [];
  const re = /\bcreate\s+extension\b[\s\S]*?;/gi;
  let match;
  while ((match = re.exec(sql)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function hasWithSchemaExtensions(statement) {
  return /\bwith\s+schema\s+extensions\b/i.test(statement);
}

function extensionNameFromStatement(statement) {
  const match = statement.match(
    /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?("?)([a-z0-9_]+)\1/i,
  );
  return match ? match[2].toLowerCase() : null;
}

function main() {
  const files = collectSqlFiles(MIGRATIONS_DIR);
  const violations = [];
  const bySlug = new Map();

  for (const filePath of files) {
    const relPath = path.relative(ROOT, filePath);
    const sql = fs.readFileSync(filePath, "utf8");
    const parsed = parseMigrationFilename(filePath);
    if (parsed) {
      if (!bySlug.has(parsed.slug)) {
        bySlug.set(parsed.slug, []);
      }
      bySlug.get(parsed.slug).push(parsed);
    }

    if (/\bpublic\.citext\b/i.test(sql)) {
      violations.push(`${relPath}: contains forbidden reference "public.citext"`);
    }

    if (/\balter\s+extension\s+[a-z0-9_"]+\s+set\s+schema\s+public\b/i.test(sql)) {
      violations.push(`${relPath}: moves an extension into schema public`);
    }

    if (/\bcreate\s+extension\b[\s\S]*?\bschema\s+public\b/i.test(sql)) {
      violations.push(`${relPath}: creates an extension in schema public`);
    }

    const createExtensionStatements = extractCreateExtensionStatements(sql);
    for (const statement of createExtensionStatements) {
      const extName = extensionNameFromStatement(statement);
      if (!extName) continue;
      if (extName !== "citext" && extName !== "vector") continue;
      if (!hasWithSchemaExtensions(statement)) {
        violations.push(
          `${relPath}: CREATE EXTENSION ${extName} must include "WITH SCHEMA extensions"`,
        );
      }
    }

    const normalizedSql = stripSqlComments(sql);
    const fileName = path.basename(filePath);
    if (normalizedSql.length === 0 && !EMPTY_MIGRATION_ALLOWLIST.has(fileName)) {
      violations.push(
        `${relPath}: empty migration SQL is not allowed (remove, fill, or explicitly allowlist)`,
      );
    }
  }

  for (const [slug, migrations] of bySlug.entries()) {
    if (migrations.length <= 1 || DUPLICATE_INTENT_ALLOWLIST.has(slug)) {
      continue;
    }

    const versions = migrations.map((item) => item.version).sort();
    const burstVersions = [];

    for (let i = 0; i < versions.length - 1; i += 1) {
      const current = Number(versions[i]);
      const next = Number(versions[i + 1]);
      if (Number.isNaN(current) || Number.isNaN(next)) continue;
      if (next - current <= 300) {
        burstVersions.push(versions[i], versions[i + 1]);
      }
    }

    const dedupedBurst = [...new Set(burstVersions)];
    if (dedupedBurst.length > 1) {
      violations.push(
        `supabase/migrations: suspicious duplicate-intent burst for "${slug}" at versions [${dedupedBurst.join(
          ", ",
        )}]`,
      );
    }
  }

  if (violations.length > 0) {
    console.error("security:db-schema-guard: failed");
    for (const violation of violations) {
      console.error(` - ${violation}`);
    }
    process.exit(1);
  }

  console.log("security:db-schema-guard: ok");
}

main();
