"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Building2,
  Hotel,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import { roleAccessLevels } from "@hms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { MenuManagementPanel } from "@/components/menu-management-panel";
import { StaffAccountsPanel } from "@/components/staff-accounts-panel";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { readSession } from "@/lib/auth";

type UserStatus = "ACTIVE" | "SUSPENDED";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: UserStatus;
  mfa: boolean;
  accessSummary: string;
};

type AdminRole = {
  id: string;
  name: string;
  level: number;
  description: string;
  home: string;
  permissions: string[];
};

type ApiPropertySettings = {
  id: string;
  propertyId: string;
  currencyCode: string;
  currencySymbol: string;
  currencyPrecision: number;
  fiscalYearStart: string;
  checkInTime: string;
  checkOutTime: string;
  numberingRules: Record<string, unknown> | null;
};

type SettingsForm = {
  currencyCode: string;
  currencySymbol: string;
  currencyPrecision: string;
  fiscalYearStart: string;
  checkInTime: string;
  checkOutTime: string;
  numberingRules: Record<string, string>;
};

type ApiProperty = {
  id: string;
  name: string;
  code: string;
};

type ApiAuditLog = {
  id: string;
  userId: string | null;
  module: string;
  action: string;
  recordType: string;
  recordId: string | null;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  target: string;
  detail: string;
  createdAt: string;
};

type ApiPermission = {
  id: string;
  module: string;
  action: string;
  code: string;
};

type ApiRole = {
  id: string;
  name: string;
  rolePermissions: Array<{
    permission: ApiPermission;
  }>;
};

type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  mfaEnabled: boolean;
  status: UserStatus;
  createdAt: string;
  userRoles?: Array<{
    role: ApiRole;
  }>;
};

type ApiRoomType = {
  id: string;
  code: string;
  name: string;
  baseOccupancy: number;
  maxOccupancy: number;
  baseRate: string;
  active: boolean;
};

type ApiRoom = {
  id: string;
  roomNumber: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  roomType: ApiRoomType;
};

type RoomTypePreset = {
  code: string;
  name: string;
  baseOccupancy: string;
  maxOccupancy: string;
  baseRate: string;
};

const permissionModules = Array.from(new Set(roleAccessLevels.flatMap((accessLevel) => accessLevel.modules)));

const roomTypePresets: RoomTypePreset[] = [
  { code: "STD", name: "Standard Room", baseOccupancy: "1", maxOccupancy: "2", baseRate: "80.00" },
  { code: "DLX", name: "Deluxe Room", baseOccupancy: "2", maxOccupancy: "3", baseRate: "120.00" },
  { code: "STE", name: "Suite", baseOccupancy: "2", maxOccupancy: "4", baseRate: "180.00" }
];

const numberingRuleLabels: Record<string, string> = {
  reservation: "Reservation numbers",
  receipt: "Receipt numbers",
  invoice: "Invoice numbers",
  journal: "Journal numbers"
};

