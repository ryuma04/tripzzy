// ════════════════════════════════════════════════════════════════
// TRIPZYY — Operator Change Queue
// Decide on the changes travellers have asked for.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ImpactReportView } from "@/components/adaptation/impact-report-view";
import { operatorAdaptationService } from "@/services/adaptation";
import { unwrapItems } from "@/lib/api";
import type { ChangeRequest, ChangeRequestStatus } from "@/types";

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const STATUS_TONE: Record<
  ChangeRequestStatus,
  "green" | "yellow" | "red" | "white"
> = {
  pending: "yellow",
  approved: "green",
  countered: "white",
  rejected: "red",
  applied: "green",
  withdrawn: "white",
};

const TYPE_LABEL: Record<string, string> = {
  date_shift: "Date shift",
  replace_component: "Component swap",
  cancel_component: "Cancellation",
  add_component: "Addition",
  party_size: "Party size",
};

interface OperatorChangeQueueProps {
  /** Called after a decision lands, so the console's other numbers refresh. */
  onDecided?: () => void;
}

export const OperatorChangeQueue: React.FC<OperatorChangeQueueProps> = ({
  onDecided,
}) => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await operatorAdaptationService.changeRequests({ limit: 50 });
    if (res.success) setRequests(unwrapItems<ChangeRequest>(res.data));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (request: ChangeRequest, action: "approve" | "reject") => {
      setBusyId(request.id);
      const res = await operatorAdaptationService.decide(request.id, action, {
        note: notes[request.id],
      });
      if (res.success) {
        showToast(
          action === "approve"
            ? "Approved and applied. The traveller has been told."
            : "Declined. The traveller has been told.",
          "success"
        );
        await load();
        onDecided?.();
      } else {
        showToast(res.message || "Could not record that decision.", "error");
      }
      setBusyId(null);
    },
    [notes, showToast, load, onDecided]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#E51919]" />
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-extrabold text-lg text-[#171313]">
            {pending.length} waiting on you
          </h3>
          <p className="text-sm font-medium text-[#171313]/65">
            Each report is what the traveller was shown when they submitted —
            not a fresh quote. Approving applies the change immediately.
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

      {requests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-10 h-10 text-[#111111]" />}
          title="Nothing to decide"
          description="Change requests raised by your travellers land here, costed and ready to approve."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const delta = Number(request.net_cost_delta);
            const isPending = request.status === "pending";
            const infeasible = request.impact?.feasible === false;

            return (
              <NeoCard key={request.id} variant="white" className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_TONE[request.status]} size="sm">
                        {request.status}
                      </Badge>
                      <p className="font-display font-bold text-sm text-[#171313]">
                        {TYPE_LABEL[request.type] || request.type}
                      </p>
                      <span className="text-xs font-medium text-[#171313]/60">
                        · {request.requested_by_name} · {request.trip_title}
                      </span>
                    </div>

                    {request.booking_item_title && (
                      <p className="text-xs font-medium text-[#171313]/70 mt-1">
                        {request.booking_item_title}
                      </p>
                    )}
                    {request.disruption_title && (
                      <p className="text-xs font-bold text-[#E51919] mt-1 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {request.disruption_title}
                      </p>
                    )}
                    {request.reason && (
                      <p className="text-xs font-medium text-[#171313]/60 mt-1 italic">
                        “{request.reason}”
                      </p>
                    )}
                    {request.ai_summary && (
                      <p className="text-xs font-medium text-[#171313]/75 mt-2 leading-relaxed max-w-2xl">
                        {request.ai_summary}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/50">
                      {delta > 0 ? "traveller pays" : delta < 0 ? "you refund" : "no change"}
                    </p>
                    <p
                      className={`font-display font-extrabold text-lg ${
                        delta > 0 ? "text-[#15803D]" : "text-[#E51919]"
                      }`}
                    >
                      {request.currency} {money(Math.abs(delta))}
                    </p>
                  </div>
                </div>

                {infeasible && (
                  <div className="mt-3 rounded-xl border-[2px] border-[#E51919] bg-[#FCA5A5]/25 px-3 py-2">
                    <p className="text-xs font-bold text-[#171313]">
                      This cannot be applied as proposed:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {(request.impact?.blockers || []).map((blocker, index) => (
                        <li
                          key={index}
                          className="text-xs font-medium text-[#171313]/80"
                        >
                          · {blocker}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isPending && (
                  <div className="mt-3 flex items-end gap-2 flex-wrap">
                    <label className="flex-1 min-w-[220px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/55">
                        Note to the traveller
                      </span>
                      <input
                        value={notes[request.id] || ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Confirmed with the property…"
                        className="w-full mt-1 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
                      />
                    </label>
                    <NeoButton
                      variant="green"
                      size="sm"
                      leftIcon={<Check className="w-4 h-4" />}
                      isLoading={busyId === request.id}
                      disabled={infeasible}
                      onClick={() => decide(request, "approve")}
                    >
                      Approve &amp; apply
                    </NeoButton>
                    <NeoButton
                      variant="soft-red"
                      size="sm"
                      leftIcon={<X className="w-4 h-4" />}
                      isLoading={busyId === request.id}
                      onClick={() => decide(request, "reject")}
                    >
                      Decline
                    </NeoButton>
                  </div>
                )}

                {request.applied_result && (
                  <p className="text-xs font-medium text-[#15803D] mt-3">
                    {request.applied_result.summary} · refunded{" "}
                    {money(request.applied_result.refunded)} · charged{" "}
                    {money(request.applied_result.charged)}
                  </p>
                )}

                {request.impact && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#171313]/60 hover:text-[#E51919]">
                      Full impact report
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
    </div>
  );
};
