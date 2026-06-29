import type { Metadata } from "next";
import { BarChart3, Database, FileSearch, Inbox, Upload } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accounting Normalization",
  description: "Report intake, validation, review, and Airtable export dashboard"
};

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/reports", label: "Reports", icon: Database },
  { href: "/review", label: "Review", icon: FileSearch }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <strong>Accounting Normalize</strong>
              <span>Parser registry and reconciliation</span>
            </div>
            <nav className="nav" aria-label="Main navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <a href={item.href} key={item.href}>
                    <Icon size={17} aria-hidden="true" />
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </aside>
          <main className="main">
            <div aria-hidden="true" style={{ display: "none" }}>
              <Inbox />
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

