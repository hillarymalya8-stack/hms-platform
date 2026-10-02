import { ModuleShell } from "@/components/module-shell";
import { ReportsWorkspace } from "@/components/reports-workspace";

export default function ReportsPage() {
  return (
    <ModuleShell
      title="Reports System"
      eyebrow="Management"
      description="Occupancy, ADR, RevPAR, revenue mix, AR/AP aging, inventory variance, and export queue controls."
      requiredPermissions={["reports.view"]}
    >
      <ReportsWorkspace />
    </ModuleShell>
  );
}
