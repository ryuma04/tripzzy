// ═══════════════════════════════════════════
// TRIPZYY — Shared Trip Service
//
// `getTrips` (the public browse feed) was dropped along with the Community
// Trips page. What is left is the share-link pair: read a trip someone
// published, and clone it into your own account.
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { Trip } from "@/types";

export const communityService = {
  getPublicTrip: (shareSlug: string) =>
    apiClient.get<Trip>(`/public/trips/${shareSlug}`, false),

  /**
   * Clone a shared trip into the caller's account.
   *
   * The `{}` body is required, not cosmetic: the endpoint takes a
   * `CloneRequest` (optional title / start_date, for rebasing the copy), and
   * a POST with no body at all fails validation before the handler runs.
   */
  cloneTrip: (shareSlug: string) =>
    apiClient.post<Trip>(`/public/trips/${shareSlug}/clone`, {}),
};
