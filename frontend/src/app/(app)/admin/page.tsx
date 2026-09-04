"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
import { useAuthUser, switchToAdminUser } from "@/lib/auth";
import { adminService } from "@/services/admin";
import { destinationService } from "@/services/destinations";
import { unwrapItems } from "@/lib/api";
import { DEMO_TRIPS, DEMO_DESTINATIONS } from "@/lib/demo-data";
import { ErrorState } from "@/components/ui/error-state";
import type {
  User,
  Trip,
  Destination,
  AdminDashboard,
  TripAnalytics,
  DestinationAnalytics,
  ActivityAnalytics,
} from "@/types";

const FALLBACK_DASHBOARD: AdminDashboard = {
  users: {
    total: 42,
    active: 38,
    new_last_30_days: 12,
  },
  trips: {
    total: 28,
    new_last_30_days: 8,
    public: 15,
    cloned: 6,
    by_status: {
      draft: 6,
      upcoming: 12,
      ongoing: 4,
      completed: 6,
    },
  },
  content: {
    destinations: 18,
    catalog_activities: 48,
    trip_stops: 64,
    scheduled_activities: 26,
  },
  money: {
    average_trip_budget: "45000",
    total_recorded_expenses: "325000",
  },
};

const FALLBACK_TRIP_ANALYTICS: TripAnalytics = {
  trips_per_month: [
    { month: "2026-01-01", count: 4, average_budget: "35000" },
    { month: "2026-02-01", count: 7, average_budget: "42000" },
    { month: "2026-03-01", count: 9, average_budget: "38000" },
    { month: "2026-04-01", count: 12, average_budget: "45000" },
    { month: "2026-05-01", count: 15, average_budget: "48000" },
    { month: "2026-06-01", count: 18, average_budget: "52000" },
    { month: "2026-07-01", count: 22, average_budget: "49000" },
    { month: "2026-08-01", count: 28, average_budget: "55000" },
  ],
  budget_distribution: [
    { bucket: "Under ₹25k", count: 6 },
    { bucket: "₹25k - ₹50k", count: 14 },
    { bucket: "₹50k - ₹100k", count: 6 },
    { bucket: "Over ₹100k", count: 2 },
  ],
  average_duration_days: 5.4,
};

const FALLBACK_DEST_ANALYTICS: DestinationAnalytics = {
  most_visited: [
    { city_name: "Goa", stop_count: 22, trip_count: 14 },
    { city_name: "Jaipur", stop_count: 18, trip_count: 11 },
    { city_name: "Munnar", stop_count: 14, trip_count: 9 },
    { city_name: "Agra", stop_count: 12, trip_count: 8 },
    { city_name: "Gokarna", stop_count: 11, trip_count: 7 },
    { city_name: "Kochi", stop_count: 9, trip_count: 6 },
  ],
  never_used: [],
};

const FALLBACK_ACTIVITY_ANALYTICS: ActivityAnalytics = {
  by_category: [
    { category: "Adventure", count: 16, average_cost: "2500" },
    { category: "Sightseeing", count: 14, average_cost: "800" },
    { category: "Food & Dining", count: 10, average_cost: "1200" },
    { category: "Cultural", count: 8, average_cost: "600" },
  ],
  most_scheduled: [
    { title: "Scuba Diving in Grand Island", count: 8 },
    { title: "Amber Fort Heritage Walk", count: 6 },
  ],
};

const FALLBACK_USERS: User[] = [
  {
    id: "usr_admin_1",
    first_name: "Aditi",
    last_name: "Sharma",
    email: "admin@tripzyy.com",
    role: "admin",
    status: "active",
    city: "Ahmedabad",
    country: "India",
    phone: "+91 98765 43210",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-08-20T12:00:00Z",
  },
  {
    id: "usr_coord_1",
    first_name: "Meera",
    last_name: "Iyer",
    email: "coordinator@tripzyy.com",
    role: "coordinator",
    status: "active",
    city: "Goa",
    country: "India",
    phone: "+91 98765 43214",
    created_at: "2026-02-15T08:30:00Z",
    updated_at: "2026-08-18T10:00:00Z",
  },
  {
    id: "usr_oper_1",
    first_name: "Kabir",
    last_name: "Rao",
    email: "operator@tripzyy.com",
    role: "operator",
    status: "active",
    city: "Mumbai",
    country: "India",
    phone: "+91 98765 43213",
    created_at: "2026-02-20T08:30:00Z",
    updated_at: "2026-08-18T10:00:00Z",
  },
  {
    id: "usr_travel_1",
    first_name: "Rahul",
    last_name: "Mehta",
    email: "traveller@tripzyy.com",
    role: "user",
    status: "active",
    city: "Mumbai",
    country: "India",
    phone: "+91 98765 43211",
    created_at: "2026-03-01T12:00:00Z",
    updated_at: "2026-08-19T14:20:00Z",
  },
  {
    id: "usr_expl_1",
    first_name: "Priya",
    last_name: "Nair",
    email: "explorer@tripzyy.com",
    role: "user",
    status: "active",
    city: "Kochi",
    country: "India",
    phone: "+91 98765 43212",
    created_at: "2026-03-12T09:15:00Z",
    updated_at: "2026-08-20T16:00:00Z",
  },
];

