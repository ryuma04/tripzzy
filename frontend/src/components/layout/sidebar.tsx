"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  MapPin,
  PlusCircle,
  Users,
  Calendar as CalendarIcon,
  ShieldAlert,
  User,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { mockCurrentUser } from "@/data/mock";
import { logout } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const mainNavItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    label: "My Trips",
    href: "/trips",
    icon: <MapPin className="w-5 h-5" />,
    badge: "3",
    badgeColor: "bg-[#FFF5E9]",
  },
  {
    label: "Create Trip",
    href: "/trips/new",
    icon: <PlusCircle className="w-5 h-5" />,
    badge: "NEW",
    badgeColor: "bg-[#FCA5A5]",
  },
  {
    label: "Explore",
    href: "/explore",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    label: "Community",
    href: "/community",
    icon: <Users className="w-5 h-5" />,
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: <CalendarIcon className="w-5 h-5" />,
  },
  {
    label: "Admin Panel",
    href: "/admin",
    icon: <ShieldAlert className="w-5 h-5" />,
    badge: "PRO",
    badgeColor: "bg-[#FCA5A5]",
  },
];

const secondaryNavItems: NavItem[] = [
  {
    label: "Profile",
    href: "/profile",
    icon: <User className="w-5 h-5" />,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings className="w-5 h-5" />,
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname() || "/dashboard";
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard" && (pathname === "/" || pathname === "/dashboard")) return true;
    if (href === "/trips" && pathname === "/trips") return true;
    if (href === "/trips/new" && pathname === "/trips/new") return true;
    if (href !== "/dashboard" && href !== "/trips" && pathname.startsWith(href)) return true;
    return false;
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-4 bg-[#FFF5E9] border-r-[4px] border-[#171313] select-none">
      {/* Brand Header with Official Tripzyy Logo */}
      <div>
        <div className="mb-6">
          <Link
            href="/dashboard"
            onClick={() => setIsMobileOpen(false)}
            className="flex items-center justify-center px-3 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform block"
          >
            <TripzyyLogo size="sidebar" />
          </Link>
        </div>

        {/* Navigation Category Label */}
        <div className="px-3 mb-2">
          <span className="font-display font-extrabold text-[10px] uppercase tracking-widest text-neutral-600">
            Main Menu
          </span>
        </div>

        {/* Main Nav Links */}
        <nav className="flex flex-col gap-1.5">
          {mainNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide border-[3px] transition-all duration-100 ${
                  active
                    ? "bg-[#E51919] text-[#FFFFFF] border-[#171313] shadow-[3px_3px_0px_#171313] -translate-x-0.5 -translate-y-0.5"
                    : "border-transparent text-[#171313] hover:bg-[#FAECDC] hover:border-[#171313] hover:-translate-x-0.5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={active ? "text-[#FFFFFF]" : "text-[#171313]"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border border-[#171313] shadow-[1px_1px_0px_#171313] ${
                      active
                        ? "bg-[#171313] text-[#FFF5E9]"
                        : item.badgeColor || "bg-[#FCA5A5] text-[#171313]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Nav & User Profile */}
      <div className="pt-4 border-t-[3px] border-[#171313] flex flex-col gap-2">
        <div className="px-3 mb-1">
          <span className="font-display font-extrabold text-[10px] uppercase tracking-widest text-neutral-600">
            Account & System
          </span>
        </div>

        {secondaryNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2 rounded-xl font-display font-bold text-sm border-[2px] transition-all duration-100 ${
                active
                  ? "bg-[#E51919] text-[#FFFFFF] border-[#171313] shadow-[2px_2px_0px_#171313]"
                  : "border-transparent text-[#171313] hover:bg-[#FAECDC] hover:border-[#171313]"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User Card */}
        <div className="mt-2 p-2.5 bg-[#FFFFFF] border-[2px] border-[#171313] rounded-xl flex items-center justify-between shadow-[2px_2px_0px_#171313]">
          <Link
            href="/profile"
            onClick={() => setIsMobileOpen(false)}
            className="flex items-center gap-2.5 truncate"
          >
            <Avatar
              src={mockCurrentUser.avatar_url}
              name={`${mockCurrentUser.first_name} ${mockCurrentUser.last_name}`}
              size="sm"
            />
            <div className="truncate">
              <div className="font-display font-extrabold text-xs text-[#171313] truncate leading-tight">
                {mockCurrentUser.first_name} {mockCurrentUser.last_name}
              </div>
              <div className="text-[10px] font-bold text-neutral-500 uppercase">
                {mockCurrentUser.role}
              </div>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 rounded-lg border border-[#171313] bg-[#FFF5E9] hover:bg-[#E51919] hover:text-white transition-colors cursor-pointer text-[#171313]"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#FFF5E9] border-b-[3px] border-[#171313] z-40 px-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <TripzyyLogo size="sm" />
        </Link>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-xl border-[2px] border-[#171313] bg-[#E51919] shadow-[2px_2px_0px_#171313] text-white cursor-pointer"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-[#171313]/70 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="relative w-72 max-w-[85vw] h-full z-10"
            >
              <SidebarContent />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
