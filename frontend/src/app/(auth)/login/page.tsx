"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  Building2,
  Shield,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { SignIn, useUser, useAuth, useClerk } from "@clerk/nextjs";
import { API_BASE_URL } from "@/lib/api";

type OnboardingRole = "user" | "operator" | "admin";

const ROLE_CONFIGS: Record<
  OnboardingRole,
  {
    title: string;
    badge: string;
    subtitle: string;
    color: string;
    icon: React.ElementType;
    bannerNote: string;
  }
> = {
  user: {
    title: "Explorer Station",
    badge: "TRAVELER",
    subtitle: "Personal travel planner & routes",
    color: "#E51919",
    icon: Compass,
    bannerNote:
      "Explorer Gateway: Sign in to view itineraries, split expenses & saved trips.",
  },
  operator: {
    title: "Tour & Travel Mission Control",
    badge: "TOUR & TRAVEL",
    subtitle: "Agency fleet, departures, rosters & client assist",
    color: "#D97706",
    icon: Building2,
    bannerNote:
      "Tour & Travel Command Station: Unified portal for tour operations, fleet logistics, passenger rosters & client support.",
  },
  admin: {
    title: "Station Admin",
    badge: "ADMIN",
    subtitle: "Platform governance & system control",
    color: "#171313",
    icon: Shield,
    bannerNote:
      "Admin Station Gateway: System telemetry, user audits & catalog control.",
  },
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const sessionExpired = searchParams?.get("expired") === "1";
  const isRoleForbidden = searchParams?.get("error") === "role_forbidden";
  const forbiddenParamMessage = searchParams?.get("msg");
  const isSyncMode = searchParams?.get("sync") === "1";
  const targetRoleParam = searchParams?.get("role") as OnboardingRole | null;

  const [role, setRole] = useState<OnboardingRole>(() => {
    if (targetRoleParam && ROLE_CONFIGS[targetRoleParam]) return targetRoleParam;
    return "user";
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(
    () => forbiddenParamMessage || null
  );
  const [isVerifying, setIsVerifying] = useState(false);

  // If redirected with forbidden error while Clerk session was open, terminate Clerk session immediately
  useEffect(() => {
    if (isRoleForbidden && isSignedIn) {
      signOut();
    }
  }, [isRoleForbidden, isSignedIn, signOut]);

  // Read saved role from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && !targetRoleParam) {
      const saved = localStorage.getItem("tripzyy_pending_role") as OnboardingRole | null;
      if (saved && ROLE_CONFIGS[saved]) {
        setRole(saved);
      }
    }
  }, [targetRoleParam]);

  // Tab selection handler
  const handleRoleSelect = (selected: OnboardingRole) => {
    setRole(selected);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      localStorage.setItem("tripzyy_pending_role", selected);
      localStorage.setItem("tripzyy_active_role_view", selected);
    }
  };

  // Verify role with Tripzyy backend before letting user inside the app
  useEffect(() => {
    if (!isSyncMode || !isLoaded || !isSignedIn || !user || isVerifying) return;

    let isCancelled = false;

    const verifyAndSync = async () => {
      setIsVerifying(true);
      setErrorMessage(null);
      const chosenRole = targetRoleParam || role || "user";

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Unable to obtain authentication session token from Clerk.");
        }

        const email = user.primaryEmailAddress?.emailAddress;
        const response = await fetch(`${API_BASE_URL}/auth/clerk-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            first_name: user.firstName || "Traveler",
            last_name: user.lastName || "",
            clerk_id: user.id,
            role: chosenRole,
          }),
        });

        const res = (await response.json()) as {
          success: boolean;
          message?: string;
          data?: { access_token: string; refresh_token: string; user: any };
          error?: { code: string; details?: any };
        };

        if (response.status === 403 || res.error?.code === "FORBIDDEN") {
          // Access restricted: terminate Clerk session and show error directly on login page
          await signOut();
          if (typeof window !== "undefined") {
            localStorage.removeItem("tripzyy_token");
            localStorage.removeItem("tripzyy_user");
            localStorage.removeItem("tripzyy_pending_role");
            localStorage.removeItem("tripzyy_active_role_view");
          }
          setErrorMessage(
            res.message ||
              "Access restricted for this workspace. Please select the correct workspace role."
          );
          setIsVerifying(false);
          router.replace("/login");
          return;
        }

        if (response.ok && res.success && res.data?.access_token) {
          if (typeof window !== "undefined") {
            localStorage.setItem("tripzyy_token", res.data.access_token);
            if (res.data.user) {
              localStorage.setItem("tripzyy_user", JSON.stringify(res.data.user));
              if (
                res.data.user.role === "operator" ||
                res.data.user.role === "coordinator" ||
                res.data.user.operator_role
              ) {
                localStorage.setItem("tripzyy_active_role_view", "operator");
              } else if (res.data.user.role === "admin") {
                localStorage.setItem("tripzyy_active_role_view", "admin");
              } else {
                localStorage.setItem("tripzyy_active_role_view", "user");
              }
            }
            localStorage.removeItem("tripzyy_pending_role");
          }
          window.dispatchEvent(new Event("tripzyy_auth_changed"));
          window.location.href = `/dashboard?view=${chosenRole}`;
          return;
        }

        // Other non-OK response
        await signOut();
        setErrorMessage(res.message || "Failed to authenticate with workspace.");
        setIsVerifying(false);
        router.replace("/login");
      } catch (err: any) {
        if (!isCancelled) {
          await signOut();
          setErrorMessage(err.message || "Authentication verification failed.");
          setIsVerifying(false);
          router.replace("/login");
        }
      }
    };

    verifyAndSync();
    return () => {
      isCancelled = true;
    };
  }, [isSyncMode, isLoaded, isSignedIn, user, targetRoleParam, role, getToken, signOut, router]);

  const currentConfig = ROLE_CONFIGS[role];
  const IconComponent = currentConfig.icon;

  return (
    <NeoCard className="p-5 sm:p-7 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313] max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-5">
        <div
          className="w-14 h-14 border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[3px_3px_0px_#171313] transition-colors"
          style={{ backgroundColor: currentConfig.color }}
        >
          <IconComponent className="w-7 h-7" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FAF7F2] border-2 border-[#171313] rounded-full text-xs font-black uppercase mb-2">
          <Sparkles className="w-3.5 h-3.5" style={{ color: currentConfig.color }} />
          <span>{currentConfig.badge} WORKSPACE</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#171313] tracking-tight">
          Welcome to Tripzyy
        </h1>
        <p className="text-xs sm:text-sm font-medium text-neutral-600 mt-1">
          Sign in to access your {currentConfig.title.toLowerCase()}.
        </p>
      </div>

      {/* Role Access Restricted Alert Banner */}
      {errorMessage && (
        <div className="mb-4 p-4 bg-[#FEF2F2] border-[3px] border-[#DC2626] rounded-xl shadow-[4px_4px_0px_#DC2626] animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="font-display font-extrabold text-xs text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Role Access Restricted
          </p>
          <p className="text-xs font-semibold text-neutral-800 mt-1.5 leading-relaxed">
            {errorMessage}
          </p>
        </div>
      )}

      {sessionExpired && (
        <div className="mb-4 p-3 bg-[#FFF4E6] border-2 border-[#D94B3D] rounded-xl shadow-[2px_2px_0px_#D94B3D]">
          <p className="font-display font-extrabold text-xs text-[#171313]">
            Your session expired
          </p>
          <p className="text-[11px] font-medium text-neutral-700 mt-0.5">
            Sign in again to pick up where you left off.
          </p>
        </div>
      )}

      {/* ─── 3 User Types Selector Tabs ─── */}
      <div className="mb-5">
        <label className="font-display font-extrabold text-[11px] uppercase tracking-wider text-[#171313] block mb-2 px-1">
          Select Target Workspace (3 Roles Available)
        </label>
        <div className="grid grid-cols-3 gap-2.5 p-2 bg-[#FAF7F2] border-[3px] border-[#171313] rounded-2xl shadow-[3px_3px_0px_#171313]">
          {(Object.keys(ROLE_CONFIGS) as OnboardingRole[]).map((r) => {
            const config = ROLE_CONFIGS[r];
            const RoleIcon = config.icon;
            const isSelected = role === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => handleRoleSelect(r)}
                className={`py-3 px-2 rounded-xl font-display text-xs flex flex-col items-center justify-center gap-1.5 border-[2.5px] transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#171313] text-white border-[#171313] shadow-[3px_3px_0px_#E51919] -translate-y-0.5"
                    : "bg-white text-[#171313] border-[#171313]/20 hover:border-[#171313] hover:bg-[#F3ECE2]"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: config.color }}
                >
                  <RoleIcon className="w-4 h-4" />
                </div>
                <span className="font-black tracking-tight text-center leading-tight">
                  {config.badge}
                </span>
                {isSelected && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#E51919]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Role Banner Info */}
      <div
        className="p-3 mb-5 border-2 border-[#171313] rounded-xl flex items-center gap-2.5 text-xs font-bold text-[#171313]"
        style={{ backgroundColor: `${currentConfig.color}15` }}
      >
        <IconComponent
          className="w-5 h-5 flex-shrink-0"
          style={{ color: currentConfig.color }}
        />
        <span>{currentConfig.bannerNote}</span>
      </div>

      {/* Clerk Sign In Component OR Verifying Spinner */}
      {isVerifying ? (
        <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-[#FAF7F2] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
          <div
            className="w-12 h-12 border-4 border-[#171313] border-t-transparent rounded-full animate-spin mb-4"
            style={{ borderTopColor: currentConfig.color }}
          />
          <h3 className="font-display font-extrabold text-base text-[#171313]">
            Verifying Workspace Clearance...
          </h3>
          <p className="text-xs text-neutral-600 mt-1 font-medium max-w-xs">
            Confirming authorization for <strong>{currentConfig.title}</strong>
          </p>
        </div>
      ) : (
        <div className="flex justify-center my-2">
          <SignIn
            key={`${role}-${errorMessage || "normal"}`}
            routing="hash"
            signUpUrl="/register"
            fallbackRedirectUrl={`/login?sync=1&role=${role}`}
            forceRedirectUrl={`/login?sync=1&role=${role}`}
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "w-full shadow-none border-2 border-[#171313] rounded-2xl bg-white",
                headerTitle: "font-display font-extrabold text-[#171313]",
                headerSubtitle: "text-neutral-600 font-medium text-xs",
                formButtonPrimary:
                  "bg-[#E51919] hover:bg-[#c41515] text-white font-bold border-2 border-[#171313] shadow-[2px_2px_0px_#171313] transition-all",
                formFieldInput:
                  "border-2 border-[#171313] rounded-xl font-medium focus:shadow-[2px_2px_0px_#E51919] focus:border-[#E51919]",
                footerActionLink: "text-[#E51919] font-bold hover:underline",
              },
            }}
          />
        </div>
      )}

      {/* Register Link */}
      <div className="text-center text-xs sm:text-sm font-bold text-neutral-700 pt-5 mt-5 border-t-2 border-[#171313]">
        New expedition planner or traveler?{" "}
        <Link
          href="/register"
          className="text-[#E51919] underline underline-offset-4 hover:text-[#B91C1C]"
        >
          Create an Account
        </Link>
      </div>
    </NeoCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="p-8 font-display font-bold text-center">Loading...</div>}
    >
      <LoginContent />
    </Suspense>
  );
}
