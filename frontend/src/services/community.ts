// ═══════════════════════════════════════════
// TRIPZYY — Community Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { CommunityTrip, PaginatedResponse, Trip } from "@/types";

export const communityService = {
  getTrips: (page = 1, limit = 20) =>
    apiClient.get<PaginatedResponse<CommunityTrip>>(`/community/trips?page=${page}&limit=${limit}`, false),

  getPublicTrip: (shareSlug: string) =>
    apiClient.get<Trip>(`/public/trips/${shareSlug}`, false),

  cloneTrip: (shareSlug: string) =>
    apiClient.post<Trip>(`/public/trips/${shareSlug}/clone`),
};
