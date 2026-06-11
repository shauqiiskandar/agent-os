import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "command_center — mission control",
  description: "Watch the ask sub-agent reason and act in real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">
        {children}
      </body>
    </html>
  );
}
