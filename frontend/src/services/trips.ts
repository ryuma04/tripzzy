// ═══════════════════════════════════════════
// TRIPZYY — Trip Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  Trip,
  CreateTripPayload,
  UpdateTripPayload,
  TripStop,
  CreateStopPayload,
  ItineraryActivity,
  CreateActivityPayload,
  BudgetSummary,
  CalendarResponse,
  Expense,
  CreateExpensePayload,
  Transport,
  CreateTransportPayload,
  Accommodation,
  CreateAccommodationPayload,
  PaginatedResponse,
  TripSearchParams,
} from "@/types";

function buildQuery(params?: Record<string, any>): string {
  if (!params) return "";
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (filtered.length === 0) return "";
  return (
    "?" +
    filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
  );
}

// ─── Trips ──────────────────────────────

export const tripService = {
  list: (params?: TripSearchParams) =>
    apiClient.get<PaginatedResponse<Trip> | Trip[]>(
      `/trips${buildQuery(params || {})}`
    ),

  get: (tripId: string) => apiClient.get<Trip>(`/trips/${tripId}`),

  create: (payload: CreateTripPayload) =>
    apiClient.post<Trip>("/trips", payload),

  generate: (payload: {
    destination_ids: string[];
    start_date: string;
    end_date: string;
    budget_tier: string;
    travel_style: string;
    traveller_count: number;
  }) => apiClient.post<Trip>("/trips/generate", payload),

  update: (tripId: string, payload: UpdateTripPayload) =>
    apiClient.put<Trip>(`/trips/${tripId}`, payload),

  delete: (tripId: string) => apiClient.delete(`/trips/${tripId}`),

  // ─── Stops ──────────────────────────────

  getStops: (tripId: string) =>
    apiClient.get<TripStop[]>(`/trips/${tripId}/stops`),

  createStop: (tripId: string, payload: CreateStopPayload) =>
    apiClient.post<TripStop>(`/trips/${tripId}/stops`, {
      destination_id: payload.destination_id,
      arrival_date: payload.arrival_date,
      departure_date: payload.departure_date,
      order_index: payload.order ?? 0,
    }),

  deleteStop: (stopId: string) => apiClient.delete(`/stops/${stopId}`),

  reorderStops: (tripId: string, orderedIds: string[]) =>
    apiClient.put(`/trips/${tripId}/stops/reorder`, {
      ordered_ids: orderedIds,
    }),

  // ─── Itinerary Activities ────────────────

  getItinerary: (tripId: string) =>
    apiClient.get<ItineraryActivity[]>(`/trips/${tripId}/itinerary`),

  addActivity: (stopId: string, payload: CreateActivityPayload) =>
    apiClient.post<ItineraryActivity>(`/stops/${stopId}/activities`, {
      activity_id: payload.activity_id || undefined,
      title: payload.title,
      activity_date: payload.date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      estimated_cost: payload.estimated_cost,
      order_index: payload.order ?? 0,
      notes: payload.notes || undefined,
    }),

  updateActivity: (
    activityId: string,
    payload: Partial<CreateActivityPayload>
  ) =>
    apiClient.put<ItineraryActivity>(`/itinerary-activities/${activityId}`, {
      title: payload.title,
      activity_date: payload.date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      estimated_cost: payload.estimated_cost,
      notes: payload.notes,
    }),

  deleteActivity: (activityId: string) =>
    apiClient.delete(`/itinerary-activities/${activityId}`),

  reorderActivities: (stopId: string, orderedIds: string[]) =>
    apiClient.put(`/stops/${stopId}/activities/reorder`, {
      ordered_ids: orderedIds,
    }),

  // ─── Accommodations ─────────────────────

  getAccommodations: (stopId: string) =>
    apiClient.get<Accommodation[]>(`/stops/${stopId}/accommodations`),

  createAccommodation: (stopId: string, payload: CreateAccommodationPayload) =>
    apiClient.post<Accommodation>(`/stops/${stopId}/accommodations`, payload),

  deleteAccommodation: (accommodationId: string) =>
    apiClient.delete(`/accommodations/${accommodationId}`),

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
    apiClient.post<Expense>(`/trips/${tripId}/expenses`, {
      title: payload.title,
      amount: payload.amount,
      category: payload.category,
      date: payload.date,
      notes: payload.notes || undefined,
    }),

  updateExpense: (expenseId: string, payload: Partial<CreateExpensePayload>) =>
    apiClient.put<Expense>(`/expenses/${expenseId}`, payload),

  deleteExpense: (expenseId: string) =>
    apiClient.delete(`/expenses/${expenseId}`),

  // ─── Transport ──────────────────────────

  getTransport: (tripId: string) =>
    apiClient.get<Transport[]>(`/trips/${tripId}/transport`),

  createTransport: (tripId: string, payload: CreateTransportPayload) =>
    apiClient.post<Transport>(`/trips/${tripId}/transport`, payload),

  updateTransport: (
    transportId: string,
    payload: Partial<CreateTransportPayload>
  ) => apiClient.put<Transport>(`/transport/${transportId}`, payload),

  deleteTransport: (transportId: string) =>
    apiClient.delete(`/transport/${transportId}`),

  // ─── Sharing ────────────────────────────

  share: (tripId: string) =>
    apiClient.post<{ share_slug: string; share_url?: string }>(
      `/trips/${tripId}/share`
    ),

  unshare: (tripId: string) => apiClient.delete(`/trips/${tripId}/share`),
};
