import { FrontOfficeWorkspace } from "@/components/front-office-workspace";
import { ModuleShell } from "@/components/module-shell";

export default function FrontOfficePage() {
  return (
    <ModuleShell
      title="Front Office System"
      eyebrow="Reception"
      description="Guests, rooms, reservations, check-in, check-out, and folio handoff for reception staff."
      requiredPermissions={["front_office.view"]}
    >
      <FrontOfficeWorkspace />
    </ModuleShell>
  );
}
