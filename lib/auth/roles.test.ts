import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessSales,
  canCreateProjects,
  canEditProjects,
  canManageCrm,
  canManageDocuments,
  canManageSheetStock,
  canRunNesting,
  canViewFinancials,
  canViewShopTv,
  normalizeAppRole,
  type AppRole,
} from "@/lib/auth/roles";

const roles: AppRole[] = [
  "admin",
  "manager",
  "sales",
  "engineering",
  "fabrication",
  "viewer",
];

test("normalizeAppRole falls back to viewer", () => {
  assert.equal(normalizeAppRole(undefined), "viewer");
  assert.equal(normalizeAppRole("unexpected"), "viewer");
  assert.equal(normalizeAppRole("sales"), "sales");
});

test("sales + finance capabilities are limited to commercial roles", () => {
  for (const role of roles) {
    const expected = role === "admin" || role === "manager" || role === "sales";
    assert.equal(canAccessSales(role), expected, `${role} sales access`);
    assert.equal(canManageCrm(role), expected, `${role} crm access`);
    assert.equal(canViewFinancials(role), expected, `${role} financial visibility`);
    assert.equal(canCreateProjects(role), expected, `${role} create projects`);
    assert.equal(canEditProjects(role), expected, `${role} edit projects`);
    assert.equal(canManageDocuments(role), expected, `${role} manage documents`);
  }
});

test("nesting + sheet stock capabilities are restricted to shop roles", () => {
  for (const role of roles) {
    const expected =
      role === "admin" ||
      role === "manager" ||
      role === "engineering" ||
      role === "fabrication";
    assert.equal(canRunNesting(role), expected, `${role} run nesting`);
    assert.equal(canManageSheetStock(role), expected, `${role} manage sheet stock`);
  }
});

test("shop tv visibility excludes viewer", () => {
  for (const role of roles) {
    assert.equal(canViewShopTv(role), role !== "viewer", `${role} shop tv`);
  }
});
