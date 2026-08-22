// ════════════════════════════════════════════════════════════════
// TRIPZYY — Split Your Bill Component & Modal Flow
// Equal splitting, user search, member breakdown, and notifications
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Wallet,
  Check,
  X,
  Plus,
  ArrowRight,
  Sparkles,
  Search,
  CheckCircle2,
  Share2,
  Copy,
  Receipt,
  UserCheck,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  DEMO_USERS,
  DEMO_TRIPS,
  DEMO_TRIP_EXPENSES,
  searchDemoUsers,
  saveBillSplit,
  getSavedBillSplits,
} from "@/lib/demo-data";
import { useAuthUser } from "@/lib/auth";
import type { Trip, User, BillSplit, BillSplitMember } from "@/types";

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrip?: Trip | null;
  availableTrips?: Trip[];
  onSplitCompleted?: (split: BillSplit) => void;
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

  // Combine available trips with demo completed trips for robust testing
  const allEligibleTrips: Trip[] = React.useMemo(() => {
    const combined = [...(availableTrips || []), ...DEMO_TRIPS];
    const map = new Map<string, Trip>();
    for (const t of combined) {
      if (!map.has(t.id)) map.set(t.id, t);
    }
    return Array.from(map.values());
  }, [availableTrips]);

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(initialTrip || allEligibleTrips[0] || null);
  const [tripType, setTripType] = useState<"group" | "solo">("group");
  const [customTotalAmount, setCustomTotalAmount] = useState<number>(40000);

  // Group Members (Current user is always member #1)
  const currentUserName = currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : "Yash Patil";
  const currentUserEmail = currentUser?.email || "yash.patil@tripzyy.io";

  const [members, setMembers] = useState<
    { id: string; user_id?: string; name: string; handle: string; email: string; avatar_url?: string; is_current_user: boolean }[]
  >([
    {
      id: "usr_current",
      user_id: currentUser?.id || "usr_yash",
      name: `You (${currentUserName})`,
      handle: `@${currentUserName.toLowerCase().replace(/\s+/g, "")}`,
      email: currentUserEmail,
      avatar_url: currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
      is_current_user: true,
    },
  ]);

  // User Search State
  const [userQuery, setUserQuery] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [finalSplit, setFinalSplit] = useState<BillSplit | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  // Update total amount whenever selected trip changes
  useEffect(() => {
    if (selectedTrip) {
      const expenses = DEMO_TRIP_EXPENSES[selectedTrip.id] || [];
      const totalFromExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const total = totalFromExpenses > 0 ? totalFromExpenses : selectedTrip.budget || 40000;
      setCustomTotalAmount(total);
    }
  }, [selectedTrip]);

  // Set default initial trip if provided
  useEffect(() => {
    if (initialTrip) {
      setSelectedTrip(initialTrip);
    }
  }, [initialTrip]);

  // Handle user search autocomplete
  useEffect(() => {
    if (userQuery.trim().length > 0) {
      const results = searchDemoUsers(userQuery);
      // Filter out users already added
      const filtered = results.filter((u) => !members.some((m) => m.email === u.email || m.name.includes(u.first_name)));
      setUserSuggestions(filtered);
    } else {
      setUserSuggestions([]);
    }
  }, [userQuery, members]);

  const handleAddMember = (userToAdd: User) => {
    const newMember = {
      id: userToAdd.id,
      user_id: userToAdd.id,
      name: `${userToAdd.first_name} ${userToAdd.last_name}`,
      handle: `@${userToAdd.first_name.toLowerCase()}`,
      email: userToAdd.email,
      avatar_url: userToAdd.avatar_url,
      is_current_user: false,
    };
    setMembers((prev) => [...prev, newMember]);
    setUserQuery("");
    setUserSuggestions([]);
    showToast(`Added ${newMember.name} to bill split`, "info");
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id || m.is_current_user));
  };

  // Equal split calculation with integer penny reconciliation
  const memberCount = Math.max(1, members.length);
  const baseShare = Math.floor(customTotalAmount / memberCount);
  const remainder = customTotalAmount - baseShare * memberCount;

  const calculatedMemberShares = members.map((m, idx) => {
    const share = idx === 0 ? baseShare + remainder : baseShare;
    return {
      ...m,
      share_amount: share,
      status: (m.is_current_user ? "PAID" : "PENDING") as "PAID" | "PENDING",
    };
  });

  const handleConfirmSplit = () => {
    if (!selectedTrip) {
      showToast("Please select an eligible trip to split.", "error");
      return;
    }

    if (tripType === "solo") {
      showToast("Solo trips do not require bill splitting.", "info");
      onClose();
      return;
    }

    const splitRecord: BillSplit = {
      id: `split_${Date.now()}`,
      trip_id: selectedTrip.id,
      trip_title: selectedTrip.title,
      total_expense: customTotalAmount,
      member_count: memberCount,
      split_type: "equal",
      created_at: new Date().toISOString(),
      created_by_name: currentUserName,
      status: "PENDING",
      members: calculatedMemberShares.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        name: m.name,
        email: m.email,
        handle: m.handle,
        avatar_url: m.avatar_url,
        is_current_user: m.is_current_user,
        share_amount: m.share_amount,
        status: m.is_current_user ? "SETTLED" : "PENDING",
      })),
    };

    saveBillSplit(splitRecord);
    setFinalSplit(splitRecord);
    setIsConfirmed(true);
    if (onSplitCompleted) onSplitCompleted(splitRecord);
    showToast("Bill split created! In-app notifications dispatched to all members.", "success");
  };

  const handleCopySummary = () => {
    if (!finalSplit) return;
    const text = `Tripzyy Bill Split: ${finalSplit.trip_title}\nTotal Expense: ₹${finalSplit.total_expense.toLocaleString("en-IN")}\nMembers (${finalSplit.member_count}):\n${finalSplit.members.map((m) => `• ${m.name}: ₹${m.share_amount.toLocaleString("en-IN")} (${m.status})`).join("\n")}\nSplit by: ${finalSplit.created_by_name}`;
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    showToast("Split summary copied to clipboard!", "success");
    setTimeout(() => setHasCopied(false), 3000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Split Your Bill"
      subtitle="Divide trip expenses equally among travel group members and dispatch notifications."
      maxWidth="lg"
    >
      {!isConfirmed ? (
        <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto pr-1">
          {/* ─── 1. Select Eligible Trip ─── */}
          <div className="flex flex-col gap-2">
            <label className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-600">
              1. Select Completed or Active Trip:
            </label>
            <select
              value={selectedTrip?.id || ""}
              onChange={(e) => {
                const found = allEligibleTrips.find((t) => t.id === e.target.value);
                if (found) setSelectedTrip(found);
              }}
              className="w-full p-3 bg-white border-[2.5px] border-[#171313] rounded-xl font-display font-bold text-sm shadow-[3px_3px_0px_#171313] focus:outline-none"
            >
              {allEligibleTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status.toUpperCase()} — ₹{(t.budget || 30000).toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </div>

          {/* ─── 2. Trip Type & Total Expense ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAECDC] border-2 border-[#171313] rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-extrabold uppercase text-neutral-600">
                Trip Total Expense
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-display font-black text-2xl text-[#171313]">
                  ₹{customTotalAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <span className="text-[10px] text-neutral-500 font-semibold mt-1">
                Calculated from verified receipts &amp; budget
              </span>
            </div>

            <div className="p-4 bg-white border-2 border-[#171313] rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-extrabold uppercase text-neutral-600">
                Trip Mode
              </span>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setTripType("group")}
                  className={`flex-1 py-1.5 px-3 rounded-lg border-2 border-[#171313] text-xs font-black uppercase transition-all ${
                    tripType === "group"
                      ? "bg-[#107038] text-white shadow-[2px_2px_0px_#171313]"
                      : "bg-neutral-100 text-[#171313] hover:bg-neutral-200"
                  }`}
                >
                  Group Trip
                </button>
                <button
                  type="button"
                  onClick={() => setTripType("solo")}
                  className={`flex-1 py-1.5 px-3 rounded-lg border-2 border-[#171313] text-xs font-black uppercase transition-all ${
                    tripType === "solo"
                      ? "bg-[#D94B3D] text-white shadow-[2px_2px_0px_#171313]"
                      : "bg-neutral-100 text-[#171313] hover:bg-neutral-200"
                  }`}
                >
                  Solo Trip
                </button>
              </div>
              <span className="text-[10px] text-neutral-500 font-semibold mt-1">
                {tripType === "group" ? "Split enabled for group" : "No split needed for solo"}
              </span>
            </div>
          </div>

          {tripType === "solo" ? (
            <div className="p-6 bg-neutral-50 border-2 border-[#171313] rounded-xl text-center flex flex-col items-center gap-2">
              <UserCheck className="w-8 h-8 text-[#107038]" />
              <h5 className="font-display font-extrabold text-base text-[#171313]">
                Solo Expedition Confirmed
              </h5>
              <p className="text-xs text-neutral-600 max-w-sm">
                This expedition has no co-travellers. All expenses are assigned 100% to you with no bill splitting required.
              </p>
            </div>
          ) : (
            <>
              {/* ─── 3. Group Members & User Search ─── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-700">
                    Group Members ({members.length}):
                  </span>
                  <span className="text-xs font-bold text-[#107038]">
                    ₹{Math.round(customTotalAmount / memberCount).toLocaleString("en-IN")} each
                  </span>
                </div>

                {/* Member Pills */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-50 border-2 border-[#171313] rounded-xl">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]"
                    >
                      {m.avatar_url && (
                        <img
                          src={m.avatar_url}
                          alt={m.name}
                          className="w-5 h-5 rounded-full object-cover border border-[#171313]"
                        />
                      )}
                      <span className="font-display font-bold text-xs text-[#171313]">
                        {m.name}
                      </span>
                      {m.is_current_user ? (
                        <span className="text-[9px] font-black uppercase px-1 rounded bg-[#FFD54A] border border-[#171313]">
                          You
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          className="hover:text-[#D94B3D] transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Search & Add Tripzyy User Field */}
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white p-2 rounded-xl border-[2.5px] border-[#171313] shadow-[3px_3px_0px_#171313]">
                    <Search className="w-4 h-4 text-neutral-400 ml-2" />
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Search Tripzyy user to add (e.g. @rahul, Priya, Aman, Sneha)..."
                      className="flex-1 text-xs font-semibold focus:outline-none"
                    />
                    {userQuery && (
                      <button
                        onClick={() => setUserQuery("")}
                        className="text-neutral-400 hover:text-neutral-700 mr-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Autocomplete Dropdown */}
                  {userSuggestions.length > 0 && (
                    <div className="absolute z-40 w-full mt-1 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-48 overflow-y-auto">
                      {userSuggestions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleAddMember(u)}
                          className="w-full text-left px-3 py-2.5 border-b border-neutral-100 hover:bg-[#FFF4E6] flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            {u.avatar_url && (
                              <img
                                src={u.avatar_url}
                                alt={u.first_name}
                                className="w-6 h-6 rounded-full object-cover border border-[#171313]"
                              />
                            )}
                            <div>
                              <div className="font-display font-bold text-xs text-[#171313]">
                                {u.first_name} {u.last_name}
                              </div>
                              <div className="text-[10px] text-neutral-500 font-medium">
                                @{u.first_name.toLowerCase()} • {u.city}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-[#FFD54A] text-[#171313] border border-[#171313] rounded text-[10px] font-black uppercase shadow-[1px_1px_0px_#171313]">
                            + Add
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── 4. Live Equal Split Breakdown Table ─── */}
              <div className="flex flex-col gap-2">
                <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-700">
                  Individual Calculated Share:
                </span>
                <div className="border-[2.5px] border-[#171313] rounded-xl overflow-hidden shadow-[3px_3px_0px_#171313]">
                  <div className="p-2.5 bg-[#171313] text-white flex items-center justify-between text-[11px] font-black uppercase">
                    <span>Group Member</span>
                    <span>Individual Share (₹)</span>
                  </div>
                  {calculatedMemberShares.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`p-3 flex items-center justify-between text-xs border-b border-neutral-200 ${
                        idx % 2 === 0 ? "bg-white" : "bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-display font-bold text-[#171313]">
                        <span>{idx + 1}.</span>
                        <span>{m.name}</span>
                        {m.is_current_user && (
                          <span className="text-[9px] font-black uppercase px-1 rounded bg-[#B7F4D8] border border-[#171313]">
                            Initiator
                          </span>
                        )}
                      </div>
                      <div className="font-display font-black text-sm text-[#171313]">
                        ₹{m.share_amount.toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ─── Actions Footer ─── */}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <NeoButton variant="white" size="md" onClick={onClose}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="primary"
              size="md"
              onClick={handleConfirmSplit}
              rightIcon={<Check className="w-4 h-4" />}
            >
              Confirm &amp; Notify Group
            </NeoButton>
          </div>
        </div>
      ) : (
        /* ─── Success & Settlement Confirmation View ─── */
        <div className="flex flex-col gap-6 text-center py-4">
          <div className="w-14 h-14 rounded-2xl bg-[#B7F4D8] border-[3px] border-[#171313] flex items-center justify-center mx-auto shadow-[4px_4px_0px_#171313]">
            <CheckCircle2 className="w-8 h-8 text-[#107038]" />
          </div>

          <div>
            <h4 className="font-display font-black text-2xl text-[#171313]">
              Bill Split Confirmed!
            </h4>
            <p className="text-xs font-semibold text-neutral-600 max-w-md mx-auto mt-1">
              ₹{finalSplit?.total_expense.toLocaleString("en-IN")} successfully divided among {finalSplit?.member_count} members (₹{Math.round((finalSplit?.total_expense || 0) / (finalSplit?.member_count || 1)).toLocaleString("en-IN")} each).
            </p>
          </div>

          <div className="p-4 bg-[#FAECDC] border-2 border-[#171313] rounded-xl text-left flex flex-col gap-2 max-w-md mx-auto w-full">
            <div className="flex items-center justify-between pb-2 border-b border-[#171313]">
              <span className="font-display font-bold text-xs uppercase text-[#171313]">
                {finalSplit?.trip_title}
              </span>
              <Badge variant="green">DISPATCHED</Badge>
            </div>
            {finalSplit?.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-700">{m.name}:</span>
                <span className="font-mono font-extrabold text-[#171313]">
                  ₹{m.share_amount.toLocaleString("en-IN")} ({m.status})
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <NeoButton
              variant="white"
              size="md"
              leftIcon={hasCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopySummary}
            >
              {hasCopied ? "Copied Summary!" : "Copy Summary"}
            </NeoButton>
            <NeoButton
              variant="primary"
              size="md"
              onClick={() => {
                setIsConfirmed(false);
                onClose();
              }}
            >
              Done &amp; Close
            </NeoButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
