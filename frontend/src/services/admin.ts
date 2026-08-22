// ═══════════════════════════════════════════
// TRIPZYY — Admin Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { AdminDashboard, User } from "@/types";

export const adminService = {
  getDashboard: () =>
    apiClient.get<AdminDashboard>("/admin/dashboard"),

  getUsers: (page = 1, limit = 20) =>
    apiClient.get<{ items: User[]; total: number }>(`/admin/users?page=${page}&limit=${limit}`),

  getUser: (userId: string) =>
    apiClient.get<User>(`/admin/users/${userId}`),

  updateUserStatus: (userId: string, status: { is_active?: boolean; role?: "user" | "admin" }) =>
    apiClient.put<User>(`/admin/users/${userId}/status`, status),

  getTripAnalytics: () =>
    apiClient.get<{ trends: { month: string; count: number }[] }>("/admin/analytics/trips"),

  getDestinationAnalytics: () =>
    apiClient.get<{ destinations: { name: string; trips: number }[] }>("/admin/analytics/destinations"),

  getActivityAnalytics: () =>
    apiClient.get<{ categories: { category: string; count: number }[] }>("/admin/analytics/activities"),
};
