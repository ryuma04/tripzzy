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
  MoreVertical,
  Activity as ActivityIcon,
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

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Administration"
        tagColor="red"
        title="Admin Control Center & Analytics"
        subtitle="Platform governance, real-time user metrics, destination trends, and system monitoring."
      />

      {/* ─── KPI Metrics Grid (Wireframe Screen 12 Stat Cards) ─── */}
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
          icon={<MapPin className="w-6 h-6 text-[#D94B3D]" />}
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
          icon={<ActivityIcon className="w-6 h-6 text-[#D94B3D]" />}
          color="soft-red"
        />
      </div>

      {/* ─── Tabs ─── */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Overview Analytics Charts (Wireframe Screen 12 Charts) ─── */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trends Chart */}
            <NeoCard className="p-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111] mb-4">
                <TrendingUp className="w-5 h-5 text-[#4F7DF9]" />
                <h3 className="font-display font-extrabold text-lg text-[#111111]">
                  Monthly Trip Creation Velocity (2026)
                </h3>
              </div>
              <NeoBarChart
                data={(dashboard?.trip_trends || []).map((t) => ({
                  name: t.month,
                  value: t.count,
                }))}
                fillColor="#FFD54A"
              />
            </NeoCard>

            {/* Category Breakdown Donut */}
            <NeoCard className="p-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111] mb-4">
                <PieIcon className="w-5 h-5 text-[#6EE7B7]" />
                <h3 className="font-display font-extrabold text-lg text-[#111111]">
                  Activity Distribution by Category
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

      {/* ─── User Management Table ─── */}
      {activeTab === "users" && (
        <NeoCard className="p-6 overflow-x-auto">
          <div className="pb-4 border-b-2 border-[#111111] mb-4 flex items-center justify-between">
            <h3 className="font-display font-extrabold text-lg text-[#111111]">
              Registered System Accounts
            </h3>
            <span className="text-xs font-bold text-neutral-500">
              Total {usersList.length} Accounts
            </span>
          </div>

          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b-2 border-[#111111] text-xs font-display font-extrabold uppercase text-neutral-600">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-neutral-200 hover:bg-neutral-50 font-medium text-xs text-[#111111]"
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
                      className={`px-2 py-0.5 rounded border border-[#111111] font-display font-extrabold text-[10px] uppercase ${
                        u.role === "admin"
                          ? "bg-[#FF9ECF] text-[#111111]"
                          : "bg-neutral-100 text-neutral-800"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <NeoButton
                      variant="white"
                      size="sm"
                      onClick={() => handleToggleRole(u.id)}
                    >
                      Toggle {u.role === "admin" ? "User" : "Admin"}
                    </NeoButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NeoCard>
      )}

      {/* ─── Platform Trips Monitoring Table ─── */}
      {activeTab === "trips" && (
        <NeoCard className="p-6 overflow-x-auto">
          <div className="pb-4 border-b-2 border-[#111111] mb-4">
            <h3 className="font-display font-extrabold text-lg text-[#111111]">
              Active & Public Trip Records
            </h3>
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
              ))}
            </tbody>
          </table>
        </NeoCard>
      )}
    </div>
  );
}
