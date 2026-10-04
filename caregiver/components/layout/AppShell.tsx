"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  HeartPulse,
  Home,
  Menu,
  Users,
} from "lucide-react";

interface AppShellProps {
  children: ReactNode;
  unreadCount?: number;
}

export function AppShell({
  children,
  unreadCount = 0,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1F2937]">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-20 items-center border-b border-gray-100 px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2EC4B6] text-white">
                <HeartPulse size={21} />
              </div>

              <div>
                <p className="text-base font-bold text-gray-900">
                  OncoCare+
                </p>

                <p className="text-[11px] text-gray-400">
                  Caregiver
                </p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-xl bg-[#E8F8F6] px-4 py-3 text-sm font-medium text-[#0F766E]"
            >
              <Home size={18} />
              Dashboard
            </Link>

            <Link
              href="/patients"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <Users size={18} />
              My Patients
            </Link>

            <Link
              href="/notifications"
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <span className="flex items-center gap-3">
                <Bell size={18} />
                Notifications
              </span>

              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2EC4B6] px-1.5 text-[10px] font-bold text-white">
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </Link>
          </nav>

          <div className="border-t border-gray-100 p-4">
            <div className="rounded-xl bg-[#F5F7FA] p-3">
              <p className="text-xs font-medium text-gray-700">
                OncoCare+ Caregiver
              </p>

              <p className="mt-1 text-[11px] leading-4 text-gray-400">
                Care coordination workspace
              </p>
            </div>
          </div>
        </aside>

        {/* Main area */}
        <div className="min-w-0 flex-1">
          {/* Mobile header */}
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur lg:hidden">
            <Link
              href="/dashboard"
              className="flex items-center gap-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2EC4B6] text-white">
                <HeartPulse size={18} />
              </div>

              <span className="font-bold text-gray-900">
                OncoCare+
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <Bell size={20} />

                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-[#EF4444]" />
                )}
              </Link>

              <button
                type="button"
                aria-label="Open navigation"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <Menu size={21} />
              </button>
            </div>
          </header>

          <main className="min-h-screen">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}