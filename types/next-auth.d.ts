import { DefaultSession } from "next-auth";

import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    role: AppRole;
    authProvider: "azure-ad" | "credentials";
    user: DefaultSession["user"] & {
      id?: string;
    };
  }

  interface User {
    id?: string;
    role?: AppRole;
    authProvider?: "azure-ad" | "credentials";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: AppRole;
    authProvider?: "azure-ad" | "credentials";
    userId?: string;
  }
}
