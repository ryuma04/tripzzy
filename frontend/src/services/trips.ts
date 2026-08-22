// ═══════════════════════════════════════════
// TRIPZYY — Trip Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  Trip, CreateTripPayload, UpdateTripPayload, TripStop, CreateStopPayload,
  ItineraryActivity, CreateActivityPayload, BudgetSummary, CalendarResponse,
  Expense, CreateExpensePayload, Transport, CreateTransportPayload,
  PaginatedResponse, TripSearchParams,
} from "@/types";

function buildQuery(params?: Record<string, any>): string {
  if (!params) return "";
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (filtered.length === 0) return "";
  return "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

// ─── Trips ──────────────────────────────

export const tripService = {
  list: (params?: TripSearchParams) =>
    apiClient.get<PaginatedResponse<Trip>>(`/trips${buildQuery(params || {})}`),

  get: (tripId: string) =>
    apiClient.get<Trip>(`/trips/${tripId}`),

  create: (payload: CreateTripPayload) =>
    apiClient.post<Trip>("/trips", payload),

  update: (tripId: string, payload: UpdateTripPayload) =>
    apiClient.put<Trip>(`/trips/${tripId}`, payload),

  delete: (tripId: string) =>
    apiClient.delete(`/trips/${tripId}`),

  // ─── Stops ──────────────────────────────

  getStops: (tripId: string) =>
    apiClient.get<TripStop[]>(`/trips/${tripId}/stops`),

  createStop: (tripId: string, payload: CreateStopPayload) =>
    apiClient.post<TripStop>(`/trips/${tripId}/stops`, payload),

  reorderStops: (tripId: string, order: string[]) =>
    apiClient.put(`/trips/${tripId}/stops/reorder`, { order }),

  // ─── Itinerary ──────────────────────────

  getItinerary: (tripId: string) =>
    apiClient.get<ItineraryActivity[]>(`/trips/${tripId}/itinerary`),

  // ─── Calendar ───────────────────────────

  getCalendar: (tripId: string) =>
    apiClient.get<CalendarResponse>(`/trips/${tripId}/calendar`),

  // ─── Budget ─────────────────────────────

  getBudget: (tripId: string) =>
    apiClient.get<BudgetSummary>(`/trips/${tripId}/budget`),

  // ─── Expenses ───────────────────────────

  getExpenses: (tripId: string) =>
    apiClient.get<Expense[]>(`/trips/${tripId}/expenses`),

  createExpense: (tripId: string, payload: CreateExpensePayload) =>
    apiClient.post<Expense>(`/trips/${tripId}/expenses`, payload),

  updateExpense: (expenseId: string, payload: Partial<CreateExpensePayload>) =>
    apiClient.put<Expense>(`/expenses/${expenseId}`, payload),

  deleteExpense: (expenseId: string) =>
    apiClient.delete(`/expenses/${expenseId}`),

  // ─── Transport ──────────────────────────

  getTransport: (tripId: string) =>
    apiClient.get<Transport[]>(`/trips/${tripId}/transport`),

  createTransport: (tripId: string, payload: CreateTransportPayload) =>
    apiClient.post<Transport>(`/trips/${tripId}/transport`, payload),

  updateTransport: (transportId: string, payload: Partial<CreateTransportPayload>) =>
    apiClient.put<Transport>(`/transport/${transportId}`, payload),

  deleteTransport: (transportId: string) =>
    apiClient.delete(`/transport/${transportId}`),

  // ─── Sharing ────────────────────────────

  share: (tripId: string) =>
    apiClient.post<{ share_slug: string }>(`/trips/${tripId}/share`),

  unshare: (tripId: string) =>
    apiClient.delete(`/trips/${tripId}/share`),
};
