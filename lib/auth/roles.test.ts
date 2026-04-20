import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessSales,
  canCreateProjects,
  canEditProjects,
  canManageCrm,
  canManageDocuments,
  canManageSheetStock,
  canManageUsers,
  canRunNesting,
  canViewFinancials,
  canViewShopTv,
  legacyRoleToCapabilities,
  normalizeAppCapabilities,
  toCapabilitySet,
} from "@/lib/auth/roles";

test("normalizeAppCapabilities falls back to read_projects", () => {
  assert.deepEqual(normalizeAppCapabilities(undefined), ["read_projects"]);
  assert.deepEqual(normalizeAppCapabilities(["unexpected"]), ["read_projects"]);
  assert.deepEqual(normalizeAppCapabilities(["read_projects", "view_financials"]), [
    "read_projects",
    "view_financials",
  ]);
});

test("legacy role mapper keeps commercial capabilities", () => {
  const salesCaps = toCapabilitySet(legacyRoleToCapabilities("sales"));
  assert.equal(canAccessSales(salesCaps), true);
  assert.equal(canManageCrm(salesCaps), true);
  assert.equal(canViewFinancials(salesCaps), true);
  assert.equal(canCreateProjects(salesCaps), true);
  assert.equal(canEditProjects(salesCaps), true);
  assert.equal(canManageDocuments(salesCaps), true);

  const viewerCaps = toCapabilitySet(legacyRoleToCapabilities("viewer"));
  assert.equal(canAccessSales(viewerCaps), false);
  assert.equal(canManageCrm(viewerCaps), false);
  assert.equal(canViewFinancials(viewerCaps), false);
});

test("legacy role mapper keeps nesting + sheet stock behavior", () => {
  const engineeringCaps = toCapabilitySet(legacyRoleToCapabilities("engineering"));
  assert.equal(canRunNesting(engineeringCaps), true);
  assert.equal(canManageSheetStock(engineeringCaps), true);

  const salesCaps = toCapabilitySet(legacyRoleToCapabilities("sales"));
  assert.equal(canRunNesting(salesCaps), false);
  assert.equal(canManageSheetStock(salesCaps), false);
});

test("manage_users is admin-only in legacy mapper", () => {
  const adminCaps = toCapabilitySet(legacyRoleToCapabilities("admin"));
  const managerCaps = toCapabilitySet(legacyRoleToCapabilities("manager"));
  assert.equal(canManageUsers(adminCaps), true);
  assert.equal(canManageUsers(managerCaps), false);
});

test("shop tv visibility excludes viewer", () => {
  const viewerCaps = toCapabilitySet(legacyRoleToCapabilities("viewer"));
  const managerCaps = toCapabilitySet(legacyRoleToCapabilities("manager"));
  assert.equal(canViewShopTv(viewerCaps), false);
  assert.equal(canViewShopTv(managerCaps), true);
});
