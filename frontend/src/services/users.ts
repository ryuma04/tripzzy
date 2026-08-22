// ═══════════════════════════════════════════
// TRIPZYY — User Profile & Preferences Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { User, UserPreferences } from "@/types";

export const userService = {
  getProfile: () =>
    apiClient.get<User>("/users/me"),

  updateProfile: (data: Partial<User>) =>
    apiClient.put<User>("/users/me", data),

  updatePreferences: (preferences: UserPreferences) =>
    apiClient.put<UserPreferences>("/users/me/preferences", preferences),

  deleteAccount: () =>
    apiClient.delete<null>("/users/me"),
};
