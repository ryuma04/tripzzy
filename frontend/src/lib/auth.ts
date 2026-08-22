// ═══════════════════════════════════════════
// TRIPZYY — Auth Service
// Login, register, logout, current user
// ═══════════════════════════════════════════

import { apiClient } from "./api";
import type { AuthResponse, LoginPayload, RegisterPayload, User } from "@/types";

export async function login(payloadOrEmail: LoginPayload | string, password?: string) {
  const payload: LoginPayload =
    typeof payloadOrEmail === "string"
      ? { email: payloadOrEmail, password: password || "" }
      : payloadOrEmail;

  const res = await apiClient.post<AuthResponse>("/auth/login", payload, false);
  if (res.success && res.data) {
    localStorage.setItem("tripzyy_token", res.data.access_token);
    localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
  }
  return res;
}

export async function register(payload: RegisterPayload) {
  return apiClient.post<AuthResponse>("/auth/register", payload, false);
}

export async function logout() {
  const res = await apiClient.post("/auth/logout");
  localStorage.removeItem("tripzyy_token");
  localStorage.removeItem("tripzyy_user");
  return res;
}

export async function getCurrentUser() {
  return apiClient.get<User>("/auth/me");
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem("tripzyy_user");
  if (!data) return null;
  try {
    return JSON.parse(data) as User;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tripzyy_token");
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}
