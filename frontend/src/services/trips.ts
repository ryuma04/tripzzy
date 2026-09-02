// ═══════════════════════════════════════════
// TRIPZYY — Trip Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import { DEMO_MODE, noteDemoFallback } from "@/lib/demo-mode";
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

  generateOptions: async (payload: {
    destination_ids: string[];
    start_date: string;
    end_date: string;
    budget_tier: string;
    travel_style: string;
    traveller_count: number;
    destination_names?: string[];
  }): Promise<{ success: boolean; data?: any; message?: string }> => {
    // Note: apiClient never throws -- transport failures come back as an
    // error envelope with code NETWORK_ERROR. The try/catch that used to wrap
    // this was dead code, and the fallback below ran on *any* unexpected
    // shape, which is how a failing backend still produced a convincing
    // two-plan result.
    const res = await apiClient.post<any>("/trips/generate-options", {
      destination_ids: payload.destination_ids,
      start_date: payload.start_date,
      end_date: payload.end_date,
      budget_tier: payload.budget_tier,
      travel_style: payload.travel_style,
      traveller_count: payload.traveller_count,
    });
    if (res.success && res.data?.budget_plan && res.data?.premium_plan) {
      return res;
    }

    if (!DEMO_MODE) {
      return {
        success: false,
        message:
          res.message || "The AI planner is unavailable. Please try again.",
      };
    }

    noteDemoFallback("AI plan generation", res.message);
    const { getDemoAIPlans } = await import("@/lib/demo-data");
    const demoPlans = getDemoAIPlans(
      payload.destination_names || ["Goa"],
      payload.start_date,
      payload.end_date,
      payload.traveller_count,
      payload.budget_tier === "Luxury" ? 60000 : 35000
    );
    return {
      success: true,
      data: demoPlans,
      message: "Generated 2 tailored travel plans (demo mode)",
    };
  },

  selectPlan: async (payload: {
    selected_plan: any;
    destination_ids: string[];
    start_date?: string;
    end_date?: string;
    traveller_count?: number;
  }) => {
    const res = await apiClient.post<Trip>("/trips/select-plan", payload);
    if (res.success && res.data) {
      return res;
    }

    // Outside demo mode this must surface as a failure. The fallback below
    // builds a trip object in memory and reports "created successfully",
    // but nothing is written to the database -- the traveller is told their
    // itinerary was saved and finds it gone on the next page load.
    if (!DEMO_MODE) {
      return {
        success: false,
        message: res.message || "Could not save the selected plan.",
        data: null,
        error: res.error,
      };
    }

    noteDemoFallback("select-plan (nothing was persisted)", res.message);
    const plan = payload.selected_plan;
    const fallbackTrip: Trip = {
      id: `trip_ai_${Date.now()}`,
      user_id: "usr_yash",
      title: plan.title || "Custom Expedition",
      description: `AI Preference: ${plan.plan_type === "BUDGET" ? "Best Value" : "Premium Experience"} | ${plan.description || ""}`,
      start_date: payload.start_date || "2026-10-12",
      end_date: payload.end_date || "2026-10-18",
      budget: plan.total_cost || 30000,
      traveller_count: payload.traveller_count || 2,
      status: "upcoming",
      is_shared: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stops: (plan.stops || []).map((s: any, idx: number) => ({
        id: `stop_${idx}_${Date.now()}`,
        trip_id: `trip_ai_${Date.now()}`,
        city_name: s.destination_name || "Destination",
        arrival_date: s.arrival_date || payload.start_date || "2026-10-12",
        departure_date: s.departure_date || payload.end_date || "2026-10-18",
        order: idx + 1,
        activities: (s.activities || []).map((a: any, aIdx: number) => ({
          id: `act_${aIdx}_${Date.now()}`,
          stop_id: `stop_${idx}_${Date.now()}`,
          title: a.title,
          date: a.date || payload.start_date || "2026-10-12",
          start_time: a.start_time || "10:00",
          end_time: a.end_time || "13:00",
          estimated_cost: a.estimated_cost || 500,
          order: aIdx + 1,
          notes: a.notes,
        })),
      })),
    };
    return {
      success: true,
      data: fallbackTrip,
      message: "AI Itinerary created successfully",
    };
  },

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
