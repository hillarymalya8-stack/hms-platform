import { AuditTrailPanel } from "@/components/audit-trail-panel";
import { ModuleShell } from "@/components/module-shell";

export default function AuditTrailPage() {
  return (
    <ModuleShell
      title="Audit Trail"
      eyebrow="Security"
      description="Who sold, collected, edited, voided and moved stock - searchable by staff member, date, item and action."
      requiredPermissions={["audit.view"]}
    >
      <AuditTrailPanel />
    </ModuleShell>
  );
}
