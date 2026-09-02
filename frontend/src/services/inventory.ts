// ═══════════════════════════════════════════
// TRIPZYY — Inventory / Alternatives Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { AlternativesQuery, ComponentAlternative } from "@/types";

function buildQuery(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

export const inventoryService = {
  /**
   * Ranked options that could fill one slot in a trip.
   *
   * Ranked against the caller's stored preferences and filtered by real
   * per-date capacity, so a sold-out option never comes back. Pass
   * `exclude_service_id` to leave out whatever is currently booked — used
   * both for comparing before committing, and for replacing something that
   * has fallen through.
   */
  alternatives: (query: AlternativesQuery) =>
    apiClient.get<{ items: ComponentAlternative[]; count: number }>(
      `/components/alternatives${buildQuery({ ...query })}`
    ),
};
