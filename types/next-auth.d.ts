import { DefaultSession } from "next-auth";

import type { AppCapability } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    capabilities: AppCapability[];
    authProvider: "azure-ad" | "credentials";
    user: DefaultSession["user"] & {
      id?: string;
    };
  }

  interface User {
    id?: string;
    capabilities?: AppCapability[];
    authProvider?: "azure-ad" | "credentials";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    capabilities?: AppCapability[];
    authProvider?: "azure-ad" | "credentials";
    userId?: string;
  }
}
