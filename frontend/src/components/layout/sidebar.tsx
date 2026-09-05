"use client";

import React, { useState, useEffect } from "react";
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
  Building2,
  User as UserIcon,
  Settings,
  LogOut,
  Menu,
  X,
  Briefcase,
  AlertTriangle,
  Wallet,
  MessageSquare,
  Activity,
  Truck,
  Shield,
  Send,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { logout, useAuthUser, getStoredUser } from "@/lib/auth";
import { useClerk } from "@clerk/nextjs";
import { operatorService } from "@/services/operator";
import type { User } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

// 1. Explorer / Traveller Navigation
const explorerNavItems: NavItem[] = [
  {
    label: "Explorer Desk",
    href: "/dashboard",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    label: "My Expeditions",
    href: "/trips",
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    label: "Plan New Trip",
    href: "/trips/new",
    icon: <PlusCircle className="w-5 h-5" />,
    badge: "AI",
    badgeColor: "bg-[#E51919] text-white",
  },
  {
    label: "Discover Places",
    href: "/explore",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    label: "Trip Calendar",
    href: "/calendar",
    icon: <CalendarIcon className="w-5 h-5" />,
  },
];

// 2. Tour & Travel (Operator & Coordinator Unified) Navigation
const tourAndTravelNavItems: NavItem[] = [
  {
    label: "Tour & Travel Mission",
    href: "/dashboard?view=operator",
    icon: <Building2 className="w-5 h-5" />,
    badge: "OPS",
    badgeColor: "bg-[#D97706] text-white",
  },
  {
    label: "Tour Operations",
    href: "/operator",
    icon: <Truck className="w-5 h-5" />,
  },
];

// 4. Station Administrator Navigation
const adminNavItems: NavItem[] = [
  {
    label: "Station Command",
    href: "/admin",
    icon: <ShieldAlert className="w-5 h-5" />,
    badge: "ROOT",
    badgeColor: "bg-[#171313] text-white",
  },
  {
    label: "User Directory",
    href: "/admin",
    icon: <Users className="w-5 h-5" />,
  },
  {
    label: "Destination Catalog",
    href: "/admin",
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    label: "System Telemetry",
    href: "/admin",
    icon: <Activity className="w-5 h-5" />,
  },
  {
    label: "Explorer Preview",
    href: "/dashboard",
    icon: <Compass className="w-5 h-5" />,
  },
];

