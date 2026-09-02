"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Users,
  Ticket,
  CalendarDays,
  Truck,
  UserCog,
  Wallet,
  AlertTriangle,
  Lock,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { operatorService } from "@/services/operator";
import { unwrapItems } from "@/lib/api";
import type {
  OperatorBookingRow,
  OperatorCoordinator,
  OperatorCustomer,
  OperatorDashboard,
  OperatorPaymentsPage,
  OperatorProfile,
  OperatorSchedule,
  OperatorVendor,
  TourGroup,
} from "@/types";

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const BOOKING_TONE: Record<string, "green" | "yellow" | "red" | "white"> = {
  draft: "white",
  pending_payment: "yellow",
  confirmed: "green",
  in_progress: "green",
  completed: "green",
  cancelled: "red",
};

const GROUP_TONE: Record<string, "green" | "yellow" | "red" | "white"> = {
  forming: "yellow",
  confirmed: "green",
  full: "green",
  in_progress: "green",
  completed: "white",
  cancelled: "red",
};

export default function OperatorConsolePage() {
  const { showToast } = useToast();

  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [dashboard, setDashboard] = useState<OperatorDashboard | null>(null);
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [bookings, setBookings] = useState<OperatorBookingRow[]>([]);
  const [schedule, setSchedule] = useState<OperatorSchedule | null>(null);
  const [vendors, setVendors] = useState<OperatorVendor[]>([]);
  const [coordinators, setCoordinators] = useState<OperatorCoordinator[]>([]);
  const [groups, setGroups] = useState<TourGroup[]>([]);
  const [payments, setPayments] = useState<OperatorPaymentsPage | null>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const me = await operatorService.profile();
    if (!me.success) {
      // 403 here is the ordinary case for a traveller wandering in, not a
      // failure — it gets its own screen rather than an error state.
      if (me.error?.code === "FORBIDDEN") {
        setAccessDenied(true);
        setIsLoading(false);
        return;
      }
      setError(me.message || "Could not reach the operator console.");
      setIsLoading(false);
      return;
    }
    setProfile(me.data);

    const [dash, cust, bks, sched, vnd, coord, grps, pays] = await Promise.all([
      operatorService.dashboard(),
      operatorService.customers({ limit: 50 }),
      operatorService.bookings({ limit: 50 }),
      operatorService.schedule({ days: 14 }),
      operatorService.vendors({ limit: 50 }),
      operatorService.coordinators(),
      operatorService.tourGroups({ limit: 50 }),
      operatorService.payments({ limit: 50 }),
    ]);

    if (dash.success) setDashboard(dash.data);
    if (cust.success) setCustomers(unwrapItems<OperatorCustomer>(cust.data));
    if (bks.success) setBookings(unwrapItems<OperatorBookingRow>(bks.data));
    if (sched.success) setSchedule(sched.data);
    if (vnd.success) setVendors(unwrapItems<OperatorVendor>(vnd.data));
    if (coord.success && coord.data) setCoordinators(coord.data);
    if (grps.success) setGroups(unwrapItems<TourGroup>(grps.data));
    if (pays.success) setPayments(pays.data);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAssign = async (group: TourGroup, coordinatorId: string) => {
    const res = await operatorService.assignCoordinator(
      group.id,
      coordinatorId || null
    );
    if (res.success && res.data) {
      setGroups((prev) => prev.map((g) => (g.id === group.id ? res.data! : g)));
      showToast(
        coordinatorId
          ? `${res.data.coordinator_name} is running ${res.data.name}.`
          : `${res.data.name} has no coordinator assigned.`,
        "success"
      );
      // The unstaffed count on the overview just changed.
      const dash = await operatorService.dashboard();
      if (dash.success) setDashboard(dash.data);
    } else {
      showToast(res.message || "Could not assign that coordinator.", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFD54A] border-2 border-[#171313] rounded-xl font-display font-extrabold text-sm shadow-[3px_3px_0px_#171313]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading operations...
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <NeoCard className="p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313] text-center">
          <div className="w-16 h-16 bg-[#FFF0F0] border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-[#E51919] mx-auto mb-4 shadow-[3px_3px_0px_#171313]">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="font-display font-black text-3xl text-[#171313] mb-2">
            Operator staff only
          </h2>
          <p className="text-sm font-medium text-neutral-600 max-w-md mx-auto">
            This console is for tour operator staff. Access comes from being on
            an operator&apos;s roster, not from your account type — ask an
            operator manager to add you.
          </p>
        </NeoCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <ErrorState
          title="Could not load the console"
          message={error}
          onRetry={load}
        />
      </div>
    );
  }

  const unstaffed = dashboard?.operations.unstaffed_departures ?? 0;

  const tabs = [
    { id: "overview", label: "Overview", icon: <Building2 className="w-4 h-4" /> },
    { id: "schedule", label: "Schedule", count: schedule?.total_events ?? 0, icon: <CalendarDays className="w-4 h-4" /> },
    { id: "bookings", label: "Bookings", count: bookings.length, icon: <Ticket className="w-4 h-4" /> },
    { id: "groups", label: "Departures", count: groups.length, icon: <Users className="w-4 h-4" /> },
    { id: "customers", label: "Customers", count: customers.length, icon: <Users className="w-4 h-4" /> },
    { id: "vendors", label: "Vendors", count: vendors.length, icon: <Truck className="w-4 h-4" /> },
    { id: "team", label: "Team", count: coordinators.length, icon: <UserCog className="w-4 h-4" /> },
    { id: "payments", label: "Payments", icon: <Wallet className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─── Operator bar ─── */}
      <div className="p-4 bg-[#171313] text-white rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#107038] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#107038] border border-white flex items-center justify-center shadow-[2px_2px_0px_#FFFFFF]">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-black text-sm uppercase tracking-wide">
              {profile?.name}
            </div>
            <span className="text-xs text-neutral-300 font-medium">
              {profile?.your_job_title} · {profile?.your_role}
            </span>
          </div>
        </div>

        {/* The one number worth interrupting somebody for. */}
        {unstaffed > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E51919] border-2 border-white text-xs font-display font-extrabold cursor-pointer hover:-translate-y-0.5 transition-transform"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {unstaffed} departure{unstaffed === 1 ? "" : "s"} with no coordinator
          </button>
        )}
      </div>

      <SectionHeader
        tag="Operations"
        tagColor="red"
        title="Tour Operations Console"
        subtitle="Customers, bookings, vendors, departures and money — in one place."
      />

      {/* ─── KPI row ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          label="Active bookings"
          value={(dashboard?.bookings.active ?? 0).toLocaleString()}
          trend={`${dashboard?.bookings.awaiting_payment ?? 0} awaiting payment`}
          trendPositive={(dashboard?.bookings.awaiting_payment ?? 0) === 0}
          icon={<Ticket className="w-6 h-6 text-white" />}
          color="red"
        />
        <StatCard
          label="Customers"
          value={(dashboard?.bookings.customers ?? 0).toLocaleString()}
          icon={<Users className="w-6 h-6 text-[#E51919]" />}
          color="cream"
        />
        <StatCard
          label="Collected"
          value={`₹${money(dashboard?.money.collected ?? 0)}`}
          trend={`₹${money(dashboard?.money.outstanding ?? 0)} outstanding`}
          trendPositive={Number(dashboard?.money.outstanding ?? 0) === 0}
          icon={<Wallet className="w-6 h-6 text-[#171313]" />}
          color="white"
        />
        <StatCard
          label="Departing in 14 days"
          value={(dashboard?.operations.departing_within_14_days ?? 0).toLocaleString()}
          trend={`${dashboard?.operations.coordinators ?? 0} staff on roster`}
          trendPositive
          icon={<CalendarDays className="w-6 h-6 text-[#E51919]" />}
          color="soft-red"
        />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ─── Overview ─── */}
      {activeTab === "overview" && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NeoCard className="p-6 bg-white border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <h3 className="font-display font-extrabold text-lg mb-4 pb-3 border-b-2 border-[#171313]">
              Money
            </h3>
            <dl className="flex flex-col gap-3 text-sm">
              {[
                ["Booked value", dashboard.money.booked_value],
                ["Collected", dashboard.money.collected],
                ["Outstanding", dashboard.money.outstanding],
                ["Refunded", dashboard.money.refunded],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="font-semibold text-neutral-600">{label}</dt>
                  <dd className="font-display font-black">₹{money(value)}</dd>
                </div>
              ))}
            </dl>
          </NeoCard>

          <NeoCard className="p-6 bg-white border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <h3 className="font-display font-extrabold text-lg mb-4 pb-3 border-b-2 border-[#171313]">
              Supply
            </h3>
            <dl className="flex flex-col gap-3 text-sm">
              {[
                ["Vendors", dashboard.operations.vendors],
                ["Bookable services", dashboard.operations.services],
                ["Coordinators", dashboard.operations.coordinators],
                ["Unstaffed departures", dashboard.operations.unstaffed_departures],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="font-semibold text-neutral-600">{label}</dt>
                  <dd className="font-display font-black">
                    {Number(value).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </NeoCard>
        </div>
      )}

      {/* ─── Schedule ─── */}
      {activeTab === "schedule" && (
        <div className="flex flex-col gap-4">
          {!schedule || schedule.days.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="w-10 h-10 text-[#111111]" />}
              title="Nothing scheduled"
              description="No committed services fall in the next two weeks."
            />
          ) : (
            schedule.days.map((day) => (
              <NeoCard
                key={day.date}
                className="p-5 bg-white border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]"
              >
                <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313] mb-3">
                  <h4 className="font-display font-extrabold text-base">
                    {new Date(day.date).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </h4>
                  <span className="text-[11px] font-bold text-neutral-500">
                    {day.events.length} event{day.events.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-col divide-y divide-neutral-200">
                  {day.events.map((e) => (
                    <div
                      key={e.item_id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm truncate">
                          {e.title}
                        </div>
                        <div className="text-[11px] font-semibold text-neutral-500">
                          {e.traveller_name} · {e.booking_reference}
                          {e.vendor_name ? ` · ${e.vendor_name}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-bold">
                          {e.start_time ?? "—"}
                        </div>
                        <Badge variant="cream">{e.component_type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </NeoCard>
            ))
          )}
        </div>
      )}

      {/* ─── Bookings ─── */}
      {activeTab === "bookings" && (
        <NeoCard className="p-0 overflow-hidden bg-white border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
          {bookings.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Ticket className="w-10 h-10 text-[#111111]" />}
                title="No bookings yet"
                description="Bookings placed with your operator will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#171313] text-white text-[11px] uppercase font-black">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Reference</th>
                    <th className="py-2.5 px-4 text-left">Traveller</th>
                    <th className="py-2.5 px-4 text-left">Starts</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Outstanding</th>
                    <th className="py-2.5 px-4 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => (
                    <tr
                      key={b.id}
                      className={i % 2 ? "bg-neutral-50" : "bg-white"}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-xs">
                        {b.reference}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold">{b.traveller_name}</div>
                        <div className="text-[11px] text-neutral-500">
                          {b.traveller_email}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        {b.first_service_date ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-display font-black">
                        ₹{money(b.total)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          Number(b.amount_outstanding) > 0
                            ? "text-[#D94B3D]"
                            : "text-neutral-400"
                        }`}
                      >
                        ₹{money(b.amount_outstanding)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={BOOKING_TONE[b.status] ?? "white"}>
                          {b.status.replace("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NeoCard>
      )}

      {/* ─── Departures ─── */}
      {activeTab === "groups" && (
        <div className="flex flex-col gap-4">
          {groups.length === 0 ? (
            <EmptyState
              icon={<Users className="w-10 h-10 text-[#111111]" />}
              title="No departures yet"
              description="Group several bookings into a departure to staff and schedule them together."
            />
          ) : (
            groups.map((g) => (
              <NeoCard
                key={g.id}
                className={`p-5 bg-white border-[3px] shadow-[4px_4px_0px_#171313] ${
                  g.coordinator_id ? "border-[#171313]" : "border-[#E51919]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-extrabold text-base">
                        {g.name}
                      </h4>
                      <Badge variant={GROUP_TONE[g.status] ?? "white"}>
                        {g.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-[11px] font-semibold text-neutral-500">
                      {g.destination ? `${g.destination} · ` : ""}
                      {g.start_date} → {g.end_date} · {g.seats_taken}/{g.capacity} seats
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={g.coordinator_id ?? ""}
                      onChange={(e) => handleAssign(g, e.target.value)}
                      className={`p-2 bg-white border-2 rounded-lg font-display font-bold text-xs shadow-[2px_2px_0px_#171313] focus:outline-none ${
                        g.coordinator_id
                          ? "border-[#171313]"
                          : "border-[#E51919] text-[#E51919]"
                      }`}
                    >
                      <option value="">Unassigned</option>
                      {coordinators
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.active_departures})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {g.members.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-neutral-200 flex flex-wrap gap-2">
                    {g.members.map((m) => (
                      <span
                        key={m.id}
                        className="px-2 py-0.5 rounded-lg bg-[#FAECDC] border border-[#171313] text-[11px] font-bold"
                      >
                        {m.traveller_name} × {m.seats}
                      </span>
                    ))}
                  </div>
                )}
              </NeoCard>
            ))
          )}
        </div>
      )}

      {/* ─── Customers ─── */}
      {activeTab === "customers" && (
        <NeoCard className="p-0 overflow-hidden bg-white border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
          {customers.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Users className="w-10 h-10 text-[#111111]" />}
                title="No customers yet"
                description="Anyone who books with you appears here, with their lifetime value."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#171313] text-white text-[11px] uppercase font-black">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Customer</th>
                    <th className="py-2.5 px-4 text-left">City</th>
                    <th className="py-2.5 px-4 text-right">Bookings</th>
                    <th className="py-2.5 px-4 text-right">Lifetime value</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={c.id} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={c.avatar_url ?? undefined}
                            name={`${c.first_name} ${c.last_name}`}
                            size="sm"
                          />
                          <div>
                            <div className="font-bold">
                              {c.first_name} {c.last_name}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {c.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        {c.city ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        {c.booking_count}
                      </td>
                      <td className="py-3 px-4 text-right font-display font-black">
                        ₹{money(c.lifetime_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NeoCard>
      )}

      {/* ─── Vendors ─── */}
      {activeTab === "vendors" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v) => (
            <NeoCard
              key={v.id}
              className="p-4 bg-white border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-display font-extrabold text-sm">{v.name}</h4>
                <Badge variant="cream">{v.category}</Badge>
              </div>
              <div className="text-[11px] font-semibold text-neutral-500">
                {v.city ?? "—"} · {v.service_count} service
                {v.service_count === 1 ? "" : "s"}
              </div>
              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between text-[11px] font-bold">
                <span>★ {v.rating ?? "—"}</span>
                <span
                  className={
                    v.reliability_score >= 85
                      ? "text-[#107038]"
                      : v.reliability_score >= 70
                        ? "text-[#171313]"
                        : "text-[#D94B3D]"
                  }
                >
                  {v.reliability_score}% reliable
                </span>
              </div>
            </NeoCard>
          ))}
        </div>
      )}

      {/* ─── Team ─── */}
      {activeTab === "team" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coordinators.map((c) => (
            <NeoCard
              key={c.id}
              className="p-4 bg-white border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex items-center gap-3"
            >
              <Avatar src={c.avatar_url ?? undefined} name={c.name ?? "?"} size="md" />
              <div className="min-w-0">
                <div className="font-display font-extrabold text-sm truncate">
                  {c.name}
                </div>
                <div className="text-[11px] font-semibold text-neutral-500 truncate">
                  {c.job_title ?? c.role}
                </div>
                <div className="text-[11px] font-bold text-[#107038]">
                  {c.active_departures} active departure
                  {c.active_departures === 1 ? "" : "s"}
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      )}

      {/* ─── Payments ─── */}
      {activeTab === "payments" && payments && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ["Captured", payments.totals.captured, "#107038"],
              ["Refunded", payments.totals.refunded, "#D94B3D"],
              ["Net", payments.totals.net, "#171313"],
            ].map(([label, value, colour]) => (
              <NeoCard
                key={label}
                className="p-4 bg-white border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]"
              >
                <span className="text-[10px] font-extrabold uppercase text-neutral-500">
                  {label}
                </span>
                <div
                  className="font-display font-black text-2xl"
                  style={{ color: colour }}
                >
                  ₹{money(value)}
                </div>
              </NeoCard>
            ))}
          </div>

          <NeoCard className="p-0 overflow-hidden bg-white border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#171313] text-white text-[11px] uppercase font-black">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Booking</th>
                    <th className="py-2.5 px-4 text-left">Traveller</th>
                    <th className="py-2.5 px-4 text-left">Kind</th>
                    <th className="py-2.5 px-4 text-left">Status</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.items.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                      <td className="py-3 px-4 font-mono font-bold text-xs">
                        {p.booking_reference}
                      </td>
                      <td className="py-3 px-4 font-semibold text-xs">
                        {p.traveller_name}
                      </td>
                      <td className="py-3 px-4 text-xs font-bold">{p.kind}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            p.status === "captured"
                              ? "green"
                              : p.status === "failed"
                                ? "red"
                                : "yellow"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          p.kind === "refund" ? "text-[#D94B3D]" : "text-[#171313]"
                        }`}
                      >
                        {p.kind === "refund" ? "−" : ""}₹{money(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NeoCard>
        </div>
      )}
    </div>
  );
}
