// ═══════════════════════════════════════════
// TRIPZYY — User Profile & Preferences Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { User, UserPreferences } from "@/types";

export const userService = {
  getProfile: () => apiClient.get<User>("/users/me"),

  updateProfile: (data: Partial<User>) =>
    apiClient.put<User>("/users/me", data),

  getPreferences: () =>
    apiClient.get<UserPreferences>("/users/me/preferences"),

  updatePreferences: (preferences: UserPreferences) =>
    apiClient.put<UserPreferences>("/users/me/preferences", preferences),

  changePassword: (payload: {
    current_password: string;
    new_password: string;
  }) => apiClient.put<null>("/users/me/password", payload),

  deleteAccount: () => apiClient.delete<null>("/users/me"),
};
