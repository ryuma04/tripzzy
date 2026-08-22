// ═══════════════════════════════════════════
// TRIPZYY — Auth Service
// Login, register, OTP verification, avatar upload & current user
// ═══════════════════════════════════════════

import { apiClient } from "./api";
import type {
  ApiResponse,
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from "@/types";

export interface RegisterResultData {
  user: User;
  verification_required: boolean;
  access_token?: string;
  token_type?: string;
  debug_verification_code?: string;
}

export async function login(
  payloadOrEmail: LoginPayload | string,
  password?: string
) {
  const payload: LoginPayload =
    typeof payloadOrEmail === "string"
      ? { email: payloadOrEmail, password: password || "" }
      : payloadOrEmail;

  const res = await apiClient.post<AuthResponse>("/auth/login", payload, false);
  if (res.success && res.data && res.data.access_token) {
    localStorage.setItem("tripzyy_token", res.data.access_token);
    if (res.data.user) {
      localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
    }
  }
  return res;
}

export async function requestLoginOtp(email: string) {
  return apiClient.post<{ debug_verification_code?: string }>(
    "/auth/request-login-otp",
    { email },
    false
  );
}

export async function loginWithOtp(email: string, code: string) {
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
  }
  return res;
}

export async function register(payload: RegisterPayload) {
  const backendPayload = {
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    password: payload.password,
    confirm_password: payload.confirm_password || payload.password,
    phone: payload.phone || "9999999999",
    city: payload.city || "Mumbai",
    country: payload.country || "India",
    additional_info: payload.additional_info || payload.bio || "",
  };

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
  }
  return res;
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