export function AdminWorkspace() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [roomTypes, setRoomTypes] = useState<ApiRoomType[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [settings, setSettings] = useState<SettingsForm | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("Loading administration data...");
  const [busy, setBusy] = useState(false);
  const can = (permission: string) => permissions.includes(permission);
  const [roomTypeForm, setRoomTypeForm] = useState({
    code: "",
    name: "",
    baseOccupancy: "1",
    maxOccupancy: "2",
    baseRate: ""
  });
  const [roomForm, setRoomForm] = useState({
    roomTypeId: "",
    roomNumber: ""
  });

  const activeUsers = users;
  const activeRoles = roles;
  const selectedRole = activeRoles.find((role) => role.id === selectedRoleId) ?? activeRoles[0];
  const blockedModules = permissionModules.filter((module) => !selectedRole?.permissions.includes(module));
  const roomNumbers = useMemo(() => parseRoomNumbers(roomForm.roomNumber), [roomForm.roomNumber]);
  const roomNumberPreview = roomNumbers.slice(0, 12).join(", ");
  const existingRoomNumbers = useMemo(() => new Set(rooms.map((room) => room.roomNumber.toLowerCase())), [rooms]);
  const newRoomCount = roomNumbers.filter((roomNumber) => !existingRoomNumbers.has(roomNumber.toLowerCase())).length;

  const stats = useMemo(() => {
    const active = activeUsers.filter((user) => user.status === "ACTIVE").length;
    const mfa = activeUsers.filter((user) => user.mfa).length;
    const mfaCoverage = activeUsers.length ? Math.round((mfa / activeUsers.length) * 100) : 0;
    return { active, mfaCoverage };
  }, [activeUsers]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const session = readSession();
    const granted = session?.user.permissions ?? [];
    const propertyId = session?.user.defaultPropertyId ?? null;
    const has = (permission: string) => granted.includes(permission);
    setPermissions(granted);
    setBusy(true);
    setMessage("Loading registered users, roles, rooms, and settings...");

    const skipped = Promise.resolve(null);
    const [userResult, roleResult, roomTypeResult, roomResult, settingsResult, propertyResult, auditResult] = await Promise.all([
      has("users.view") ? apiRequest<ApiUser[]>("/users") : skipped,
      has("roles.view") ? apiRequest<ApiRole[]>("/roles") : skipped,
      has("front_office.view") ? apiRequest<ApiRoomType[]>("/front-office/room-types") : skipped,
      has("front_office.view") ? apiRequest<ApiRoom[]>("/front-office/rooms") : skipped,
      has("settings.view") && propertyId ? apiRequest<ApiPropertySettings>(`/properties/${propertyId}/settings`) : skipped,
      has("properties.view") ? apiRequest<ApiProperty[]>("/properties") : skipped,
      has("audit.view") ? apiRequest<ApiAuditLog[]>("/audit") : skipped
    ]);
    setBusy(false);

    const errors: string[] = [];
    const mappedRoles = roleResult?.ok ? roleResult.data.map(mapApiRole) : [];
    if (roleResult && !roleResult.ok) errors.push(`Roles: ${roleResult.error}`);
    setRoles(mappedRoles);
    setSelectedRoleId((current) => (mappedRoles.some((role) => role.id === current) ? current : mappedRoles[0]?.id ?? ""));

    const mappedUsers = userResult?.ok ? userResult.data.map((user) => mapApiUser(user, mappedRoles)) : [];
    if (userResult && !userResult.ok) errors.push(`Users: ${userResult.error}`);
    setUsers(mappedUsers);

    if (roomTypeResult?.ok) {
      setRoomTypes(roomTypeResult.data);
      setRoomForm((current) => ({ ...current, roomTypeId: current.roomTypeId || roomTypeResult.data[0]?.id || "" }));
    } else {
      setRoomTypes([]);
      if (roomTypeResult) errors.push(`Room types: ${roomTypeResult.error}`);
    }
    if (roomResult?.ok) setRooms(roomResult.data);
    else {
      setRooms([]);
      if (roomResult) errors.push(`Rooms: ${roomResult.error}`);
    }

    if (settingsResult?.ok) setSettings(mapSettings(settingsResult.data));
    else {
      setSettings(null);
      if (settingsResult) errors.push(`Settings: ${settingsResult.error}`);
    }

    if (propertyResult?.ok) setPropertyName(propertyResult.data.find((property) => property.id === propertyId)?.name ?? "");

    if (auditResult?.ok) setAudit(auditResult.data.map((entry) => mapAuditLog(entry, mappedUsers)));
    else {
      setAudit([]);
      if (auditResult) errors.push(`Audit: ${auditResult.error}`);
    }

    setMessage(errors.length ? errors.join(" ") : "Administration data loaded from the hotel database.");
  }

  async function reloadAudit() {
    if (!can("audit.view")) return;
    const result = await apiRequest<ApiAuditLog[]>("/audit");
    if (result.ok) setAudit(result.data.map((entry) => mapAuditLog(entry, users)));
  }

  async function createRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomTypeForm.code.trim().toUpperCase();
    const name = roomTypeForm.name.trim();
    const baseRate = Number(roomTypeForm.baseRate);
    const baseOccupancy = Number(roomTypeForm.baseOccupancy);
    const maxOccupancy = Number(roomTypeForm.maxOccupancy);

    if (!code || !name || !Number.isFinite(baseRate) || baseRate < 0) {
      setMessage("Enter a room type code, name, and valid base rate.");
      return;
    }

    if (!Number.isInteger(baseOccupancy) || !Number.isInteger(maxOccupancy) || baseOccupancy < 1 || maxOccupancy < baseOccupancy) {
      setMessage("Enter valid room occupancy numbers.");
      return;
    }

    if (roomTypes.some((roomType) => roomType.code.toUpperCase() === code)) {
      setMessage(`Room type ${code} already exists. Use a different code.`);
      return;
    }

    setBusy(true);
    const result = await apiRequest<ApiRoomType>("/front-office/room-types", {
      method: "POST",
      body: JSON.stringify({
        code,
        name,
        baseOccupancy,
        maxOccupancy,
        baseRate: roomTypeForm.baseRate,
        active: true
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setRoomTypes((current) => [result.data, ...current]);
    setRoomForm((current) => ({ ...current, roomTypeId: result.data.id }));
    setRoomTypeForm({ code: "", name: "", baseOccupancy: "1", maxOccupancy: "2", baseRate: "" });
    void reloadAudit();
    setMessage(`Room type ${result.data.code} created.`);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedRoomNumbers = parseRoomNumbers(roomForm.roomNumber);

    if (!roomForm.roomTypeId || requestedRoomNumbers.length === 0) {
      setMessage("Choose a room type and enter at least one room number.");
      return;
    }

    if (requestedRoomNumbers.length > 100) {
      setMessage("Add 100 rooms or fewer at a time.");
      return;
    }

    const existingNumbers = new Set(rooms.map((room) => room.roomNumber.toLowerCase()));
    const skippedRoomNumbers = requestedRoomNumbers.filter((roomNumber) => existingNumbers.has(roomNumber.toLowerCase()));
    const roomNumbersToCreate = requestedRoomNumbers.filter((roomNumber) => !existingNumbers.has(roomNumber.toLowerCase()));

    if (roomNumbersToCreate.length === 0) {
      setMessage(`${requestedRoomNumbers.length === 1 ? "That room already exists" : "Those rooms already exist"}.`);
      return;
    }

    setBusy(true);
    const createdRooms: ApiRoom[] = [];
    let failedMessage = "";

    for (const roomNumber of roomNumbersToCreate) {
      const result = await apiRequest<ApiRoom>("/front-office/rooms", {
        method: "POST",
        body: JSON.stringify({
          roomTypeId: roomForm.roomTypeId,
          roomNumber
        })
      });

      if (!result.ok) {
        failedMessage = `Room ${roomNumber}: ${result.error}`;
        break;
      }

      createdRooms.push(result.data);
    }

    setBusy(false);

    if (createdRooms.length === 0 && failedMessage) {
      setMessage(failedMessage);
      return;
    }

    setRooms((current) => [...createdRooms, ...current]);
    setRoomForm((current) => ({ ...current, roomNumber: failedMessage ? roomNumbersToCreate.slice(createdRooms.length).join(", ") : "" }));
    void reloadAudit();
    setMessage(
      [
        `${createdRooms.length} room${createdRooms.length === 1 ? "" : "s"} added.`,
        skippedRoomNumbers.length ? `${skippedRoomNumbers.length} duplicate${skippedRoomNumbers.length === 1 ? "" : "s"} skipped.` : "",
        failedMessage ? `Stopped at ${failedMessage}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function applyRoomTypePreset(preset: RoomTypePreset) {
    setRoomTypeForm({ ...preset });
    setMessage(`${preset.name} preset loaded. Adjust the rate if needed, then save the room type.`);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = readSession();
    const propertyId = session?.user.defaultPropertyId;

    if (!settings || !propertyId) {
      setMessage("No property is linked to your account, so settings cannot be saved.");
      return;
    }

    const precision = Number(settings.currencyPrecision);
    if (!/^[A-Z]{3}$/.test(settings.currencyCode.trim())) {
      setMessage("Currency code must be a 3-letter ISO code such as USD or KES.");
      return;
    }
    if (!settings.currencySymbol.trim() || !Number.isInteger(precision) || precision < 0 || precision > 6) {
      setMessage("Enter a currency symbol and a precision between 0 and 6.");
      return;
    }
    if (!isTime(settings.checkInTime) || !isTime(settings.checkOutTime)) {
      setMessage("Check-in and check-out times must use HH:MM, for example 14:00.");
      return;
    }
    if (!settings.fiscalYearStart) {
      setMessage("Choose the first day of the fiscal year.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<ApiPropertySettings>(`/properties/${propertyId}/settings`, {
      method: "PATCH",
      body: JSON.stringify({
        currencyCode: settings.currencyCode.trim(),
        currencySymbol: settings.currencySymbol.trim(),
        currencyPrecision: precision,
        fiscalYearStart: settings.fiscalYearStart,
        checkInTime: settings.checkInTime,
        checkOutTime: settings.checkOutTime,
        numberingRules: Object.fromEntries(
          Object.entries(settings.numberingRules).map(([key, value]) => [key, value.trim()])
        )
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setSettings(mapSettings(result.data));
    void reloadAudit();
    setMessage("Property settings saved.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Administration Workspace</h3>
            <p className="text-sm text-muted-foreground">Register staff, assign access levels, control permissions, and audit changes.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetric icon={UsersRound} label="Users" value={String(activeUsers.length)} detail={`${stats.active} active`} />
          <AdminMetric icon={ShieldCheck} label="Roles" value={String(activeRoles.length)} detail="Permission groups" />
          <AdminMetric icon={LockKeyhole} label="MFA coverage" value={`${stats.mfaCoverage}%`} detail="Protected accounts" />
          <AdminMetric icon={ReceiptText} label="Audit events" value={can("audit.view") ? String(audit.length) : "-"} detail="Latest 100 recorded" />
        </div>

        <StaffAccountsPanel />

        {can("front_office.view") ? (
        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Hotel className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Room Inventory Setup</h4>
            </div>
            <Badge>{rooms.length} rooms</Badge>
          </div>
          {!can("front_office.rooms.manage") ? (
            <p className="mb-3 text-sm text-muted-foreground">You can view rooms but not add room types or rooms.</p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={createRoomType} className="rounded border border-border bg-background p-3">
              <p className="mb-3 text-sm font-bold">Room Type</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {roomTypePresets.map((preset) => (
                  <Button key={preset.code} type="button" variant="secondary" className="h-8 px-3" onClick={() => applyRoomTypePreset(preset)}>
                    {preset.name}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label="Room type code"
                  value={roomTypeForm.code}
                  onChange={(event) => setRoomTypeForm({ ...roomTypeForm, code: event.target.value.toUpperCase() })}
                  placeholder="Code"
                />
                <Input
                  aria-label="Room type name"
                  value={roomTypeForm.name}
                  onChange={(event) => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })}
                  placeholder="Name"
                />
                <Input
                  aria-label="Base occupancy"
                  value={roomTypeForm.baseOccupancy}
                  onChange={(event) => setRoomTypeForm({ ...roomTypeForm, baseOccupancy: event.target.value })}
                  placeholder="Base occupancy"
                />
                <Input
                  aria-label="Maximum occupancy"
                  value={roomTypeForm.maxOccupancy}
                  onChange={(event) => setRoomTypeForm({ ...roomTypeForm, maxOccupancy: event.target.value })}
                  placeholder="Max occupancy"
                />
                <Input
                  aria-label="Base rate"
                  className="sm:col-span-2"
                  value={roomTypeForm.baseRate}
                  onChange={(event) => setRoomTypeForm({ ...roomTypeForm, baseRate: event.target.value })}
                  placeholder="Base rate"
                />
              </div>
              {roomTypes.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {roomTypes.map((roomType) => (
                    <p key={roomType.id}>
                      <span className="font-semibold text-foreground">{roomType.code}</span> {roomType.name} · {formatMoney(roomType.baseRate)} · sleeps{" "}
                      {roomType.maxOccupancy}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No room types yet. Create one before adding rooms.</p>
              )}
              <Button className="mt-3" disabled={busy || !can("front_office.rooms.manage")}>
                <BedDouble className="h-4 w-4" aria-hidden="true" />
                Save type
              </Button>
            </form>

            <form onSubmit={createRoom} className="rounded border border-border bg-background p-3">
              <p className="mb-3 text-sm font-bold">Add Rooms</p>
              <div className="grid gap-3">
                <select
                  aria-label="Room type for new room"
                  className="h-10 rounded border border-border bg-white px-3 text-sm"
                  value={roomForm.roomTypeId}
                  onChange={(event) => setRoomForm({ ...roomForm, roomTypeId: event.target.value })}
                >
                  <option value="">Select room type</option>
                  {roomTypes.map((roomType) => (
                    <option key={roomType.id} value={roomType.id}>
                      {roomType.code} - {roomType.name}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label="Room numbers"
                  rows={4}
                  value={roomForm.roomNumber}
                  onChange={(event) => setRoomForm({ ...roomForm, roomNumber: event.target.value })}
                  placeholder="Room numbers: 101-110, 201, 202"
                  className="w-full rounded border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="mt-3 rounded border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
                {roomNumbers.length ? (
                  <>
                    <span className="font-semibold text-foreground">{roomNumbers.length} parsed</span>
                    {newRoomCount !== roomNumbers.length ? `, ${roomNumbers.length - newRoomCount} already exists` : ""}
                    {roomNumberPreview ? `: ${roomNumberPreview}${roomNumbers.length > 12 ? ", ..." : ""}` : ""}
                  </>
                ) : (
                  "Use commas, spaces, or ranges. Example: 101-110, 201, 202."
                )}
              </div>
              <Button className="mt-3" disabled={busy || !can("front_office.rooms.manage") || !roomForm.roomTypeId || newRoomCount === 0}>
                <Hotel className="h-4 w-4" aria-hidden="true" />
                Add {newRoomCount > 1 ? `${newRoomCount} rooms` : "room"}
              </Button>
              <div className="mt-3 max-h-36 overflow-auto rounded border border-border bg-white">
                {rooms.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No rooms set up yet.</p>
                ) : (
                  rooms.slice(0, 8).map((room) => (
                    <div key={room.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
                      <div>
                        <p className="font-semibold">Room {room.roomNumber}</p>
                        <p className="text-xs text-muted-foreground">{room.roomType.name}</p>
                      </div>
                      <Badge tone={room.occupancyStatus === "AVAILABLE" ? "success" : "neutral"}>{room.occupancyStatus}</Badge>
                    </div>
                  ))
                )}
              </div>
            </form>
          </div>
        </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <InvoiceWorkspace compact />

        {can("roles.view") ? (
          <div className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Role Permissions</h4>
            </div>
            {activeRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles found. Roles are created by first-run setup.</p>
            ) : (
              <>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Role</span>
                  <select
                    aria-label="Selected role"
                    className="h-10 w-full rounded border border-border bg-white px-3 text-sm"
                    value={selectedRole?.id}
                    onChange={(event) => setSelectedRoleId(event.target.value)}
                  >
                    {activeRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.level ? `Level ${role.level} - ` : ""}
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-border bg-muted/50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Access level</p>
                    <p className="mt-1 text-lg font-bold">{selectedRole?.level ? `Level ${selectedRole.level}` : "Custom"}</p>
                  </div>
                  <div className="rounded border border-border bg-muted/50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Users with role</p>
                    <p className="mt-1 text-lg font-bold">{activeUsers.filter((user) => user.roleId === selectedRole?.id).length}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{selectedRole?.description}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded border border-border bg-background px-3 py-2">
                    <p className="font-bold">Can open</p>
                    <p className="mt-1 text-muted-foreground">{selectedRole?.permissions.join(", ") || "No modules"}</p>
                  </div>
                  <div className="rounded border border-border bg-background px-3 py-2">
                    <p className="font-bold">Blocked from</p>
                    <p className="mt-1 text-muted-foreground">{blockedModules.join(", ") || "Nothing"}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Individual access is adjusted per staff member in Staff Accounts.
                </p>
              </>
            )}
          </div>
        ) : null}

        {can("settings.view") ? (
          <form onSubmit={saveSettings} className="rounded border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="font-bold">Property Settings</h4>
              </div>
              {propertyName ? <Badge>{propertyName}</Badge> : null}
            </div>
            {!settings ? (
              <p className="text-sm text-muted-foreground">
                {busy ? "Loading settings..." : "Property settings could not be loaded for your account."}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Currency code">
                    <Input
                      value={settings.currencyCode}
                      maxLength={3}
                      onChange={(event) => setSettings({ ...settings, currencyCode: event.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="Symbol">
                    <Input value={settings.currencySymbol} onChange={(event) => setSettings({ ...settings, currencySymbol: event.target.value })} />
                  </Field>
                  <Field label="Decimals">
                    <Input
                      inputMode="numeric"
                      value={settings.currencyPrecision}
                      onChange={(event) => setSettings({ ...settings, currencyPrecision: event.target.value })}
                    />
                  </Field>
                  <Field label="Fiscal year starts">
                    <Input
                      type="date"
                      value={settings.fiscalYearStart}
                      onChange={(event) => setSettings({ ...settings, fiscalYearStart: event.target.value })}
                    />
                  </Field>
                  <Field label="Check-in time">
                    <Input type="time" value={settings.checkInTime} onChange={(event) => setSettings({ ...settings, checkInTime: event.target.value })} />
                  </Field>
                  <Field label="Check-out time">
                    <Input type="time" value={settings.checkOutTime} onChange={(event) => setSettings({ ...settings, checkOutTime: event.target.value })} />
                  </Field>
                </div>
                {Object.keys(settings.numberingRules).length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(settings.numberingRules).map(([key, value]) => (
                      <Field key={key} label={numberingRuleLabels[key] ?? key}>
                        <Input
                          value={value}
                          onChange={(event) =>
                            setSettings({ ...settings, numberingRules: { ...settings.numberingRules, [key]: event.target.value } })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                ) : null}
                <Button className="mt-3" disabled={busy || !can("settings.manage")}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Save settings
                </Button>
                {!can("settings.manage") ? <p className="mt-2 text-xs text-muted-foreground">You can view but not change settings.</p> : null}
              </>
            )}
          </form>
        ) : null}

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Audit Trail</h4>
          </div>
          <div className="divide-y divide-border">
            {audit.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {can("audit.view") ? "No audit events recorded yet." : "You do not have access to the audit trail."}
              </div>
            ) : (
              audit.slice(0, 10).map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{event.action}</p>
                      <p className="text-muted-foreground">{event.target}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.actor}
                    {event.detail ? ` - ${event.detail}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {can("pos.products.manage") ? (
        <div className="xl:col-span-2">
          <MenuManagementPanel canManageTables={can("pos.outlets.manage")} />
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function AdminMetric({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" aria-hidden={true} />
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function mapApiRole(role: ApiRole): AdminRole {
  const template = roleAccessLevels.find((accessLevel) => accessLevel.name === role.name);
  const permissions = summarizePermissionModules(role.rolePermissions.map((entry) => entry.permission));

  return {
    id: role.id,
    name: role.name,
    level: template?.level ?? 0,
    description: template?.description ?? "Custom database role.",
    home: template?.home ?? resolveRoleHome(permissions),
    permissions
  };
}

function mapApiUser(user: ApiUser, roles: AdminRole[]): AdminUser {
  const assignedRole = user.userRoles?.[0]?.role;
  const role = assignedRole ? roles.find((entry) => entry.id === assignedRole.id) : undefined;

  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    roleId: role?.id ?? "",
    status: user.status,
    mfa: user.mfaEnabled,
    accessSummary: role?.permissions.join(", ") ?? "No access assigned"
  };
}

function summarizePermissionModules(permissions: ApiPermission[]) {
  const modules = new Set<string>();

  for (const permission of permissions) {
    if (["users", "roles", "properties", "settings", "audit"].includes(permission.module)) {
      modules.add("administration");
      continue;
    }

    if (permission.module === "accounting") {
      modules.add("finance");
      continue;
    }

    if (permission.module === "front_office") {
      modules.add("front office");
      continue;
    }

    modules.add(permission.module.replaceAll("_", " "));
  }

  return [...modules].sort();
}

function resolveRoleHome(permissions: string[]) {
  if (permissions.includes("finance")) return "Finance system";
  if (permissions.includes("pos")) return "POS terminal";
  if (permissions.includes("front office")) return "Front office system";
  if (permissions.includes("inventory")) return "Inventory system";
  if (permissions.includes("reports")) return "Reports system";
  if (permissions.includes("administration")) return "Administration system";
  return "Assigned system";
}

function mapSettings(settings: ApiPropertySettings): SettingsForm {
  const rules = settings.numberingRules && typeof settings.numberingRules === "object" ? settings.numberingRules : {};
  return {
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    currencyPrecision: String(settings.currencyPrecision),
    fiscalYearStart: settings.fiscalYearStart.slice(0, 10),
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    numberingRules: Object.fromEntries(
      Object.entries(rules)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value as string])
    )
  };
}

function mapAuditLog(entry: ApiAuditLog, users: AdminUser[]): AuditEvent {
  const actor = entry.userId ? users.find((user) => user.id === entry.userId)?.name ?? "Staff member" : "System";
  return {
    id: entry.id,
    action: `${humanize(entry.module)}: ${humanize(entry.action)}`,
    actor,
    target: humanize(entry.recordType),
    detail: entry.recordId ? `Record ${entry.recordId.slice(0, 8)}` : "",
    createdAt: entry.createdAt
  };
}

function humanize(value: string) {
  const text = value.replaceAll("_", " ").replaceAll(".", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function parseRoomNumbers(value: string) {
  const seen = new Set<string>();
  const roomNumbers: string[] = [];
  const tokens = value
    .split(/[,\n]+/)
    .flatMap((entry) => entry.trim().split(/\s+/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const expanded = expandRoomNumberToken(token);

    for (const roomNumber of expanded) {
      const key = roomNumber.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roomNumbers.push(roomNumber);
    }
  }

  return roomNumbers;
}

function expandRoomNumberToken(token: string) {
  const range = token.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/);
  if (!range || range[1].toLowerCase() !== range[3].toLowerCase()) {
    return [token];
  }

  const prefix = range[1];
  const start = Number(range[2]);
  const end = Number(range[4]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 199) {
    return [token];
  }

  const width = Math.max(range[2].length, range[4].length);
  return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${String(start + index).padStart(width, "0")}`);
}
