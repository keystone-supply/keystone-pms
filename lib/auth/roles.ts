export const APP_CAPABILITIES = [
  "read_projects",
  "create_projects",
  "edit_projects",
  "delete_projects",
  "manage_documents",
  "view_financials",
  "access_sales",
  "manage_crm",
  "run_nesting",
  "manage_sheet_stock",
  "view_shop_tv",
  "manage_users",
  "manage_user_access",
] as const;

export type AppCapability = (typeof APP_CAPABILITIES)[number];
export type AppCapabilitySet = ReadonlySet<AppCapability>;

type LegacyRole =
  | "admin"
  | "manager"
  | "sales"
  | "engineering"
  | "fabrication"
  | "viewer";

const LEGACY_ROLE_CAPABILITIES: Record<LegacyRole, readonly AppCapability[]> = {
  admin: [
    "read_projects",
    "create_projects",
    "edit_projects",
    "delete_projects",
    "manage_documents",
    "view_financials",
    "access_sales",
    "manage_crm",
    "run_nesting",
    "manage_sheet_stock",
    "view_shop_tv",
    "manage_users",
    "manage_user_access",
  ],
  manager: [
    "read_projects",
    "create_projects",
    "edit_projects",
    "delete_projects",
    "manage_documents",
    "view_financials",
    "access_sales",
    "manage_crm",
    "run_nesting",
    "manage_sheet_stock",
    "view_shop_tv",
    "manage_user_access",
  ],
  sales: [
    "read_projects",
    "create_projects",
    "edit_projects",
    "manage_documents",
    "view_financials",
    "access_sales",
    "manage_crm",
    "view_shop_tv",
  ],
  engineering: ["read_projects", "run_nesting", "manage_sheet_stock", "view_shop_tv"],
  fabrication: ["read_projects", "run_nesting", "manage_sheet_stock", "view_shop_tv"],
  viewer: ["read_projects"],
};

export const DEFAULT_APP_CAPABILITIES: readonly AppCapability[] = ["read_projects"];

const APP_CAPABILITY_SET = new Set<string>(APP_CAPABILITIES);

export function isAppCapability(value: unknown): value is AppCapability {
  return typeof value === "string" && APP_CAPABILITY_SET.has(value);
}

export function normalizeAppCapabilities(value: unknown): AppCapability[] {
  if (!Array.isArray(value)) return [...DEFAULT_APP_CAPABILITIES];
  const next = value.filter(isAppCapability);
  return next.length > 0 ? Array.from(new Set(next)) : [...DEFAULT_APP_CAPABILITIES];
}

export function toCapabilitySet(capabilities: readonly AppCapability[]): AppCapabilitySet {
  return new Set<AppCapability>(capabilities);
}

export function legacyRoleToCapabilities(role: unknown): AppCapability[] {
  if (typeof role !== "string") return [...DEFAULT_APP_CAPABILITIES];
  const legacy = role as LegacyRole;
  return legacy in LEGACY_ROLE_CAPABILITIES
    ? [...LEGACY_ROLE_CAPABILITIES[legacy]]
    : [...DEFAULT_APP_CAPABILITIES];
}

export function hasCapability(caps: AppCapabilitySet, capability: AppCapability): boolean {
  return caps.has(capability);
}

export function canViewFinancials(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "view_financials");
}

export function canEditProjects(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "edit_projects");
}

export function canCreateProjects(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "create_projects");
}

export function canManageDocuments(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "manage_documents");
}

export function canAccessSales(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "access_sales");
}

export function canManageCrm(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "manage_crm");
}

export function canRunNesting(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "run_nesting");
}

export function canManageSheetStock(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "manage_sheet_stock");
}

export function canViewShopTv(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "view_shop_tv");
}

export function canManageUsers(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "manage_users");
}

export function canManageUserAccess(caps: AppCapabilitySet): boolean {
  return hasCapability(caps, "manage_user_access");
}
