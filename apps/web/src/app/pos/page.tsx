import { ModuleShell } from "@/components/module-shell";
import { PosWorkspace } from "@/components/pos-workspace";

export default function PosManagementPage() {
  return (
    <ModuleShell
      title="POS Management System"
      eyebrow="Outlet control"
      description="Outlet products, table sales, payment policy checks, receipt references, and paid sale review."
      requiredPermissions={["pos.view"]}
    >
      <PosWorkspace />
    </ModuleShell>
  );
}
