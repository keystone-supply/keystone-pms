import type { Session } from "next-auth";

import {
  normalizeAppCapabilities,
  toCapabilitySet,
  type AppCapabilitySet,
} from "@/lib/auth/roles";

export function getSessionCapabilitySet(session: Session | null | undefined): AppCapabilitySet {
  return toCapabilitySet(normalizeAppCapabilities(session?.capabilities));
}
