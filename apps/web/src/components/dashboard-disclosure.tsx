"use client";

import { ReactNode, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function DashboardDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="rounded-lg border border-border bg-white">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left font-semibold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
          <ChevronDown aria-hidden="true" className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </button>
      </h2>
      <div id={id} hidden={!open}>
        {open ? <div className="border-t border-border p-4">{children}</div> : null}
      </div>
    </section>
  );
}
