// ═══════════════════════════════════════════
// TRIPZYY — Notification Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { Pagination, TripzyyNotification } from "@/types";

export interface NotificationPage {
  items: TripzyyNotification[];
  pagination: Pagination;
  unread_count: number;
}

export const notificationService = {
  /**
   * Notifications addressed to the signed-in user.
   *
   * These are real rows now. The previous implementation kept them in
   * `localStorage`, so they were per-browser and per-person: the only one who
   * ever saw a "you were added to a bill split" message was the person who
   * created the split.
   */
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) =>
    apiClient.get<NotificationPage>(
      `/notifications?page=${params?.page ?? 1}&limit=${params?.limit ?? 20}` +
        (params?.unreadOnly ? "&unread_only=true" : "")
    ),

  markRead: (notificationId: string) =>
    apiClient.put<TripzyyNotification>(`/notifications/${notificationId}/read`),

  markAllRead: () => apiClient.put<{ updated: number }>("/notifications/read-all"),
};
