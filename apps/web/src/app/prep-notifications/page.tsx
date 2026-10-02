import { ModuleShell } from "@/components/module-shell";
import { PrepNotificationsWorkspace } from "@/components/prep-notifications-workspace";

export default function PrepNotificationsPage() {
  return (
    <ModuleShell
      title="Prep Notifications"
      eyebrow="Kitchen and bar"
      description="Live routing monitor for restaurant kitchen, bar printer, and service desk POS tickets."
      requiredPermissions={["pos.view"]}
    >
      <PrepNotificationsWorkspace />
    </ModuleShell>
  );
}
