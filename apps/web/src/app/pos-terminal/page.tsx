import type { Metadata } from "next";
import { PosTerminalApp } from "@/components/pos-terminal-app";

export const metadata: Metadata = {
  title: "POS Terminal | HMS Platform",
  description: "Dedicated cashier terminal interface linked to the hotel database."
};

export default function PosTerminalPage() {
  return <PosTerminalApp />;
}
