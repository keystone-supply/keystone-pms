import type { NextRequest } from "next/server";

import { getGraphAccessToken } from "@/lib/auth/apiAccessToken";

const GRAPH_SCOPE = "openid profile email offline_access Files.ReadWrite.All";
const SERVICE_TOKEN_REFRESH_BUFFER_MS = 60_000;

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type CachedToken = {
  value: string;
  expiresAtMs: number;
};

type ResolveOneDriveAccessTokenOptions = {
  getRequestAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
};

let cachedServiceToken: CachedToken | null = null;

function readServiceAccountConfig() {
  const refreshToken = process.env.ONEDRIVE_SERVICE_REFRESH_TOKEN;
  const clientId =
    process.env.ONEDRIVE_SERVICE_CLIENT_ID ?? process.env.AZURE_AD_CLIENT_ID;
  const clientSecret =
    process.env.ONEDRIVE_SERVICE_CLIENT_SECRET ??
    process.env.AZURE_AD_CLIENT_SECRET;
  const tenantId =
    process.env.ONEDRIVE_SERVICE_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;

  if (!refreshToken || !clientId || !clientSecret || !tenantId) {
    return null;
  }

  return {
    refreshToken,
    clientId,
    clientSecret,
    tenantId,
  };
}

async function refreshServiceAccountAccessToken(
  fetchImpl: typeof fetch,
  nowMs: () => number,
): Promise<string | null> {
  const config = readServiceAccountConfig();
  if (!config) return null;

  if (
    cachedServiceToken &&
    nowMs() + SERVICE_TOKEN_REFRESH_BUFFER_MS < cachedServiceToken.expiresAtMs
  ) {
    return cachedServiceToken.value;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });

  try {
    const response = await fetchImpl(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );

    if (!response.ok) {
      console.warn(
        `[onedrive] Service account token refresh failed with status ${response.status}.`,
      );
      return null;
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as OAuthTokenResponse;
    if (!payload.access_token) {
      console.warn("[onedrive] Service account refresh response missing access token.");
      return null;
    }

    const expiresInSeconds =
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? Math.max(payload.expires_in, 1)
        : 3600;
    const expiresAtMs = nowMs() + expiresInSeconds * 1000;
    cachedServiceToken = {
      value: payload.access_token,
      expiresAtMs,
    };

    return payload.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[onedrive] Service account token refresh failed: ${message}`);
    return null;
  }
}

export async function resolveOneDriveAccessToken(
  request: NextRequest,
  options: ResolveOneDriveAccessTokenOptions = {},
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now;
  const getRequestAccessToken =
    options.getRequestAccessToken ?? (() => getGraphAccessToken(request));

  const serviceToken = await refreshServiceAccountAccessToken(fetchImpl, nowMs);
  if (serviceToken) return serviceToken;

  return getRequestAccessToken();
}

export function __resetServiceAccountTokenCacheForTests() {
  cachedServiceToken = null;
}
