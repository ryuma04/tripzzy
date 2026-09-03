// ════════════════════════════════════════════════════════════════
// TRIPZYY — Disruption Board
// Raise an incident, see what it puts at risk, and recover from it.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudLightning,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Siren,
  Wand2,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { operatorAdaptationService } from "@/services/adaptation";
import { unwrapItems } from "@/lib/api";
import type {
  CreateDisruptionPayload,
  Disruption,
  DisruptionSeverity,
  DisruptionStatus,
  DisruptionType,
} from "@/types";

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const TYPES: { value: DisruptionType; label: string }[] = [
  { value: "weather", label: "Weather" },
  { value: "vendor_cancellation", label: "Vendor cancelled" },
  { value: "transport_delay", label: "Transport delay" },
  { value: "closure", label: "Closure" },
  { value: "safety", label: "Safety" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
];

const SEVERITIES: DisruptionSeverity[] = ["low", "medium", "high", "critical"];

const SEVERITY_TONE: Record<DisruptionSeverity, "white" | "yellow" | "red"> = {
  low: "white",
  medium: "yellow",
  high: "red",
  critical: "red",
};

const STATUS_TONE: Record<DisruptionStatus, "green" | "yellow" | "red" | "white"> =
  {
    open: "red",
    mitigating: "yellow",
    resolved: "green",
    dismissed: "white",
  };

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

interface DisruptionBoardProps {
  onChanged?: () => void;
}

export const DisruptionBoard: React.FC<DisruptionBoardProps> = ({
  onChanged,
}) => {
  const { showToast } = useToast();
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isRaising, setIsRaising] = useState(false);

  const [form, setForm] = useState<CreateDisruptionPayload>({
    type: "weather",
    severity: "high",
    title: "",
    description: "",
    city: "",
    from_date: today(),
    to_date: today(7),
    notify: true,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await operatorAdaptationService.disruptions({ limit: 50 });
    if (res.success) setDisruptions(unwrapItems<Disruption>(res.data));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const raise = useCallback(async () => {
    if (!form.title.trim() || !form.city?.trim()) {
      showToast("An incident needs a title and a city.", "error");
      return;
    }
    setIsRaising(true);
    const res = await operatorAdaptationService.raise({
      ...form,
      title: form.title.trim(),
      city: form.city?.trim(),
      description: form.description?.trim() || undefined,
    });
    if (res.success && res.data) {
      const at = res.data.assessment;
      showToast(
        at
          ? `${at.items_at_risk} component(s) at risk across ${at.travellers_affected} traveller(s).`
          : "Disruption raised.",
        "success"
      );
      setIsComposerOpen(false);
      setForm((prev) => ({ ...prev, title: "", description: "" }));
      await load();
      onChanged?.();
    } else {
      showToast(res.message || "Could not raise that disruption.", "error");
    }
    setIsRaising(false);
  }, [form, showToast, load, onChanged]);

  const recover = useCallback(
    async (disruption: Disruption, itemId: string) => {
      setBusyId(itemId);
      const res = await operatorAdaptationService.recover(disruption.id, itemId);
      if (res.success) {
        showToast(
          "Replacement proposed. It is now in the change queue for approval.",
          "success"
        );
        await load();
        onChanged?.();
      } else {
        showToast(res.message || "Could not propose a replacement.", "error");
      }
      setBusyId(null);
    },
    [showToast, load, onChanged]
  );

  const setStatus = useCallback(
    async (disruption: Disruption, status: DisruptionStatus) => {
      setBusyId(disruption.id);
      const res = await operatorAdaptationService.setDisruptionStatus(
        disruption.id,
        status
      );
      if (res.success) {
        await load();
        onChanged?.();
      } else {
        showToast(res.message || "Could not update that incident.", "error");
      }
      setBusyId(null);
    },
    [showToast, load, onChanged]
  );

  const reassess = useCallback(
    async (disruption: Disruption) => {
      setBusyId(disruption.id);
      const res = await operatorAdaptationService.reassess(disruption.id);
      if (res.success) {
        showToast("Recosted against today's availability.", "success");
        await load();
      } else {
        showToast(res.message || "Could not reassess that incident.", "error");
      }
      setBusyId(null);
    },
    [showToast, load]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#E51919]" />
      </div>
    );
  }

  const open = disruptions.filter(
    (d) => d.status === "open" || d.status === "mitigating"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-extrabold text-lg text-[#171313]">
            {open.length} live incident{open.length === 1 ? "" : "s"}
          </h3>
          <p className="text-sm font-medium text-[#171313]/65">
            Raising one costs its blast radius straight away: what is at risk,
            what you would refund, and what could replace it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NeoButton
            variant="cream"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={load}
          >
            Refresh
          </NeoButton>
          <NeoButton
            variant="primary"
            size="sm"
            leftIcon={<Siren className="w-4 h-4" />}
            onClick={() => setIsComposerOpen(true)}
          >
            Raise a disruption
          </NeoButton>
        </div>
      </div>

      {disruptions.length === 0 ? (
        <EmptyState
          icon={<CloudLightning className="w-10 h-10 text-[#111111]" />}
          title="Nothing has gone wrong"
          description="Raise an incident when it does — weather, a vendor pulling out, a road closure — and the engine will cost it and rank replacements for every affected component."
        />
      ) : (
        <div className="space-y-4">
          {disruptions.map((disruption) => {
            const at = disruption.assessment;
            return (
              <NeoCard
                key={disruption.id}
                variant={disruption.status === "open" ? "soft-red" : "white"}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={SEVERITY_TONE[disruption.severity]} size="sm">
                        {disruption.severity}
                      </Badge>
                      <Badge variant={STATUS_TONE[disruption.status]} size="sm">
                        {disruption.status}
                      </Badge>
                      <p className="font-display font-extrabold text-base text-[#171313]">
                        {disruption.title}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-[#171313]/65 mt-1">
                      {[
                        disruption.city,
                        disruption.from_date && disruption.to_date
                          ? `${disruption.from_date} → ${disruption.to_date}`
                          : disruption.from_date,
                        TYPES.find((t) => t.value === disruption.type)?.label,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {disruption.description && (
                      <p className="text-sm font-medium text-[#171313]/80 mt-1.5">
                        {disruption.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <NeoButton
                      variant="cream"
                      size="sm"
                      isLoading={busyId === disruption.id}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={() => reassess(disruption)}
                    >
                      Recost
                    </NeoButton>
                    {disruption.status !== "resolved" && (
                      <NeoButton
                        variant="green"
                        size="sm"
                        isLoading={busyId === disruption.id}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        onClick={() => setStatus(disruption, "resolved")}
                      >
                        Resolve
                      </NeoButton>
                    )}
                  </div>
                </div>

                {at && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                      <StatCard
                        label="At risk"
                        value={`${at.items_at_risk} item(s)`}
                        color="white"
                      />
                      <StatCard
                        label="Travellers"
                        value={at.travellers_affected}
                        color="white"
                      />
                      <StatCard
                        label="Exposure"
                        value={`₹${money(at.exposure_total)}`}
                        color="white"
                      />
                      <StatCard
                        label="Net if replaced"
                        value={`₹${money(at.net_if_replaced)}`}
                        color={
                          Number(at.net_if_replaced) > 0 ? "soft-red" : "green"
                        }
                      />
                    </div>

                    {at.items.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60">
                          Affected components
                        </p>
                        {at.items.map((item) => {
                          const best = item.alternatives[0];
                          return (
                            <div
                              key={item.item_id}
                              className="rounded-xl border-[2px] border-[#171313] bg-[#FFFDFB] p-3"
                            >
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <p className="font-display font-bold text-sm text-[#171313]">
                                    {item.title}
                                  </p>
                                  <p className="text-xs font-medium text-[#171313]/65">
                                    {item.booking_reference} · {item.service_date}
                                    {item.city ? ` · ${item.city}` : ""}
                                  </p>
                                  <p className="text-xs font-medium text-[#171313]/65 mt-1">
                                    Worth ₹{money(item.total_price)} · refund if
                                    cancelled ₹{money(item.refund_if_cancelled)}
                                    {Number(item.penalty_if_cancelled) > 0
                                      ? ` · ₹${money(item.penalty_if_cancelled)} penalty`
                                      : ""}
                                  </p>
                                </div>

                                <div className="text-right shrink-0">
                                  {best ? (
                                    <>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/50">
                                        best replacement
                                      </p>
                                      <p className="text-xs font-bold text-[#171313]">
                                        {best.name}
                                      </p>
                                      <p className="text-xs font-medium text-[#171313]/65">
                                        ₹{money(best.total_price)} ·{" "}
                                        {Math.round(best.match_score)} match
                                      </p>
                                      <NeoButton
                                        variant="dark"
                                        size="sm"
                                        className="mt-2"
                                        isLoading={busyId === item.item_id}
                                        leftIcon={<Wand2 className="w-3.5 h-3.5" />}
                                        onClick={() =>
                                          recover(disruption, item.item_id)
                                        }
                                      >
                                        Propose swap
                                      </NeoButton>
                                    </>
                                  ) : (
                                    <p className="text-xs font-bold text-[#E51919] flex items-center gap-1.5">
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                      No replacement available
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </NeoCard>
            );
          })}
        </div>
      )}

      {/* ─── Raise one ─── */}
      <Modal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        title="Raise a disruption"
        subtitle="Scope it, and the engine costs everything it touches."
        maxWidth="xl"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
              What happened
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Cyclone warning, Goa coast"
              className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Type
              </span>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as DisruptionType })
                }
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Severity
              </span>
              <select
                value={form.severity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    severity: e.target.value as DisruptionSeverity,
                  })
                }
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-xs font-medium text-[#171313]/60">
            High and critical treat the affected components as unusable rather
            than merely at risk, so the engine recommends replacing them.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                City
              </span>
              <input
                value={form.city || ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Goa"
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                From
              </span>
              <input
                type="date"
                value={form.from_date || ""}
                onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                To
              </span>
              <input
                type="date"
                value={form.to_date || ""}
                onChange={(e) => setForm({ ...form, to_date: e.target.value })}
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
              Detail (optional)
            </span>
            <textarea
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              placeholder="Red alert issued for the whole coastal belt."
              className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.notify !== false}
              onChange={(e) => setForm({ ...form, notify: e.target.checked })}
              className="w-4 h-4 accent-[#E51919]"
            />
            <span className="text-sm font-medium text-[#171313]">
              Notify every affected traveller
            </span>
          </label>

          <NeoButton
            variant="primary"
            leftIcon={<Siren className="w-4 h-4" />}
            isLoading={isRaising}
            onClick={raise}
          >
            Raise it and cost the impact
          </NeoButton>
        </div>
      </Modal>
    </div>
  );
};
