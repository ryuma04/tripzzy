// ════════════════════════════════════════════════════════════════
// TRIPZYY — Booking & Checkout Modal
// Converts a trip's itinerary components into an official booking
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Ticket,
  Calendar,
  CheckCircle2,
  CreditCard,
  Wallet,
  Clock,
  Loader2,
  ShieldCheck,
  Building,
  Plane,
  Train,
  Check,
  AlertCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { bookingService } from "@/services/bookings";
import type {
  Trip,
  Booking,
  BookingItemInput,
  PaymentMethod,
  Quote,
} from "@/types";

interface CheckoutModalProps {
  trip: Trip;
  isOpen: boolean;
  onClose: () => void;
  onBookingCompleted?: (booking: Booking) => void;
}

const METHODS: PaymentMethod[] = ["card", "upi", "netbanking", "wallet"];

const money = (v: string | number) =>
  Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export function CheckoutModal({
  trip,
  isOpen,
  onClose,
  onBookingCompleted,
}: CheckoutModalProps) {
  const { showToast } = useToast();

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit" | "later">("full");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [notes, setNotes] = useState("");

  // Extract all bookable components from trip stops, activities, accommodations, and transports
  const allComponents = useMemo(() => {
    const items: (BookingItemInput & { key: string; displayTitle: string })[] = [];

    // 1. Activities from stops
    if (trip.stops) {
      trip.stops.forEach((stop, sIdx) => {
        const cityName = stop.destination?.name || stop.city_name || "City";
        if (stop.activities) {
          stop.activities.forEach((act, aIdx) => {
            const cost = Number(act.estimated_cost) || 300;
            items.push({
              key: `act_${act.id || `${sIdx}_${aIdx}`}`,
              stop_id: stop.id,
              itinerary_activity_id: act.id,
              component_type: "activity",
              title: act.title,
              displayTitle: `${act.title} (${cityName})`,
              city: cityName,
              service_date: act.date || stop.arrival_date || trip.start_date,
              quantity: trip.traveller_count || 1,
              units: 1,
              unit_price: String(cost),
            });
          });
        }

        // 2. Accommodations from stops
        if (stop.accommodations) {
          stop.accommodations.forEach((acc, accIdx) => {
            const cost = Number(acc.estimated_cost) || 1500;
            items.push({
              key: `acc_${acc.id || `${sIdx}_${accIdx}`}`,
              stop_id: stop.id,
              component_type: "accommodation",
              title: acc.name,
              displayTitle: `Stay: ${acc.name} (${cityName})`,
              city: cityName,
              service_date: acc.check_in || stop.arrival_date,
              end_date: acc.check_out || stop.departure_date,
              quantity: 1,
              units: acc.nights || 1,
              unit_price: String(cost),
            });
          });
        }
      });
    }

    // 3. Transports
    if (trip.transports) {
      trip.transports.forEach((trans, tIdx) => {
        const cost = Number(trans.cost) || 500;
        const depDate = trans.departure_time ? trans.departure_time.split("T")[0] : trip.start_date;
        items.push({
          key: `trans_${trans.id || tIdx}`,
          component_type: "transport",
          title: `Transfer: ${trans.transport_type.toUpperCase()}`,
          displayTitle: `Transfer (${trans.transport_type.toUpperCase()})`,
          city: "Transit",
          service_date: depDate,
          quantity: trip.traveller_count || 1,
          units: 1,
          unit_price: String(cost),
        });
      });
    }

    return items;
  }, [trip]);

  // Default select all components when opened
  useEffect(() => {
    if (isOpen && allComponents.length > 0) {
      setSelectedKeys(new Set(allComponents.map((c) => c.key)));
    }
  }, [isOpen, allComponents]);

  // Request real-time server quote whenever selection changes
  useEffect(() => {
    const selectedItems = allComponents.filter((c) => selectedKeys.has(c.key));
    if (!isOpen || selectedItems.length === 0) {
      setQuote(null);
      return;
    }

    let isMounted = true;
    const fetchQuote = async () => {
      setIsQuoting(true);
      try {
        const cleanItems: BookingItemInput[] = selectedItems.map((c) => ({
          component_type: c.component_type,
          title: c.title,
          city: c.city,
          service_date: c.service_date,
          end_date: c.end_date,
          quantity: c.quantity,
          units: c.units,
          unit_price: c.unit_price,
          stop_id: c.stop_id,
          itinerary_activity_id: c.itinerary_activity_id,
        }));

        const res = await bookingService.quote(trip.id, cleanItems);
        if (isMounted && res.success && res.data) {
          setQuote(res.data);
        }
      } catch (err) {
        console.error("Failed to generate quote:", err);
      } finally {
        if (isMounted) setIsQuoting(false);
      }
    };

    fetchQuote();
    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedKeys, allComponents, trip.id]);

  const toggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) {
          showToast("Select at least one component to book.", "info");
          return prev;
        }
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleConfirmAndBook = async () => {
    const selectedItems = allComponents.filter((c) => selectedKeys.has(c.key));
    if (selectedItems.length === 0) {
      showToast("Please select at least one component.", "error");
      return;
    }

    setIsBooking(true);
    try {
      const cleanItems: BookingItemInput[] = selectedItems.map((c) => ({
        component_type: c.component_type,
        title: c.title,
        city: c.city,
        service_date: c.service_date,
        end_date: c.end_date,
        quantity: c.quantity,
        units: c.units,
        unit_price: c.unit_price,
        stop_id: c.stop_id,
        itinerary_activity_id: c.itinerary_activity_id,
      }));

      // 1. Create booking on backend
      const bookRes = await bookingService.create(trip.id, cleanItems, {
        notes: notes.trim() || undefined,
      });

      if (!bookRes.success || !bookRes.data) {
        showToast(bookRes.message || "Failed to create booking.", "error");
        setIsBooking(false);
        return;
      }

      let createdBooking = bookRes.data;

      // 2. Process payment if immediate payment requested
      if (paymentOption !== "later") {
        const total = Number(createdBooking.total);
        const amountToPay =
          paymentOption === "deposit"
            ? (total * 0.2).toFixed(2)
            : undefined; // undefined settles full balance

        const payRes = await bookingService.pay(createdBooking.id, {
          amount: amountToPay,
          method,
        });

        if (payRes.success && payRes.data) {
          createdBooking = payRes.data;
          showToast(
            paymentOption === "full"
              ? `Booking confirmed & paid! Ref: ${createdBooking.reference}`
              : `Deposit recorded! ₹${money(createdBooking.amount_outstanding)} remaining.`,
            "success"
          );
        } else {
          showToast("Booking created, but payment failed. You can retry in Bookings tab.", "info");
        }
      } else {
        showToast(`Tour held! Reference: ${createdBooking.reference}`, "success");
      }

      if (onBookingCompleted) {
        onBookingCompleted(createdBooking);
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || "An error occurred during booking.", "error");
    } finally {
      setIsBooking(false);
    }
  };

  const totalAmount = quote ? Number(quote.total) : 0;
  const depositAmount = (totalAmount * 0.2).toFixed(2);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Book Itinerary & Checkout"
      subtitle={`Confirm components for "${trip.title}" to lock in prices and availability`}
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-5">
        {allComponents.length === 0 ? (
          <div className="p-8 text-center bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl">
            <Ticket className="w-10 h-10 mx-auto text-neutral-400 mb-2" />
            <h4 className="font-display font-bold text-sm text-[#171313]">No Itinerary Components Found</h4>
            <p className="text-xs text-neutral-500 mt-1">
              Add destination stops, activities, or stays to your trip first to book them.
            </p>
          </div>
        ) : (
          <>
            {/* Step 1: Component Selection */}
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#171313]">
                <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                  1. Select Components ({selectedKeys.size}/{allComponents.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedKeys(
                      selectedKeys.size === allComponents.length
                        ? new Set([allComponents[0].key])
                        : new Set(allComponents.map((c) => c.key))
                    )
                  }
                  className="text-xs font-bold text-[#E51919] hover:underline cursor-pointer"
                >
                  {selectedKeys.size === allComponents.length ? "Clear extra" : "Select all"}
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {allComponents.map((comp) => {
                  const isChecked = selectedKeys.has(comp.key);
                  const cost = Number(comp.unit_price) * (comp.quantity || 1) * (comp.units || 1);

                  return (
                    <label
                      key={comp.key}
                      onClick={() => toggleItem(comp.key)}
                      className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        isChecked
                          ? "bg-[#FFF9F2] border-[#171313] shadow-[2px_2px_0px_#171313]"
                          : "bg-white border-neutral-200 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                            isChecked
                              ? "bg-[#E51919] border-[#171313] text-white"
                              : "border-neutral-300 bg-white"
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-display font-bold text-xs text-[#171313]">
                            {comp.displayTitle}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-medium">
                            {comp.service_date}
                            {comp.end_date ? ` → ${comp.end_date}` : ""} · {comp.quantity} pers.
                          </div>
                        </div>
                      </div>

                      <span className="font-display font-extrabold text-xs text-[#171313]">
                        ₹{money(cost)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Live Server Quote Summary */}
            <div className="p-4 bg-[#FFFDFB] border-2 border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313]">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200 text-xs font-bold text-neutral-600">
                <span>Verified Server Quote</span>
                {isQuoting ? (
                  <span className="flex items-center gap-1 text-[#E51919]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Calculating live prices...
                  </span>
                ) : (
                  <span className="text-[#107038] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Availability Locked
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <div className="text-[11px] font-bold text-neutral-500 uppercase">
                    Total Payable ({selectedKeys.size} items)
                  </div>
                  <div className="font-display font-black text-2xl text-[#171313]">
                    ₹{money(totalAmount)}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-[#FFF4E6] border border-[#171313] rounded-md text-[#E51919]">
                    {trip.currency || "INR"}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 3: Payment Options & Settle Timing */}
            <div>
              <label className="block font-display font-bold text-xs uppercase tracking-wider text-[#171313] mb-2">
                2. Payment Schedule
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentOption("full")}
                  className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                    paymentOption === "full"
                      ? "bg-[#FFF4E6] border-[#171313] shadow-[3px_3px_0px_#171313]"
                      : "bg-white border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <div className="font-display font-bold text-xs text-[#171313]">
                    Pay in Full
                  </div>
                  <div className="text-[11px] text-[#107038] font-black mt-1">
                    ₹{money(totalAmount)}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    Locks confirmed tickets
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentOption("deposit")}
                  className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                    paymentOption === "deposit"
                      ? "bg-[#FFF4E6] border-[#171313] shadow-[3px_3px_0px_#171313]"
                      : "bg-white border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <div className="font-display font-bold text-xs text-[#171313]">
                    20% Deposit
                  </div>
                  <div className="text-[11px] text-[#E51919] font-black mt-1">
                    ₹{money(depositAmount)}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    Pay rest later
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentOption("later")}
                  className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                    paymentOption === "later"
                      ? "bg-[#FFF4E6] border-[#171313] shadow-[3px_3px_0px_#171313]"
                      : "bg-white border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <div className="font-display font-bold text-xs text-[#171313]">
                    Reserve Tour
                  </div>
                  <div className="text-[11px] text-neutral-600 font-black mt-1">
                    ₹0 now
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    Pay before departure
                  </div>
                </button>
              </div>
            </div>

            {/* Payment Method selector (if paying now) */}
            {paymentOption !== "later" && (
              <div className="flex flex-col gap-1.5">
                <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`p-2.5 rounded-xl border-2 font-display font-bold text-xs uppercase tracking-wider text-center cursor-pointer transition-all ${
                        method === m
                          ? "bg-[#FFFFFF] border-[#171313] shadow-[2px_2px_0px_#171313] text-[#E51919]"
                          : "bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Booking Notes */}
            <NeoInput
              label="Special Requests / Operator Notes (optional)"
              placeholder="e.g. Vegetarian meal preferences, room on ground floor"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t-2 border-[#171313]">
              <NeoButton variant="white" size="sm" onClick={onClose} disabled={isBooking}>
                Cancel
              </NeoButton>

              <NeoButton
                variant="primary"
                size="md"
                disabled={isBooking || selectedKeys.size === 0}
                onClick={handleConfirmAndBook}
                leftIcon={
                  isBooking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )
                }
              >
                {isBooking
                  ? "Processing Booking..."
                  : paymentOption === "full"
                  ? `Pay ₹${money(totalAmount)} & Confirm`
                  : paymentOption === "deposit"
                  ? `Pay ₹${money(depositAmount)} Deposit & Hold`
                  : "Reserve Itinerary Now"}
              </NeoButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
