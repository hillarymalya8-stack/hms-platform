import { FinanceWorkspace } from "@/components/finance-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function FinancePage() {
  return (
    <ModuleShell
      title="Finance System"
      eyebrow="Accounting"
      description="Record income and expenses, review balances, make guest invoices, and finish the business day."
      requiredPermissions={["accounting.view"]}
    >
      <FinanceWorkspace />
    </ModuleShell>
  );
}
