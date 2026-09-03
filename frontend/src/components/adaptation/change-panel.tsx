// ════════════════════════════════════════════════════════════════
// TRIPZYY — Change Requests
// Preview what a change costs, submit it, and follow what happened.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Info,
  Loader2,
  RefreshCw,
  Repeat,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ImpactReportView } from "@/components/adaptation/impact-report-view";
import { adaptationService } from "@/services/adaptation";
import { bookingService } from "@/services/bookings";
import { unwrapItems } from "@/lib/api";
import type {
  AssessChangeResponse,
  Booking,
  BookingItem,
  ChangeProposal,
  ChangeRequest,
  ChangeRequestStatus,
  ChangeRequestType,
  ComponentAlternative,
  ConflictCheck,
  Trip,
} from "@/types";

interface ChangePanelProps {
  trip: Trip;
}

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const STATUS_TONE: Record<
  ChangeRequestStatus,
  "green" | "yellow" | "red" | "white" | "dark"
> = {
  pending: "yellow",
  approved: "green",
  countered: "white",
  rejected: "red",
  applied: "green",
  withdrawn: "white",
};

const STATUS_HELP: Record<ChangeRequestStatus, string> = {
  pending: "Waiting on the operator.",
  approved: "Agreed — being applied.",
  countered: "The operator has proposed something else.",
  rejected: "The operator could not accommodate this.",
  applied: "Done. Your itinerary and booking are updated.",
  withdrawn: "You took this back.",
};

const CHANGE_LABEL: Record<ChangeRequestType, string> = {
  date_shift: "Move the dates",
  replace_component: "Swap a component",
  cancel_component: "Drop a component",
  add_component: "Add something",
  party_size: "Change party size",
};

/** Live components only — a replaced or cancelled line cannot change again. */
const isLive = (item: BookingItem) =>
  item.status === "pending" || item.status === "confirmed";

