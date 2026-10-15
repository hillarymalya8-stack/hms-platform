"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <Button
        ref={toggleRef}
        type="button"
        variant="secondary"
        className="w-full justify-between lg:hidden"
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Close menu" : "Open menu"}
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </Button>
      <div
        id={navigationId}
        className={open ? "mt-3 lg:mt-0" : "hidden lg:block"}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            setOpen(false);
            toggleRef.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
