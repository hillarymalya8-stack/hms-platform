import { ModuleShell } from "@/components/module-shell";
import { PurchasingWorkspace } from "@/components/purchasing-workspace";

export default function PurchasingPage() {
  return (
    <ModuleShell
      title="Purchasing System"
      eyebrow="Procure to pay"
      description="Purchase orders, approvals, goods receiving, supplier invoice matching, accounts payable, and supplier payments."
      requiredPermissions={["purchasing.view"]}
    >
      <PurchasingWorkspace />
    </ModuleShell>
  );
}