export const ChangePanel: React.FC<ChangePanelProps> = ({ trip }) => {
  const { showToast } = useToast();

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [conflicts, setConflicts] = useState<ConflictCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [changeType, setChangeType] = useState<ChangeRequestType>(
    "replace_component"
  );
  const [itemId, setItemId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [shiftDays, setShiftDays] = useState<number>(3);
  const [partySize, setPartySize] = useState<number>(trip.traveller_count || 1);
  const [reason, setReason] = useState("");

  const [preview, setPreview] = useState<AssessChangeResponse | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const liveItems = useMemo(
    () =>
      bookings
        .flatMap((b) => b.items || [])
        .filter(isLive)
        .sort((a, b) => a.service_date.localeCompare(b.service_date)),
    [bookings]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    const [changes, books, health] = await Promise.all([
      adaptationService.list({ tripId: trip.id, limit: 50 }),
      bookingService.list({ limit: 50 }),
      adaptationService.conflicts(trip.id),
    ]);

    if (changes.success) setRequests(unwrapItems<ChangeRequest>(changes.data));
    if (books.success) {
      setBookings(
        unwrapItems<Booking>(books.data).filter((b) => b.trip_id === trip.id)
      );
    }
    if (health.success && health.data) setConflicts(health.data);
    setIsLoading(false);
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Default to the first live component so the composer opens on something
  // actionable rather than on an empty select.
  useEffect(() => {
    if (!itemId && liveItems.length > 0) setItemId(liveItems[0].id);
  }, [liveItems, itemId]);

  const proposal = useCallback((): ChangeProposal => {
    switch (changeType) {
      case "date_shift":
        return { shift_days: shiftDays };
      case "party_size":
        return { traveller_count: partySize };
      case "cancel_component":
        return { booking_item_id: itemId };
      case "replace_component":
        return serviceId
          ? { booking_item_id: itemId, new_service_id: serviceId }
          : { booking_item_id: itemId };
      default:
        return {};
    }
  }, [changeType, shiftDays, partySize, itemId, serviceId]);

  const runPreview = useCallback(async () => {
    setIsAssessing(true);
    setPreview(null);
    // `explain` is only asked for on an explicit preview, never on every
    // keystroke: a narration costs a model round-trip and the deterministic
    // report is already on screen without it.
    const res = await adaptationService.assess(
      trip.id,
      changeType,
      proposal(),
      { explain: true }
    );
    if (res.success && res.data) {
      setPreview(res.data);
    } else {
      showToast(res.message || "Could not assess that change.", "error");
    }
    setIsAssessing(false);
  }, [trip.id, changeType, proposal, showToast]);

  const submit = useCallback(async () => {
    setIsSubmitting(true);
    const res = await adaptationService.submit(
      trip.id,
      changeType,
      proposal(),
      reason || undefined
    );
    if (res.success) {
      showToast("Change request sent to the operator.", "success");
      setIsComposerOpen(false);
      setPreview(null);
      setReason("");
      await load();
    } else {
      showToast(res.message || "Could not submit that change.", "error");
    }
    setIsSubmitting(false);
  }, [trip.id, changeType, proposal, reason, showToast, load]);

  const withdraw = useCallback(
    async (request: ChangeRequest) => {
      setBusyId(request.id);
      const res = await adaptationService.withdraw(request.id);
      if (res.success) {
        showToast("Request withdrawn.", "success");
        await load();
      } else {
        showToast(res.message || "Could not withdraw that request.", "error");
      }
      setBusyId(null);
    },
    [showToast, load]
  );

  const openComposer = (type: ChangeRequestType) => {
    setChangeType(type);
    setServiceId("");
    setPreview(null);
    setIsComposerOpen(true);
  };

  const pickAlternative = (option: ComponentAlternative) => {
    setServiceId(option.service_id);
    setPreview(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#E51919]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── Itinerary health ─── */}
      {conflicts && conflicts.conflicts.length > 0 && (
        <NeoCard
          variant={conflicts.blockers > 0 ? "soft-red" : "cream-card"}
          className="p-4"
        >
          <div className="flex items-start gap-3">
            {conflicts.blockers > 0 ? (
              <Ban className="w-5 h-5 text-[#E51919] mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-[#171313] mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-display font-bold text-sm text-[#171313]">
                {conflicts.blockers > 0
                  ? `${conflicts.blockers} thing(s) need fixing`
                  : `${conflicts.warnings + conflicts.notes} thing(s) worth a look`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {conflicts.conflicts.slice(0, 4).map((conflict, index) => (
                  <li
                    key={`${conflict.code}-${index}`}
                    className="text-xs font-medium text-[#171313]/75"
                  >
                    · {conflict.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </NeoCard>
      )}

      {/* ─── Start a change ─── */}
      <NeoCard variant="white" className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display font-extrabold text-lg text-[#171313]">
              Something changed?
            </h3>
            <p className="text-sm font-medium text-[#171313]/65 mt-0.5">
              See exactly what it costs before you commit to anything. Nothing
              moves until the operator agrees.
            </p>
          </div>
          <NeoButton
            variant="cream"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={load}
          >
            Refresh
          </NeoButton>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <NeoButton
            variant="primary"
            size="sm"
            leftIcon={<CalendarClock className="w-4 h-4" />}
            onClick={() => openComposer("date_shift")}
          >
            Move dates
          </NeoButton>
          <NeoButton
            variant="dark"
            size="sm"
            leftIcon={<Repeat className="w-4 h-4" />}
            disabled={liveItems.length === 0}
            onClick={() => openComposer("replace_component")}
          >
            Swap
          </NeoButton>
          <NeoButton
            variant="cream"
            size="sm"
            leftIcon={<Users className="w-4 h-4" />}
            onClick={() => openComposer("party_size")}
          >
            Party size
          </NeoButton>
          <NeoButton
            variant="soft-red"
            size="sm"
            leftIcon={<Trash2 className="w-4 h-4" />}
            disabled={liveItems.length === 0}
            onClick={() => openComposer("cancel_component")}
          >
            Drop one
          </NeoButton>
        </div>

        {liveItems.length === 0 && (
          <p className="text-xs font-medium text-[#171313]/55 mt-3">
            Nothing is booked on this trip yet, so there is nothing to reprice —
            moving the dates is still free.
          </p>
        )}
      </NeoCard>

      {/* ─── History ─── */}
      {requests.length === 0 ? (
        <EmptyState
          icon={<Wand2 className="w-10 h-10 text-[#111111]" />}
          title="No changes yet"
          description="When plans move, raise a change here and see the cost, the conflicts and the alternatives before anything happens."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const delta = Number(request.net_cost_delta);
            return (
              <NeoCard key={request.id} variant="white" className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_TONE[request.status]} size="sm">
                        {request.status}
                      </Badge>
                      <p className="font-display font-bold text-sm text-[#171313]">
                        {CHANGE_LABEL[request.type]}
                      </p>
                      {request.booking_item_title && (
                        <span className="text-xs font-medium text-[#171313]/60">
                          · {request.booking_item_title}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-[#171313]/65 mt-1">
                      {STATUS_HELP[request.status]}
                    </p>

                    {request.disruption_title && (
                      <p className="text-xs font-bold text-[#E51919] mt-1">
                        Raised for: {request.disruption_title}
                      </p>
                    )}
                    {request.reason && (
                      <p className="text-xs font-medium text-[#171313]/60 mt-1 italic">
                        “{request.reason}”
                      </p>
                    )}
                    {request.ai_summary && (
                      <p className="text-xs font-medium text-[#171313]/75 mt-2 leading-relaxed">
                        {request.ai_summary}
                      </p>
                    )}
                    {request.review_note && (
                      <p className="text-xs font-medium text-[#171313] mt-2">
                        <span className="font-bold">Operator:</span>{" "}
                        {request.review_note}
                      </p>
                    )}
                    {request.applied_result && (
                      <p className="text-xs font-medium text-[#15803D] mt-2">
                        {request.applied_result.summary}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/50">
                      {delta > 0 ? "extra" : delta < 0 ? "back to you" : "no change"}
                    </p>
                    <p
                      className={`font-display font-extrabold text-lg ${
                        delta > 0 ? "text-[#E51919]" : "text-[#15803D]"
                      }`}
                    >
                      {request.currency} {money(Math.abs(delta))}
                    </p>
                    {request.status === "pending" && (
                      <NeoButton
                        variant="cream"
                        size="sm"
                        className="mt-2"
                        isLoading={busyId === request.id}
                        leftIcon={<X className="w-3.5 h-3.5" />}
                        onClick={() => withdraw(request)}
                      >
                        Withdraw
                      </NeoButton>
                    )}
                  </div>
                </div>

                {request.impact && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#171313]/60 hover:text-[#E51919]">
                      See the full impact report
                    </summary>
                    <div className="mt-3">
                      <ImpactReportView report={request.impact} />
                    </div>
                  </details>
                )}
              </NeoCard>
            );
          })}
        </div>
      )}

      {/* ─── Composer ─── */}
      <Modal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        title={CHANGE_LABEL[changeType]}
        subtitle="Preview the impact first — nothing is committed until you send it."
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {changeType === "date_shift" && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Move the whole trip by
              </span>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  value={shiftDays}
                  min={-365}
                  max={365}
                  onChange={(e) => {
                    setShiftDays(Number(e.target.value));
                    setPreview(null);
                  }}
                  className="w-28 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-display font-bold text-sm text-[#171313]"
                />
                <span className="text-sm font-medium text-[#171313]/70">
                  days ({shiftDays >= 0 ? "later" : "earlier"})
                </span>
              </div>
            </label>
          )}

          {changeType === "party_size" && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Travelling party
              </span>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  value={partySize}
                  min={1}
                  max={50}
                  onChange={(e) => {
                    setPartySize(Number(e.target.value));
                    setPreview(null);
                  }}
                  className="w-28 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-display font-bold text-sm text-[#171313]"
                />
                <span className="text-sm font-medium text-[#171313]/70">
                  people (currently {trip.traveller_count})
                </span>
              </div>
            </label>
          )}

          {(changeType === "replace_component" ||
            changeType === "cancel_component") && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Which component
              </span>
              <select
                value={itemId}
                onChange={(e) => {
                  setItemId(e.target.value);
                  setServiceId("");
                  setPreview(null);
                }}
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              >
                {liveItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.service_date} ·{" "}
                    {money(item.total_price)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {changeType === "replace_component" && (
            <p className="text-xs font-medium text-[#171313]/60 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {serviceId
                ? "A replacement is chosen. Preview to see what it costs."
                : "Preview without choosing and you get a ranked shortlist — then pick one from it."}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
              Why (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Anything the operator should know"
              className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
            />
          </label>

          <div className="flex items-center gap-2">
            <NeoButton
              variant="dark"
              leftIcon={<Wand2 className="w-4 h-4" />}
              isLoading={isAssessing}
              onClick={runPreview}
            >
              Preview the impact
            </NeoButton>
            {preview && (
              <NeoButton
                variant="primary"
                leftIcon={<Check className="w-4 h-4" />}
                isLoading={isSubmitting}
                disabled={!preview.impact.feasible}
                onClick={submit}
              >
                Send to the operator
              </NeoButton>
            )}
          </div>

          {preview && (
            <ImpactReportView
              report={preview.impact}
              aiSummary={preview.ai_summary}
              onPickAlternative={
                changeType === "replace_component" ? pickAlternative : undefined
              }
            />
          )}
        </div>
      </Modal>
    </div>
  );
};
