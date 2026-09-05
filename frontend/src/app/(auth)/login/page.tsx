"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Compass,
  Building2,
  Shield,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { SignIn } from "@clerk/nextjs";

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
  const searchParams = useSearchParams();
  const sessionExpired = searchParams?.get("expired") === "1";

  const [role, setRole] = useState<OnboardingRole>("user");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tripzyy_pending_role") as OnboardingRole | null;
      if (saved && ROLE_CONFIGS[saved]) {
        setRole(saved);
      }
    }
  }, []);

  const handleRoleSelect = (selected: OnboardingRole) => {
    setRole(selected);
    if (typeof window !== "undefined") {
      localStorage.setItem("tripzyy_pending_role", selected);
      localStorage.setItem("tripzyy_active_role_view", selected);
    }
  };

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

      {/* Clerk Sign In Component */}
      <div className="flex justify-center my-2">
        <SignIn
          routing="hash"
          signUpUrl="/register"
          fallbackRedirectUrl={`/dashboard?view=${role}`}
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
