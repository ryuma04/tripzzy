// ═══════════════════════════════════════════
// TRIPZYY — Activities Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { Activity, ActivitySearchParams, PaginatedResponse } from "@/types";

function buildQuery(params?: Record<string, any>): string {
  if (!params) return "";
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (filtered.length === 0) return "";
  return "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

export const activityService = {
  search: (params?: ActivitySearchParams) =>
    apiClient.get<PaginatedResponse<Activity>>(`/activities/search${buildQuery(params || {})}`),

  getById: (activityId: string) =>
    apiClient.get<Activity>(`/activities/${activityId}`),
};
