// ════════════════════════════════════════════════════════════════
// TRIPZYY — Split Your Bill
// Divides a trip's recorded spend among its travellers, server-side.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  X,
  Search,
  CheckCircle2,
  Copy,
  UserCheck,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { billSplitService, directoryService } from "@/services/bill-splits";
import { tripService } from "@/services/trips";
import { useAuthUser } from "@/lib/auth";
import { unwrapItems } from "@/lib/api";
import type {
  BillSplit,
  BillSplitMemberInput,
  DirectoryUser,
  Expense,
  Trip,
} from "@/types";

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrip?: Trip | null;
  availableTrips?: Trip[];
  onSplitCompleted?: (split: BillSplit) => void;
}

/** A row in the member list before the split exists. */
interface DraftMember {
  key: string;
  userId?: string;
  name: string;
  avatarUrl?: string | null;
  isSelf: boolean;
}

const money = (value: string | number) =>
  Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Divide `total` into `count` shares that sum back to exactly `total`.
 *
 * Mirrors `divide_evenly` on the server so the preview matches what actually
 * gets saved. Previously the table gave the entire remainder to the initiator
 * while the heading above it printed `round(total / n)`, so the rows and the
 * summary disagreed -- 40000 across 3 showed 13334/13333/13333 under a label
 * reading "₹13,333 each".
 */
export function divideEvenly(total: number, count: number): number[] {
  if (count < 1) return [];
  const paise = Math.round(total * 100);
  const base = Math.floor(paise / count);
  const remainder = paise - base * count;
  return Array.from(
    { length: count },
    (_, i) => (base + (i < remainder ? 1 : 0)) / 100
  );
}

