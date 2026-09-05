"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  Plus,
  MapPin,
  Calendar,
  Wallet,
  ArrowRight,
  Sparkles,
  Users,
  Receipt,
  Building2,
  Shield,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Truck,
  Activity,
  UserCheck,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { StatCard } from "@/components/ui/stat-card";
import { SearchBar } from "@/components/ui/search-bar";
import { ErrorState } from "@/components/ui/error-state";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { SplitBillModal } from "@/components/budget/split-bill-modal";
import { tripService } from "@/services/trips";
import { destinationService } from "@/services/destinations";
import { operatorService } from "@/services/operator";
import { adminService } from "@/services/admin";
import { operatorAssistService } from "@/services/engagement";
import { operatorAdaptationService } from "@/services/adaptation";
import { getCurrentUser, useAuthUser, switchToAdminUser, getStoredUser } from "@/lib/auth";
import { DEMO_TRIPS, DEMO_DESTINATIONS } from "@/lib/demo-data";
import { DEMO_MODE } from "@/lib/demo-mode";
import { unwrapItems } from "@/lib/api";
import type {
  Trip,
  Destination,
  User,
  TourGroup,
  OperatorDashboard,
  AdminDashboard,
  AssistThread,
  ChangeRequest,
  Disruption,
} from "@/types";

