// ═══════════════════════════════════════════
// TRIPZYY — Assist & Reviews Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  AssistThread,
  AssistThreadStatus,
  PaginatedResponse,
  Review,
  ReviewPage,
  ReviewSubject,
  ReviewableItem,
} from "@/types";

function page(params?: { page?: number; limit?: number }) {
  return new URLSearchParams({
    page: String(params?.page ?? 1),
    limit: String(params?.limit ?? 20),
  });
}

/** Traveller-side support conversations. */
export const assistService = {
  /**
   * Start a conversation about one trip.
   *
   * `askConcierge` defaults to true so somebody mid-tour gets an answer from
   * their own trip data immediately rather than silence until office hours.
   * The reply is always labelled as the concierge and it cannot change
   * anything — the thread still reaches a human either way.
   */
  open: (
    tripId: string,
    payload: { subject: string; body: string; askConcierge?: boolean }
  ) =>
    apiClient.post<AssistThread>(`/trips/${tripId}/assist`, {
      subject: payload.subject,
      body: payload.body,
      ask_concierge: payload.askConcierge ?? true,
    }),

  list: (params?: { page?: number; limit?: number; tripId?: string }) => {
    const q = page(params);
    if (params?.tripId) q.set("trip_id", params.tripId);
    return apiClient.get<PaginatedResponse<AssistThread>>(`/assist?${q}`);
  },

  get: (threadId: string) =>
    apiClient.get<AssistThread>(`/assist/${threadId}`),

  reply: (threadId: string, body: string, askConcierge = false) =>
    apiClient.post<AssistThread>(`/assist/${threadId}/messages`, {
      body,
      ask_concierge: askConcierge,
    }),
};

/** Operator-side. Scoped server-side to the caller's own operator. */
export const operatorAssistService = {
  threads: (params?: {
    page?: number;
    limit?: number;
    status?: AssistThreadStatus;
    mineOnly?: boolean;
  }) => {
    const q = page(params);
    if (params?.status) q.set("status", params.status);
    if (params?.mineOnly) q.set("mine_only", "true");
    return apiClient.get<PaginatedResponse<AssistThread>>(
      `/operator/assist?${q}`
    );
  },

  thread: (threadId: string) =>
    apiClient.get<AssistThread>(`/operator/assist/${threadId}`),

  /** Replying claims the thread; `resolve` closes it in the same step. */
  reply: (threadId: string, body: string, resolve = false) =>
    apiClient.post<AssistThread>(`/operator/assist/${threadId}/messages`, {
      body,
      resolve,
    }),

  setStatus: (threadId: string, status: AssistThreadStatus) =>
    apiClient.put<AssistThread>(`/operator/assist/${threadId}/status`, {
      status,
    }),

  /** Pass `null` to hand it back to the unassigned pool. */
  assign: (threadId: string, memberId: string | null) =>
    apiClient.put<AssistThread>(`/operator/assist/${threadId}/assignee`, {
      member_id: memberId,
    }),
};

/**
 * Reviews.
 *
 * Worth knowing: a rating written here is not decoration — it is written back
 * onto the row the component ranker reads, so it changes what the next
 * traveller is recommended. That is why the API refuses a review of anything
 * the author did not actually book.
 */
export const reviewService = {
  create: (payload: {
    subject: ReviewSubject;
    target_id: string;
    rating: number;
    title?: string;
    body?: string;
  }) => apiClient.post<Review>("/reviews", payload),

  /** Components from tours they took, not yet rated. Drives the prompt. */
  pending: () => apiClient.get<ReviewableItem[]>("/reviews/pending"),

  mine: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Review>>(`/reviews/mine?${page(params)}`),

  /** Public: no auth needed, and the summary carries the distribution. */
  listFor: (
    subject: ReviewSubject,
    targetId: string,
    params?: { page?: number; limit?: number }
  ) =>
    apiClient.get<ReviewPage>(
      `/reviews/${subject}/${targetId}?${page(params)}`
    ),

  update: (
    reviewId: string,
    payload: { rating?: number; title?: string; body?: string }
  ) => apiClient.put<Review>(`/reviews/${reviewId}`, payload),

  remove: (reviewId: string) => apiClient.delete<null>(`/reviews/${reviewId}`),
};
