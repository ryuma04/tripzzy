"use client";

import { useEffect, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { apiClient } from "@/lib/api";
import type { AuthResponse, User } from "@/types";

export function ClerkSync() {
  const { isSignedIn, user, isLoaded } = useUser();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;

    const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("tripzyy_user") : null;
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("tripzyy_token") : null;

    let alreadySynced = false;
    if (storedUserStr && storedToken) {
      try {
        const parsed = JSON.parse(storedUserStr) as User;
        if (parsed.email?.toLowerCase() === email.toLowerCase()) {
          alreadySynced = true;
        }
      } catch {
        alreadySynced = false;
      }
    }

    if (alreadySynced || syncingRef.current) return;

    syncingRef.current = true;
    (async () => {
      try {
        const res = await apiClient.post<AuthResponse>(
          "/auth/clerk-sync",
          {
            email,
            first_name: user.firstName || "Traveler",
            last_name: user.lastName || "",
            clerk_id: user.id,
          },
          false
        );

        if (res.success && res.data?.access_token) {
          localStorage.setItem("tripzyy_token", res.data.access_token);
          if (res.data.user) {
            localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
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
