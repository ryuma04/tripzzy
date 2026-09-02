// ════════════════════════════════════════════════════════════════
// TRIPZYY — Compare Alternatives
// Swap one component of a trip for a ranked alternative.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Star,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Check,
  Info,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { inventoryService } from "@/services/inventory";
import type { ComponentAlternative, ComfortTier, ServiceType } from "@/types";

interface CompareAlternativesProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType: ServiceType;
  city?: string;
  /** ISO date the component falls on; drives capacity and seasonal pricing. */
  onDate?: string;
  quantity?: number;
  nights?: number;
  /** Currently-selected option, excluded from results and used as the baseline. */
  currentServiceId?: string;
  currentPrice?: number;
  currentName?: string;
  onSelect?: (option: ComponentAlternative) => void;
}

const TIER_LABEL: Record<ComfortTier, string> = {
  budget: "Budget",
  standard: "Standard",
  premium: "Premium",
  luxury: "Luxury",
};

const REASON_LABEL: Record<string, string> = {
  price: "Price",
  comfort: "Comfort match",
  rating: "Rating",
  interests: "Your interests",
  reliability: "Reliability",
};

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function CompareAlternatives({
  isOpen,
  onClose,
  serviceType,
  city,
  onDate,
  quantity = 1,
  nights = 1,
  currentServiceId,
  currentPrice,
  currentName,
  onSelect,
}: CompareAlternativesProps) {
  const [options, setOptions] = useState<ComponentAlternative[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      const res = await inventoryService.alternatives({
        service_type: serviceType,
        city,
        on_date: onDate,
        quantity,
        nights,
        exclude_service_id: currentServiceId,
        limit: 8,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setOptions(res.data.items);
      } else {
        setError(res.message || "Could not load alternatives.");
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, serviceType, city, onDate, quantity, nights, currentServiceId]);

  // The baseline every delta is measured against.
  const baseline = useMemo(
    () => (currentPrice != null ? currentPrice : null),
    [currentPrice]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compare alternatives"
      subtitle={
        currentName
          ? `Other options instead of ${currentName}`
          : `Options for this ${serviceType}`
      }
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Ranking options for you...
          </div>
        )}

        {!isLoading && error && (
          <p className="text-xs font-semibold text-[#D94B3D] py-6 text-center">
            {error}
          </p>
        )}

        {!isLoading && !error && options.length === 0 && (
          <EmptyState
            icon={<Info className="w-10 h-10 text-[#111111]" />}
            title="Nothing available"
            description={
              onDate
                ? "No supplier has capacity for this component on that date. Try a different date, or a smaller party."
                : "No alternatives are published for this component yet."
            }
          />
        )}

        {!isLoading &&
          options.map((option, index) => {
            const total = Number(option.total_price);
            const delta = baseline != null ? total - baseline : null;
            const isOpen2 = expanded === option.service_id;

            return (
              <div
                key={option.service_id}
                className={`border-[2.5px] border-[#171313] rounded-xl overflow-hidden ${
                  index === 0
                    ? "shadow-[4px_4px_0px_#107038]"
                    : "shadow-[3px_3px_0px_#171313]"
                }`}
              >
                <div className="p-4 bg-white flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {index === 0 && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#B7F4D8] border border-[#171313] text-[#107038]">
                          Best match
                        </span>
                      )}
                      <Badge variant="yellow">
                        {TIER_LABEL[option.comfort_tier]}
                      </Badge>
                      <span className="text-[10px] font-bold text-neutral-500">
                        {option.match_score}/100 match
                      </span>
                    </div>

                    <h4 className="font-display font-black text-base text-[#171313] mt-1.5">
                      {option.name}
                    </h4>
                    <p className="text-[11px] font-semibold text-neutral-500">
                      {option.vendor_name}
                      {option.rating && (
                        <span className="inline-flex items-center gap-0.5 ml-2">
                          <Star className="w-3 h-3 fill-[#FFD54A] text-[#171313]" />
                          {option.rating}
                        </span>
                      )}
                      {option.reliability_score != null && (
                        <span className="inline-flex items-center gap-0.5 ml-2">
                          <ShieldCheck className="w-3 h-3 text-[#107038]" />
                          {option.reliability_score}% reliable
                        </span>
                      )}
                    </p>

                    {option.notes.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {option.notes.map((note) => (
                          <li
                            key={note}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FAECDC] border border-[#171313]"
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="sm:text-right shrink-0">
                    <div className="font-display font-black text-xl text-[#171313]">
                      ₹{money(option.total_price)}
                    </div>
                    <div className="text-[10px] font-semibold text-neutral-500">
                      ₹{money(option.unit_price)} / {option.unit_label}
                    </div>

                    {delta != null && (
                      <div
                        className={`inline-flex items-center gap-1 mt-1 text-[11px] font-black ${
                          delta < 0
                            ? "text-[#107038]"
                            : delta > 0
                              ? "text-[#D94B3D]"
                              : "text-neutral-500"
                        }`}
                      >
                        {delta < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : delta > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {delta === 0
                          ? "Same price"
                          : `${delta < 0 ? "Saves" : "Adds"} ₹${money(Math.abs(delta))}`}
                      </div>
                    )}

                    <div className="mt-2 flex sm:justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(isOpen2 ? null : option.service_id)
                        }
                        className="text-[10px] font-black uppercase underline text-neutral-600 hover:text-[#171313] cursor-pointer"
                      >
                        {isOpen2 ? "Hide" : "Why?"}
                      </button>
                      <NeoButton
                        variant="primary"
                        size="sm"
                        onClick={() => onSelect?.(option)}
                        rightIcon={<Check className="w-3.5 h-3.5" />}
                      >
                        Choose
                      </NeoButton>
                    </div>
                  </div>
                </div>

                {/* The score breakdown. A ranking nobody can interrogate is
                    a ranking nobody should act on. */}
                {isOpen2 && (
                  <div className="px-4 py-3 bg-[#FAF7F2] border-t-2 border-[#171313] flex flex-col gap-1.5">
                    {Object.entries(option.match_reasons).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-neutral-600 w-28 shrink-0">
                          {REASON_LABEL[key] ?? key}
                        </span>
                        <div className="flex-1 h-2 bg-white border border-[#171313] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#107038]"
                            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold w-8 text-right">
                          {Math.round(value)}
                        </span>
                      </div>
                    ))}
                    <p className="text-[10px] text-neutral-500 font-medium mt-1">
                      {option.free_cancellation_days > 0
                        ? `Free cancellation up to ${option.free_cancellation_days} days before.`
                        : `Cancelling costs ${option.cancellation_penalty_pct}% of the total.`}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </Modal>
  );
}
