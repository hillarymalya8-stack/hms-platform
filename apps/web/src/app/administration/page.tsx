import { AdminWorkspace } from "@/components/admin-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function AdministrationPage() {
  return (
    <ModuleShell
      title="Administration System"
      eyebrow="Security"
      description="Users, roles, permissions, MFA enforcement, property settings, numbering rules, and audit controls."
      requiredPermissions={["users.view", "roles.view", "settings.view"]}
    >
      <AdminWorkspace />
    </ModuleShell>
  );
}