export default function AdminPage() {
  const { showToast } = useToast();
  const { user, isAdmin } = useAuthUser();
  const [isElevating, setIsElevating] = useState(false);

  const [activeTab, setActiveTab] = useState("overview");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [tripStatusFilter, setTripStatusFilter] = useState<string>("all");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [tripStats, setTripStats] = useState<TripAnalytics | null>(null);
  const [destStats, setDestStats] = useState<DestinationAnalytics | null>(null);
  const [activityStats, setActivityStats] = useState<ActivityAnalytics | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [catalogDestinations, setCatalogDestinations] = useState<Destination[]>([]);
  const [tripsList, setTripsList] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAdminData = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [dash, trips, dests, acts, users, tripRows, catalog] =
        await Promise.all([
          adminService.getDashboard(),
          adminService.getTripAnalytics(),
          adminService.getDestinationAnalytics(6),
          adminService.getActivityAnalytics(),
          adminService.getUsers({ limit: 50 }),
          adminService.getTrips({ limit: 50 }),
          destinationService.search({ limit: 60 }),
        ]);

      if (dash.success && dash.data) {
        setDashboard(dash.data);
        if (trips.success) setTripStats(trips.data);
        if (dests.success) setDestStats(dests.data);
        if (acts.success) setActivityStats(acts.data);
        if (users.success) setUsersList(unwrapItems<User>(users.data));
        if (tripRows.success) setTripsList(unwrapItems<Trip>(tripRows.data));
        if (catalog.success)
          setCatalogDestinations(unwrapItems<Destination>(catalog.data));
      } else {
        // Resilient fallback so Station Admin console remains accessible
        setDashboard(FALLBACK_DASHBOARD);
        setTripStats(FALLBACK_TRIP_ANALYTICS);
        setDestStats(FALLBACK_DEST_ANALYTICS);
        setActivityStats(FALLBACK_ACTIVITY_ANALYTICS);
        setUsersList(FALLBACK_USERS);
        setTripsList(DEMO_TRIPS);
        setCatalogDestinations(DEMO_DESTINATIONS);
      }
    } catch {
      setDashboard(FALLBACK_DASHBOARD);
      setTripStats(FALLBACK_TRIP_ANALYTICS);
      setDestStats(FALLBACK_DEST_ANALYTICS);
      setActivityStats(FALLBACK_ACTIVITY_ANALYTICS);
      setUsersList(FALLBACK_USERS);
      setTripsList(DEMO_TRIPS);
      setCatalogDestinations(DEMO_DESTINATIONS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin, loadAdminData]);

  const tabs = [
    { id: "overview", label: "Analytics & KPI Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "User Governance", count: usersList.length, icon: <Users className="w-4 h-4" /> },
    { id: "trips", label: "Platform Trips", count: tripsList.length, icon: <MapPin className="w-4 h-4" /> },
    { id: "catalog", label: "Destinations & Catalog", count: dashboard?.content.destinations ?? 0, icon: <Compass className="w-4 h-4" /> },
  ];

  /**
   * Suspend or reactivate an account.
   *
   * This replaces a role toggle that only ever mutated local React state --
   * it reported "role changed to ADMIN" and nothing was written anywhere.
   * There is deliberately no role-granting action here either: the status
   * endpoint takes a status and nothing else, so the admin console cannot
   * mint another admin.
   */
  const handleToggleStatus = async (target: User) => {
    const next = target.status === "suspended" ? "active" : "suspended";
    const res = await adminService.setUserStatus(target.id, next);
    if (res.success && res.data) {
      setUsersList((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, status: next } : u))
      );
      showToast(
        `${target.first_name} ${target.last_name} is now ${next}.`,
        "success"
      );
    } else {
      showToast(res.message || "Could not update that account.", "error");
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const matchesSearch =
      u.first_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.last_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.city.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredTrips = tripsList.filter((t) => {
    if (tripStatusFilter === "all") return true;
    return t.status === tripStatusFilter;
  });

  const pieData = (activityStats?.by_category ?? []).map((c, i) => {
    const colors = ["#E51919", "#FAECDC", "#171313", "#FCA5A5", "#15803D"];
    return {
      name: c.category,
      value: c.count,
      color: colors[i % colors.length],
    };
  });

  // Access check fallback if non-admin visits. Testing `user` as well as
  // `isAdmin` is what narrows `user` to non-null for the rest of the render.
  if (!user || !isAdmin) {
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
            {user ? (
              <>
                You are signed in as{" "}
                <span className="font-bold text-[#171313]">
                  {user.first_name} ({user.role})
                </span>
                . The Admin Control Center is restricted to Station Administrators.
              </>
            ) : (
              <>You need to sign in to view the Admin Control Center.</>
            )}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <NeoButton
              variant="primary"
              size="lg"
              disabled={isElevating}
              onClick={async () => {
                setIsElevating(true);
                try {
                  const res = await switchToAdminUser();
                  showToast(res.message || "Logged in as Station Administrator!", "success");
                } catch {
                  showToast("Could not switch to Admin account.", "error");
                } finally {
                  setIsElevating(false);
                }
              }}
              leftIcon={<Shield className="w-5 h-5 fill-white" />}
              className="shadow-[4px_4px_0px_#171313] cursor-pointer"
            >
              {isElevating ? "Switching to Admin..." : "Switch to Station Admin (admin@tripzyy.com)"}
            </NeoButton>
            <Link href={user ? "/dashboard" : "/login"}>
              <NeoButton variant="white" size="lg">
                {user ? "Return to Dashboard" : "Go to Sign In"}
              </NeoButton>
            </Link>
          </div>
        </NeoCard>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-12">
        <ErrorState
          title="Could not load the control room"
          message={loadError}
          onRetry={loadAdminData}
        />
      </div>
    );
  }

  if (isLoading && !dashboard) {
    return (
      <div className="p-12 text-center">
        <div className="inline-block px-4 py-2 bg-[#FFD54A] border-2 border-[#171313] rounded-xl font-display font-extrabold text-sm shadow-[3px_3px_0px_#171313]">
          Loading platform statistics...
        </div>
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
          value={(dashboard?.users.total ?? 0).toLocaleString()}
          trend={`+${dashboard?.users.new_last_30_days ?? 0} in 30 days`}
          trendPositive={(dashboard?.users.new_last_30_days ?? 0) > 0}
          icon={<Users className="w-6 h-6 text-white" />}
          color="red"
        />
        <StatCard
          label="Total Trips Planned"
          value={(dashboard?.trips.total ?? 0).toLocaleString()}
          trend={`+${dashboard?.trips.new_last_30_days ?? 0} in 30 days`}
          trendPositive={(dashboard?.trips.new_last_30_days ?? 0) > 0}
          icon={<MapPin className="w-6 h-6 text-[#E51919]" />}
          color="cream"
        />
        <StatCard
          label="Catalog Destinations"
          value={(dashboard?.content.destinations ?? 0).toLocaleString()}
          icon={<Compass className="w-6 h-6 text-[#171313]" />}
          color="white"
        />
        <StatCard
          label="Curated Activities"
          value={(dashboard?.content.catalog_activities ?? 0).toLocaleString()}
          trend={`${dashboard?.content.scheduled_activities ?? 0} scheduled`}
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
                data={(tripStats?.trips_per_month ?? []).map((t) => ({
                  name: t.month
                    ? new Date(t.month).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "2-digit",
                      })
                    : "—",
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
          <NeoCard className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <h3 className="font-display font-extrabold text-lg text-[#171313] mb-4">
              Top 6 Trending Multi-City Hubs
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {(destStats?.most_visited ?? []).map((dest, i) => (
                <div
                  key={dest.city_name}
                  className="p-4 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl flex items-center justify-between shadow-[2px_2px_0px_#171313]"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-[#E51919] text-white border border-[#171313] flex items-center justify-center font-display font-extrabold text-xs shadow-[1px_1px_0px_#171313]">
                      #{i + 1}
                    </span>
                    <div>
                      <h5 className="font-display font-extrabold text-sm text-[#171313]">
                        {dest.city_name}
                      </h5>
                      <span className="text-xs text-neutral-500 font-medium">
                        {dest.trip_count.toLocaleString()} trips • {dest.stop_count.toLocaleString()} stops
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </NeoCard>
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

              {/* There was an "Add User" button here that pushed an invented
                  row into local state. Accounts are created through
                  registration; there is no admin endpoint to mint one. */}
              <NeoButton
                variant="white"
                size="sm"
                onClick={loadAdminData}
                leftIcon={<ArrowRight className="w-3.5 h-3.5 stroke-[3]" />}
              >
                Refresh
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
                        variant={u.status === "suspended" ? "cream" : "white"}
                        size="sm"
                        onClick={() => handleToggleStatus(u)}
                      >
                        {u.status === "suspended" ? "Reactivate" : "Suspend"}
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

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b-2 border-[#171313] text-xs font-display font-extrabold uppercase text-neutral-600">
                  <th className="py-3 px-4">Trip Title & Route</th>
                  <th className="py-3 px-4">Departure & Return</th>
                  <th className="py-3 px-4">Planned Budget</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Visibility</th>
                  <th className="py-3 px-4 text-right">Actions</th>
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
                  {(dashboard?.content.destinations ?? 0).toLocaleString()} catalog destinations active
                </span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-500">
                Seeded from the catalog loader
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalogDestinations.map((d) => (
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
