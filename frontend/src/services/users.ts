// ═══════════════════════════════════════════
// TRIPZYY — User Profile & Preferences Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { UpdatePreferencesPayload, User, UserPreferences } from "@/types";

export const userService = {
  getProfile: () => apiClient.get<User>("/users/me"),

  updateProfile: (data: Partial<User>) =>
    apiClient.put<User>("/users/me", data),

  getPreferences: () =>
    apiClient.get<UserPreferences>("/users/me/preferences"),

  /**
   * Partial by design: the endpoint uses `exclude_unset`, so omitting a
   * field leaves the stored value alone rather than nulling it.
   */
  updatePreferences: (preferences: UpdatePreferencesPayload) =>
    apiClient.put<UserPreferences>("/users/me/preferences", preferences),

  changePassword: (payload: {
    current_password: string;
    new_password: string;
  }) => apiClient.put<null>("/users/me/password", payload),

  deleteAccount: () => apiClient.delete<null>("/users/me"),
};
