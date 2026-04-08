export const APP_ROLES = [
  "admin",
  "manager",
  "sales",
  "engineering",
  "fabrication",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type AppCapability =
  | "read_projects"
  | "create_projects"
  | "edit_projects"
  | "delete_projects"
  | "manage_documents"
  | "view_financials"
  | "access_sales"
  | "manage_crm"
  | "run_nesting"
  | "manage_sheet_stock"
  | "view_shop_tv";

export const DEFAULT_APP_ROLE: AppRole = "viewer";

const ROLE_CAPABILITIES: Record<AppRole, readonly AppCapability[]> = {
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
  engineering: [
    "read_projects",
    "run_nesting",
    "manage_sheet_stock",
    "view_shop_tv",
  ],
  fabrication: [
    "read_projects",
    "run_nesting",
    "manage_sheet_stock",
    "view_shop_tv",
  ],
  viewer: ["read_projects"],
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function normalizeAppRole(value: unknown): AppRole {
  return isAppRole(value) ? value : DEFAULT_APP_ROLE;
}

export function hasCapability(role: AppRole, capability: AppCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function canViewFinancials(role: AppRole): boolean {
  return hasCapability(role, "view_financials");
}

export function canEditProjects(role: AppRole): boolean {
  return hasCapability(role, "edit_projects");
}

export function canCreateProjects(role: AppRole): boolean {
  return hasCapability(role, "create_projects");
}

export function canManageDocuments(role: AppRole): boolean {
  return hasCapability(role, "manage_documents");
}

export function canAccessSales(role: AppRole): boolean {
  return hasCapability(role, "access_sales");
}

export function canManageCrm(role: AppRole): boolean {
  return hasCapability(role, "manage_crm");
}

export function canRunNesting(role: AppRole): boolean {
  return hasCapability(role, "run_nesting");
}

export function canManageSheetStock(role: AppRole): boolean {
  return hasCapability(role, "manage_sheet_stock");
}

export function canViewShopTv(role: AppRole): boolean {
  return hasCapability(role, "view_shop_tv");
}
