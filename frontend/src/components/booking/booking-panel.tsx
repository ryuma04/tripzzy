// ════════════════════════════════════════════════════════════════
// TRIPZYY — Booking Panel
// Book a trip's components, pay for them, and cancel individually.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  CreditCard,
  Ticket,
  XCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { bookingService } from "@/services/bookings";
import { unwrapItems } from "@/lib/api";
import type {
  Booking,
  BookingItem,
  BookingStatus,
  PaymentMethod,
  Trip,
} from "@/types";

interface BookingPanelProps {
  trip: Trip;
}

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const STATUS_TONE: Record<BookingStatus, "green" | "yellow" | "red" | "white"> = {
  draft: "white",
  pending_payment: "yellow",
  confirmed: "green",
  in_progress: "green",
  completed: "green",
  cancelled: "red",
};

const METHODS: PaymentMethod[] = ["card", "upi", "netbanking", "wallet"];

/** Plain-language cancellation terms, from the snapshot on the item. */
function cancellationTerms(item: BookingItem): string {
  if (item.free_cancellation_days > 0) {
    return `Free cancellation up to ${item.free_cancellation_days} days before`;
  }
  if (item.cancellation_penalty_pct >= 100) return "Non-refundable";
  return `${item.cancellation_penalty_pct}% penalty on cancellation`;
}

