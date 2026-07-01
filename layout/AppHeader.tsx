"use client";

import Link from "next/link";
import { Bell, Moon, PanelLeft, Search, Sun, UserRound } from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";

export default function AppHeader() {
  const { isMobileOpen, toggleMobileSidebar, toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  return (
    <header className="sticky top-0 z-99999 flex w-full border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex grow flex-col items-center justify-between lg:flex-row lg:px-6">
        <div className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <button
            className="z-99999 flex h-10 w-10 items-center justify-center rounded-lg border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400 lg:h-11 lg:w-11 lg:border"
            onClick={handleToggle}
            aria-label="Toggle sidebar"
            type="button"
          >
            {isMobileOpen ? <span className="text-xl leading-none">x</span> : <PanelLeft size={18} />}
          </button>

          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-xs font-semibold text-white">AN</span>
            <span className="font-semibold text-gray-900 dark:text-white">Accounting</span>
          </Link>

          <div className="hidden lg:block">
            <form>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  <Search size={20} />
                </span>
                <input
                  type="text"
                  placeholder="Search or type command..."
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 xl:w-[430px]"
                />
                <button className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400" type="button">
                  <span>Ctrl</span>
                  <span>K</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-4 px-5 py-4 shadow-theme-md dark:shadow-none lg:w-auto lg:justify-end lg:px-0 lg:shadow-none">
          <div className="flex items-center gap-2 2xsm:gap-3">
            <button
              onClick={toggleTheme}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              type="button"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white" type="button" aria-label="Notifications">
              <span className="absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-warning-500">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning-500 opacity-75" />
              </span>
              <Bell size={20} />
            </button>
          </div>

          <Link href="/analytics" className="flex items-center text-gray-700 dark:text-gray-400">
            <span className="mr-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
              <UserRound size={20} />
            </span>
            <span className="mr-1 hidden font-medium text-theme-sm sm:block">Accounting Ops</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
