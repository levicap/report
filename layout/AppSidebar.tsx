"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  CircleEllipsis,
  Database,
  FileSearch,
  FileUp,
  Layers3,
  LineChart,
  MessageSquareText,
  Upload
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: Array<{ name: string; path: string; badge?: string }>;
};

const mainItems: NavItem[] = [
  {
    name: "Dashboard",
    icon: <BarChart3 size={20} />,
    subItems: [
      { name: "Operations", path: "/" },
      { name: "Unified Reports", path: "/analytics", badge: "new" }
    ]
  },
  {
    name: "Ingestion",
    icon: <FileUp size={20} />,
    subItems: [
      { name: "Unified Upload", path: "/analytics/upload", badge: "new" },
      { name: "Airtable Upload", path: "/upload" }
    ]
  },
  { name: "Reports", icon: <Database size={20} />, path: "/reports" },
  { name: "Review", icon: <FileSearch size={20} />, path: "/review" },
  { name: "Comments", icon: <MessageSquareText size={20} />, path: "/comments" }
];

const systemItems: NavItem[] = [
  { name: "Parser Registry", icon: <Layers3 size={20} />, path: "/analytics/upload" },
  { name: "Analytics Model", icon: <LineChart size={20} />, path: "/analytics" }
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;

  const isActive = (path: string) => pathname === path;
  const groupIsActive = (item: NavItem) => Boolean(item.subItems?.some((subItem) => isActive(subItem.path)));

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${
        expanded ? "w-[290px]" : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex py-8 ${expanded ? "justify-start" : "justify-center"}`}>
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-theme-sm">AN</span>
          {expanded ? (
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-gray-900 dark:text-white">Accounting</span>
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Normalization</span>
            </span>
          ) : null}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear custom-scrollbar">
        <nav className="mb-6">
          <SidebarSection title="Menu" expanded={expanded} items={mainItems} pathname={pathname} />
          <SidebarSection title="System" expanded={expanded} items={systemItems} pathname={pathname} />
        </nav>

        {expanded ? (
          <div className="mx-auto mb-10 w-full max-w-60 rounded-2xl bg-gray-50 px-4 py-5 text-center dark:bg-white/[0.03]">
            <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">Unified report model</h3>
            <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">Client-selected parsers write canonical JSON, raw tables, line rows, totals, and provenance.</p>
            <Link href="/analytics/upload" className="flex items-center justify-center rounded-lg bg-brand-500 p-3 text-theme-sm font-medium text-white hover:bg-brand-600">
              Parse report
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );

  function SidebarSection({ title, expanded, items, pathname }: { title: string; expanded: boolean; items: NavItem[]; pathname: string }) {
    return (
      <div className="mb-6">
        <h2 className={`mb-4 flex text-xs uppercase leading-5 text-gray-400 ${expanded ? "justify-start" : "justify-center"}`}>
          {expanded ? title : <CircleEllipsis size={20} />}
        </h2>
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const active = item.path ? isActive(item.path) : groupIsActive(item);
            return (
              <li key={item.name}>
                {item.path ? (
                  <Link href={item.path} className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${expanded ? "lg:justify-start" : "lg:justify-center"}`}>
                    <span className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{item.icon}</span>
                    {expanded ? <span>{item.name}</span> : null}
                  </Link>
                ) : (
                  <div className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${expanded ? "lg:justify-start" : "lg:justify-center"}`}>
                    <span className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{item.icon}</span>
                    {expanded ? <span>{item.name}</span> : null}
                    {expanded ? <ChevronDown className={`ml-auto h-5 w-5 ${active ? "rotate-180 text-brand-500" : "text-gray-500"}`} /> : null}
                  </div>
                )}
                {item.subItems && expanded ? (
                  <ul className="ml-9 mt-2 space-y-1">
                    {item.subItems.map((subItem) => (
                      <li key={subItem.path}>
                        <Link href={subItem.path} className={`menu-dropdown-item ${isActive(subItem.path) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}>
                          {subItem.name}
                          {subItem.badge ? <span className="ml-auto rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium uppercase text-brand-500 dark:bg-brand-500/15">{subItem.badge}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}
