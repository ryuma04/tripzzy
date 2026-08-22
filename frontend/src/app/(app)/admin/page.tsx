"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Users,
  MapPin,
  Compass,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  CheckCircle2,
  XCircle,
  Activity as ActivityIcon,
  Shield,
  Search,
  Plus,
  ArrowRight,
  Filter,
  Eye,
  Trash2,
  Server,
  Lock,
  Layers,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { NeoBarChart } from "@/components/charts/neo-bar-chart";
import { NeoPieChart } from "@/components/charts/neo-pie-chart";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { adminService } from "@/services/admin";
import { tripService } from "@/services/trips";
import type { User, AdminDashboard, Trip } from "@/types";

export default function AdminPage() {
  const { showToast } = useToast();
  const { user, isAdmin, setRole } = useAuthUser();

  const [activeTab, setActiveTab] = useState("overview");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [tripsList, setTripsList] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAdminData() {
      setIsLoading(true);
      try {
        const [dashRes, usersRes, tripsRes] = await Promise.all([
          adminService.getDashboard(),
          adminService.getUsers(1, 50),
          tripService.list({ limit: 50 }),
        ]);

        if (dashRes.success && dashRes.data) {
          setDashboard(dashRes.data);
        }

        if (usersRes.success && usersRes.data) {
          const items = Array.isArray(usersRes.data)
            ? usersRes.data
            : (usersRes.data as any).items || [];
          setUsersList(items);
        }

        if (tripsRes.success && tripsRes.data) {
          const items = Array.isArray(tripsRes.data)
            ? tripsRes.data
            : (tripsRes.data as any).items || [];
          setTripsList(items);
        }
      } catch (err) {
        console.error("Failed to load admin data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAdminData();
  }, []);

  const tabs = [
    { id: "overview", label: "Analytics & KPI Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "User Management", count: usersList.length, icon: <Users className="w-4 h-4" /> },
    { id: "trips", label: "Platform Trips", count: tripsList.length, icon: <MapPin className="w-4 h-4" /> },
  ];

  const handleToggleRole = async (userId: string) => {
    const userToUpdate = usersList.find((u) => u.id === userId);
    if (!userToUpdate) return;
    const newRole = userToUpdate.role === "admin" ? "user" : "admin";

    try {
      const res = await adminService.updateUserStatus(userId, { role: newRole });
      if (res.success) {
        setUsersList(
          usersList.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
        showToast(`User role updated to ${newRole.toUpperCase()}`, "success");
      } else {
        showToast(res.message || "Failed to update role.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update role.", "error");
    }
  };

  const pieData = (dashboard?.activity_categories || []).map((c, i) => {
    const colors = ["#D94B3D", "#A8322A", "#F3B5A8", "#E8D8C8", "#171313"];
    return {
      name: c.category,
      value: c.count,
      color: colors[i % colors.length],
    };
  });

  // Access check fallback if non-admin visits
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <NeoCard className="p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313] text-center">
          <div className="w-16 h-16 bg-[#FFF0F0] border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-[#E51919] mx-auto mb-4 shadow-[3px_3px_0px_#171313]">
            <Lock className="w-8 h-8" />
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-[#FAF7F2] border border-[#171313] font-display font-extrabold text-xs uppercase text-neutral-600 mb-2 inline-block">
            Access Control Notice
          </span>
          <h2 className="font-display font-black text-3xl text-[#171313] mb-2">
            Administrator Privileges Required
          </h2>
          <p className="text-sm font-medium text-neutral-600 mb-6 max-w-md mx-auto">
            You are currently signed in as <span className="font-bold text-[#171313]">{user.first_name} ({user.role})</span>. The Admin Control Center is restricted to Station Administrators.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <NeoButton
              variant="primary"
              size="lg"
              onClick={handleElevateRole}
              leftIcon={<Shield className="w-5 h-5 fill-white" />}
            >
              Elevate to Station Admin
            </NeoButton>
            <Link href="/dashboard">
              <NeoButton variant="white" size="lg">
                Return to Explorer Dashboard
              </NeoButton>
            </Link>
          </div>
        </NeoCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─── Top Admin Station Bar ─── */}
      <div className="p-4 bg-[#171313] text-white rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#E51919] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E51919] border border-white flex items-center justify-center shadow-[2px_2px_0px_#FFFFFF]">
            <Shield className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="font-display font-black text-sm uppercase tracking-wide flex items-center gap-2">
              <span>Station Commander Control Room</span>
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            </div>
            <span className="text-xs text-neutral-300 font-medium">
              Administrator: {user.first_name} {user.last_name} ({user.email})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>Server: 18ms Latency</span>
          </span>
        </div>
      </div>

      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Governance & Telemetry"
        tagColor="red"
        title="Admin Control Center & Analytics"
        subtitle="Platform governance, real-time user accounts, trip auditing, and destination catalog telemetry."
      />

      {/* ─── KPI Metrics Grid (Stat Cards) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          label="Total Registered Users"
          value={(dashboard?.total_users ?? usersList.length).toLocaleString()}
          trend="+12%"
          trendPositive={true}
          icon={<Users className="w-6 h-6 text-white" />}
          color="red"
        />
        <StatCard
          label="Total Trips Planned"
          value={(dashboard?.total_trips ?? tripsList.length).toLocaleString()}
          trend="+24%"
          trendPositive={true}
          icon={<MapPin className="w-6 h-6 text-[#E51919]" />}
          color="cream"
        />
        <StatCard
          label="Catalog Destinations"
          value={dashboard?.total_destinations ?? 0}
          icon={<Compass className="w-6 h-6 text-[#171313]" />}
          color="white"
        />
        <StatCard
          label="Curated Activities"
          value={(dashboard?.total_activities ?? 0).toLocaleString()}
          trend="+5%"
          trendPositive={true}
          icon={<ActivityIcon className="w-6 h-6 text-[#E51919]" />}
          color="soft-red"
        />
      </div>

      {/* ─── Tabs Navigation ─── */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Tab 1: Overview Analytics Charts ─── */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trends Chart */}
            <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#171313] mb-4">
                <TrendingUp className="w-5 h-5 text-[#E51919]" />
                <h3 className="font-display font-extrabold text-lg text-[#171313]">
                  Monthly Expedition Velocity (2026)
                </h3>
              </div>
              <NeoBarChart
                data={(dashboard?.trip_trends || []).map((t) => ({
                  name: t.month,
                  value: t.count,
                }))}
                fillColor="#E51919"
              />
            </NeoCard>

            {/* Category Breakdown Donut */}
            <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#171313] mb-4">
                <PieIcon className="w-5 h-5 text-[#15803D]" />
                <h3 className="font-display font-extrabold text-lg text-[#171313]">
                  Activity Category Distribution
                </h3>
              </div>
              <NeoPieChart data={pieData} />
            </NeoCard>
          </div>

          {/* Popular Destinations Comparison */}
          {dashboard?.popular_destinations && dashboard.popular_destinations.length > 0 && (
            <NeoCard className="p-6 md:p-8">
              <h3 className="font-display font-extrabold text-lg text-[#111111] mb-4">
                Top Trending Multi-City Hubs
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {dashboard.popular_destinations.map((dest, i) => (
                  <div
                    key={dest.name}
                    className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex items-center justify-between shadow-[2px_2px_0px_#111111]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-[#FFD54A] border border-[#111111] flex items-center justify-center font-display font-extrabold text-xs">
                        #{i + 1}
                      </span>
                      <div>
                        <h5 className="font-display font-extrabold text-sm text-[#111111]">
                          {dest.name}
                        </h5>
                        <span className="text-xs text-neutral-500 font-medium">
                          {dest.trips.toLocaleString()} trips planned
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </NeoCard>
          )}
        </div>
      )}

      {/* ─── Tab 2: User Governance Table ─── */}
      {activeTab === "users" && (
        <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
          {/* Header & Controls */}
          <div className="pb-4 border-b-2 border-[#171313] mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-extrabold text-lg text-[#171313]">
                Registered System Accounts
              </h3>
              <span className="text-xs font-bold text-neutral-500">
                Showing {filteredUsers.length} of {usersList.length} Accounts
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 sm:w-60">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user, email, city..."
                  className="w-full pl-9 pr-3 py-1.5 bg-[#FAF7F2] border-2 border-[#171313] rounded-lg text-xs font-medium text-[#171313] shadow-[2px_2px_0px_#171313] focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5 pointer-events-none" />
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]">
                <button
                  type="button"
                  onClick={() => setUserRoleFilter("all")}
                  className={`px-2 py-0.5 text-xs font-display font-extrabold rounded ${
                    userRoleFilter === "all" ? "bg-[#171313] text-white" : "text-[#171313]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setUserRoleFilter("user")}
                  className={`px-2 py-0.5 text-xs font-display font-extrabold rounded ${
                    userRoleFilter === "user" ? "bg-[#E51919] text-white" : "text-[#171313]"
                  }`}
                >
                  Users
                </button>
                <button
                  type="button"
                  onClick={() => setUserRoleFilter("admin")}
                  className={`px-2 py-0.5 text-xs font-display font-extrabold rounded ${
                    userRoleFilter === "admin" ? "bg-[#171313] text-white" : "text-[#171313]"
                  }`}
                >
                  Admins
                </button>
              </div>

              {/* Add User Action */}
              <NeoButton
                variant="primary"
                size="sm"
                onClick={handleAddUser}
                leftIcon={<Plus className="w-3.5 h-3.5 stroke-[3]" />}
              >
                Add User
              </NeoButton>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b-2 border-[#171313] text-xs font-display font-extrabold uppercase text-neutral-600">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Role Status</th>
                  <th className="py-3 px-4 text-right">Role Governance</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-200 hover:bg-[#FAF7F2] font-medium text-xs text-[#171313]"
                  >
                    <td className="py-3 px-4 flex items-center gap-3">
                      <Avatar
                        src={u.avatar_url}
                        name={`${u.first_name} ${u.last_name}`}
                        size="sm"
                      />
                      <div>
                        <span className="font-display font-extrabold text-sm block">
                          {u.first_name} {u.last_name}
                        </span>
                        <span className="text-[11px] text-neutral-500">{u.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span>{u.email}</span>
                      <span className="block text-neutral-500 text-[11px]">{u.phone}</span>
                    </td>
                    <td className="py-3 px-4">
                      {u.city}, {u.country}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded border border-[#171313] font-display font-extrabold text-[10px] uppercase shadow-[1px_1px_0px_#171313] ${
                          u.role === "admin"
                            ? "bg-[#E51919] text-white"
                            : "bg-[#FAECDC] text-[#171313]"
                        }`}
                      >
                        {u.role === "admin" ? "🛡️ Admin" : "🎒 User"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <NeoButton
                        variant={u.role === "admin" ? "white" : "cream"}
                        size="sm"
                        onClick={() => handleToggleRole(u.id)}
                      >
                        Switch to {u.role === "admin" ? "User" : "Admin"}
                      </NeoButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NeoCard>
      )}

      {/* ─── Tab 3: Platform Trips Monitoring ─── */}
      {activeTab === "trips" && (
        <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
          <div className="pb-4 border-b-2 border-[#171313] mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold text-lg text-[#171313]">
                Platform Expeditions & Records
              </h3>
              <span className="text-xs font-bold text-neutral-500">
                Auditing {filteredTrips.length} active itineraries
              </span>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]">
              {["all", "ongoing", "upcoming", "completed"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTripStatusFilter(st)}
                  className={`px-2.5 py-0.5 text-xs font-display font-extrabold rounded uppercase ${
                    tripStatusFilter === st ? "bg-[#E51919] text-white" : "text-[#171313]"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b-2 border-[#111111] text-xs font-display font-extrabold uppercase text-neutral-600">
                <th className="py-3 px-4">Trip Title</th>
                <th className="py-3 px-4">Dates</th>
                <th className="py-3 px-4">Budget</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Visibility</th>
              </tr>
            </thead>
            <tbody>
              {tripsList.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-neutral-200 hover:bg-neutral-50 font-medium text-xs text-[#111111]"
                >
                  <td className="py-3 px-4 font-display font-extrabold text-sm">
                    {t.title}
                  </td>
                  <td className="py-3 px-4">
                    {t.start_date} → {t.end_date}
                  </td>
                  <td className="py-3 px-4 font-extrabold">
                    ₹{t.budget.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-4">
                    <Badge status={t.status} size="sm" />
                  </td>
                  <td className="py-3 px-4">
                    {t.is_shared ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#6EE7B7] border border-[#111111]">
                        Public
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-200">
                        Private
                      </span>
                    )}
                  </td>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-neutral-200 hover:bg-[#FAF7F2] font-medium text-xs text-[#171313]"
                  >
                    <td className="py-3 px-4">
                      <span className="font-display font-extrabold text-sm block">
                        {t.title}
                      </span>
                      <span className="text-[11px] text-[#E51919] font-bold">
                        {t.stops?.map((s) => s.destination?.city).join(" → ") || "Multi-stop"}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-neutral-700">
                      {t.start_date} → {t.end_date}
                    </td>
                    <td className="py-3 px-4 font-extrabold">
                      ₹{t.budget.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={t.status} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      {t.is_shared ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] border border-[#171313]">
                          Public Community
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-200 border border-[#171313]">
                          Private
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/trips/${t.id}`}>
                        <NeoButton variant="cream" size="sm" rightIcon={<Eye className="w-3.5 h-3.5" />}>
                          Inspect
                        </NeoButton>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NeoCard>
      )}

      {/* ─── Tab 4: Catalog & Destinations ─── */}
      {activeTab === "catalog" && (
        <div className="flex flex-col gap-6">
          <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <div className="pb-4 border-b-2 border-[#171313] mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display font-extrabold text-lg text-[#171313]">
                  Verified Destination Hubs
                </h3>
                <span className="text-xs font-bold text-neutral-500">
                  {mockDestinations.length} catalog destinations active
                </span>
              </div>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={() => showToast("Add destination modal opened.", "info")}
                leftIcon={<Plus className="w-3.5 h-3.5 stroke-[3]" />}
              >
                Add Destination
              </NeoButton>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockDestinations.map((d) => (
                <div
                  key={d.id}
                  className="p-4 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-black text-sm text-[#171313]">
                      {d.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#E51919] text-white border border-[#171313] text-[10px] font-extrabold uppercase">
                      {d.region}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 font-medium line-clamp-2">
                    {d.description}
                  </p>
                  <div className="pt-2 border-t border-[#171313] flex items-center justify-between text-xs font-bold">
                    <span className="text-neutral-500">{d.city}, {d.country}</span>
                    <Link href={`/explore?city=${encodeURIComponent(d.city)}`}>
                      <span className="text-[#E51919] hover:underline cursor-pointer">
                        View Hub →
                      </span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </NeoCard>
        </div>
      )}
    </div>
  );
}