type DashboardRoleView = "user" | "operator" | "admin";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get("view") as DashboardRoleView | null;
  const { user, isAdmin, isOperator, isCoordinator, updateUser } =
    useAuthUser();

  // Active Role Perspective (auto-detected from logged in user, URL, or toggled)
  const [activeRoleView, setActiveRoleView] =
    useState<DashboardRoleView>("user");

  // Filter inside Tour & Travel dashboard (combined features)
  const [tourTravelFilter, setTourTravelFilter] = useState<
    "all" | "departures" | "assist" | "disruptions"
  >("all");

  useEffect(() => {
    // 1. URL search param takes highest precedence
    if (
      viewParam &&
      (viewParam === "user" || viewParam === "operator" || viewParam === "admin")
    ) {
      setActiveRoleView(viewParam);
      if (typeof window !== "undefined") {
        localStorage.setItem("tripzyy_active_role_view", viewParam);
      }
      return;
    }

    // 2. Pending role from login/register or saved active view
    if (typeof window !== "undefined") {
      const pendingRole = localStorage.getItem("tripzyy_pending_role");
      if (pendingRole === "operator" || pendingRole === "coordinator") {
        setActiveRoleView("operator");
        localStorage.setItem("tripzyy_active_role_view", "operator");
        localStorage.removeItem("tripzyy_pending_role");
        return;
      }
      if (pendingRole === "admin") {
        setActiveRoleView("admin");
        localStorage.setItem("tripzyy_active_role_view", "admin");
        localStorage.removeItem("tripzyy_pending_role");
        return;
      }

      const savedView = localStorage.getItem(
        "tripzyy_active_role_view"
      ) as DashboardRoleView | null;
      if (
        savedView &&
        (savedView === "user" || savedView === "operator" || savedView === "admin")
      ) {
        setActiveRoleView(savedView);
        return;
      }
    }

    // 3. Fallback to user role
    if (isAdmin) {
      setActiveRoleView("admin");
    } else if (
      isOperator ||
      isCoordinator ||
      user?.role === "operator" ||
      user?.role === "coordinator"
    ) {
      setActiveRoleView("operator");
    } else {
      setActiveRoleView("user");
    }
  }, [viewParam, isAdmin, isOperator, isCoordinator, user?.role]);

  const handleSwitchRoleView = (view: DashboardRoleView) => {
    setActiveRoleView(view);
    if (typeof window !== "undefined") {
      localStorage.setItem("tripzyy_active_role_view", view);
      const current = getStoredUser();
      if (current) {
        updateUser({
          ...current,
          role:
            view === "operator"
              ? "operator"
              : view === "admin"
              ? "admin"
              : "user",
        });
      }
    }
  };

  // Explorer Data State
  const [searchQuery, setSearchQuery] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);

  // Coordinator / Operator Data State
  const [tourGroups, setTourGroups] = useState<TourGroup[]>([]);
  const [operatorStats, setOperatorStats] =
    useState<OperatorDashboard | null>(null);
  const [assistThreads, setAssistThreads] = useState<AssistThread[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);

  // Admin Data State
  const [adminStats, setAdminStats] = useState<AdminDashboard | null>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userRes = await getCurrentUser();
      if (userRes.success && userRes.data) {
        updateUser(userRes.data);
      }

      const [tripsRes, destsRes] = await Promise.all([
        tripService.list({ limit: 10 }),
        destinationService.search({ limit: 6 }),
      ]);

      if (tripsRes.success) {
        const items = unwrapItems<Trip>(tripsRes.data);
        setTrips(items.length === 0 && DEMO_MODE ? DEMO_TRIPS : items);
      } else if (DEMO_MODE) {
        setTrips(DEMO_TRIPS);
      }

      if (destsRes.success) {
        const items = unwrapItems<Destination>(destsRes.data);
        setDestinations(
          items.length === 0 && DEMO_MODE ? DEMO_DESTINATIONS : items
        );
      } else if (DEMO_MODE) {
        setDestinations(DEMO_DESTINATIONS);
      }

      const [groupsRes, opStatsRes, threadsRes, changesRes, disruptionsRes] =
        await Promise.allSettled([
          operatorService.tourGroups({ limit: 8 }),
          operatorService.dashboard(),
          operatorAssistService.threads({ limit: 5 }),
          operatorAdaptationService.changeRequests({ limit: 5 }),
          operatorAdaptationService.disruptions({ limit: 5 }),
        ]);

      if (groupsRes.status === "fulfilled" && groupsRes.value.success) {
        setTourGroups(unwrapItems<TourGroup>(groupsRes.value.data));
      }
      if (opStatsRes.status === "fulfilled" && opStatsRes.value.success) {
        setOperatorStats(opStatsRes.value.data);
      }
      if (threadsRes.status === "fulfilled" && threadsRes.value.success) {
        setAssistThreads(unwrapItems<AssistThread>(threadsRes.value.data));
      }
      if (changesRes.status === "fulfilled" && changesRes.value.success) {
        setChangeRequests(unwrapItems<ChangeRequest>(changesRes.value.data));
      }
      if (
        disruptionsRes.status === "fulfilled" &&
        disruptionsRes.value.success
      ) {
        setDisruptions(unwrapItems<Disruption>(disruptionsRes.value.data));
      }

      const [adminDashRes, adminUsersRes] = await Promise.allSettled([
        adminService.getDashboard(),
        adminService.getUsers({ limit: 6 }),
      ]);

      if (adminDashRes.status === "fulfilled" && adminDashRes.value.success) {
        setAdminStats(adminDashRes.value.data);
      }
      if (
        adminUsersRes.status === "fulfilled" &&
        adminUsersRes.value.success
      ) {
        setAdminUsers(unwrapItems<User>(adminUsersRes.value.data));
      }
    } catch (err) {
      console.error("Dashboard data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [updateUser]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const activeTrip =
    trips.find((t) => t.status === "ongoing") ||
    trips.find((t) => t.status === "upcoming") ||
    trips[0];

  const totalBudget = trips.reduce(
    (acc, t) => acc + (parseFloat(String(t.budget)) || 0),
    0
  );
  const totalStops = trips.reduce(
    (acc, t) => acc + (t.stops?.length || 0),
    0
  );
  const totalTravellers = trips.reduce(
    (acc, t) => acc + (t.traveller_count || 1),
    0
  );

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─── Role Perspective Switcher Bar ─── */}
      <div className="p-3 bg-[#FFFFFF] border-[3.5px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border-2 border-[#171313] bg-[#FAF7F2] flex items-center justify-center font-black text-xs text-[#E51919] shadow-[2px_2px_0px_#171313]">
            {activeRoleView === "user" ? (
              <Compass className="w-4 h-4" />
            ) : activeRoleView === "operator" ? (
              <Building2 className="w-4 h-4 text-[#D97706]" />
            ) : (
              <Shield className="w-4 h-4 text-[#171313]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xs uppercase tracking-wider text-[#171313]">
                Workspace Dashboard
              </span>
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-[#171313] text-white ${
                  activeRoleView === "user"
                    ? "bg-[#E51919]"
                    : activeRoleView === "operator"
                    ? "bg-[#D97706]"
                    : "bg-[#171313]"
                }`}
              >
                {activeRoleView === "user"
                  ? "EXPLORER"
                  : activeRoleView === "operator"
                  ? "TOUR & TRAVEL"
                  : "ADMIN"}
              </span>
            </div>
            <span className="text-[11px] font-medium text-neutral-600 block">
              {user?.first_name ? `${user.first_name} ${user.last_name}` : "Signed in"}
              {user?.operator_name ? ` • ${user.operator_name}` : ""}
            </span>
          </div>
        </div>

        {/* View Selection Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl self-stretch sm:self-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => handleSwitchRoleView("user")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-black uppercase flex items-center gap-1.5 border-2 transition-all cursor-pointer ${
              activeRoleView === "user"
                ? "bg-[#E51919] text-white border-[#171313] shadow-[2px_2px_0px_#171313] -translate-y-0.5"
                : "bg-transparent text-neutral-700 border-transparent hover:bg-white"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Explorer</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchRoleView("operator")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-black uppercase flex items-center gap-1.5 border-2 transition-all cursor-pointer ${
              activeRoleView === "operator"
                ? "bg-[#D97706] text-white border-[#171313] shadow-[2px_2px_0px_#171313] -translate-y-0.5"
                : "bg-transparent text-neutral-700 border-transparent hover:bg-white"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Tour & Travel</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchRoleView("admin")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-black uppercase flex items-center gap-1.5 border-2 transition-all cursor-pointer ${
              activeRoleView === "admin"
                ? "bg-[#171313] text-white border-[#171313] shadow-[2px_2px_0px_#E51919] -translate-y-0.5"
                : "bg-transparent text-neutral-700 border-transparent hover:bg-white"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          PERSPECTIVE 1: EXPLORER DASHBOARD (TRAVELLER ROLE)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeRoleView === "user" && (
        <div className="flex flex-col gap-8">
          {/* Hero Action Box */}
          <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#FAECDC] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#E51919] overflow-hidden">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
              <div className="max-w-2xl flex-1">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="px-2.5 py-0.5 bg-[#E51919] text-white border-2 border-[#171313] rounded-md font-display font-black text-[11px] uppercase shadow-[2px_2px_0px_#171313] tracking-wider">
                    EXPLORER STATION
                  </span>
                  <span className="text-xs font-bold text-neutral-700">
                    Welcome back, {user?.first_name || "Explorer"}!
                  </span>
                </div>

                <h1 className="font-display font-black text-3xl sm:text-4xl md:text-5xl text-[#171313] tracking-tight leading-[1.1] mb-3">
                  Where is your next expedition heading?
                </h1>

                <p className="text-xs sm:text-sm font-medium text-neutral-700 mb-6 max-w-xl">
                  Search multi-stop destinations, coordinate activities, and build budgets in your interactive workspace.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch gap-3 bg-[#FFFFFF] p-2 sm:p-2.5 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                  <div className="flex-1">
                    <SearchBar
                      value={searchQuery}
                      onChange={setSearchQuery}
                      onSearch={handleSearch}
                      placeholder="Search cities, beaches, treks or activities..."
                    />
                  </div>
                  <NeoButton
                    variant="primary"
                    size="md"
                    onClick={handleSearch}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Explore
                  </NeoButton>
                </div>
              </div>

              <div className="hidden lg:flex flex-col items-center justify-center p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] flex-shrink-0">
                <div className="mb-2">
                  <TripzyyLogo variant="icon" size="lg" />
                </div>
                <span className="font-display font-black text-xs uppercase tracking-wider text-[#171313]">
                  Expedition Desk
                </span>
              </div>
            </div>
          </div>

          {/* Explorer Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard
              label="Active Expeditions"
              value={trips.length}
              icon={<Compass className="w-5 h-5 text-[#E51919]" />}
              color="white"
            />
            <StatCard
              label="Destinations Explored"
              value={totalStops || destinations.length}
              icon={<MapPin className="w-5 h-5 text-[#2563EB]" />}
              color="white"
            />
            <StatCard
              label="Budget Allocated"
              value={`₹${totalBudget.toLocaleString("en-IN")}`}
              icon={<Wallet className="w-5 h-5 text-[#15803D]" />}
              color="white"
            />
            <StatCard
              label="Crew Members"
              value={totalTravellers}
              icon={<Users className="w-5 h-5 text-[#D97706]" />}
              color="white"
            />
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/trips/new">
              <NeoButton
                variant="primary"
                size="md"
                leftIcon={<Sparkles className="w-4 h-4" />}
              >
                Create New AI Itinerary
              </NeoButton>
            </Link>
            <Link href="/explore">
              <NeoButton
                variant="white"
                size="md"
                leftIcon={<Compass className="w-4 h-4" />}
              >
                Browse Curated Destinations
              </NeoButton>
            </Link>
            <NeoButton
              variant="cream"
              size="md"
              leftIcon={<Receipt className="w-4 h-4" />}
              onClick={() => setIsSplitModalOpen(true)}
            >
              Split a Bill with Crew
            </NeoButton>
          </div>

          {/* Active Trip Spotlight */}
          {activeTrip && (
            <NeoCard className="p-6 bg-[#FFFFFF] border-[3.5px] border-[#171313] shadow-[6px_6px_0px_#171313]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b-2 border-neutral-200">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-[#E51919] text-white font-black text-[10px] uppercase rounded border border-[#171313]">
                      SPOTLIGHT EXPEDITION
                    </span>
                    <span className="text-xs font-bold text-neutral-500 uppercase">
                      {activeTrip.status}
                    </span>
                  </div>
                  <h3 className="font-display font-black text-xl sm:text-2xl text-[#171313]">
                    {activeTrip.title}
                  </h3>
                </div>
                <Link href={`/trips/${activeTrip.id}`}>
                  <NeoButton
                    variant="primary"
                    size="sm"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Open Itinerary & Bookings
                  </NeoButton>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF7F2] p-4 rounded-xl border-2 border-[#171313]">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block">
                    Departure Date
                  </span>
                  <span className="font-display font-extrabold text-xs text-[#171313]">
                    {activeTrip.start_date || "Upcoming"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block">
                    Return Date
                  </span>
                  <span className="font-display font-extrabold text-xs text-[#171313]">
                    {activeTrip.end_date || "Flexible"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block">
                    Total Crew
                  </span>
                  <span className="font-display font-extrabold text-xs text-[#171313]">
                    {activeTrip.traveller_count || 1} Travelers
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block">
                    Est. Budget
                  </span>
                  <span className="font-display font-extrabold text-xs text-[#15803D]">
                    ₹{Number(activeTrip.budget || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </NeoCard>
          )}

          {/* Trending Destinations */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <SectionHeader
                title="Trending Indian Destinations"
                subtitle="Curated multi-stop bases with verified attractions"
              />
              <Link href="/explore">
                <NeoButton variant="cream" size="sm">
                  View All ({destinations.length})
                </NeoButton>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {destinations.slice(0, 3).map((dest) => (
                <NeoCard
                  key={dest.id}
                  className="p-4 bg-white border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 bg-[#FAF7F2] border border-[#171313] rounded font-bold text-[10px] uppercase">
                        {dest.region || "India"}
                      </span>
                      <span className="text-xs font-black text-[#E51919]">
                        ★ 96
                      </span>
                    </div>
                    <h4 className="font-display font-extrabold text-lg text-[#171313] mb-1">
                      {dest.name}
                    </h4>
                    <p className="text-xs font-medium text-neutral-600 line-clamp-2 mb-4">
                      {dest.description || "Scenic coastal destination with rich cultural heritage."}
                    </p>
                  </div>
                  <Link href={`/explore?q=${encodeURIComponent(dest.name)}`}>
                    <NeoButton variant="white" size="sm" className="w-full">
                      Explore Activities
                    </NeoButton>
                  </Link>
                </NeoCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          PERSPECTIVE 2: TOUR & TRAVEL MISSION CONTROL (OPERATOR & COORDINATOR UNIFIED)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeRoleView === "operator" && (
        <div className="flex flex-col gap-8">
          <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#FEF3C7] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#D97706] overflow-hidden">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 bg-[#D97706] text-white border-2 border-[#171313] rounded-md font-display font-black text-[11px] uppercase shadow-[2px_2px_0px_#171313] tracking-wider">
                    TOUR & TRAVEL OPERATIONS
                  </span>
                  <span className="text-xs font-bold text-neutral-700">
                    {user?.operator_name || "Tripzyy Journeys Operations"} • {user?.first_name ? `${user.first_name} ${user.last_name}` : "Operations Desk"}
                  </span>
                </div>
                <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171313] tracking-tight mb-2">
                  Tour & Travel Command Center
                </h1>
                <p className="text-xs sm:text-sm font-medium text-neutral-700 max-w-2xl">
                  Unified agency operations: Oversee tour group departures, fleet logistics, passenger rosters, client assist inquiries, and real-time field disruptions.
                </p>
              </div>

              <Link href="/operator">
                <NeoButton
                  variant="primary"
                  size="lg"
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                  className="shadow-[4px_4px_0px_#171313]"
                >
                  Enter Full Operations Console
                </NeoButton>
              </Link>
            </div>
          </div>

          {/* Tour & Travel Operations Sub-Filter Tabs */}
          <div className="flex items-center gap-2 p-1.5 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setTourTravelFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
                tourTravelFilter === "all"
                  ? "bg-[#D97706] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313]"
                  : "text-neutral-700 hover:bg-white"
              }`}
            >
              All Operations
            </button>
            <button
              type="button"
              onClick={() => setTourTravelFilter("departures")}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
                tourTravelFilter === "departures"
                  ? "bg-[#D97706] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313]"
                  : "text-neutral-700 hover:bg-white"
              }`}
            >
              Tour Departures ({tourGroups.length || 4})
            </button>
            <button
              type="button"
              onClick={() => setTourTravelFilter("assist")}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
                tourTravelFilter === "assist"
                  ? "bg-[#7C3AED] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313]"
                  : "text-neutral-700 hover:bg-white"
              }`}
            >
              Passenger Assist & Requests ({assistThreads.length + changeRequests.length || 3})
            </button>
            <button
              type="button"
              onClick={() => setTourTravelFilter("disruptions")}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
                tourTravelFilter === "disruptions"
                  ? "bg-[#E51919] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313]"
                  : "text-neutral-700 hover:bg-white"
              }`}
            >
              Disruptions Radar ({disruptions.length})
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard
              label="Active Departures"
              value={tourGroups.length || 4}
              icon={<Building2 className="w-5 h-5 text-[#D97706]" />}
              color="white"
            />
            <StatCard
              label="Passenger Roster"
              value={
                tourGroups.reduce((acc, g) => acc + (g.seats_taken || 0), 0) ||
                32
              }
              icon={<Users className="w-5 h-5 text-[#15803D]" />}
              color="white"
            />
            <StatCard
              label="Gross Bookings"
              value={
                operatorStats?.money?.booked_value
                  ? `₹${Number(operatorStats.money.booked_value).toLocaleString("en-IN")}`
                  : "₹2,45,000"
              }
              icon={<Wallet className="w-5 h-5 text-[#2563EB]" />}
              color="white"
            />
            <StatCard
              label="Disruptions Radar"
              value={disruptions.length}
              icon={<AlertTriangle className="w-5 h-5 text-[#E51919]" />}
              color="white"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Departures & Inquiries */}
            <div className="lg:col-span-2 space-y-6">
              {/* Card 1: Live Departures Schedule (Operator Focus) */}
              {(tourTravelFilter === "all" || tourTravelFilter === "departures") && (
                <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-neutral-200">
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-[#D97706]" />
                      <h3 className="font-display font-black text-lg text-[#171313]">
                        Live Departures Schedule
                      </h3>
                    </div>
                    <Link href="/operator">
                      <NeoButton variant="cream" size="sm">
                        Manage All ({tourGroups.length})
                      </NeoButton>
                    </Link>
                  </div>

                  <div className="flex flex-col gap-3">
                    {(tourGroups.length > 0
                      ? tourGroups.slice(0, 4)
                      : [
                          {
                            id: "1",
                            name: "Goa Coastal Heritage Group",
                            start_date: "2026-10-15",
                            capacity: 12,
                            seats_taken: 8,
                            status: "confirmed",
                          },
                          {
                            id: "2",
                            name: "Manali Valley Backpacking",
                            start_date: "2026-11-02",
                            capacity: 16,
                            seats_taken: 12,
                            status: "forming",
                          },
                        ]
                    ).map((grp: any) => (
                      <div
                        key={grp.id}
                        className="p-3.5 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-display font-black text-xs text-[#171313]">
                              {grp.name}
                            </span>
                            <span className="px-2 py-0.5 bg-[#D97706] text-white text-[9px] font-black uppercase rounded">
                              {grp.status}
                            </span>
                          </div>
                          <span className="text-xs text-neutral-600">
                            {grp.destination || "Expedition Route"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-xs text-[#171313] block">
                            {grp.seats_taken || 6} / {grp.capacity || 12} Seats
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            {grp.start_date}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </NeoCard>
              )}

              {/* Card 2: Traveler Support & Client Inquiries (Coordinator Focus) */}
              {(tourTravelFilter === "all" || tourTravelFilter === "assist") && (
                <>
                  <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-neutral-200">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-[#2563EB]" />
                        <h3 className="font-display font-black text-lg text-[#171313]">
                          Traveler Support & Inquiries Inbox
                        </h3>
                      </div>
                      <Link href="/operator">
                        <span className="text-xs font-bold text-[#2563EB] hover:underline">
                          All Messages →
                        </span>
                      </Link>
                    </div>

                    {assistThreads.length === 0 ? (
                      <div className="py-6 text-center text-neutral-500 font-medium text-xs bg-[#FAF7F2] rounded-xl border-2 border-dashed border-neutral-300">
                        All traveler support queries have been answered!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {assistThreads.slice(0, 3).map((thread) => (
                          <div
                            key={thread.id}
                            className="p-3 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl flex items-center justify-between"
                          >
                            <div>
                              <span className="font-display font-black text-xs text-[#171313] block">
                                {thread.subject || "Traveler Inquiry"}
                              </span>
                              <span className="text-[11px] text-neutral-600">
                                {thread.trip_title || thread.traveller_name || "Departure Assist"} •{" "}
                                {thread.message_count || 1} messages
                              </span>
                            </div>
                            <Link href="/operator">
                              <NeoButton variant="cream" size="sm">
                                Reply
                              </NeoButton>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </NeoCard>

                  {/* Card 2B: Client Change Requests Queue (Coordinator Focus) */}
                  <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-neutral-200">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[#7C3AED]" />
                        <h3 className="font-display font-black text-lg text-[#171313]">
                          Client Change Requests Queue
                        </h3>
                      </div>
                      <Link href="/operator">
                        <span className="text-xs font-bold text-[#7C3AED] hover:underline">
                          Review Queue ({changeRequests.length}) →
                        </span>
                      </Link>
                    </div>

                    {changeRequests.length === 0 ? (
                      <div className="py-5 text-center text-neutral-500 font-medium text-xs bg-[#FAF7F2] rounded-xl border-2 border-dashed border-neutral-300">
                        No pending itinerary change requests from travelers.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {changeRequests.slice(0, 3).map((req) => (
                          <div
                            key={req.id}
                            className="p-3 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl flex items-center justify-between"
                          >
                            <div>
                              <span className="font-display font-black text-xs text-[#171313] block">
                                {req.reason || "Itinerary Amendment"}
                              </span>
                              <span className="text-[11px] text-neutral-600">
                                Requested by {req.requested_by_name || "Traveler"} • {req.status}
                              </span>
                            </div>
                            <Link href="/operator">
                              <NeoButton variant="cream" size="sm">
                                Inspect
                              </NeoButton>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </NeoCard>
                </>
              )}
            </div>

            {/* Right Column: Disruptions & Quick Actions */}
            <div className="space-y-6">
              {/* Card 3: Disruptions Radar */}
              <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-neutral-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-[#E51919]" />
                    <h3 className="font-display font-black text-lg text-[#171313]">
                      Field Disruptions Radar
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 bg-[#E51919]/10 text-[#E51919] font-black text-[10px] rounded uppercase border border-[#E51919]/20">
                    LIVE
                  </span>
                </div>

                {disruptions.length === 0 ? (
                  <div className="p-4 bg-[#F0FDF4] border-2 border-[#15803D] rounded-xl text-center">
                    <UserCheck className="w-6 h-6 text-[#15803D] mx-auto mb-1" />
                    <p className="font-bold text-xs text-[#15803D]">
                      Clear Skies Ahead
                    </p>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      No active disruptions reported on scheduled routes.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {disruptions.slice(0, 3).map((disruption) => (
                      <div
                        key={disruption.id}
                        className="p-3 bg-[#FEF2F2] border-2 border-[#E51919] rounded-xl"
                      >
                        <span className="font-display font-black text-xs text-[#991B1B] block mb-0.5">
                          {disruption.title}
                        </span>
                        <p className="text-[11px] text-neutral-700 font-medium">
                          {disruption.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </NeoCard>

              {/* Card 4: Quick Operations Actions */}
              <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
                <h3 className="font-display font-black text-lg text-[#171313] mb-4 pb-3 border-b-2 border-neutral-200">
                  Quick Actions
                </h3>
                <div className="flex flex-col gap-3">
                  <Link href="/operator">
                    <NeoButton variant="cream" size="sm" className="w-full justify-start">
                      <Plus className="w-4 h-4 mr-2 text-[#D97706]" />
                      Launch New Departure
                    </NeoButton>
                  </Link>
                  <Link href="/operator">
                    <NeoButton variant="cream" size="sm" className="w-full justify-start">
                      <Users className="w-4 h-4 mr-2 text-[#15803D]" />
                      Passenger Assist Desk
                    </NeoButton>
                  </Link>
                  <Link href="/operator">
                    <NeoButton variant="cream" size="sm" className="w-full justify-start">
                      <AlertTriangle className="w-4 h-4 mr-2 text-[#E51919]" />
                      Disruption Radar ({disruptions.length})
                    </NeoButton>
                  </Link>
                  <Link href="/operator">
                    <NeoButton variant="cream" size="sm" className="w-full justify-start">
                      <Briefcase className="w-4 h-4 mr-2 text-[#2563EB]" />
                      Vendor Contracts & Fleet
                    </NeoButton>
                  </Link>
                </div>
              </NeoCard>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          PERSPECTIVE 4: STATION ADMINISTRATOR CONTROL CENTER
         ════════════════════════════════════════════════════════════════════════ */}
      {activeRoleView === "admin" && (
        <div className="flex flex-col gap-8">
          <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#F1F5F9] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#171313] overflow-hidden">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 bg-[#171313] text-white border-2 border-[#171313] rounded-md font-display font-black text-[11px] uppercase shadow-[2px_2px_0px_#E51919] tracking-wider">
                    STATION COMMAND CENTER
                  </span>
                  <span className="text-xs font-bold text-neutral-700">
                    Platform Administrator • {user?.first_name || "Admin"}
                  </span>
                </div>
                <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171313] tracking-tight mb-2">
                  System Administration Gateway
                </h1>
                <p className="text-xs sm:text-sm font-medium text-neutral-700 max-w-xl">
                  Platform oversight: audit user registrations, manage destination inventory, inspect PostgreSQL telemetry, and review security metrics.
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!isAdmin) {
                    await switchToAdminUser();
                  }
                  router.push("/admin");
                }}
              >
                <NeoButton
                  variant="primary"
                  size="lg"
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                  className="shadow-[4px_4px_0px_#171313] cursor-pointer"
                >
                  Enter Admin Console
                </NeoButton>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard
              label="Platform Users"
              value={adminStats?.users?.total || adminUsers.length || 24}
              icon={<Users className="w-5 h-5 text-[#2563EB]" />}
              color="white"
            />
            <StatCard
              label="Itineraries & Trips"
              value={adminStats?.trips?.total || trips.length || 18}
              icon={<Compass className="w-5 h-5 text-[#E51919]" />}
              color="white"
            />
            <StatCard
              label="Catalog Destinations"
              value={adminStats?.content?.destinations || destinations.length || 12}
              icon={<MapPin className="w-5 h-5 text-[#15803D]" />}
              color="white"
            />
            <StatCard
              label="System Gateway"
              value="ACTIVE"
              icon={<CheckCircle2 className="w-5 h-5 text-[#15803D]" />}
              color="white"
            />
          </div>

          <NeoCard className="p-6 bg-white border-[3.5px] border-[#171313] shadow-[4px_4px_0px_#171313]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-neutral-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#171313]" />
                <h3 className="font-display font-black text-lg text-[#171313]">
                  Platform User Audit Roster
                </h3>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!isAdmin) {
                    await switchToAdminUser();
                  }
                  router.push("/admin");
                }}
              >
                <NeoButton variant="cream" size="sm" className="cursor-pointer">
                  Full User Directory →
                </NeoButton>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {(adminUsers.length > 0
                ? adminUsers.slice(0, 5)
                : [
                    {
                      id: "1",
                      first_name: "Rahul",
                      last_name: "Mehta",
                      email: "rahul@example.com",
                      role: "user",
                      status: "active",
                    },
                    {
                      id: "2",
                      first_name: "Meera",
                      last_name: "Iyer",
                      email: "coordinator@tripzyy.com",
                      role: "coordinator",
                      status: "active",
                    },
                    {
                      id: "3",
                      first_name: "Kabir",
                      last_name: "Rao",
                      email: "operator@tripzyy.com",
                      role: "operator",
                      status: "active",
                    },
                  ]
              ).map((u: any) => (
                <div
                  key={u.id}
                  className="p-3 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border-2 border-[#171313] flex items-center justify-center font-bold text-xs text-[#171313]">
                      {u.first_name?.[0]}
                    </div>
                    <div>
                      <span className="font-display font-black text-xs text-[#171313] block">
                        {u.first_name} {u.last_name}
                      </span>
                      <span className="text-[11px] text-neutral-500 font-medium">
                        {u.email}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#171313] text-white font-extrabold text-[9px] uppercase rounded">
                      {u.role}
                    </span>
                    <span className="px-2 py-0.5 bg-[#15803D] text-white font-extrabold text-[9px] uppercase rounded">
                      {u.status || "active"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </NeoCard>
        </div>
      )}

      {/* Bill Split Modal */}
      <SplitBillModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        initialTrip={activeTrip}
        availableTrips={trips}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-display font-bold text-center">
          Loading Workspace Dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
