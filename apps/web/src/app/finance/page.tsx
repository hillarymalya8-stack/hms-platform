import { FinanceWorkspace } from "@/components/finance-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function FinancePage() {
  return (
    <ModuleShell
      title="Finance System"
      eyebrow="Accounting"
      description="General ledger, journal posting, trial balance, business date close, profit and loss, and balance sheet controls."
      requiredPermissions={["accounting.view"]}
    >
      <FinanceWorkspace />
    </ModuleShell>
  );
}
