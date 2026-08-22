"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { Avatar } from "@/components/ui/avatar";
import { useAuthUser } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";

export const TopBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { user, isAdmin, setRole } = useAuthUser();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleToggleRole = () => {
    const newRole = isAdmin ? "user" : "admin";
    setRole(newRole);
    if (newRole === "admin") {
      showToast("Switched to Admin Commander perspective!", "success");
      if (!pathname.startsWith("/admin")) {
        router.push("/admin");
      }
    } else {
      showToast("Switched to Explorer User perspective!", "info");
      if (pathname.startsWith("/admin")) {
        router.push("/dashboard");
      }
    }
  };

  const sampleNotifications = [
    {
      id: "1",
      title: "Expedition Alert",
      desc: "Goa Beach Hopping starts in 3 days!",
      time: "2h ago",
      icon: <MapPin className="w-4 h-4 text-[#E51919]" />,
    },
    {
      id: "2",
      title: "Budget Update",
      desc: "Expense logged for Mumbai Colaba Hotel",
      time: "5h ago",
      icon: <Calendar className="w-4 h-4 text-[#15803D]" />,
    },
    {
      id: "3",
      title: "Community Upvote",
      desc: "Rohit cloned your Himachal Trek circuit",
      time: "1d ago",
      icon: <Sparkles className="w-4 h-4 text-[#E51919]" />,
    },
  ];

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
        {/* Quick Role Switcher Pill */}
        <button
          type="button"
          onClick={handleToggleRole}
          title={`Click to switch to ${isAdmin ? "User" : "Admin"} mode`}
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2.5px] border-[#171313] text-xs font-display font-extrabold shadow-[2px_2px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer ${
            isAdmin
              ? "bg-[#E51919] text-white"
              : "bg-[#FFFFFF] text-[#171313] hover:bg-[#FAECDC]"
          }`}
        >
          {isAdmin ? (
            <>
              <Shield className="w-3.5 h-3.5 fill-white" />
              <span>Admin Mode</span>
            </>
          ) : (
            <>
              <Compass className="w-3.5 h-3.5 text-[#E51919]" />
              <span>User Mode</span>
            </>
          )}
          <ArrowRightLeft className="w-3 h-3 opacity-70 ml-1" />
        </button>

        {/* Quick Create Trip Button (for users only) */}
        {!isAdmin && (
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
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#E51919] border border-[#171313] rounded-full text-[9px] font-extrabold text-white flex items-center justify-center">
              3
            </span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[6px_6px_0px_#171313] p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313] mb-3">
                <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                  Notifications
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#E51919] text-white border border-[#171313]">
                  3 New
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {sampleNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 bg-[#FAF7F2] border border-[#171313] rounded-xl flex items-start gap-2.5 hover:bg-[#F3ECE2] transition-colors"
                  >
                    <div className="p-1.5 bg-[#FFFFFF] rounded-lg border border-[#171313]">
                      {n.icon}
                    </div>
                    <div>
                      <div className="font-display font-bold text-xs text-[#171313]">
                        {n.title}
                      </div>
                      <div className="text-[11px] text-neutral-600 font-medium leading-tight">
                        {n.desc}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 mt-1">
                        {n.time}
                      </div>
                    </div>
                  </div>
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
            src={user.avatar_url}
            name={`${user.first_name} ${user.last_name}`}
            size="sm"
          />
          <div className="hidden md:flex flex-col text-left">
            <span className="font-display font-black text-xs text-[#171313] leading-none">
              {user.first_name}
            </span>
            <span className="text-[9px] font-extrabold text-neutral-500 uppercase tracking-tight mt-0.5">
              {isAdmin ? "Admin" : "Explorer"}
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
};
