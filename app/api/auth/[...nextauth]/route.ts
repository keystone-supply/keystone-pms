/** NextAuth Azure AD provider; stores and refreshes Microsoft Graph token for OneDrive. */
import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

async function refreshAccessToken(token: any) {
  try {
    const usedTenantId = process.env.AZURE_AD_TENANT_ID ?? "common";
    console.log(
      "🔁 refreshAccessToken called; refreshToken present:",
      !!token.refreshToken,
      "length:",
      token.refreshToken ? token.refreshToken.length : 0,
    );
    const response = await fetch(
      `https://login.microsoftonline.com/${usedTenantId}/oauth2/v2.0/token`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.AZURE_AD_CLIENT_ID!,
          client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
          scope: "openid profile email offline_access Files.ReadWrite.All",
          refresh_token: token.refreshToken,
          grant_type: "refresh_token",
        }),
      },
    );

    const tokens: any = await response.json().catch((e) => {
      console.error("Failed to parse refresh response body", e);
      return { parseError: true };
    });

    console.log(
      "🔁 refresh response status",
      response.status,
      "body:",
      tokens && typeof tokens === "object" ? Object.keys(tokens) : tokens,
    );

    if (!response.ok) {
      console.error("Refresh token error (non-OK):", tokens);
      throw tokens;
    }

    return {
      ...tokens,
      expires_at: Math.round(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    };
  } catch (error) {
    console.error("RefreshAccessToken error:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

const handler = NextAuth({
  providers: [
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
  session: { strategy: "jwt" }, // explicit for reliable token persistence
  callbacks: {
    async jwt({ token, account }) {
      console.log("JWT callback - account exists?", !!account);
      if (account) {
        token.accessToken = account.access_token!;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + (account.expires_in || 3600) * 1000;
        console.log(
          "✅ Graph access token SAVED to JWT + expires:",
          new Date(token.accessTokenExpires).toISOString(),
        );
      }

      // If the access token has expired, try to refresh it
      if (Date.now() > (token.accessTokenExpires ?? 0)) {
        console.log("🔄 Access token expired, refreshing...");
        const refreshedTokens = await refreshAccessToken(token);
        if (refreshedTokens.access_token) {
          token.accessToken = refreshedTokens.access_token;
          token.accessTokenExpires = refreshedTokens.expires_at * 1000;
          token.refreshToken =
            refreshedTokens.refresh_token ?? token.refreshToken;
          console.log(
            "✅ Token refreshed successfully, new expiry:",
            new Date(token.accessTokenExpires).toISOString(),
          );
        } else {
          console.log(
            "❌ Refresh failed, user will need to re-login",
            refreshedTokens,
          );
        }
      } else if (token.accessToken) {
        console.log("✅ Graph access token still valid");
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken as string;
      console.log(
        "✅ Session updated with Graph token (length:",
        token.accessToken ? token.accessToken.length : 0,
        ")",
      );
      return session;
    },
  },
});

export { handler as GET, handler as POST };
