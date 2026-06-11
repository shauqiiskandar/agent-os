import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Command Center — Mission Control",
  description: "Centralized hub for orchestrating tools across D:\\ai-sandbox\\ projects.",
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
