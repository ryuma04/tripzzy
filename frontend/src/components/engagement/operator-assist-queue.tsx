// ════════════════════════════════════════════════════════════════
// TRIPZYY — Operator Assist Queue
// Traveller questions, and the coordinator answering them.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Headphones,
  Inbox,
  Loader2,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { operatorAssistService } from "@/services/engagement";
import { unwrapItems } from "@/lib/api";
import type { AssistSender, AssistThread, AssistThreadStatus } from "@/types";

const STATUS_TONE: Record<
  AssistThreadStatus,
  "green" | "yellow" | "red" | "white"
> = {
  open: "yellow",
  waiting: "white",
  resolved: "green",
  closed: "white",
};

const SENDER_STYLE: Record<
  AssistSender,
  { label: string; icon: React.ReactNode; card: string }
> = {
  traveller: {
    label: "Traveller",
    icon: <UserRound className="w-3.5 h-3.5" />,
    card: "bg-[#F3ECE2] border-[#171313]",
  },
  coordinator: {
    label: "You",
    icon: <Headphones className="w-3.5 h-3.5" />,
    card: "bg-[#FFFDFB] border-[#171313]",
  },
  // Marked as a draft answer, not a colleague's: a coordinator needs to see at
  // a glance that the traveller has already been told something, and by what.
  ai: {
    label: "Concierge · AI (already sent)",
    icon: <Bot className="w-3.5 h-3.5" />,
    card: "bg-[#FCA5A5]/20 border-dashed border-[#E51919]",
  },
};

interface OperatorAssistQueueProps {
  onChanged?: () => void;
}

export const OperatorAssistQueue: React.FC<OperatorAssistQueueProps> = ({
  onChanged,
}) => {
  const { showToast } = useToast();
  const [threads, setThreads] = useState<AssistThread[]>([]);
  const [active, setActive] = useState<AssistThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await operatorAssistService.threads({ limit: 50 });
    if (res.success) setThreads(unwrapItems<AssistThread>(res.data));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = useCallback(
    async (thread: AssistThread) => {
      const res = await operatorAssistService.thread(thread.id);
      if (res.success && res.data) setActive(res.data);
      else showToast(res.message || "Could not open that thread.", "error");
    },
    [showToast]
  );

  const send = useCallback(
    async (resolve: boolean) => {
      if (!active || !reply.trim()) {
        showToast("Write a reply first.", "error");
        return;
      }
      setBusy(true);
      const res = await operatorAssistService.reply(
        active.id,
        reply.trim(),
        resolve
      );
      if (res.success && res.data) {
        showToast(
          resolve ? "Answered and resolved." : "Reply sent.",
          "success"
        );
        setActive(res.data);
        setReply("");
        await load();
        onChanged?.();
      } else {
        showToast(res.message || "Could not send that reply.", "error");
      }
      setBusy(false);
    },
    [active, reply, showToast, load, onChanged]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#E51919]" />
      </div>
    );
  }

  const needsYou = threads.filter((t) => t.status === "open");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-extrabold text-lg text-[#171313]">
            {needsYou.length} question{needsYou.length === 1 ? "" : "s"} waiting
          </h3>
          <p className="text-sm font-medium text-[#171313]/65">
            The concierge may already have answered from trip data — check what
            it said before repeating it.
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

      {threads.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-10 h-10 text-[#111111]" />}
          title="Nothing to answer"
          description="Questions from your travellers land here, routed from the bookings you supplied."
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <NeoCard
              key={thread.id}
              variant={thread.status === "open" ? "cream-card" : "white"}
              interactive
              className="p-4"
              onClick={() => open(thread)}
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
                    {thread.traveller_name} · {thread.trip_title}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#171313]/60">
                    {thread.message_count} message
                    {thread.message_count === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs font-medium text-[#171313]/55">
                    {thread.assigned_member_name || "Unassigned"}
                  </p>
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.subject || "Conversation"}
        subtitle={
          active ? `${active.traveller_name} · ${active.trip_title}` : undefined
        }
        maxWidth="2xl"
      >
        {active && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(active.messages || []).map((message) => {
                const style = SENDER_STYLE[message.sender];
                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border-[2px] px-3 py-2.5 ${style.card}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {style.icon}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#171313]/70">
                        {message.sender === "traveller" && message.sender_name
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

            {active.status !== "closed" && (
              <>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Answer the traveller…"
                  className="w-full rounded-xl border-[3px] border-[#171313] bg-[#FFFDFB] px-3 py-2 font-medium text-sm text-[#171313]"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <NeoButton
                    variant="dark"
                    leftIcon={<Send className="w-4 h-4" />}
                    isLoading={busy}
                    onClick={() => send(false)}
                  >
                    Reply
                  </NeoButton>
                  <NeoButton
                    variant="green"
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                    isLoading={busy}
                    onClick={() => send(true)}
                  >
                    Reply &amp; resolve
                  </NeoButton>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
