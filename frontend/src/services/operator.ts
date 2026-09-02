// ═══════════════════════════════════════════
// TRIPZYY — Operator Console Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  BookingStatus,
  CreateTourGroupPayload,
  OperatorBookingRow,
  OperatorCoordinator,
  OperatorCustomer,
  OperatorDashboard,
  OperatorPaymentsPage,
  OperatorProfile,
  OperatorSchedule,
  OperatorVendor,
  OperatorVendorService,
  PaginatedResponse,
  TourGroup,
  TourGroupStatus,
} from "@/types";

function page(params?: { page?: number; limit?: number }) {
  return new URLSearchParams({
    page: String(params?.page ?? 1),
    limit: String(params?.limit ?? 20),
  });
}

/**
 * Every call here is scoped server-side to the caller's own operator,
 * resolved from their membership. Note that no method takes an `operator_id`
 * — there is deliberately no parameter a caller could change to reach
 * another operator's customers, vendors or money.
 */
export const operatorService = {
  profile: () => apiClient.get<OperatorProfile>("/operator/me"),

  dashboard: () => apiClient.get<OperatorDashboard>("/operator/dashboard"),

  customers: (params?: { page?: number; limit?: number; q?: string }) => {
    const q = page(params);
    if (params?.q) q.set("q", params.q);
    return apiClient.get<PaginatedResponse<OperatorCustomer>>(
      `/operator/customers?${q}`
    );
  },

  bookings: (params?: {
    page?: number;
    limit?: number;
    status?: BookingStatus;
    q?: string;
  }) => {
    const q = page(params);
    if (params?.status) q.set("status", params.status);
    if (params?.q) q.set("q", params.q);
    return apiClient.get<PaginatedResponse<OperatorBookingRow>>(
      `/operator/bookings?${q}`
    );
  },

  /** What has to actually happen, day by day. */
  schedule: (params?: { start?: string; days?: number }) => {
    const q = new URLSearchParams({ days: String(params?.days ?? 14) });
    if (params?.start) q.set("start", params.start);
    return apiClient.get<OperatorSchedule>(`/operator/schedule?${q}`);
  },

  vendors: (params?: { page?: number; limit?: number; q?: string }) => {
    const q = page(params);
    if (params?.q) q.set("q", params.q);
    return apiClient.get<PaginatedResponse<OperatorVendor>>(
      `/operator/vendors?${q}`
    );
  },

  vendorServices: (vendorId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<OperatorVendorService>>(
      `/operator/vendors/${vendorId}/services?${page(params)}`
    ),

  coordinators: () =>
    apiClient.get<OperatorCoordinator[]>("/operator/coordinators"),

  tourGroups: (params?: {
    page?: number;
    limit?: number;
    status?: TourGroupStatus;
  }) => {
    const q = page(params);
    if (params?.status) q.set("status", params.status);
    return apiClient.get<PaginatedResponse<TourGroup>>(
      `/operator/tour-groups?${q}`
    );
  },

  createTourGroup: (payload: CreateTourGroupPayload) =>
    apiClient.post<TourGroup>("/operator/tour-groups", payload),

  /** Pass `null` to hand the departure back to the pool. */
  assignCoordinator: (groupId: string, coordinatorId: string | null) =>
    apiClient.put<TourGroup>(`/operator/tour-groups/${groupId}/coordinator`, {
      coordinator_id: coordinatorId,
    }),

  setGroupStatus: (groupId: string, status: TourGroupStatus) =>
    apiClient.put<TourGroup>(`/operator/tour-groups/${groupId}/status`, {
      status,
    }),

  addBookingToGroup: (groupId: string, bookingId: string, seats = 1) =>
    apiClient.post<TourGroup>(`/operator/tour-groups/${groupId}/members`, {
      booking_id: bookingId,
      seats,
    }),

  removeFromGroup: (groupId: string, memberId: string) =>
    apiClient.delete<TourGroup>(
      `/operator/tour-groups/${groupId}/members/${memberId}`
    ),

  payments: (params?: { page?: number; limit?: number }) =>
    apiClient.get<OperatorPaymentsPage>(`/operator/payments?${page(params)}`),
};
