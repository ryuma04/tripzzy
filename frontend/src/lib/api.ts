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
