import type { PermissionCode } from "./permissions";

// Each store can only be opened by staff holding its permission. Stock received, moved out of,
// or recorded as used at a store requires that store's permission.
export const storeAccess = [
  { locationCode: "MAIN", permission: "inventory.store.main", label: "Main Store", usageAllowed: false },
  { locationCode: "BAR", permission: "inventory.store.bar", label: "Bar Store", usageAllowed: true },
  { locationCode: "KITCHEN", permission: "inventory.store.restaurant", label: "Restaurant Store", usageAllowed: true }
] as const satisfies readonly { locationCode: string; permission: PermissionCode; label: string; usageAllowed: boolean }[];

// POS outlets of these types can only be used by staff holding the matching permission.
// Room service is cooked by the restaurant kitchen, so it follows the restaurant permission.
export const outletAccess = [
  { outletTypes: ["BAR"], permission: "pos.outlet.bar", label: "Bar outlet" },
  { outletTypes: ["RESTAURANT", "ROOM_SERVICE"], permission: "pos.outlet.restaurant", label: "Restaurant outlet" }
] as const satisfies readonly { outletTypes: readonly string[]; permission: PermissionCode; label: string }[];

export const outletScopePermissionCodes: readonly PermissionCode[] = [
  ...storeAccess.map((store) => store.permission),
  ...outletAccess.map((outlet) => outlet.permission)
];

// Stores without a dedicated permission (added later) are treated as part of the Main Store.
export function storePermissionFor(locationCode: string): PermissionCode {
  return storeAccess.find((store) => store.locationCode === locationCode)?.permission ?? "inventory.store.main";
}

export function canUseStore(permissions: readonly string[], locationCode: string) {
  return permissions.includes(storePermissionFor(locationCode));
}

export function canRecordUsageAt(locationCode: string) {
  return storeAccess.find((store) => store.locationCode === locationCode)?.usageAllowed ?? false;
}

export function outletPermissionFor(outletType: string): PermissionCode | null {
  return outletAccess.find((outlet) => (outlet.outletTypes as readonly string[]).includes(outletType))?.permission ?? null;
}

export function canUseOutlet(permissions: readonly string[], outletType: string) {
  const required = outletPermissionFor(outletType);
  return required === null || permissions.includes(required);
}
