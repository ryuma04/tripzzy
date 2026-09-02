// ═══════════════════════════════════════════
// TRIPZYY — Admin Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  ActivityAnalytics,
  AdminDashboard,
  DestinationAnalytics,
  PaginatedResponse,
  Trip,
  TripAnalytics,
  User,
} from "@/types";

export const adminService = {
  getDashboard: () => apiClient.get<AdminDashboard>("/admin/dashboard"),

  getUsers: (params?: {
    page?: number;
    limit?: number;
    q?: string;
    role?: "user" | "admin";
    status?: "active" | "suspended" | "deleted";
  }) => {
    const query = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 20),
    });
    if (params?.q) query.set("q", params.q);
    if (params?.role) query.set("role", params.role);
    if (params?.status) query.set("status", params.status);
    return apiClient.get<PaginatedResponse<User>>(`/admin/users?${query}`);
  },

  getUser: (userId: string) => apiClient.get<User>(`/admin/users/${userId}`),

  /**
   * Suspend or reactivate an account.
   *
   * Status only — the endpoint deliberately has no role field, so an admin
   * cannot mint another admin through it.
   */
  setUserStatus: (userId: string, status: "active" | "suspended" | "deleted") =>
    apiClient.put<User>(`/admin/users/${userId}/status`, { status }),

  getTrips: (params?: { page?: number; limit?: number; q?: string }) => {
    const query = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 20),
    });
    if (params?.q) query.set("q", params.q);
    return apiClient.get<PaginatedResponse<Trip>>(`/admin/trips?${query}`);
  },

  getTripAnalytics: (months = 12) =>
    apiClient.get<TripAnalytics>(`/admin/analytics/trips?months=${months}`),

  getDestinationAnalytics: (limit = 20) =>
    apiClient.get<DestinationAnalytics>(
      `/admin/analytics/destinations?limit=${limit}`
    ),

  getActivityAnalytics: (limit = 20) =>
    apiClient.get<ActivityAnalytics>(
      `/admin/analytics/activities?limit=${limit}`
    ),
};
