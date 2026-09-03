// ════════════════════════════════════════════════════════════════
// TRIPZYY — Impact Report
// The costed consequence of a proposed change, shown the same way to
// the traveller previewing it and the operator deciding on it.
// ════════════════════════════════════════════════════════════════

"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { Badge } from "@/components/ui/badge";
import type {
  ComponentAlternative,
  ConflictSeverity,
  ImpactReport,
} from "@/types";

interface ImpactReportViewProps {
  report: ImpactReport;
  /** Groq's prose rendering. Optional — the report stands on its own. */
  aiSummary?: string | null;
  /** Offer the alternatives as choices rather than as information. */
  onPickAlternative?: (option: ComponentAlternative) => void;
  className?: string;
}

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const SEVERITY_STYLE: Record<
  ConflictSeverity,
  { tone: string; icon: React.ReactNode; label: string }
> = {
  blocker: {
    tone: "border-[#E51919] bg-[#FCA5A5]/30",
    icon: <Ban className="w-4 h-4 text-[#E51919]" />,
    label: "Blocker",
  },
  warning: {
    tone: "border-[#171313] bg-[#F3ECE2]",
    icon: <AlertTriangle className="w-4 h-4 text-[#171313]" />,
    label: "Warning",
  },
  info: {
    tone: "border-[#171313]/40 bg-[#FAF7F2]",
    icon: <Info className="w-4 h-4 text-[#171313]/70" />,
    label: "Note",
  },
};

const ACTION_LABEL: Record<string, string> = {
  reprice: "Rebooked",
  replace: "Replaced",
  cancel: "Cancelled",
};

