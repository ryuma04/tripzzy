"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Bell,
  Plus,
  Sparkles,
  MapPin,
  Calendar,
  Shield,
  Compass,
  ArrowRightLeft,
  Building2,
} from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { Avatar } from "@/components/ui/avatar";
import { getStoredUser, getCurrentUser, useAuthUser } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { notificationService } from "@/services/notifications";
import type { User, TripzyyNotification } from "@/types";

export const TopBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { user, isAdmin } = useAuthUser();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<TripzyyNotification[]>([]);

  const [unreadCount, setUnreadCount] = useState(0);

  // Fetched from the API. These used to come out of localStorage, which meant
  // they were per-browser and only ever visible to whoever created them.
  useEffect(() => {
    if (!showNotifications) return;
    let cancelled = false;
    (async () => {
      const res = await notificationService.list({ limit: 10 });
      if (cancelled || !res.success || !res.data) return;
      setNotifications(res.data.items);
      setUnreadCount(res.data.unread_count);
    })();
    return () => {
      cancelled = true;
    };
  }, [showNotifications]);

  const handleMarkRead = async (id: string) => {
    const res = await notificationService.markRead(id);
    if (!res.success) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-20 w-full h-20 bg-[#FFF5E9]/90 backdrop-blur-md border-b-[3px] border-[#171313] px-6 lg:px-8 flex items-center justify-between gap-4 select-none">
      {/* Search Input */}
      <form
        onSubmit={handleSearchSubmit}
        className="flex-1 max-w-md relative hidden sm:block"
      >
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trips, cities, activities, or tags..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl text-xs sm:text-sm font-medium text-[#171313] placeholder:text-neutral-500 shadow-[3px_3px_0px_#171313] focus:outline-none focus:bg-[#FFFDFB] focus:shadow-[4px_4px_0px_#E51919] transition-all"
          />
          <Search className="w-4 h-4 text-neutral-600 absolute left-3.5 pointer-events-none" />
        </div>
      </form>

      {/* Right Controls */}
      <div className="flex items-center gap-3 sm:gap-4 ml-auto">
        {/* Role indicator. Read-only: the role comes from the server on the
            access token. This used to be a button that flipped it in
            localStorage, which was a one-click self-promotion to admin. */}
        {/* Dynamic Role Badge */}
        {isAdmin ? (
          <span
            title="Signed in as Station Administrator"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2.5px] border-[#171313] text-xs font-display font-extrabold shadow-[2px_2px_0px_#171313] bg-[#171313] text-white"
          >
            <Shield className="w-3.5 h-3.5 text-[#E51919]" />
            <span>Admin</span>
          </span>
        ) : user?.role === "operator" || user?.operator_role === "owner" || user?.operator_role === "manager" ? (
          <span
            title="Signed in as Tour Operator"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2.5px] border-[#171313] text-xs font-display font-extrabold shadow-[2px_2px_0px_#171313] bg-[#D97706] text-white"
          >
            <Shield className="w-3.5 h-3.5 fill-white" />
            <span>Operator</span>
          </span>
        ) : user?.role === "coordinator" || user?.operator_role === "coordinator" ? (
          <span
            title="Signed in as Field Coordinator"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2.5px] border-[#171313] text-xs font-display font-extrabold shadow-[2px_2px_0px_#171313] bg-[#7C3AED] text-white"
          >
            <Compass className="w-3.5 h-3.5 text-white" />
            <span>Coordinator</span>
          </span>
        ) : (
          <span
            title="Signed in as Explorer"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2.5px] border-[#171313] text-xs font-display font-extrabold shadow-[2px_2px_0px_#171313] bg-[#15803D] text-white"
          >
            <Compass className="w-3.5 h-3.5 text-white" />
            <span>Explorer</span>
          </span>
        )}

        {/* Quick Action Button based on Role */}
        {isAdmin ? (
          <Link href="/admin">
            <NeoButton
              variant="primary"
              size="sm"
              leftIcon={<Shield className="w-4 h-4" />}
              className="hidden sm:inline-flex"
            >
              Admin Console
            </NeoButton>
          </Link>
        ) : user?.role === "operator" || user?.operator_role === "owner" || user?.operator_role === "manager" ? (
          <Link href="/operator">
            <NeoButton
              variant="primary"
              size="sm"
              leftIcon={<Building2 className="w-4 h-4" />}
              className="hidden sm:inline-flex"
            >
              Operations Console
            </NeoButton>
          </Link>
        ) : user?.role === "coordinator" || user?.operator_role === "coordinator" ? (
          <Link href="/dashboard">
            <NeoButton
              variant="primary"
              size="sm"
              leftIcon={<Compass className="w-4 h-4" />}
              className="hidden sm:inline-flex"
            >
              Flight Deck
            </NeoButton>
          </Link>
        ) : (
          <Link href="/trips/new">
            <NeoButton
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
              className="hidden sm:inline-flex"
            >
              New Trip
            </NeoButton>
          </Link>
        )}

        {/* Notifications Dropdown Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-10 h-10 rounded-xl border-[2px] border-[#171313] bg-[#FFFFFF] flex items-center justify-center text-[#171313] shadow-[2px_2px_0px_#171313] hover:bg-[#FAF7F2] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#E51919] border border-[#171313] rounded-full text-[9px] font-extrabold text-white flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-84 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[6px_6px_0px_#171313] p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313] mb-3">
                <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                  Notifications &amp; Splits
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#E51919] text-white border border-[#171313]">
                  {unreadCount} unread
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {notifications.length === 0 && (
                  <p className="text-[11px] font-semibold text-neutral-500 py-4 text-center">
                    Nothing new right now.
                  </p>
                )}
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                    className={`w-full text-left p-2.5 border border-[#171313] rounded-xl flex items-start gap-2.5 transition-colors ${
                      n.is_read
                        ? "bg-[#FAF7F2] hover:bg-[#F3ECE2]"
                        : "bg-[#FFF4E6] hover:bg-[#FAECDC]"
                    }`}
                  >
                    <div className="p-1.5 bg-[#FFFFFF] rounded-lg border border-[#171313] flex-shrink-0 mt-0.5">
                      {n.type === "bill_split" ? (
                        <span className="text-xs">🧾</span>
                      ) : (
                        <MapPin className="w-4 h-4 text-[#E51919]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-bold text-xs text-[#171313] truncate">
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#E51919] flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-600 font-medium leading-tight mt-0.5">
                        {n.body}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 mt-1">
                        {new Date(n.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Header Link */}
        <Link
          href="/profile"
          className="flex items-center gap-2.5 pl-2 border-l-2 border-[#171313] hover:opacity-90 transition-opacity"
        >
          <Avatar
            src={user?.avatar_url}
            name={user ? `${user.first_name} ${user.last_name}` : "Explorer"}
            size="sm"
          />
          <span suppressHydrationWarning className="hidden md:inline font-display font-extrabold text-xs uppercase text-[#171313]">
            {user?.first_name || "Explorer"}
          </span>
        </Link>
      </div>
    </header>
  );
};
