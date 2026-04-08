/** NextAuth providers and session role model for Keystone-PMS. */
import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { createClient } from "@supabase/supabase-js";

import { DEFAULT_APP_ROLE, normalizeAppRole } from "@/lib/auth/roles";

type AuthUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active?: boolean;
};

type RefreshTokenInput = {
  refreshToken?: string;
  [key: string]: unknown;
};

type RefreshTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  [key: string]: unknown;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

async function refreshAccessToken(token: RefreshTokenInput): Promise<RefreshTokenResponse> {
  try {
    const usedTenantId = process.env.AZURE_AD_TENANT_ID ?? "common";
    const params = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      scope: "openid profile email offline_access Files.ReadWrite.All",
      grant_type: "refresh_token",
    });
    if (typeof token.refreshToken === "string" && token.refreshToken.length > 0) {
      params.set("refresh_token", token.refreshToken);
    }
    const response = await fetch(
      `https://login.microsoftonline.com/${usedTenantId}/oauth2/v2.0/token`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        body: params,
      },
    );

    const tokens = (await response.json().catch(() => ({}))) as RefreshTokenResponse;
    if (!response.ok) {
      throw tokens;
    }

    return {
      ...tokens,
      expires_at: Math.round(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    };
  } catch {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

async function findAppUserByEmail(email: string): Promise<AuthUserRow | null> {
  if (!adminSupabase) return null;
  const { data, error } = await adminSupabase
    .from("app_users")
    .select("id, email, display_name, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AuthUserRow;
}

async function syncAzureUser(email: string, name: string | null, azureOid?: string | null) {
  if (!adminSupabase) return null;
  const existing = await findAppUserByEmail(email);
  if (existing) return existing;
  // Do not silently reactivate disabled users.
  const { data: disabled } = await adminSupabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .eq("is_active", false)
    .maybeSingle();
  if (disabled) return null;
  const { data, error } = await adminSupabase
    .from("app_users")
    .insert({
      email,
      display_name: name,
      role: DEFAULT_APP_ROLE,
      auth_provider: "azure_ad",
      azure_oid: azureOid ?? null,
      is_active: true,
    })
    .select("id, email, display_name, role")
    .single();
  if (error || !data) return null;
  return data as AuthUserRow;
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password || !adminSupabase) return null;

        const { data, error } = await adminSupabase.rpc("authenticate_app_user", {
          p_email: email,
          p_password: password,
        });
        if (error || !Array.isArray(data) || data.length === 0) return null;
        const user = data[0] as AuthUserRow;
        return {
          id: user.id,
          email: user.email,
          name: user.display_name ?? user.email,
          role: normalizeAppRole(user.role),
          authProvider: "credentials",
        };
      },
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: "openid profile email offline_access Files.ReadWrite.All",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "azure-ad") {
        const email = user.email?.trim().toLowerCase();
        if (!email) return false;
        const synced = await syncAzureUser(
          email,
          user.name ?? null,
          account.providerAccountId,
        );
        if (!synced) return false;
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "azure-ad") {
        token.accessToken = account.access_token!;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + (Number(account.expires_in) || 3600) * 1000;
      }

      // Credentials sign-in provides role directly from authorize.
      if (user?.role) {
        token.role = normalizeAppRole(user.role);
        token.authProvider = user.authProvider ?? "credentials";
        token.userId = user.id;
      }

      // For Azure users or already-existing sessions, refresh role from DB by email.
      const tokenEmail =
        typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
      if (tokenEmail) {
        const appUser = await findAppUserByEmail(tokenEmail);
        if (appUser) {
          token.role = normalizeAppRole(appUser.role);
          token.userId = appUser.id;
          token.authProvider =
            token.authProvider ?? (account?.provider === "azure-ad" ? "azure-ad" : "credentials");
        } else {
          token.role = DEFAULT_APP_ROLE;
          token.userId = undefined;
          token.authProvider =
            token.authProvider ??
            (account?.provider === "credentials" ? "credentials" : "azure-ad");
        }
      }

      if (
        token.authProvider === "azure-ad" &&
        token.refreshToken &&
        Date.now() > Number(token.accessTokenExpires ?? 0)
      ) {
        const refreshedTokens = await refreshAccessToken(token);
        if (refreshedTokens.access_token) {
          token.accessToken = refreshedTokens.access_token;
          token.accessTokenExpires = Number(refreshedTokens.expires_at) * 1000;
          token.refreshToken = refreshedTokens.refresh_token ?? token.refreshToken;
        }
      }

      token.role = normalizeAppRole(token.role);
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.role = normalizeAppRole(token.role);
      session.authProvider =
        token.authProvider === "credentials" ? "credentials" : "azure-ad";
      if (session.user) {
        session.user.id = token.userId as string | undefined;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