const secondaryNavItems: NavItem[] = [
  {
    label: "Profile",
    href: "/profile",
    icon: <UserIcon className="w-5 h-5" />,
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname() || "/dashboard";
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, isAdmin, isOperator, isCoordinator } = useAuthUser();
  const { signOut } = useClerk();

  const [isOperatorStaff, setIsOperatorStaff] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsOperatorStaff(false);
      return;
    }
    let cancelled = false;
    operatorService.profile().then((res) => {
      if (!cancelled) setIsOperatorStaff(res.success);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (href: string) => {
    if (href === "/admin" && pathname.startsWith("/admin")) return true;
    if (href === "/operator" && pathname.startsWith("/operator")) return true;
    if (href === "/dashboard" && (pathname === "/" || pathname === "/dashboard")) return true;
    if (href === "/trips" && pathname === "/trips") return true;
    if (href === "/trips/new" && pathname === "/trips/new") return true;
    if (
      href !== "/dashboard" &&
      href !== "/admin" &&
      href !== "/operator" &&
      href !== "/trips" &&
      pathname.startsWith(href)
    )
      return true;
    return false;
  };

  const handleLogout = async () => {
    await logout();
    await signOut({ redirectUrl: "/login" });
  };

  // Track active role view mode
  const [activeRoleView, setActiveRoleView] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlView = searchParams.get("view");
      if (urlView) return urlView;
      const storedView = localStorage.getItem("tripzyy_active_role_view");
      if (storedView) return storedView;
      const pendingRole = localStorage.getItem("tripzyy_pending_role");
      if (pendingRole) return pendingRole;
      const stored = getStoredUser();
      if (stored?.role === "operator" || stored?.operator_role) return "operator";
      if (stored?.role) return stored.role;
    }
    return "user";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlView = searchParams.get("view");
      const storedView = localStorage.getItem("tripzyy_active_role_view");
      const pendingRole = localStorage.getItem("tripzyy_pending_role");
      const stored = getStoredUser();
      const effective = user || stored;

      if (urlView) {
        setActiveRoleView(urlView);
      } else if (storedView) {
        setActiveRoleView(storedView);
      } else if (pendingRole) {
        setActiveRoleView(pendingRole);
      } else if (effective?.role === "operator" || effective?.operator_role) {
        setActiveRoleView("operator");
      } else if (effective?.role === "admin") {
        setActiveRoleView("admin");
      } else if (effective?.role) {
        setActiveRoleView(effective.role);
      }
    }
  }, [pathname, user]);

  const storedUser = typeof window !== "undefined" ? getStoredUser() : null;
  const effectiveUser = user || storedUser;
  const pendingRole = typeof window !== "undefined" ? localStorage.getItem("tripzyy_pending_role") : null;

  const isOperatorStaffMember = Boolean(
    isAdmin ||
    isOperator ||
    isCoordinator ||
    isOperatorStaff ||
    effectiveUser?.role === "operator" ||
    effectiveUser?.role === "coordinator" ||
    effectiveUser?.role === "admin" ||
    effectiveUser?.operator_role ||
    pendingRole === "operator" ||
    pendingRole === "coordinator"
  );

  const isStationAdmin = Boolean(
    (isAdmin || effectiveUser?.role === "admin") &&
    (pathname.startsWith("/admin") || activeRoleView === "admin") &&
    activeRoleView !== "operator" &&
    activeRoleView !== "user"
  );

  const isTourAndTravel = Boolean(
    !isStationAdmin &&
    isOperatorStaffMember &&
    (activeRoleView === "operator" ||
      activeRoleView === "coordinator" ||
      pathname.startsWith("/operator")) &&
    activeRoleView !== "admin"
  );

  const currentNavItems = isStationAdmin
    ? adminNavItems
    : isTourAndTravel
    ? tourAndTravelNavItems
    : isOperatorStaffMember
    ? [
        ...explorerNavItems,
        {
          label: "Tour & Travel",
          href: "/dashboard?view=operator",
          icon: <Building2 className="w-5 h-5" />,
          badge: "OPS",
          badgeColor: "bg-[#D97706] text-white",
        },
      ]
    : explorerNavItems;

  const roleLabel = isStationAdmin
    ? "Station Admin"
    : isTourAndTravel
    ? "Tour & Travel Mission"
    : "Explorer Station";

  const roleBadge = isStationAdmin
    ? "ADMIN"
    : isTourAndTravel
    ? "TOUR & TRAVEL"
    : "EXPLORER";

  const roleBadgeColor = isStationAdmin
    ? "bg-[#171313]"
    : isTourAndTravel
    ? "bg-[#D97706]"
    : "bg-[#15803D]";

  const homeRedirect = isStationAdmin
    ? "/admin"
    : isTourAndTravel
    ? "/dashboard?view=operator"
    : "/dashboard";

  const SidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-4 bg-[#EAD7C0] text-[#171313] border-r-[4px] border-[#171313] select-none shadow-[2px_0px_10px_rgba(23,19,19,0.06)]">
      {/* Brand Header with Official Tripzyy Logo */}
      <div>
        <div className="mb-6">
          <Link
            href={homeRedirect}
            onClick={() => setIsMobileOpen(false)}
            className="flex items-center justify-center px-3 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform block"
          >
            <TripzyyLogo size="sidebar" />
          </Link>
        </div>

        {/* Dynamic Navigation Category Label */}
        <div className="px-3 mb-2.5 flex items-center justify-between">
          <span className="font-display font-black text-[10px] uppercase tracking-widest text-neutral-800">
            {roleLabel}
          </span>
          <span
            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#171313] text-white shadow-[1px_1px_0px_#171313] ${roleBadgeColor}`}
          >
            {roleBadge}
          </span>
        </div>

        {/* Role-Specific Main Nav Links */}
        <nav className="flex flex-col gap-1.5">
          {currentNavItems.map((item, idx) => {
            const active = isActive(item.href);
            return (
              <Link
                key={`${item.href}-${idx}`}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide border-[3px] transition-all duration-100 ${
                  active
                    ? "bg-[#E51919] text-[#FFFFFF] border-[#171313] shadow-[3px_3px_0px_#171313] -translate-x-0.5 -translate-y-0.5"
                    : "border-transparent text-[#171313] hover:bg-[#DAC0A3] hover:border-[#171313] hover:-translate-x-0.5"
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
                        : item.badgeColor || "bg-[#DAC0A3] text-[#171313]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Secondary Links */}
        <div className="mt-6 pt-4 border-t-2 border-[#D9C3B0]/80">
          <div className="px-3 mb-2">
            <span className="font-display font-extrabold text-[10px] uppercase tracking-widest text-neutral-600">
              Account & System
            </span>
          </div>
          <nav className="flex flex-col gap-1.5">
            {secondaryNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2 rounded-xl font-display font-bold text-xs tracking-wide border-[2px] transition-all duration-100 ${
                    active
                      ? "bg-[#FFFFFF] text-[#171313] border-[#171313] shadow-[2px_2px_0px_#171313]"
                      : "border-transparent text-neutral-700 hover:bg-[#DAC0A3] hover:border-[#171313]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-700">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* User Profile Pill & Sign Out */}
      <div className="pt-4 border-t-2 border-[#D9C3B0]/80">
        <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFFFFF] border-[2.5px] border-[#171313] shadow-[2px_2px_0px_#171313]">
          <Link
            href="/profile"
            onClick={() => setIsMobileOpen(false)}
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
          >
            <Avatar
              name={
                user
                  ? `${user.first_name} ${user.last_name}`
                  : "User"
              }
              size="sm"
            />
            <div className="flex flex-col min-w-0">
              <span className="font-display font-black text-xs text-[#171313] truncate">
                {user
                  ? `${user.first_name} ${user.last_name}`
                  : "Traveler"}
              </span>
              <span
                className={`text-[9px] font-black uppercase tracking-wider ${
                  isAdmin
                    ? "text-[#171313]"
                    : isOperator || user?.role === "operator"
                    ? "text-[#D97706]"
                    : isCoordinator || user?.role === "coordinator"
                    ? "text-[#7C3AED]"
                    : "text-[#15803D]"
                }`}
              >
                {roleBadge}
              </span>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 text-[#171313] hover:text-[#E51919] hover:bg-neutral-100 rounded-lg border border-transparent hover:border-[#171313] transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 flex-shrink-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Top Header Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#FFF5E9] border-b-[3px] border-[#171313] z-40 px-4 flex items-center justify-between shadow-[0_2px_4px_rgba(23,19,19,0.05)]">
        <Link href={homeRedirect} className="flex items-center">
          <TripzyyLogo size="md" />
        </Link>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 border-[2.5px] border-[#171313] rounded-xl bg-[#FFFFFF] shadow-[2px_2px_0px_#171313] hover:bg-[#FAF7F2] transition-colors"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-6 h-6 text-[#171313]" />
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-neutral-900/60 z-50 md:hidden backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#EAD7C0] z-50 md:hidden border-r-[4px] border-[#171313] shadow-2xl"
            >
              <div className="relative h-full flex flex-col">
                <button
                  onClick={() => setIsMobileOpen(false)}
                  className="absolute top-4 right-4 p-1.5 border-[2px] border-[#171313] rounded-lg bg-[#FFFFFF] shadow-[2px_2px_0px_#171313] z-10"
                  aria-label="Close Navigation"
                >
                  <X className="w-5 h-5 text-[#171313]" />
                </button>
                <div className="h-full overflow-y-auto">
                  <SidebarContent />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
