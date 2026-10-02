import { OfflineSyncWorkspace } from "@/components/offline-sync-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function OfflineSyncPage() {
  return (
    <ModuleShell
      title="Offline Sync Center"
      eyebrow="Resilience"
      description="Machine queues, offline POS sales, sync retries, conflicts, and device readiness."
      requiredPermissions={["pos.view"]}
    >
      <OfflineSyncWorkspace />
    </ModuleShell>
  );
}
