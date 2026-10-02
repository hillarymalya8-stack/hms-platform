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
  UserPlus,
  UsersRound
} from "lucide-react";
import { roleAccessLevels } from "@hms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type UserStatus = "ACTIVE" | "SUSPENDED";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: UserStatus;
  mfa: boolean;
  lastLogin: string;
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

type PropertySettings = {
  propertyName: string;
  currencyCode: string;
  taxRate: string;
  businessDate: string;
  reservationPrefix: string;
  receiptPrefix: string;
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

const demoRoles: AdminRole[] = roleAccessLevels.map((accessLevel) => ({
  id: `role-${accessLevel.key}`,
  name: accessLevel.name,
  level: accessLevel.level,
  description: accessLevel.description,
  home: accessLevel.home,
  permissions: [...accessLevel.modules]
}));

const demoUsers: AdminUser[] = roleAccessLevels
  .filter((accessLevel) => accessLevel.defaultUser)
  .map((accessLevel, index) => ({
    id: `user-${accessLevel.key}`,
    name: accessLevel.defaultUser?.fullName ?? accessLevel.name,
    email: accessLevel.defaultUser?.email ?? `${accessLevel.key}@hotel.local`,
    roleId: `role-${accessLevel.key}`,
    status: "ACTIVE",
    mfa: accessLevel.level >= 40,
    lastLogin: index < 3 ? "2026-08-31T08:20:00.000Z" : "Never",
    accessSummary: accessLevel.modules.join(", ")
  }));

const demoSettings: PropertySettings = {
  propertyName: "Main Hotel",
  currencyCode: "USD",
  taxRate: "16.00",
  businessDate: "2026-08-31",
  reservationPrefix: "RES",
  receiptPrefix: "RCT"
};

export function AdminWorkspace() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [roomTypes, setRoomTypes] = useState<ApiRoomType[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("role-super-admin");
  const [settings, setSettings] = useState<PropertySettings>(demoSettings);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState("Load administration data to manage access and settings.");
  const [busy, setBusy] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    roleId: "role-front-office"
  });
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

  const activeUsers = users.length ? users : demoUsers;
  const activeRoles = roles.length ? roles : demoRoles;
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
  }, []);

  async function loadData() {
    setBusy(true);
    setMessage("Loading registered users, roles, and access levels...");

    const [userResult, roleResult, roomTypeResult, roomResult] = await Promise.all([
      apiRequest<ApiUser[]>("/users"),
      apiRequest<ApiRole[]>("/roles"),
      apiRequest<ApiRoomType[]>("/front-office/room-types"),
      apiRequest<ApiRoom[]>("/front-office/rooms")
    ]);

    setSettings({ ...demoSettings });
    setSelectedRoleId("role-super-admin");
    setBusy(false);

    if (!userResult.ok || !roleResult.ok) {
      const errorMessage = !userResult.ok
        ? userResult.error
        : !roleResult.ok
          ? roleResult.error
          : "Administration data could not be loaded.";
      setUsers(demoUsers.map((user) => ({ ...user })));
      setRoles(demoRoles.map((role) => ({ ...role, permissions: [...role.permissions] })));
      setAudit([
        createAudit("Access registry opened", "System Administrator", "Local role templates", "Database is required before new users can be saved."),
        createAudit("Settings viewed", "System Administrator", "Main Hotel", "Property settings loaded.")
      ]);
      setMessage(errorMessage);
      return;
    }

    const mappedRoles = roleResult.data.map(mapApiRole);
    setRoles(mappedRoles);
    setSelectedRoleId(mappedRoles[0]?.id ?? "role-super-admin");
    setRegisterForm((current) => ({ ...current, roleId: mappedRoles[0]?.id ?? current.roleId }));
    setUsers(userResult.data.map((user) => mapApiUser(user, mappedRoles)));
    if (roomTypeResult.ok) {
      setRoomTypes(roomTypeResult.data);
      setRoomForm((current) => ({ ...current, roomTypeId: current.roomTypeId || roomTypeResult.data[0]?.id || "" }));
    }
    if (roomResult.ok) setRooms(roomResult.data);
    setAudit([
      createAudit("Access registry loaded", "System Administrator", "User register", "Users and roles loaded from the shared database."),
      createAudit("Settings viewed", "System Administrator", "Main Hotel", "Property settings loaded.")
    ]);
    setMessage("Registered users and access levels loaded.");
  }

  async function registerUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const role = activeRoles.find((entry) => entry.id === registerForm.roleId);

    if (!registerForm.name.trim() || !registerForm.email.trim() || !registerForm.password || !role) {
      setMessage("Enter a name, email, temporary password, and access level before registering a user.");
      return;
    }

    if (registerForm.password.length < 8) {
      setMessage("Temporary password must be at least 8 characters.");
      return;
    }

    if (activeUsers.some((user) => user.email.toLowerCase() === registerForm.email.trim().toLowerCase())) {
      setMessage("That email address is already assigned to a user.");
      return;
    }

    if (role.id.startsWith("role-")) {
      setMessage("Start the database and load live roles before saving a new registered user.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<ApiUser>("/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        roleId: role.id
      })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const user: AdminUser = {
      id: result.data.id,
      name: result.data.fullName,
      email: result.data.email,
      roleId: role.id,
      status: result.data.status,
      mfa: result.data.mfaEnabled,
      lastLogin: "Never",
      accessSummary: role.permissions.join(", ")
    };
    setUsers((current) => [user, ...current]);
    setRegisterForm({ name: "", email: "", password: "", roleId: role.id });
    addAudit("User registered", "System Administrator", user.email, `Assigned access level: ${role.name}`);
    setMessage(`${user.name} registered as ${role.name}. They will open ${role.home}.`);
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
    addAudit("Room type created", "System Administrator", result.data.code, `Base rate ${formatMoney(result.data.baseRate)}`);
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
    addAudit(
      "Rooms assigned",
      "System Administrator",
      `${createdRooms.length} room${createdRooms.length === 1 ? "" : "s"}`,
      createdRooms[0]?.roomType.name ?? "Room inventory"
    );
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

  function toggleUserStatus(userId: string) {
    const user = activeUsers.find((entry) => entry.id === userId);
    if (!user) return;
    const nextStatus: UserStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    setUsers((current) =>
      current.map((entry) => (entry.id === userId ? { ...entry, status: nextStatus } : entry))
    );
    addAudit("User status changed", "System Administrator", user.email, `New status: ${nextStatus}`);
    setMessage(`${user.name} is now ${nextStatus.toLowerCase()}.`);
  }

  function enforceMfa(userId: string) {
    const user = activeUsers.find((entry) => entry.id === userId);
    if (!user) return;

    setUsers((current) => current.map((entry) => (entry.id === userId ? { ...entry, mfa: true } : entry)));
    addAudit("MFA enforced", "System Administrator", user.email, "MFA required at next login.");
    setMessage(`MFA enabled for ${user.name}.`);
  }

  function togglePermission(module: string) {
    if (!selectedRole) return;
    if (selectedRole.level === 100 && module === "administration") {
      setMessage("Super Administrator must keep administration access.");
      return;
    }

    setRoles((current) =>
      current.map((role) => {
        if (role.id !== selectedRole.id) return role;
        const hasPermission = role.permissions.includes(module);
        return {
          ...role,
          permissions: hasPermission
            ? role.permissions.filter((permission) => permission !== module)
            : [...role.permissions, module]
        };
      })
    );
    addAudit("Role permission changed", "System Administrator", selectedRole.name, `Toggled module: ${module}`);
    setMessage(`${selectedRole.name} permissions updated.`);
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings.propertyName.trim() || !settings.currencyCode.trim() || Number(settings.taxRate) < 0) {
      setMessage("Property name, currency, and tax rate are required.");
      return;
    }

    addAudit("Property settings saved", "System Administrator", settings.propertyName, `Currency ${settings.currencyCode}, tax ${settings.taxRate}%`);
    setMessage("Property settings saved and audited.");
  }

  function addAudit(action: string, actor: string, target: string, detail: string) {
    setAudit((current) => [createAudit(action, actor, target, detail), ...current]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Administration Workspace</h3>
            <p className="text-sm text-muted-foreground">Register staff, assign access levels, control permissions, and audit changes.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadData} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Load administration
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetric icon={UsersRound} label="Users" value={String(activeUsers.length)} detail={`${stats.active} active`} />
          <AdminMetric icon={ShieldCheck} label="Roles" value={String(activeRoles.length)} detail="Permission groups" />
          <AdminMetric icon={LockKeyhole} label="MFA coverage" value={`${stats.mfaCoverage}%`} detail="Protected accounts" />
          <AdminMetric icon={ReceiptText} label="Audit events" value={String(audit.length)} detail="Session history" />
        </div>

        <form onSubmit={registerUser} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Register User</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              aria-label="User name"
              value={registerForm.name}
              onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
              placeholder="Full name"
            />
            <Input
              aria-label="User email"
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
              placeholder="Email"
            />
            <Input
              aria-label="Temporary password"
              type="password"
              value={registerForm.password}
              onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
              placeholder="Temporary password"
            />
            <select
              aria-label="User access level"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={registerForm.roleId}
              onChange={(event) => setRegisterForm({ ...registerForm, roleId: event.target.value })}
            >
              {activeRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The selected access level controls which system opens after login and which modules are blocked.
          </p>
          <Button className="mt-3" disabled={busy}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Register user
          </Button>
        </form>

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Hotel className="h-4 w-4 text-primary" aria-hidden="true" />
              <h4 className="font-bold">Room Inventory Setup</h4>
            </div>
            <Badge>{rooms.length} rooms</Badge>
          </div>
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
              <Button className="mt-3" disabled={busy}>
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
              <Button className="mt-3" disabled={busy || !roomForm.roomTypeId || newRoomCount === 0}>
                <Hotel className="h-4 w-4" aria-hidden="true" />
                Add {newRoomCount > 1 ? `${newRoomCount} rooms` : "room"}
              </Button>
              <div className="mt-3 max-h-36 overflow-auto rounded border border-border bg-white">
                {rooms.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No rooms loaded yet.</p>
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

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">User Access</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Can open</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">MFA</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((user) => {
                  const role = activeRoles.find((entry) => entry.id === user.roleId);
                  return (
                    <tr key={user.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">{role?.name ?? "Unassigned"}</td>
                      <td className="px-4 py-3">
                        <p className="max-w-[220px] text-xs text-muted-foreground">{user.accessSummary || role?.permissions.join(", ") || "No access"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={role && role.level >= 70 ? "primary" : role && role.level >= 40 ? "success" : "neutral"}>
                          {role ? `Level ${role.level}` : "None"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.mfa ? "success" : "warning"}>{user.mfa ? "Enabled" : "Required"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => toggleUserStatus(user.id)}>
                            {user.status === "ACTIVE" ? "Suspend" : "Activate"}
                          </Button>
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => enforceMfa(user.id)} disabled={user.mfa}>
                            MFA
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <InvoiceWorkspace compact />

        <div className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Role Permissions</h4>
          </div>
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
                  Level {role.level} - {role.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-border bg-muted/50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Access level</p>
              <p className="mt-1 text-lg font-bold">{selectedRole ? `Level ${selectedRole.level}` : "Unassigned"}</p>
            </div>
            <div className="rounded border border-border bg-muted/50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Opens first</p>
              <p className="mt-1 text-sm font-bold">{selectedRole?.home ?? "No workspace"}</p>
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
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {permissionModules.map((module) => {
              const enabled = selectedRole?.permissions.includes(module) ?? false;
              return (
                <button
                  key={module}
                  type="button"
                  className={
                    enabled
                      ? "rounded border border-primary bg-primary px-3 py-2 text-left text-sm font-semibold text-primary-foreground"
                      : "rounded border border-border bg-background px-3 py-2 text-left text-sm font-semibold text-muted-foreground"
                  }
                  onClick={() => togglePermission(module)}
                >
                  {module}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={saveSettings} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Property Settings</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Property name"
              className="sm:col-span-2"
              value={settings.propertyName}
              onChange={(event) => setSettings({ ...settings, propertyName: event.target.value })}
              placeholder="Property name"
            />
            <Input
              aria-label="Currency code"
              value={settings.currencyCode}
              onChange={(event) => setSettings({ ...settings, currencyCode: event.target.value.toUpperCase() })}
              placeholder="Currency"
            />
            <Input
              aria-label="Tax rate"
              value={settings.taxRate}
              onChange={(event) => setSettings({ ...settings, taxRate: event.target.value })}
              placeholder="Tax rate"
            />
            <Input
              aria-label="Business date"
              type="date"
              value={settings.businessDate}
              onChange={(event) => setSettings({ ...settings, businessDate: event.target.value })}
            />
            <Input
              aria-label="Reservation prefix"
              value={settings.reservationPrefix}
              onChange={(event) => setSettings({ ...settings, reservationPrefix: event.target.value.toUpperCase() })}
              placeholder="Reservation prefix"
            />
            <Input
              aria-label="Receipt prefix"
              value={settings.receiptPrefix}
              onChange={(event) => setSettings({ ...settings, receiptPrefix: event.target.value.toUpperCase() })}
              placeholder="Receipt prefix"
            />
          </div>
          <Button className="mt-3">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Save settings
          </Button>
        </form>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Audit Trail</h4>
          </div>
          <div className="divide-y divide-border">
            {audit.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No administration events loaded yet.</div>
            ) : (
              audit.slice(0, 7).map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{event.action}</p>
                      <p className="text-muted-foreground">{event.target}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.actor} - {event.detail}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
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
    lastLogin: "Never",
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

function createAudit(action: string, actor: string, target: string, detail: string): AuditEvent {
  return {
    id: createLocalId("audit"),
    action,
    actor,
    target,
    detail,
    createdAt: new Date().toISOString()
  };
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

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
