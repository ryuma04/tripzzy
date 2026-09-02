// ═══════════════════════════════════════════
// TRIPZYY — Bill Split Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  BillSplit,
  CreateBillSplitPayload,
  DirectoryUser,
  PaginatedResponse,
  SplitMemberStatus,
} from "@/types";

export const billSplitService = {
  /** Splits recorded against one trip (trip owner only). */
  listForTrip: (tripId: string) =>
    apiClient.get<BillSplit[]>(`/trips/${tripId}/bill-splits`),

  /** Every split you raised or are a member of, across all trips. */
  listMine: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<BillSplit>>(
      `/bill-splits?page=${params?.page ?? 1}&limit=${params?.limit ?? 20}`
    ),

  get: (splitId: string) => apiClient.get<BillSplit>(`/bill-splits/${splitId}`),

  create: (tripId: string, payload: CreateBillSplitPayload) =>
    apiClient.post<BillSplit>(`/trips/${tripId}/bill-splits`, payload),

  /**
   * Mark one member's share paid or outstanding. The split flips to
   * `settled` on its own once nobody is left owing.
   */
  setMemberStatus: (
    splitId: string,
    memberId: string,
    status: SplitMemberStatus
  ) =>
    apiClient.put<BillSplit>(
      `/bill-splits/${splitId}/members/${memberId}`,
      { status }
    ),

  remove: (splitId: string) => apiClient.delete(`/bill-splits/${splitId}`),
};

export const directoryService = {
  /**
   * Find real Tripzyy users to add to a split.
   *
   * Matches a name prefix, or a complete email address. Returns no contact
   * details -- enough to recognise somebody you know, not enough to walk the
   * user list.
   */
  searchUsers: (query: string, limit = 10) =>
    apiClient.get<DirectoryUser[]>(
      `/users/search?q=${encodeURIComponent(query)}&limit=${limit}`
    ),
};
