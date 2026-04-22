import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  __resetOneDriveRefreshTokenCaptureForTests,
  captureOneDriveRefreshTokenOnce,
} from "@/lib/auth/oneDriveRefreshTokenCapture";

afterEach(() => {
  __resetOneDriveRefreshTokenCaptureForTests();
});

test("returns disabled when capture key is not configured", () => {
  const result = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "",
    providedCaptureKey: "abc",
    token: {
      authProvider: "azure-ad",
      refreshToken: "refresh-token",
    },
    nowMs: () => 1000,
  });

  assert.equal(result.kind, "disabled");
});

test("rejects wrong capture key", () => {
  const result = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "expected-key",
    providedCaptureKey: "wrong-key",
    token: {
      authProvider: "azure-ad",
      refreshToken: "refresh-token",
    },
    nowMs: () => 1000,
  });

  assert.equal(result.kind, "forbidden");
});

test("requires Azure AD session and refresh token", () => {
  const wrongProvider = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "expected-key",
    providedCaptureKey: "expected-key",
    token: {
      authProvider: "credentials",
      refreshToken: "refresh-token",
    },
    nowMs: () => 1000,
  });
  assert.equal(wrongProvider.kind, "wrong_provider");

  const missingRefreshToken = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "expected-key",
    providedCaptureKey: "expected-key",
    token: {
      authProvider: "azure-ad",
      refreshToken: undefined,
    },
    nowMs: () => 1000,
  });
  assert.equal(missingRefreshToken.kind, "missing_refresh_token");
});

test("allows one successful capture then locks", () => {
  const first = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "expected-key",
    providedCaptureKey: "expected-key",
    token: {
      authProvider: "azure-ad",
      refreshToken: "refresh-token",
    },
    nowMs: () => 1000,
  });
  assert.equal(first.kind, "ok");
  if (first.kind !== "ok") {
    throw new Error("expected ok result");
  }
  assert.equal(first.refreshToken, "refresh-token");

  const second = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: "expected-key",
    providedCaptureKey: "expected-key",
    token: {
      authProvider: "azure-ad",
      refreshToken: "refresh-token",
    },
    nowMs: () => 2000,
  });
  assert.equal(second.kind, "already_used");
});
