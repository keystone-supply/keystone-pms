import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import type { NextRequest } from "next/server";

import {
  __resetServiceAccountTokenCacheForTests,
  resolveOneDriveAccessToken,
} from "@/lib/auth/oneDriveAccessToken";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  __resetServiceAccountTokenCacheForTests();
});

test("falls back to request token when service account is not configured", async () => {
  delete process.env.ONEDRIVE_SERVICE_REFRESH_TOKEN;
  delete process.env.ONEDRIVE_SERVICE_CLIENT_ID;
  delete process.env.ONEDRIVE_SERVICE_CLIENT_SECRET;
  delete process.env.ONEDRIVE_SERVICE_TENANT_ID;

  const token = await resolveOneDriveAccessToken({} as NextRequest, {
    getRequestAccessToken: async () => "request-token",
    fetchImpl: async () => {
      throw new Error("service fetch should not be called");
    },
  });

  assert.equal(token, "request-token");
});

test("uses dedicated service account token when configured", async () => {
  process.env.ONEDRIVE_SERVICE_REFRESH_TOKEN = "refresh-token";
  process.env.ONEDRIVE_SERVICE_CLIENT_ID = "client-id";
  process.env.ONEDRIVE_SERVICE_CLIENT_SECRET = "client-secret";
  process.env.ONEDRIVE_SERVICE_TENANT_ID = "tenant-id";

  let fetchCalls = 0;
  const token = await resolveOneDriveAccessToken({} as NextRequest, {
    getRequestAccessToken: async () => "request-token",
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          access_token: "service-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(token, "service-token");
});

test("falls back to request token when service account refresh fails", async () => {
  process.env.ONEDRIVE_SERVICE_REFRESH_TOKEN = "refresh-token";
  process.env.ONEDRIVE_SERVICE_CLIENT_ID = "client-id";
  process.env.ONEDRIVE_SERVICE_CLIENT_SECRET = "client-secret";
  process.env.ONEDRIVE_SERVICE_TENANT_ID = "tenant-id";

  const token = await resolveOneDriveAccessToken({} as NextRequest, {
    getRequestAccessToken: async () => "request-token",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
  });

  assert.equal(token, "request-token");
});

test("caches service access token until near expiry", async () => {
  process.env.ONEDRIVE_SERVICE_REFRESH_TOKEN = "refresh-token";
  process.env.ONEDRIVE_SERVICE_CLIENT_ID = "client-id";
  process.env.ONEDRIVE_SERVICE_CLIENT_SECRET = "client-secret";
  process.env.ONEDRIVE_SERVICE_TENANT_ID = "tenant-id";

  let now = 0;
  let fetchCalls = 0;

  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        access_token: `service-token-${fetchCalls}`,
        expires_in: 3600,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const first = await resolveOneDriveAccessToken({} as NextRequest, {
    getRequestAccessToken: async () => "request-token",
    fetchImpl,
    nowMs: () => now,
  });

  now = 1000;
  const second = await resolveOneDriveAccessToken({} as NextRequest, {
    getRequestAccessToken: async () => "request-token",
    fetchImpl,
    nowMs: () => now,
  });

  assert.equal(first, "service-token-1");
  assert.equal(second, "service-token-1");
  assert.equal(fetchCalls, 1);
});
