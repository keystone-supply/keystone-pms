# Blocked dependency check

`check-blocked-packages.mjs` reads `package-lock.json` and exits with code `1` if any package in the `BLOCKED` list is present at a blocked version.

## Local run

```bash
npm run security:blocked-deps
```

## Verify fail-fast (optional)

Temporarily add a `{ name, version }` entry to `BLOCKED` that matches something in your lockfile (e.g. a devDependency you know the exact version of), run the script, confirm it exits `1`, then revert the change.

Or copy `check-blocked-packages.mjs` and `package-lock.json` to a temp directory, set a package entry to a blocked version in the copy, run `node scripts/security/check-blocked-packages.mjs` from that directory, and confirm exit code `1`.

## CI

Runs on pushes/PRs that touch `package.json`, `package-lock.json`, or this script (see `.github/workflows/dependency-guard.yml`).
