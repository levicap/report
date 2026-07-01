import type { Metadata } from "next";
import AdminShell from "@/layout/AdminShell";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accounting Normalization",
  description: "Report intake, validation, review, and Airtable export dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="dark:bg-gray-900">
        <ThemeProvider>
          <SidebarProvider>
            <AdminShell>{children}</AdminShell>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
