import { InventoryWorkspace } from "@/components/inventory-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function InventoryPage() {
  return (
    <ModuleShell
      title="Inventory System"
      eyebrow="Stores"
      description="Stock balances, receiving, department issues, transfers, reorder alerts, and stock movement audit."
      requiredPermissions={["inventory.view"]}
    >
      <InventoryWorkspace />
    </ModuleShell>
  );
}
