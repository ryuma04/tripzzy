// ═══════════════════════════════════════════
// TRIPZYY — API Client
// Base HTTP client with JWT handling
// ═══════════════════════════════════════════

import type { ApiResponse } from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("tripzyy_token");
  }

  private getHeaders(includeAuth: boolean = true): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (includeAuth) {
      const token = this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  /**
   * A 401 on a request we *sent a token with* means the session is gone --
   * expired, or revoked by a logout elsewhere. Left alone it surfaced as a
   * bare "Invalid or expired token" toast with no way forward, and the dead
   * token stayed in localStorage so every later call failed the same way.
   *
   * Auth endpoints are excluded: a 401 from /auth/login is a wrong password,
   * not an expired session, and bouncing to the login page would wipe the
   * error the user needs to read.
   */
  private handleExpiredSession(endpoint: string, response: Response): void {
    if (response.status !== 401) return;
    if (typeof window === "undefined") return;
    if (endpoint.startsWith("/auth/")) return;
    if (!this.getToken()) return;

    try {
      localStorage.removeItem("tripzyy_token");
      localStorage.removeItem("tripzyy_user");
    } catch {
      // A blocked localStorage must not stop the redirect below.
    }

    // Already on the login screen: nothing to navigate to.
    if (window.location.pathname.startsWith("/login")) return;
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    // A hard navigation, not router.push: the session is dead, and a full
    // reload is what guarantees every component holding state derived from
    // the old session is torn down. This also matches how logout already
    // leaves the app (see sidebar.tsx). The client is a plain class outside
    // React, so it has no router to push with in any case.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?expired=1&next=${next}`;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const data = await response.json();
      if (!response.ok && !data.error) {
        return {
          success: false,
          message: data.message || `Request failed with status ${response.status}`,
          data: null,
          error: {
            code: `HTTP_${response.status}`,
            details: {},
          },
        };
      }
      return data;
    } catch {
      return {
        success: response.ok,
        message: response.ok ? "Success" : `Request failed (${response.statusText})`,
        data: null,
        error: response.ok
          ? null
          : { code: `HTTP_${response.status}`, details: {} },
      };
    }
  }

  async get<T>(
    endpoint: string,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "GET",
        headers: this.getHeaders(requireAuth),
      });
      this.handleExpiredSession(endpoint, response);
      return this.handleResponse<T>(response);
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Network connection error",
        data: null,
        error: { code: "NETWORK_ERROR", details: {} },
      };
    }
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(requireAuth),
        body: body ? JSON.stringify(body) : undefined,
      });
      this.handleExpiredSession(endpoint, response);
      return this.handleResponse<T>(response);
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Network connection error",
        data: null,
        error: { code: "NETWORK_ERROR", details: {} },
      };
    }
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "PUT",
        headers: this.getHeaders(requireAuth),
        body: body ? JSON.stringify(body) : undefined,
      });
      this.handleExpiredSession(endpoint, response);
      return this.handleResponse<T>(response);
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Network connection error",
        data: null,
        error: { code: "NETWORK_ERROR", details: {} },
      };
    }
  }

  async delete<T>(
    endpoint: string,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "DELETE",
        headers: this.getHeaders(requireAuth),
      });
      this.handleExpiredSession(endpoint, response);
      return this.handleResponse<T>(response);
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Network connection error",
        data: null,
        error: { code: "NETWORK_ERROR", details: {} },
      };
    }
  }

  async upload<T>(
    endpoint: string,
    formData: FormData,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {};
      if (requireAuth) {
        const token = this.getToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: formData,
      });
      this.handleExpiredSession(endpoint, response);
      return this.handleResponse<T>(response);
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Network connection error",
        data: null,
        error: { code: "NETWORK_ERROR", details: {} },
      };
    }
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

/**
 * Pulls the list out of a response that may be either a bare array or the
 * paginated `{ items, pagination }` envelope.
 *
 * Both shapes are in use: list endpoints paginate, while a few return a plain
 * array. Callers were each re-deriving this with an inline `Array.isArray`
 * ternary and an `as any`, so the handling is centralised here instead.
 */
export function unwrapItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return (data as any).items as T[];
  }
  return [];
}
