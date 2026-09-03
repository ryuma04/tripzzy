// ════════════════════════════════════════════════════════════════
// TRIPZYY — Assist & Reviews
// Ask the people running your tour, and rate it afterwards.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Headphones,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Star,
  UserRound,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { assistService, reviewService } from "@/services/engagement";
import { unwrapItems } from "@/lib/api";
import type {
  AssistMessage,
  AssistSender,
  AssistThread,
  AssistThreadStatus,
  ReviewableItem,
  Trip,
} from "@/types";

interface AssistPanelProps {
  trip: Trip;
}

const STATUS_TONE: Record<
  AssistThreadStatus,
  "green" | "yellow" | "red" | "white"
> = {
  open: "yellow",
  waiting: "white",
  resolved: "green",
  closed: "white",
};

const STATUS_HELP: Record<AssistThreadStatus, string> = {
  open: "With the operator.",
  waiting: "They have answered — over to you.",
  resolved: "Sorted.",
  closed: "Closed.",
};

/**
 * How each sender is presented. The concierge is visually distinct on purpose:
 * a traveller is entitled to know whether a person answered them, and an AI
 * reply that merely looks human is the one thing this must not do.
 */
const SENDER_STYLE: Record<
  AssistSender,
  { label: string; icon: React.ReactNode; card: string }
