/** Supabase client for Postgres and realtime. */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let supabaseBridgeAccessToken: string | null = null;

export function setSupabaseBridgeAccessToken(token: string | null): void {
  supabaseBridgeAccessToken = token;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => supabaseBridgeAccessToken ?? "",
});
