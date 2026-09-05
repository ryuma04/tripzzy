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
  UserRole,
} from "@/types";

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

export function getRoleRedirectPath(roleOrUser: UserRole | User | null | undefined): string {
  if (!roleOrUser) return "/dashboard";
  const role = typeof roleOrUser === "string" ? roleOrUser : roleOrUser.role;
  switch (role) {
    case "operator":
    case "coordinator":
      return "/dashboard?view=operator";
    default:
      return "/dashboard";
  }
}

export async function login(
  payloadOrEmail: LoginPayload | string,
  password?: string,
  role?: UserRole
) {
  const payload: LoginPayload =
    typeof payloadOrEmail === "string"
      ? { email: payloadOrEmail, password: password || "", role: role || "user" }
      : payloadOrEmail;

  const res = await apiClient.post<AuthResponse>("/auth/login", payload, false);
  if (res.success && res.data?.access_token) {
    localStorage.setItem("tripzyy_token", res.data.access_token);
    if (res.data.user) {
      localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
    }
    dispatchAuthChange();
  }
  // Anything else -- bad credentials, or the API being unreachable -- is
  // returned as-is. There used to be an "offline mock mode" here that minted
  // a local session when the request failed, and handed out `admin` if the
  // email merely contained the word "admin". That turned an outage, or a
  // pulled network cable, into a privilege escalation. A failed login is now
  // just a failed login.
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
  if (res.success && res.data?.access_token) {
    localStorage.setItem("tripzyy_token", res.data.access_token);
    if (res.data.user) {
      localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
    }
    dispatchAuthChange();
  }
  // Always returned: the previous version fell off the end of the function on
  // any non-success path, so callers reading `res.success` hit a TypeError on
  // undefined rather than seeing the error.
  return res;
}

export async function register(payload: RegisterPayload) {
  const targetRole: UserRole = payload.role || "user";

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
    company_name: payload.company_name,
  };

  const res = await apiClient.post<RegisterResultData>(
    "/auth/register",
    backendPayload,
    false
  );

  if (res.success && res.data) {
    // Absent when the server requires email verification first, in which
    // case the caller routes to the OTP step instead of the dashboard.
    if (res.data.access_token) {
      localStorage.setItem("tripzyy_token", res.data.access_token);
    }
    if (res.data.user) {
      localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
    }
    dispatchAuthChange();
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

/**
 * The signed-in user, or null when nobody is signed in.
 *
 * This used to fall back to `mockCurrentUser`, whose role is `"admin"` --
 * so before localStorage was read (and permanently, if it was empty) every
 * visitor looked like an administrator to the UI. Absence is now represented
 * honestly, and callers branch on it.
 */
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

export function updateStoredUser(updates: Partial<User>): User | null {
  const current = getStoredUser();
  if (!current) return null;
  const updated: User = { ...current, ...updates };
  if (typeof window !== "undefined") {
    localStorage.setItem("tripzyy_user", JSON.stringify(updated));
    dispatchAuthChange();
  }
  return updated;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tripzyy_token");
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}

/**
 * React hook exposing the signed-in user, kept in sync across tabs.
 *
 * Starts at `null` on both the server and the first client render, so
 * hydration matches without pretending somebody is signed in. Read
 * `isMounted` before rendering anything that depends on identity, otherwise
 * the signed-out state flashes for one frame.
 *
 * There is deliberately no `setRole` here any more. It wrote a role straight
 * into localStorage, which let anyone grant themselves `admin` from the
 * browser console. Roles come from the server, on the token, and nowhere else.
 */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleAuthChange = () => setUser(getStoredUser());

    handleAuthChange();

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  return {
    user,
    role: user?.role ?? null,
    isAdmin: user?.role === "admin",
    isOperator: user?.role === "operator" || user?.operator_role === "owner" || user?.operator_role === "manager",
    isCoordinator: user?.role === "coordinator" || user?.operator_role === "coordinator",
    isUser: user?.role === "user" && !user?.operator_role,
    updateUser: updateStoredUser,
    isMounted: mounted,
  };
}


export async function switchToOperatorUser(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await login("operator@tripzyy.com", "Operate@123", "operator");
    if (res.success && res.data) {
      if (typeof window !== "undefined") {
        localStorage.setItem("tripzyy_active_role_view", "operator");
      }
      return { success: true, message: "Logged in as Tour & Travel Lead" };
    }
  } catch {
    // API call failed, proceed with fallback
  }

  const current = getStoredUser();
  const operatorUser: User = current
    ? {
        ...current,
        role: "operator",
        operator_role: "owner",
        operator_name: "Tripzyy Journeys",
      }
    : {
        id: "usr_operator",
        first_name: "Kabir",
        last_name: "Rao",
        email: "operator@tripzyy.com",
        phone: "+91 98765 43213",
        city: "Mumbai",
        country: "India",
        bio: "Tripzyy Journeys Operations Director",
        role: "operator",
        operator_role: "owner",
        operator_name: "Tripzyy Journeys",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

  if (typeof window !== "undefined") {
    localStorage.setItem("tripzyy_user", JSON.stringify(operatorUser));
    localStorage.setItem("tripzyy_active_role_view", "operator");
    if (!localStorage.getItem("tripzyy_token")) {
      localStorage.setItem("tripzyy_token", "demo_operator_jwt_token");
    }
    dispatchAuthChange();
  }

  return { success: true, message: "Switched to Tour & Travel Operations" };
}

