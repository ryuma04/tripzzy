"use client";

// ═══════════════════════════════════════════
// TRIPZYY — Auth Service
// Login, register, OTP verification, avatar upload, logout, current user & role management
// ═══════════════════════════════════════════

import { useEffect, useState } from "react";
import { apiClient } from "./api";
import type {
  ApiResponse,
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from "@/types";
import { mockCurrentUser } from "@/data/mock";

export interface RegisterResultData {
  user: User;
  verification_required: boolean;
  access_token?: string;
  token_type?: string;
  debug_verification_code?: string;
}

const AUTH_CHANGED_EVENT = "tripzyy_auth_changed";

function dispatchAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export async function login(
  payloadOrEmail: LoginPayload | string,
  password?: string,
  role?: "user" | "admin"
) {
  const payload: LoginPayload =
    typeof payloadOrEmail === "string"
      ? { email: payloadOrEmail, password: password || "", role: role || "user" }
      : payloadOrEmail;

  try {
    const res = await apiClient.post<AuthResponse>("/auth/login", payload, false);
    if (res.success && res.data && res.data.access_token) {
      localStorage.setItem("tripzyy_token", res.data.access_token);
      if (res.data.user) {
        localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
      }
      dispatchAuthChange();
      return res;
    }
    // If the server responded with an error (e.g. 401 Unauthorized), return the real error
    if (!res.success && res.error?.code !== "NETWORK_ERROR") {
      return res;
    }
  } catch (err) {
    // Graceful fallback for offline / mock dev mode
  }
  
  // Local fallback session (only when backend is offline)
  const fallbackRole: "user" | "admin" = payload.role || (payload.email.toLowerCase().includes("admin") ? "admin" : "user");
  const fallbackUser: User = {
    ...mockCurrentUser,
    email: payload.email,
    role: fallbackRole,
    first_name: payload.email.split("@")[0] || "Explorer",
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("tripzyy_token", "mock_jwt_token_" + Date.now());
    localStorage.setItem("tripzyy_user", JSON.stringify(fallbackUser));
    dispatchAuthChange();
  }

  return {
    success: true,
    message: "Signed in in offline mock mode",
    data: {
      access_token: "mock_jwt_token",
      token_type: "bearer",
      user: fallbackUser,
    },
    error: null,
  };
}

export async function requestLoginOtp(email: string) {
  return apiClient.post<{ debug_verification_code?: string }>(
    "/auth/request-login-otp",
    { email },
    false
  );
}

export async function loginWithOtp(email: string, code: string, role?: "user" | "admin") {
  try {
    const res = await apiClient.post<AuthResponse>(
      "/auth/login-otp",
      { email, code },
      false
    );
    if (res.success && res.data && res.data.access_token) {
      localStorage.setItem("tripzyy_token", res.data.access_token);
      if (res.data.user) {
        localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
      }
      dispatchAuthChange();
      return res;
    }
  } catch (err) {
    // Graceful fallback
  }
}

export async function register(payload: RegisterPayload) {
  const targetRole: "user" | "admin" = payload.role || "user";

  const backendPayload = {
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    password: payload.password,
    confirm_password: payload.confirm_password || payload.password,
    phone: payload.phone || "+91 98765 43210",
    city: payload.city || "Mumbai",
    country: payload.country || "India",
    additional_info: payload.additional_info || payload.bio || "",
    role: targetRole,
  };

  try {
    const res = await apiClient.post<RegisterResultData>(
      "/auth/register",
      backendPayload,
      false
    );

    if (res.success && res.data) {
      if (res.data.access_token) {
        localStorage.setItem("tripzyy_token", res.data.access_token);
      }
      if (res.data.user) {
        localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
      }
      dispatchAuthChange();
      return res;
    }
  } catch (err) {
    // Graceful fallback
  }
}

export async function verifyOtp(email: string, code: string) {
  const res = await apiClient.post<AuthResponse>(
    "/auth/verify-otp",
    { email, code },
    false
  );
  if (res.success && res.data && res.data.access_token) {
    localStorage.setItem("tripzyy_token", res.data.access_token);
    if (res.data.user) {
      localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
    }
  }
  return res;
}

export async function resendOtp(email: string) {
  return apiClient.post<{ debug_verification_code?: string }>(
    "/auth/resend-otp",
    { email },
    false
  );
}

export async function logout() {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    // ignore
  } finally {
    localStorage.removeItem("tripzyy_token");
    localStorage.removeItem("tripzyy_user");
  }
}

export async function getCurrentUser() {
  const res = await apiClient.get<User>("/auth/me");
  if (res.success && res.data) {
    localStorage.setItem("tripzyy_user", JSON.stringify(res.data));
  }
  return res;
}

export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiClient.upload<{ avatar_url: string; user: User }>(
    "/users/me/avatar",
    formData
  );
  if (res.success && res.data && res.data.user) {
    localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
  }
  return res;
}

export function getStoredUser(): User {
  if (typeof window === "undefined") return mockCurrentUser;
  const data = localStorage.getItem("tripzyy_user");
  if (!data) return mockCurrentUser;
  try {
    return JSON.parse(data) as User;
  } catch {
    return mockCurrentUser;
  }
}

export function updateStoredUser(updates: Partial<User>): User {
  const current = getStoredUser();
  const updated: User = { ...current, ...updates };
  if (typeof window !== "undefined") {
    localStorage.setItem("tripzyy_user", JSON.stringify(updated));
    dispatchAuthChange();
  }
  return updated;
}

export function setStoredUserRole(role: "user" | "admin"): User {
  return updateStoredUser({ role });
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tripzyy_token");
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}

/**
 * React hook to listen to real-time auth and role changes
 */
export function useAuthUser() {
  // Initialize with mockCurrentUser to ensure server and client match during hydration
  const [user, setUser] = useState<User>(mockCurrentUser);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleAuthChange = () => {
      setUser(getStoredUser());
    };

    // Sync real data on mount
    setUser(getStoredUser());

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  return {
    user,
    role: user.role,
    isAdmin: user.role === "admin",
    isUser: user.role === "user",
    setRole: setStoredUserRole,
    updateUser: updateStoredUser,
    isMounted: mounted,
  };
}
