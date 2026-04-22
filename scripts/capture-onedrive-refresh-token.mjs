#!/usr/bin/env node

/**
 * One-time helper to read the Microsoft refresh token from a signed-in admin session.
 *
 * Usage:
 *   ONEDRIVE_REFRESH_CAPTURE_KEY=... \
 *   NEXTAUTH_SESSION_COOKIE='next-auth.session-token=...' \
 *   node scripts/capture-onedrive-refresh-token.mjs
 */

const endpoint =
  process.env.ONEDRIVE_REFRESH_CAPTURE_URL ??
  "http://127.0.0.1:3000/api/auth/onedrive-service-refresh-token-once";
const captureKey = process.env.ONEDRIVE_REFRESH_CAPTURE_KEY ?? "";
const cookie = process.env.NEXTAUTH_SESSION_COOKIE ?? "";

if (!captureKey || !cookie) {
  console.error(
    "Missing required env vars. Set ONEDRIVE_REFRESH_CAPTURE_KEY and NEXTAUTH_SESSION_COOKIE.",
  );
  process.exit(1);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "x-onedrive-capture-key": captureKey,
    cookie,
  },
});

const payload = await response
  .json()
  .catch(() => ({ error: "Endpoint returned non-JSON response." }));

if (!response.ok) {
  console.error(`Capture failed (${response.status}): ${payload.error ?? "unknown error"}`);
  process.exit(1);
}

if (!payload.refreshToken) {
  console.error("Capture succeeded but no refresh token was returned.");
  process.exit(1);
}

console.log("OneDrive refresh token captured successfully.\n");
console.log(`ONEDRIVE_SERVICE_REFRESH_TOKEN=${payload.refreshToken}`);
console.log(
  "\nNext: save this value securely, unset ONEDRIVE_REFRESH_CAPTURE_KEY, then restart the app.",
);
