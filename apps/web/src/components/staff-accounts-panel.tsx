"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, RefreshCcw, UserPlus, UsersRound } from "lucide-react";
import { roleAccessLevels, systemAccessGroups } from "@hms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { readSession, type AuthenticatedUser } from "@/lib/auth";

type StaffAccount = {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  permissions: string[];
  homePath: string | null;
  status: string;
  customAccess: boolean;
  createdAt: string;
  userRoles: Array<{ role: { id: string; name: string } }>;
};

type StaffForm = {
  fullName: string;
  username: string;
  password: string;
  permissions: string[];
  homePath: string;
};

const emptyForm: StaffForm = { fullName: "", username: "", password: "", permissions: [], homePath: "" };

export function StaffAccountsPanel() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Create a username and password, then tick the systems this person may open.");

  const canManage = Boolean(currentUser?.permissions.includes("users.manage"));
  const editing = accounts.find((account) => account.id === editingId) ?? null;
  const chosenSystems = systemAccessGroups.filter((group) => form.permissions.includes(group.viewPermission));

  const canGrant = useMemo(() => {
    const held = new Set(currentUser?.permissions ?? []);
    return (code: string) => held.has(code);
  }, [currentUser]);

  useEffect(() => {
    const session = readSession();
    setCurrentUser(session?.user ?? null);
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    setBusy(true);
    const result = await apiRequest<StaffAccount[]>("/users");
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setAccounts(result.data);
  }

  function toggleSystem(viewPermission: string, actionCodes: readonly string[]) {
    setForm((current) => {
      const enabled = current.permissions.includes(viewPermission);
      const permissions = enabled
        ? current.permissions.filter((code) => code !== viewPermission && !actionCodes.includes(code))
        : [...current.permissions, viewPermission];
      const homeGroup = systemAccessGroups.find((group) => group.href === current.homePath);
      const homePath = homeGroup && !permissions.includes(homeGroup.viewPermission) ? "" : current.homePath;
      return { ...current, permissions, homePath };
    });
  }

  function toggleAction(viewPermission: string, code: string) {
    setForm((current) => {
      if (current.permissions.includes(code)) {
        return { ...current, permissions: current.permissions.filter((entry) => entry !== code) };
      }
      const permissions = new Set([...current.permissions, code, viewPermission]);
      return { ...current, permissions: [...permissions] };
    });
  }

  function applyTemplate(key: string) {
    const template = roleAccessLevels.find((accessLevel) => accessLevel.key === key);
    if (!template) return;
    const permissions = template.permissionCodes.filter((code) => canGrant(code));
    setForm((current) => ({ ...current, permissions, homePath: "" }));
    setMessage(`${template.name} access loaded as a starting point. Adjust the ticks before saving.`);
  }

  function startEdit(account: StaffAccount) {
    setEditingId(account.id);
    setForm({
      fullName: account.fullName,
      username: account.username ?? account.email,
      password: "",
      permissions: [...account.permissions],
      homePath: account.homePath ?? ""
    });
    setMessage(
      account.customAccess || account.userRoles.length === 0
        ? `Editing ${account.fullName}. Leave the password blank to keep the current one.`
        : `Editing ${account.fullName}. Saving replaces their ${account.userRoles.map((entry) => entry.role.name).join(", ")} role with exactly the ticks below.`
    );
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("Create a username and password, then tick the systems this person may open.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.fullName.trim() || (!editing && (!form.username.trim() || !form.password))) {
      setMessage("Enter a full name, username, and password.");
      return;
    }
    if (form.password && form.password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (chosenSystems.length === 0) {
      setMessage("Tick at least one system this person can open.");
      return;
    }

    setBusy(true);
    const payload = {
      fullName: form.fullName.trim(),
      permissions: form.permissions,
      homePath: form.homePath || null,
      ...(form.password ? { password: form.password } : {})
    };
    const result = editing
      ? await apiRequest<StaffAccount>(`/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await apiRequest<StaffAccount>("/users", {
          method: "POST",
          body: JSON.stringify({ ...payload, username: form.username.trim() })
        });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setAccounts((current) =>
      editing ? current.map((account) => (account.id === result.data.id ? result.data : account)) : [result.data, ...current]
    );
    setEditingId(null);
    setForm(emptyForm);
    setMessage(
      editing
        ? `${result.data.fullName}'s access was updated. It applies the next time they open a page.`
        : `${result.data.fullName} can now sign in as "${result.data.username ?? result.data.email}".`
    );
  }

  async function toggleStatus(account: StaffAccount) {
    const status = account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setBusy(true);
    const result = await apiRequest<StaffAccount>(`/users/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setAccounts((current) => current.map((entry) => (entry.id === account.id ? result.data : entry)));
    setMessage(`${account.fullName} is now ${status.toLowerCase()}.`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded border border-border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">{editing ? `Edit ${editing.fullName}` : "Create Staff Login"}</h4>
          </div>
          {!editing && canManage ? (
            <select
              aria-label="Start from a role template"
              className="h-9 rounded border border-border bg-white px-3 text-sm"
              value=""
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">Start from a role template (optional)</option>
              {roleAccessLevels.map((accessLevel) => (
                <option key={accessLevel.key} value={accessLevel.key}>
                  {accessLevel.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <p className="mb-3 rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <fieldset disabled={!canManage || busy} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Full name"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              placeholder="Full name"
            />
            <Input
              aria-label="Username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().replace(/\s+/g, "") })}
              placeholder="Username"
              autoCapitalize="none"
              autoComplete="off"
              disabled={Boolean(editing)}
            />
            <Input
              aria-label="Password"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={editing ? "New password (optional)" : "Password (min 8 characters)"}
              autoComplete="new-password"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">What can they open?</p>
            <div className="grid gap-3 md:grid-cols-2">
              {systemAccessGroups.map((group) => {
                const enabled = form.permissions.includes(group.viewPermission);
                const actionCodes = group.actions.map((action) => action.code);
                return (
                  <div
                    key={group.key}
                    className={enabled ? "rounded border border-primary bg-white p-3 ring-1 ring-primary" : "rounded border border-border bg-background p-3"}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-primary"
                        checked={enabled}
                        disabled={!canGrant(group.viewPermission)}
                        onChange={() => toggleSystem(group.viewPermission, actionCodes)}
                      />
                      <span>
                        <span className="block text-sm font-semibold">{group.label}</span>
                        <span className="block text-xs text-muted-foreground">{group.description}</span>
                      </span>
                    </label>
                    {group.actions.length ? (
                      <div className="mt-2 grid gap-1 pl-6 sm:grid-cols-2">
                        {group.actions.map((action) => (
                          <label key={action.code} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={form.permissions.includes(action.code)}
                              disabled={!canGrant(action.code)}
                              onChange={() => toggleAction(group.viewPermission, action.code)}
                            />
                            {action.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Opens first after login</span>
            <select
              aria-label="Opens first after login"
              className="h-10 w-full rounded border border-border bg-white px-3 text-sm sm:w-80"
              value={form.homePath}
              onChange={(event) => setForm({ ...form, homePath: event.target.value })}
            >
              <option value="">Automatic (based on their access)</option>
              {chosenSystems.map((group) => (
                <option key={group.key} value={group.href}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {editing ? "Save changes" : "Create login"}
            </Button>
            {editing ? (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </fieldset>
        {!canManage && currentUser ? (
          <p className="mt-3 text-xs text-muted-foreground">Your account can view staff logins but not change them.</p>
        ) : null}
      </form>

      <div className="overflow-hidden rounded border border-border bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Staff Logins</h4>
            <Badge>{accounts.length}</Badge>
          </div>
          <Button type="button" variant="ghost" className="h-8 px-3" onClick={loadAccounts} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Can open</th>
                <th className="px-4 py-3 font-semibold">Opens first</th>
                <th className="px-4 py-3 font-semibold">Access set by</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No staff logins yet. Create one above.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => {
                  const systems = systemAccessGroups.filter((group) => account.permissions.includes(group.viewPermission));
                  const home = systemAccessGroups.find((group) => group.href === account.homePath);
                  return (
                    <tr key={account.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{account.fullName}</p>
                        <p className="text-xs text-muted-foreground">{account.username ?? account.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[240px] text-xs text-muted-foreground">
                          {systems.map((group) => group.label).join(", ") || "No access"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">{home?.label ?? "Automatic"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {account.customAccess || account.userRoles.length === 0
                          ? "Admin ticks"
                          : `Role: ${account.userRoles.map((entry) => entry.role.name).join(", ")}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={account.status === "ACTIVE" ? "success" : "danger"}>{account.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => startEdit(account)} disabled={!canManage || busy}>
                            <Pencil className="h-3.5 w-3.5 accent-primary" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => toggleStatus(account)} disabled={!canManage || busy}>
                            {account.status === "ACTIVE" ? "Suspend" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