export function SplitBillModal({
  isOpen,
  onClose,
  initialTrip,
  availableTrips = [],
  onSplitCompleted,
}: SplitBillModalProps) {
  const { user: currentUser } = useAuthUser();
  const { showToast } = useToast();

  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [isLoadingTotal, setIsLoadingTotal] = useState(false);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DirectoryUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [finalSplit, setFinalSplit] = useState<BillSplit | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  // Only the caller's real trips. The old version merged in DEMO_TRIPS
  // unconditionally, so the dropdown always offered fictional expeditions.
  const eligibleTrips = useMemo(() => {
    const merged = initialTrip ? [initialTrip, ...availableTrips] : availableTrips;
    const byId = new Map<string, Trip>();
    for (const t of merged) if (!byId.has(t.id)) byId.set(t.id, t);
    return Array.from(byId.values());
  }, [initialTrip, availableTrips]);

  const selectedTrip = eligibleTrips.find((t) => t.id === selectedTripId) ?? null;

  // `members` is seeded in an effect rather than in useState's initialiser.
  // useAuthUser resolves from localStorage after mount, and the initialiser
  // only ever runs on the first render -- so the old code captured the signed
  // -out placeholder and the real user never appeared as member #1.
  const resetDraft = useCallback(() => {
    setFinalSplit(null);
    setHasCopied(false);
    setUserQuery("");
    setSuggestions([]);
    setMembers(
      currentUser
        ? [
            {
              key: `self-${currentUser.id}`,
              userId: currentUser.id,
              name: `${currentUser.first_name} ${currentUser.last_name}`.trim(),
              avatarUrl: currentUser.avatar_url,
              isSelf: true,
            },
          ]
        : []
    );
  }, [currentUser]);

  useEffect(() => {
    if (isOpen) {
      resetDraft();
      setSelectedTripId(initialTrip?.id ?? eligibleTrips[0]?.id ?? "");
    }
    // Closing via the X or the backdrop must clear the success screen too.
    // It previously only reset on the "Done" button, so reopening the modal
    // dropped you back onto the last confirmation.
    if (!isOpen) resetDraft();
  }, [isOpen, initialTrip, resetDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // The default total is what the trip actually cost, from its expenses --
  // not its budget, which is what the previous version showed under the
  // label "calculated from verified receipts".
  useEffect(() => {
    if (!selectedTripId || !isOpen) return;
    let cancelled = false;

    (async () => {
      setIsLoadingTotal(true);
      const res = await tripService.getExpenses(selectedTripId);
      if (cancelled) return;
      if (res.success) {
        const spent = unwrapItems<Expense>(res.data).reduce(
          (sum, e) => sum + (Number(e.amount) || 0),
          0
        );
        setTotalAmount(spent);
      } else {
        setTotalAmount(0);
      }
      setIsLoadingTotal(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTripId, isOpen]);

  // Search the real user directory, debounced.
  useEffect(() => {
    const term = userQuery.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const res = await directoryService.searchUsers(term);
      if (cancelled) return;
      const found = res.success && res.data ? res.data : [];
      setSuggestions(found.filter((u) => !members.some((m) => m.userId === u.id)));
      setIsSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userQuery, members]);

  const shares = useMemo(
    () => divideEvenly(totalAmount, Math.max(members.length, 1)),
    [totalAmount, members.length]
  );

  const addMember = (user: DirectoryUser) => {
    setMembers((prev) => [
      ...prev,
      {
        key: `user-${user.id}`,
        userId: user.id,
        name: `${user.first_name} ${user.last_name}`.trim(),
        avatarUrl: user.avatar_url,
        isSelf: false,
      },
    ]);
    setUserQuery("");
    setSuggestions([]);
  };

  const addGuest = () => {
    const name = userQuery.trim();
    if (!name) return;
    setMembers((prev) => [
      ...prev,
      { key: `guest-${name}-${Date.now()}`, name, isSelf: false },
    ]);
    setUserQuery("");
    setSuggestions([]);
  };

  const removeMember = (key: string) =>
    setMembers((prev) => prev.filter((m) => m.key !== key || m.isSelf));

  const handleConfirm = async () => {
    if (!selectedTrip) {
      showToast("Pick a trip to split.", "error");
      return;
    }
    if (totalAmount <= 0) {
      showToast(
        "This trip has no expenses recorded yet, so there is nothing to split.",
        "error"
      );
      return;
    }
    if (members.length === 0) {
      showToast("Add at least one person to split with.", "error");
      return;
    }

    setIsSaving(true);
    const payload = {
      total_amount: totalAmount.toFixed(2),
      split_method: "equal" as const,
      is_group: members.length > 1,
      members: members.map<BillSplitMemberInput>((m) => ({
        user_id: m.userId,
        display_name: m.name,
        is_payer: m.isSelf,
      })),
    };

    const res = await billSplitService.create(selectedTrip.id, payload);
    setIsSaving(false);

    if (res.success && res.data) {
      setFinalSplit(res.data);
      onSplitCompleted?.(res.data);
      showToast(
        `Split saved. ${res.data.member_count - 1 > 0 ? "Everyone else has been notified." : ""}`.trim(),
        "success"
      );
    } else {
      showToast(res.message || "Could not save the bill split.", "error");
    }
  };

  const toggleMemberPaid = async (memberId: string, currentlyPaid: boolean) => {
    if (!finalSplit) return;
    const res = await billSplitService.setMemberStatus(
      finalSplit.id,
      memberId,
      currentlyPaid ? "owes" : "paid"
    );
    if (res.success && res.data) {
      setFinalSplit(res.data);
      if (res.data.status === "settled") {
        showToast("Everyone has paid — this split is settled.", "success");
      }
    } else {
      showToast(res.message || "Could not update that share.", "error");
    }
  };

  const handleCopySummary = () => {
    if (!finalSplit) return;
    const lines = finalSplit.members
      .map(
        (m) =>
          `• ${m.display_name}: ${finalSplit.currency} ${money(m.share_amount)} (${m.status})`
      )
      .join("\n");
    navigator.clipboard.writeText(
      `Tripzyy bill split — ${finalSplit.trip_title ?? "Trip"}\n` +
        `Total: ${finalSplit.currency} ${money(finalSplit.total_amount)}\n` +
        `Members (${finalSplit.member_count}):\n${lines}`
    );
    setHasCopied(true);
    showToast("Split summary copied.", "success");
    setTimeout(() => setHasCopied(false), 3000);
  };

  const perHead = members.length > 0 ? shares[0] : 0;
  const isUneven =
    shares.length > 1 && shares[0] !== shares[shares.length - 1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Split Your Bill"
      subtitle="Divide this trip's recorded spend between the people who travelled."
      maxWidth="lg"
    >
      {!finalSplit ? (
        <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto pr-1">
          {/* ─── 1. Trip ─── */}
          <div className="flex flex-col gap-2">
            <label className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-600">
              1. Trip to split
            </label>
            {eligibleTrips.length === 0 ? (
              <p className="text-xs font-semibold text-neutral-500 p-3 bg-neutral-50 border-2 border-[#171313] rounded-xl">
                You have no trips yet. Create one, record some expenses, and
                come back to split them.
              </p>
            ) : (
              <select
                value={selectedTripId}
                onChange={(e) => setSelectedTripId(e.target.value)}
                className="w-full p-3 bg-white border-[2.5px] border-[#171313] rounded-xl font-display font-bold text-sm shadow-[3px_3px_0px_#171313] focus:outline-none"
              >
                {eligibleTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ─── 2. Amount ─── */}
          <div className="flex flex-col gap-2">
            <label className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-600">
              2. Amount to split
            </label>
            <div className="p-4 bg-[#FAECDC] border-2 border-[#171313] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-2xl text-[#171313]">
                  ₹
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalAmount || ""}
                  onChange={(e) => setTotalAmount(Number(e.target.value) || 0)}
                  className="flex-1 bg-transparent font-display font-black text-2xl text-[#171313] focus:outline-none min-w-0"
                />
                {isLoadingTotal && (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                )}
              </div>
              <span className="text-[10px] text-neutral-600 font-semibold mt-1 block">
                {totalAmount > 0
                  ? "Totalled from this trip's recorded expenses. Edit it if you are splitting something else."
                  : "No expenses recorded on this trip yet — enter an amount to split."}
              </span>
            </div>
          </div>

          {/* ─── 3. Members ─── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-700">
                3. Split between ({members.length})
              </span>
              <span className="text-xs font-bold text-[#107038]">
                ₹{money(perHead)} {isUneven ? "each (±₹0.01)" : "each"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-50 border-2 border-[#171313] rounded-xl min-h-[52px]">
              {members.map((m) => (
                <div
                  key={m.key}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]"
                >
                  {m.avatarUrl && (
                    <img
                      src={m.avatarUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-[#171313]"
                    />
                  )}
                  <span className="font-display font-bold text-xs text-[#171313]">
                    {m.name}
                  </span>
                  {m.isSelf ? (
                    <span className="text-[9px] font-black uppercase px-1 rounded bg-[#FFD54A] border border-[#171313]">
                      You
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeMember(m.key)}
                      aria-label={`Remove ${m.name}`}
                      className="hover:text-[#D94B3D] transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Real directory search, not a hardcoded cast of characters. */}
            <div className="relative">
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border-[2.5px] border-[#171313] shadow-[3px_3px_0px_#171313]">
                <Search className="w-4 h-4 text-neutral-400 ml-2" />
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search by name, or paste an email address..."
                  className="flex-1 text-xs font-semibold focus:outline-none"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-400 mr-2" />
                )}
              </div>

              {userQuery.trim().length >= 2 && (
                <div className="absolute z-40 w-full mt-1 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-48 overflow-y-auto">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addMember(u)}
                      className="w-full text-left px-3 py-2.5 border-b border-neutral-100 hover:bg-[#FFF4E6] flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        {u.avatar_url && (
                          <img
                            src={u.avatar_url}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-[#171313]"
                          />
                        )}
                        <div>
                          <div className="font-display font-bold text-xs text-[#171313]">
                            {u.first_name} {u.last_name}
                          </div>
                          {u.city && (
                            <div className="text-[10px] text-neutral-500 font-medium">
                              {u.city}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-[#FFD54A] text-[#171313] border border-[#171313] rounded text-[10px] font-black uppercase">
                        + Add
                      </span>
                    </button>
                  ))}
                  {/* Trips get split with people who are not on Tripzyy. */}
                  {!isSearching && (
                    <button
                      type="button"
                      onClick={addGuest}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#FFF4E6] cursor-pointer"
                    >
                      <span className="font-display font-bold text-xs text-[#171313]">
                        Add “{userQuery.trim()}” as a guest
                      </span>
                      <span className="block text-[10px] text-neutral-500 font-medium">
                        Not a Tripzyy account — tracked by name only
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ─── 4. Preview ─── */}
          <div className="flex flex-col gap-2">
            <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-700">
              4. Each person pays
            </span>
            <div className="border-[2.5px] border-[#171313] rounded-xl overflow-hidden shadow-[3px_3px_0px_#171313]">
              <div className="p-2.5 bg-[#171313] text-white flex items-center justify-between text-[11px] font-black uppercase">
                <span>Member</span>
                <span>Share (₹)</span>
              </div>
              {members.map((m, idx) => (
                <div
                  key={m.key}
                  className={`p-3 flex items-center justify-between text-xs border-b border-neutral-200 ${
                    idx % 2 === 0 ? "bg-white" : "bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-display font-bold text-[#171313]">
                    <span>{idx + 1}.</span>
                    <span>{m.name}</span>
                    {m.isSelf && (
                      <span className="text-[9px] font-black uppercase px-1 rounded bg-[#B7F4D8] border border-[#171313]">
                        Paid the bill
                      </span>
                    )}
                  </div>
                  <div className="font-display font-black text-sm text-[#171313]">
                    ₹{money(shares[idx] ?? 0)}
                  </div>
                </div>
              ))}
              <div className="p-2.5 bg-[#FAECDC] flex items-center justify-between text-xs font-display font-black">
                <span>Total</span>
                <span>₹{money(totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <NeoButton variant="white" size="md" onClick={onClose}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              size="md"
              onClick={handleConfirm}
              disabled={isSaving || !selectedTrip || members.length === 0}
              rightIcon={
                isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )
              }
            >
              {isSaving ? "Saving..." : "Confirm & notify"}
            </NeoButton>
          </div>
        </div>
      ) : (
        /* ─── Settlement view ─── */
        <div className="flex flex-col gap-6 py-2 max-h-[75vh] overflow-y-auto pr-1">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#B7F4D8] border-[3px] border-[#171313] flex items-center justify-center mx-auto shadow-[4px_4px_0px_#171313]">
              {finalSplit.status === "settled" ? (
                <CheckCircle2 className="w-8 h-8 text-[#107038]" />
              ) : (
                <UserCheck className="w-8 h-8 text-[#107038]" />
              )}
            </div>
            <h4 className="font-display font-black text-2xl text-[#171313] mt-3">
              {finalSplit.status === "settled"
                ? "Everyone has settled up"
                : "Bill split saved"}
            </h4>
            <p className="text-xs font-semibold text-neutral-600 mt-1">
              ₹{money(finalSplit.total_amount)} across {finalSplit.member_count}{" "}
              {finalSplit.member_count === 1 ? "person" : "people"}.
              {finalSplit.outstanding_amount &&
                Number(finalSplit.outstanding_amount) > 0 && (
                  <> ₹{money(finalSplit.outstanding_amount)} still outstanding.</>
                )}
            </p>
          </div>

          <div className="border-[2.5px] border-[#171313] rounded-xl overflow-hidden">
            <div className="p-2.5 bg-[#171313] text-white flex items-center justify-between text-[11px] font-black uppercase">
              <span>{finalSplit.trip_title}</span>
              <Badge variant={finalSplit.status === "settled" ? "green" : "yellow"}>
                {finalSplit.status}
              </Badge>
            </div>
            {finalSplit.members.map((m) => {
              const isPaid = m.status === "paid";
              return (
                <div
                  key={m.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs border-b border-neutral-200 bg-white"
                >
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[#171313] truncate">
                      {m.display_name}
                      {m.is_payer && (
                        <span className="ml-2 text-[9px] font-black uppercase px-1 rounded bg-[#FFD54A] border border-[#171313]">
                          Paid the bill
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-neutral-600">
                      ₹{money(m.share_amount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMemberPaid(m.id, isPaid)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg border-2 border-[#171313] text-[10px] font-black uppercase transition-all cursor-pointer inline-flex items-center gap-1 ${
                      isPaid
                        ? "bg-[#B7F4D8] text-[#107038]"
                        : "bg-white text-[#171313] hover:bg-[#FAECDC]"
                    }`}
                  >
                    {isPaid ? (
                      <>
                        <Check className="w-3 h-3" /> Settled
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3" /> Mark paid
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-3">
            <NeoButton
              variant="white"
              size="md"
              leftIcon={
                hasCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
              }
              onClick={handleCopySummary}
            >
              {hasCopied ? "Copied" : "Copy summary"}
            </NeoButton>
            <NeoButton variant="primary" size="md" onClick={onClose}>
              Done
            </NeoButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