export const BookingPanel: React.FC<BookingPanelProps> = ({ trip }) => {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [pendingCancel, setPendingCancel] = useState<{
    booking: Booking;
    item?: BookingItem;
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await bookingService.list({ limit: 50 });
    if (res.success) {
      setBookings(
        unwrapItems<Booking>(res.data).filter((b) => b.trip_id === trip.id)
      );
    }
    setIsLoading(false);
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePay = async (booking: Booking, amount?: string) => {
    setBusyId(booking.id);
    const res = await bookingService.pay(booking.id, { amount, method });
    setBusyId(null);
    if (res.success && res.data) {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? res.data! : b))
      );
      showToast(
        res.data.status === "confirmed"
          ? `Booking ${res.data.reference} confirmed.`
          : `Deposit taken. ₹${money(res.data.amount_outstanding)} still outstanding.`,
        "success"
      );
    } else {
      // A declined payment is a real outcome, not a glitch — say so plainly.
      showToast(res.message || "The payment could not be taken.", "error");
    }
  };

  const handleCancel = async () => {
    if (!pendingCancel) return;
    const { booking, item } = pendingCancel;
    setPendingCancel(null);
    setBusyId(booking.id);
    const res = item
      ? await bookingService.cancelItem(booking.id, item.id)
      : await bookingService.cancel(booking.id);
    setBusyId(null);

    if (res.success && res.data) {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? res.data! : b))
      );
      const c = res.data.cancellation;
      showToast(
        c
          ? `₹${money(c.refunded)} refunded, ₹${money(c.penalty)} retained. ${c.explanation}`
          : "Cancelled.",
        Number(c?.refunded ?? 0) > 0 ? "success" : "info"
      );
    } else {
      showToast(res.message || "Could not cancel that.", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading bookings...
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-10 h-10 text-[#111111]" />}
        title="Nothing booked yet"
        description="Compare options on the itinerary, then book them to lock in prices and availability."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {bookings.map((booking) => {
        const outstanding = Number(booking.amount_outstanding);
        const isBusy = busyId === booking.id;
        const isLive = booking.status !== "cancelled";

        return (
          <NeoCard
            key={booking.id}
            className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-[#171313]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-[#171313]">
                    {booking.reference}
                  </span>
                  <Badge variant={STATUS_TONE[booking.status]}>
                    {booking.status.replace("_", " ")}
                  </Badge>
                </div>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {booking.items.length} component
                  {booking.items.length === 1 ? "" : "s"} ·{" "}
                  {booking.currency} {money(booking.total)}
                </span>
              </div>

              <div className="text-right">
                <div className="text-[10px] font-extrabold uppercase text-neutral-500">
                  Paid
                </div>
                <div className="font-display font-black text-lg text-[#107038]">
                  ₹{money(booking.amount_paid)}
                </div>
                {outstanding > 0 && (
                  <div className="text-[11px] font-bold text-[#D94B3D]">
                    ₹{money(outstanding)} outstanding
                  </div>
                )}
              </div>
            </div>

            {/* Components */}
            <div className="flex flex-col divide-y divide-neutral-200 mt-2">
              {booking.items.map((item) => {
                const isCancelled =
                  item.status === "cancelled" || item.status === "replaced";
                return (
                  <div
                    key={item.id}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div
                        className={`font-display font-bold text-sm ${
                          isCancelled
                            ? "text-neutral-400 line-through"
                            : "text-[#171313]"
                        }`}
                      >
                        {item.title}
                      </div>
                      <div className="text-[11px] font-semibold text-neutral-500">
                        {item.service_date}
                        {item.end_date && item.end_date !== item.service_date
                          ? ` → ${item.end_date}`
                          : ""}{" "}
                        · {item.quantity} × {item.units} @ ₹{money(item.unit_price)}
                      </div>
                      <div className="text-[10px] font-bold text-neutral-400 mt-0.5">
                        {cancellationTerms(item)}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-display font-black text-sm text-[#171313]">
                        ₹{money(item.total_price)}
                      </div>
                      {isCancelled ? (
                        <span className="text-[10px] font-black uppercase text-neutral-400">
                          {item.status}
                        </span>
                      ) : (
                        isLive && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingCancel({ booking, item })
                            }
                            className="text-[10px] font-black uppercase text-[#D94B3D] hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payments ledger */}
            {booking.payments.length > 0 && (
              <div className="mt-3 pt-3 border-t-2 border-dashed border-neutral-300 flex flex-col gap-1">
                {booking.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-[11px] font-semibold"
                  >
                    <span className="flex items-center gap-1.5 text-neutral-600">
                      {p.kind === "refund" ? (
                        <RotateCcw className="w-3 h-3 text-[#D94B3D]" />
                      ) : p.status === "captured" ? (
                        <CheckCircle2 className="w-3 h-3 text-[#107038]" />
                      ) : p.status === "failed" ? (
                        <XCircle className="w-3 h-3 text-[#D94B3D]" />
                      ) : (
                        <Clock className="w-3 h-3 text-neutral-400" />
                      )}
                      {p.kind} · {p.method ?? "—"} · {p.status}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        p.kind === "refund" ? "text-[#D94B3D]" : "text-[#171313]"
                      }`}
                    >
                      {p.kind === "refund" ? "−" : ""}₹{money(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {isLive && outstanding > 0 && (
              <div className="mt-4 pt-4 border-t-2 border-[#171313] flex flex-wrap items-center gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="p-2 bg-white border-2 border-[#171313] rounded-lg font-display font-bold text-xs shadow-[2px_2px_0px_#171313] focus:outline-none"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <NeoButton
                  variant="primary"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => handlePay(booking)}
                  leftIcon={
                    isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )
                  }
                >
                  Pay ₹{money(outstanding)}
                </NeoButton>

                {/* A deposit holds the tour without settling it. */}
                {Number(booking.amount_paid) === 0 && outstanding > 2000 && (
                  <NeoButton
                    variant="white"
                    size="sm"
                    disabled={isBusy}
                    onClick={() =>
                      handlePay(booking, (outstanding * 0.2).toFixed(2))
                    }
                    leftIcon={<Wallet className="w-3.5 h-3.5" />}
                  >
                    Pay 20% deposit
                  </NeoButton>
                )}

                <NeoButton
                  variant="white"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => setPendingCancel({ booking })}
                >
                  Cancel booking
                </NeoButton>
              </div>
            )}
          </NeoCard>
        );
      })}

      <ConfirmationModal
        isOpen={pendingCancel !== null}
        onClose={() => setPendingCancel(null)}
        onConfirm={handleCancel}
        title={pendingCancel?.item ? "Cancel this component?" : "Cancel this booking?"}
        message={
          pendingCancel?.item
            ? `${pendingCancel.item.title} — ${cancellationTerms(pendingCancel.item)}. The rest of the booking is unaffected.`
            : "Every remaining component will be cancelled. Each is refunded on its own terms, so you may not get the full amount back."
        }
        confirmLabel="Cancel it"
      />
    </div>
  );
};
