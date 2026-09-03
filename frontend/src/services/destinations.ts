// ═══════════════════════════════════════════
// TRIPZYY — Destinations Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { Destination, DestinationSearchParams, PaginatedResponse } from "@/types";

function buildQuery(params?: Record<string, any>): string {
  if (!params) return "";
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (filtered.length === 0) return "";
  return "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

export const destinationService = {
  search: (params?: DestinationSearchParams) =>
    apiClient.get<PaginatedResponse<Destination>>(`/destinations/search${buildQuery(params || {})}`),

  getById: (destinationId: string) =>
    apiClient.get<Destination>(`/destinations/${destinationId}`),

  fromPlace: (payload: {
    name: string;
    country?: string;
    region?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    image_url?: string;
  }) => apiClient.post<Destination>("/destinations/from-place", payload),

  getSaved: () =>
    apiClient.get<{ items: Destination[]; count: number }>("/destinations/saved"),

  save: (destinationId: string) =>
    apiClient.post<{ saved: boolean; destination_id: string }>(`/destinations/${destinationId}/save`),

  unsave: (destinationId: string) =>
    apiClient.delete<{ saved: boolean; destination_id: string }>(`/destinations/${destinationId}/save`),
};