export const ImpactReportView: React.FC<ImpactReportViewProps> = ({
  report,
  aiSummary,
  onPickAlternative,
  className = "",
}) => {
  const { cost } = report;
  const delta = Number(cost.net_delta);
  const increases = cost.direction === "increase";

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ─── The headline number ─── */}
      <NeoCard
        variant={increases ? "soft-red" : "green"}
        className="p-5"
        redShadow={increases}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#171313]/60">
              {cost.direction === "none"
                ? "No change to what you pay"
                : increases
                  ? "You would pay"
                  : "You would get back"}
            </p>
            <p className="font-display font-extrabold text-3xl text-[#171313] flex items-center gap-2 mt-1">
              {cost.direction !== "none" &&
                (increases ? (
                  <TrendingUp className="w-6 h-6 text-[#E51919]" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-[#15803D]" />
                ))}
              {report.currency} {money(Math.abs(delta))}
            </p>
          </div>
          <Badge variant={report.feasible ? "green" : "red"}>
            {report.feasible ? "Can go ahead" : "Cannot go ahead"}
          </Badge>
        </div>

        <p className="text-sm font-medium text-[#171313] mt-3">
          {report.summary}
        </p>

        {/* The arithmetic, laid out so the headline is checkable rather than
            merely asserted. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {[
            ["Originally", cost.original_total],
            ["Refunded", cost.refund_total],
            ["Penalty kept", cost.penalty_total],
            ["New booking", cost.replacement_total],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border-[2px] border-[#171313] bg-[#FFFDFB] px-3 py-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/55">
                {label}
              </p>
              <p className="font-display font-bold text-sm text-[#171313]">
                {report.currency} {money(value)}
              </p>
            </div>
          ))}
        </div>
      </NeoCard>

      {/* ─── The narration ─── */}
      {aiSummary && (
        <NeoCard variant="cream" className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#E51919] mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#171313]/60 mb-1">
                In plain English
              </p>
              <p className="text-sm font-medium text-[#171313] leading-relaxed">
                {aiSummary}
              </p>
            </div>
          </div>
        </NeoCard>
      )}

      {/* ─── What actually moves ─── */}
      {report.affected_items.length > 0 && (
        <div>
          <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60 mb-2">
            What changes ({report.affected_items.length})
          </p>
          <div className="space-y-2">
            {report.affected_items.map((item) => (
              <NeoCard key={item.item_id} variant="white" className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        size="sm"
                        variant={item.action === "cancel" ? "red" : "dark"}
                      >
                        {ACTION_LABEL[item.action] || item.action}
                      </Badge>
                      <p className="font-display font-bold text-sm text-[#171313]">
                        {item.title}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-xs font-medium text-[#171313]/70">
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>{item.service_date}</span>
                      {item.new_date && item.new_date !== item.service_date && (
                        <>
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span className="font-bold text-[#171313]">
                            {item.new_date}
                          </span>
                        </>
                      )}
                    </div>

                    {item.new_title && item.new_title !== item.title && (
                      <p className="text-xs font-medium text-[#171313]/70 mt-1">
                        Becomes{" "}
                        <span className="font-bold text-[#171313]">
                          {item.new_title}
                        </span>
                      </p>
                    )}
                    {item.note && (
                      <p className="text-xs font-medium text-[#171313]/60 mt-1 italic">
                        {item.note}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/50">
                      was
                    </p>
                    <p className="text-xs font-bold text-[#171313]/60 line-through">
                      {money(item.original_cost)}
                    </p>
                    <p className="font-display font-bold text-sm text-[#171313] mt-0.5">
                      {money(item.replacement_cost)}
                    </p>
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        </div>
      )}

      {/* ─── What it breaks ─── */}
      {report.conflicts.length > 0 && (
        <div>
          <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60 mb-2">
            Knock-on effects ({report.conflicts.length})
          </p>
          <div className="space-y-2">
            {report.conflicts.map((conflict, index) => {
              const style = SEVERITY_STYLE[conflict.severity];
              return (
                <div
                  key={`${conflict.code}-${index}`}
                  className={`flex items-start gap-2.5 rounded-xl border-[2px] px-3 py-2.5 ${style.tone}`}
                >
                  <span className="mt-0.5 shrink-0">{style.icon}</span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/55">
                      {style.label}
                    </p>
                    <p className="text-sm font-medium text-[#171313]">
                      {conflict.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Availability actually checked ─── */}
      {report.availability.length > 0 && (
        <div>
          <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60 mb-2">
            Availability checked
          </p>
          <div className="space-y-1.5">
            {report.availability.map((row, index) => (
              <div
                key={`${row.service_id}-${row.on_date}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border-[2px] border-[#171313] bg-[#FFFDFB] px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {row.available ? (
                    <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                  ) : (
                    <Ban className="w-4 h-4 text-[#E51919] shrink-0" />
                  )}
                  <p className="text-xs font-bold text-[#171313] truncate">
                    {row.name}
                  </p>
                  <span className="text-xs font-medium text-[#171313]/55">
                    {row.on_date}
                  </span>
                </div>
                <p className="text-xs font-medium text-[#171313]/70 shrink-0">
                  {row.reason ||
                    (row.seats_left === null || row.seats_left === undefined
                      ? "No published limit"
                      : `${row.seats_left} left`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── How well the choice fits ─── */}
      {report.preference_fit && (
        <NeoCard variant="cream-card" className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60">
              Fit against your preferences
            </p>
            <span className="font-display font-extrabold text-lg text-[#171313]">
              {Math.round(report.preference_fit.score)}
              <span className="text-xs font-bold text-[#171313]/50">/100</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(report.preference_fit.reasons).map(([key, value]) => (
              <span
                key={key}
                className="rounded-md border-[2px] border-[#171313] bg-[#FFFDFB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#171313]"
              >
                {key} {Math.round(value)}
              </span>
            ))}
          </div>
          {report.preference_fit.notes.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {report.preference_fit.notes.map((note, index) => (
                <li
                  key={index}
                  className="text-xs font-medium text-[#171313]/70"
                >
                  · {note}
                </li>
              ))}
            </ul>
          )}
        </NeoCard>
      )}

      {/* ─── Alternatives ─── */}
      {report.alternatives.length > 0 && (
        <div>
          <p className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]/60 mb-2">
            {onPickAlternative ? "Or choose instead" : "Other options"}
          </p>
          <div className="space-y-2">
            {report.alternatives.map((option) => (
              <NeoCard
                key={option.service_id}
                variant="white"
                interactive={Boolean(onPickAlternative)}
                className="p-3"
                onClick={
                  onPickAlternative
                    ? () => onPickAlternative(option)
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm text-[#171313]">
                      {option.name}
                    </p>
                    <p className="text-xs font-medium text-[#171313]/60">
                      {option.vendor_name} · {option.comfort_tier}
                      {option.rating ? ` · ${option.rating}★` : ""}
                    </p>
                    {option.notes.length > 0 && (
                      <p className="text-xs font-medium text-[#171313]/60 mt-1">
                        {option.notes[0]}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm text-[#171313]">
                      {option.currency} {money(option.total_price)}
                    </p>
                    <span className="inline-block mt-1 rounded-md border-[2px] border-[#171313] bg-[#F3ECE2] px-2 py-0.5 text-[10px] font-bold text-[#171313]">
                      {Math.round(option.match_score)} match
                    </span>
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
