"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { apiClient } from "@/lib/api";
import type { AuthResponse, User } from "@/types";

export function ClerkSync() {
  const { isSignedIn, user, isLoaded } = useUser();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    // Handle Clerk sign-out: clear local Tripzyy session if user signed out of Clerk
    if (!isSignedIn || !user) {
      if (typeof window !== "undefined") {
        const hasStoredToken = localStorage.getItem("tripzyy_token");
        const hasStoredUser = localStorage.getItem("tripzyy_user");
        if (hasStoredToken || hasStoredUser) {
          localStorage.removeItem("tripzyy_token");
          localStorage.removeItem("tripzyy_user");
          window.dispatchEvent(new Event("tripzyy_auth_changed"));
        }
      }
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;

    const storedUserStr =
      typeof window !== "undefined" ? localStorage.getItem("tripzyy_user") : null;
    const storedToken =
      typeof window !== "undefined" ? localStorage.getItem("tripzyy_token") : null;
    const pendingRole =
      typeof window !== "undefined"
        ? localStorage.getItem("tripzyy_pending_role")
        : null;

    let alreadySynced = false;
    if (storedUserStr && storedToken) {
      try {
        const parsed = JSON.parse(storedUserStr) as User;
        if (parsed.email?.toLowerCase() === email.toLowerCase()) {
          // If a new role was chosen that doesn't match current stored role, force re-sync
          if (pendingRole && parsed.role !== pendingRole) {
            alreadySynced = false;
          } else {
            alreadySynced = true;
          }
        }
      } catch {
        alreadySynced = false;
      }
    }

    if (alreadySynced || syncingRef.current) return;

    syncingRef.current = true;
    (async () => {
      try {
        const role =
          pendingRole ||
          (user.publicMetadata?.role as string) ||
          (user.unsafeMetadata?.role as string) ||
          "user";

        const res = await apiClient.post<AuthResponse>(
          "/auth/clerk-sync",
          {
            email,
            first_name: user.firstName || "Traveler",
            last_name: user.lastName || "",
            clerk_id: user.id,
            role,
          },
          false
        );

        if (res.success && res.data?.access_token) {
          localStorage.setItem("tripzyy_token", res.data.access_token);
          if (res.data.user) {
            localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
          }
          if (typeof window !== "undefined") {
            localStorage.removeItem("tripzyy_pending_role");
          }
          window.dispatchEvent(new Event("tripzyy_auth_changed"));
        }
      } catch (err) {
        console.error("Clerk sync failed:", err);
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, user]);

  return null;
}
