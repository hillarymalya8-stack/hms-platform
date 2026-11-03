import { InventoryWorkspace } from "@/components/inventory-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function InventoryPage() {
  return (
    <ModuleShell
      title="Inventory System"
      eyebrow="Stores"
      description="Check stock, receive items, move stock, or open Daily Usage to record what your section used."
      requiredPermissions={["inventory.view"]}
    >
      <InventoryWorkspace />
    </ModuleShell>
  );
}
