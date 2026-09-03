// ═══════════════════════════════════════════
// TRIPZYY — Dynamic Tour Management Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  AssessChangeResponse,
  ChangeProposal,
  ChangeRequest,
  ChangeRequestStatus,
  ChangeRequestType,
  ConflictCheck,
  CreateDisruptionPayload,
  Disruption,
  DisruptionStatus,
  PaginatedResponse,
} from "@/types";

function page(params?: { page?: number; limit?: number }) {
  return new URLSearchParams({
    page: String(params?.page ?? 1),
    limit: String(params?.limit ?? 20),
  });
}

/**
 * The traveller's half of the adaptation flow.
 *
 * `assess` is a **preview**: it writes nothing, so it is safe to call on every
 * keystroke of a "what if I moved this" control. `submit` is the commitment —
 * it freezes the impact report onto the request, and that frozen report is
 * what the operator later approves. The two must not be confused in the UI:
 * the numbers a traveller acts on have to be the numbers that get agreed.
 */
export const adaptationService = {
  /** Cost a proposed change. Writes nothing. */
  assess: (
    tripId: string,
    type: ChangeRequestType,
    proposal: ChangeProposal,
    options?: { explain?: boolean }
  ) => {
    const q = options?.explain ? "?explain=true" : "";
    return apiClient.post<AssessChangeResponse>(
      `/trips/${tripId}/assess-change${q}`,
      { type, proposal }
    );
  },

  /** Submit for the operator to decide on. */
  submit: (
    tripId: string,
    type: ChangeRequestType,
    proposal: ChangeProposal,
    reason?: string
  ) =>
    apiClient.post<ChangeRequest>(`/trips/${tripId}/change-requests`, {
      type,
      proposal,
      reason,
    }),

  list: (params?: { page?: number; limit?: number; tripId?: string }) => {
    const q = page(params);
    if (params?.tripId) q.set("trip_id", params.tripId);
    return apiClient.get<PaginatedResponse<ChangeRequest>>(
      `/change-requests?${q}`
    );
  },

  get: (requestId: string) =>
    apiClient.get<ChangeRequest>(`/change-requests/${requestId}`),

  /** Only possible while the operator has not decided yet. */
  withdraw: (requestId: string) =>
    apiClient.delete<ChangeRequest>(`/change-requests/${requestId}`),

  /** Standing health check on one itinerary. Advisory, never blocking. */
  conflicts: (tripId: string) =>
    apiClient.get<ConflictCheck>(`/trips/${tripId}/conflicts`),
};

/**
 * The operator's half. Scoped server-side to the caller's own operator — note
 * that nothing here takes an `operator_id`, which is the point.
 */
export const operatorAdaptationService = {
  changeRequests: (params?: {
    page?: number;
    limit?: number;
    status?: ChangeRequestStatus;
  }) => {
    const q = page(params);
    if (params?.status) q.set("status", params.status);
    return apiClient.get<PaginatedResponse<ChangeRequest>>(
      `/operator/change-requests?${q}`
    );
  },

  changeRequest: (requestId: string) =>
    apiClient.get<ChangeRequest>(`/operator/change-requests/${requestId}`),

  /**
   * Approving **applies** the change server-side, in one transaction. There is
   * no separate "now apply it" step to forget.
   */
  decide: (
    requestId: string,
    action: "approve" | "counter" | "reject",
    options?: { note?: string; counterProposal?: ChangeProposal }
  ) =>
    apiClient.post<ChangeRequest>(
      `/operator/change-requests/${requestId}/decision`,
      {
        action,
        note: options?.note,
        counter_proposal: options?.counterProposal,
      }
    ),

  disruptions: (params?: {
    page?: number;
    limit?: number;
    status?: DisruptionStatus;
  }) => {
    const q = page(params);
    if (params?.status) q.set("status", params.status);
    return apiClient.get<PaginatedResponse<Disruption>>(
      `/operator/disruptions?${q}`
    );
  },

  /** Raising one immediately returns the costed blast radius. */
  raise: (payload: CreateDisruptionPayload) =>
    apiClient.post<Disruption>("/operator/disruptions", payload),

  disruption: (disruptionId: string) =>
    apiClient.get<Disruption>(`/operator/disruptions/${disruptionId}`),

  /** Recost against availability and prices as they are now. */
  reassess: (disruptionId: string) =>
    apiClient.post<Disruption>(
      `/operator/disruptions/${disruptionId}/reassess`
    ),

  setDisruptionStatus: (disruptionId: string, status: DisruptionStatus) =>
    apiClient.put<Disruption>(`/operator/disruptions/${disruptionId}/status`, {
      status,
    }),

  /** Raise the swap the assessment recommends, on the traveller's behalf. */
  recover: (disruptionId: string, itemId: string) =>
    apiClient.post<ChangeRequest>(
      `/operator/disruptions/${disruptionId}/items/${itemId}/recover`
    ),
};