> = {
  traveller: {
    label: "You",
    icon: <UserRound className="w-3.5 h-3.5" />,
    card: "bg-[#F3ECE2] border-[#171313]",
  },
  coordinator: {
    label: "Coordinator",
    icon: <Headphones className="w-3.5 h-3.5" />,
    card: "bg-[#FFFDFB] border-[#171313]",
  },
  ai: {
    label: "Tripzyy Concierge · AI",
    icon: <Bot className="w-3.5 h-3.5" />,
    card: "bg-[#FCA5A5]/20 border-dashed border-[#E51919]",
  },
};

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
        >
          <Star
            className={`w-5 h-5 ${
              star <= value
                ? "fill-[#E51919] text-[#E51919]"
                : "text-[#171313]/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export const AssistPanel: React.FC<AssistPanelProps> = ({ trip }) => {
  const { showToast } = useToast();

  const [threads, setThreads] = useState<AssistThread[]>([]);
  const [openThread, setOpenThread] = useState<AssistThread | null>(null);
  const [pending, setPending] = useState<ReviewableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [askConcierge, setAskConcierge] = useState(true);
  const [reply, setReply] = useState("");

  const [reviewTarget, setReviewTarget] = useState<ReviewableItem | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const [threadRes, pendingRes] = await Promise.all([
      assistService.list({ tripId: trip.id, limit: 50 }),
      reviewService.pending(),
    ]);
    if (threadRes.success) setThreads(unwrapItems<AssistThread>(threadRes.data));
    if (pendingRes.success && pendingRes.data) setPending(pendingRes.data);
    setIsLoading(false);
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  const start = useCallback(async () => {
    if (subject.trim().length < 3 || !body.trim()) {
      showToast("Give it a subject and a question.", "error");
      return;
    }
    setBusy(true);
    const res = await assistService.open(trip.id, {
      subject: subject.trim(),
      body: body.trim(),
      askConcierge,
    });
    if (res.success && res.data) {
      showToast("Sent. The operator has been notified.", "success");
      setIsComposerOpen(false);
      setSubject("");
      setBody("");
      setOpenThread(res.data);
      await load();
    } else {
      showToast(res.message || "Could not start that conversation.", "error");
    }
    setBusy(false);
  }, [trip.id, subject, body, askConcierge, showToast, load]);

  const send = useCallback(async () => {
    if (!openThread || !reply.trim()) return;
    setBusy(true);
    const res = await assistService.reply(openThread.id, reply.trim());
    if (res.success && res.data) {
      setOpenThread(res.data);
      setReply("");
      await load();
    } else {
      showToast(res.message || "Could not send that message.", "error");
    }
    setBusy(false);
  }, [openThread, reply, showToast, load]);

  const view = useCallback(
    async (thread: AssistThread) => {
      const res = await assistService.get(thread.id);
      if (res.success && res.data) setOpenThread(res.data);
      else showToast(res.message || "Could not open that conversation.", "error");
    },
    [showToast]
  );

  const submitReview = useCallback(async () => {
    if (!reviewTarget) return;
    setBusy(true);
    const res = await reviewService.create({
      subject: reviewTarget.subject,
      target_id: reviewTarget.target_id,
      rating,
      title: reviewTitle.trim() || undefined,
      body: reviewBody.trim() || undefined,
    });
    if (res.success) {
      showToast(
        "Thanks — that rating now shapes what gets recommended.",
        "success"
      );
      setReviewTarget(null);
      setReviewTitle("");
      setReviewBody("");
      setRating(5);
      await load();
    } else {
      showToast(res.message || "Could not save that review.", "error");
    }
    setBusy(false);
  }, [reviewTarget, rating, reviewTitle, reviewBody, showToast, load]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#E51919]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── Ask ─── */}
      <NeoCard variant="white" className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display font-extrabold text-lg text-[#171313]">
              Need a hand?
            </h3>
            <p className="text-sm font-medium text-[#171313]/65 mt-0.5">
              Ask the operator running your tour. The concierge answers straight
              away from your trip&apos;s own data while a coordinator picks it up.
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
              leftIcon={<MessageSquare className="w-4 h-4" />}
              onClick={() => setIsComposerOpen(true)}
            >
              Ask a question
            </NeoButton>
          </div>
        </div>
      </NeoCard>

      {/* ─── Rate what you went to ─── */}
      {pending.length > 0 && (
        <NeoCard variant="cream-card" className="p-5">
          <h3 className="font-display font-extrabold text-base text-[#171313]">
            How was it?
          </h3>
          <p className="text-sm font-medium text-[#171313]/65 mt-0.5 mb-3">
            Your rating feeds straight into what gets recommended next — to you
            and to everybody else.
          </p>
          <div className="space-y-2">
            {pending.slice(0, 5).map((item) => (
              <div
                key={item.target_id}
                className="flex items-center justify-between gap-3 rounded-xl border-[2px] border-[#171313] bg-[#FFFDFB] px-3 py-2.5 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-display font-bold text-sm text-[#171313]">
                    {item.title}
                  </p>
                  <p className="text-xs font-medium text-[#171313]/60">
                    {[item.vendor_name, item.city, item.service_date]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <NeoButton
                  variant="dark"
                  size="sm"
                  leftIcon={<Star className="w-3.5 h-3.5" />}
                  onClick={() => setReviewTarget(item)}
                >
                  Rate it
                </NeoButton>
              </div>
            ))}
          </div>
        </NeoCard>
      )}

      {/* ─── Conversations ─── */}
      {threads.length === 0 ? (
        <EmptyState
          icon={<Headphones className="w-10 h-10 text-[#111111]" />}
          title="No conversations yet"
          description="Anything you ask about this trip lands with the operator running it, and stays here so you can follow the answer."
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <NeoCard
              key={thread.id}
              variant="white"
              interactive
              className="p-4"
              onClick={() => view(thread)}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_TONE[thread.status]} size="sm">
                      {thread.status}
                    </Badge>
                    <p className="font-display font-bold text-sm text-[#171313]">
                      {thread.subject}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-[#171313]/65 mt-1">
                    {STATUS_HELP[thread.status]}
                    {thread.assigned_member_name
                      ? ` With ${thread.assigned_member_name}.`
                      : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#171313]/60">
                    {thread.message_count} message
                    {thread.message_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      )}

      {/* ─── New conversation ─── */}
      <Modal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        title="Ask about this trip"
        subtitle="It reaches the operator running your tour."
        maxWidth="lg"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Airport pickup timing"
              className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
              Your question
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What time does check-in start at my hotel?"
              className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={askConcierge}
              onChange={(e) => setAskConcierge(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#E51919]"
            />
            <span className="text-sm font-medium text-[#171313]">
              Get an instant answer from the concierge
              <span className="block text-xs text-[#171313]/60">
                Answers from your trip&apos;s real data, always labelled as AI,
                and it cannot change anything. A coordinator still picks it up.
              </span>
            </span>
          </label>
          <NeoButton
            variant="primary"
            leftIcon={<Send className="w-4 h-4" />}
            isLoading={busy}
            onClick={start}
          >
            Send it
          </NeoButton>
        </div>
      </Modal>

      {/* ─── Thread ─── */}
      <Modal
        isOpen={Boolean(openThread)}
        onClose={() => setOpenThread(null)}
        title={openThread?.subject || "Conversation"}
        subtitle={openThread ? STATUS_HELP[openThread.status] : undefined}
        maxWidth="2xl"
      >
        {openThread && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(openThread.messages || []).map((message: AssistMessage) => {
                const style = SENDER_STYLE[message.sender];
                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border-[2px] px-3 py-2.5 ${style.card}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {style.icon}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/70">
                        {message.sender === "coordinator" && message.sender_name
                          ? message.sender_name
                          : style.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[#171313] whitespace-pre-wrap">
                      {message.body}
                    </p>
                  </div>
                );
              })}
            </div>

            {openThread.status !== "closed" && (
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder="Write a reply…"
                  className="flex-1 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
                />
                <NeoButton
                  variant="primary"
                  leftIcon={<Send className="w-4 h-4" />}
                  isLoading={busy}
                  onClick={send}
                >
                  Send
                </NeoButton>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Review ─── */}
      <Modal
        isOpen={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget ? `Rate ${reviewTarget.title}` : "Rate"}
        subtitle="This goes straight into what gets recommended next."
        maxWidth="lg"
      >
        {reviewTarget && (
          <div className="space-y-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Your rating
              </span>
              <div className="mt-1.5">
                <Stars value={rating} onChange={setRating} />
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                Headline (optional)
              </span>
              <input
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="Excellent stay"
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171313]/60">
                What was it like? (optional)
              </span>
              <textarea
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                rows={3}
                className="w-full mt-1.5 rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
              />
            </label>
            <NeoButton
              variant="primary"
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
              isLoading={busy}
              onClick={submitReview}
            >
              Post the review
            </NeoButton>
          </div>
        )}
      </Modal>
    </div>
  );
};
