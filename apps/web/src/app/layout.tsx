import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HMS Platform",
  description: "Integrated hotel management, POS, inventory, purchasing, and finance platform."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
