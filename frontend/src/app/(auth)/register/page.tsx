"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  Upload,
  Sparkles,
  ShieldCheck,
  Check,
  Shield,
  Compass,
  Building2,
  Users,
  Briefcase,
  KeyRound,
  Zap,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoInput } from "@/components/ui/neo-input";
import { NeoButton } from "@/components/ui/neo-button";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { register, login, getRoleRedirectPath } from "@/lib/auth";
import type { UserRole } from "@/types";

type OnboardingRole = "user" | "coordinator" | "operator" | "admin";

const ROLE_CONFIGS: Record<
  OnboardingRole,
  {
    title: string;
    badge: string;
    subtitle: string;
    description: string;
    color: string;
    icon: React.ElementType;
    bannerNote: string;
  }
> = {
  user: {
    title: "Explorer Profile",
    badge: "TRAVELER",
    subtitle: "Plan itineraries & discover destinations",
    description: "Create your personal travel station to build multi-city routes, split expenses, and explore AI itineraries.",
    color: "#E51919",
    icon: Compass,
    bannerNote: "Explorer Gateway: Build personalized trips, book curated activities & split bills.",
  },
  coordinator: {
    title: "Field Coordinator",
    badge: "COORDINATOR",
    subtitle: "Lead tour groups & assist travelers",
    description: "Manage assigned departures, review client change requests, and answer traveler queries in real-time.",
    color: "#7C3AED",
    icon: Users,
    bannerNote: "Coordinator Flight Deck: Direct access to client assist queues, change requests & passenger rosters.",
  },
  operator: {
    title: "Tour Operator",
    badge: "OPERATOR",
    subtitle: "Manage fleet, departures & revenues",
    description: "Full tour agency portal to organize multi-day group tours, vendor contracts, disruption radar & payments.",
    color: "#D97706",
    icon: Building2,
    bannerNote: "Tour Operator Mission Control: Agency-wide operations, departures, vendor services & logistics.",
  },
  admin: {
    title: "Station Admin",
    badge: "ADMIN",
    subtitle: "System governance & catalog control",
    description: "Platform command center for user audits, destination catalog curation, and infrastructure health.",
    color: "#171313",
    icon: Shield,
    bannerNote: "Admin Station Gateway: Enter Station Administrator credentials for instant access.",
  },
};

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [role, setRole] = useState<OnboardingRole>("user");
  const [step, setStep] = useState<"details" | "otp">("details");

  // User details state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    bio: "",
    companyName: "Tripzyy Journeys",
    travelPreferences: "Backpacking, Coastal Road Trips, Mountain Trekking",
  });
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Admin credentials state (only Admin ID & Password)
  const [adminData, setAdminData] = useState({
    adminId: "admin@tripzyy.com",
    adminPassword: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarPreview(URL.createObjectURL(file));
      showToast("Profile photo selected.", "info");
    }
  };

  // Validation
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!formData.email.trim() || !formData.email.includes("@")) {
      newErrors.email = "Valid email address is required.";
    }
    if (!formData.password || formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }
    if ((role === "coordinator" || role === "operator") && !formData.companyName.trim()) {
      newErrors.companyName = "Organization / Company name is required.";
    }
    return newErrors;
  };

  const handleProceedToOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setStep("otp");
      setCountdown(60);
      showToast(`Verification token dispatched to ${formData.email}`, "info");

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 600);
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setErrors({ otp: "Please enter the complete 6-digit OTP code." });
      return;
    }

    setIsLoading(true);
    try {
      const targetRole: UserRole = role === "admin" ? "user" : role;
      const res = await register({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone || "+919876543210",
        password: formData.password,
        role: targetRole,
        company_name: role !== "user" ? formData.companyName : undefined,
        city: "Mumbai",
        country: "India",
        bio: formData.bio,
        travel_preferences: formData.travelPreferences
          .split(",")
          .map((s) => s.trim()),
        avatar_url: avatarPreview || undefined,
      });

      showToast(
        `${ROLE_CONFIGS[role].badge} account created! Welcome to Tripzyy.`,
        "success"
      );

      const redirectPath = getRoleRedirectPath(targetRole);
      router.push(redirectPath);
    } catch (err: any) {
      showToast(
        err.message || "Failed to create account. Please try again.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Admin direct login
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};
    if (!adminData.adminId.trim())
      newErrors.adminId = "Admin ID or Email is required.";
    if (!adminData.adminPassword || adminData.adminPassword.length < 4) {
      newErrors.adminPassword = "Password must be at least 4 characters.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      const res = await login(adminData.adminId, adminData.adminPassword, "admin");
      if (res.success) {
        showToast("Admin credentials verified! Entering Admin Panel...", "success");
        router.push("/admin");
      } else {
        showToast(res.message || "Invalid admin credentials.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to access admin panel.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Demo Login
  const handleQuickDemoLogin = async (
    demoEmail: string,
    demoPass: string,
    demoRole: UserRole,
    destPath: string
  ) => {
    setIsLoading(true);
    try {
      const res = await login(demoEmail, demoPass, demoRole);
      if (res.success) {
        showToast(`Signed in as demo ${demoRole.toUpperCase()}!`, "success");
        router.push(destPath);
      } else {
        showToast(res.message || "Demo login failed", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Demo login error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const currentConfig = ROLE_CONFIGS[role];
  const IconComponent = currentConfig.icon;

  return (
    <NeoCard className="p-5 sm:p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313] max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div
          className="w-14 h-14 border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[3px_3px_0px_#171313] transition-colors"
          style={{ backgroundColor: currentConfig.color }}
        >
          <IconComponent className="w-7 h-7" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FAF7F2] border-2 border-[#171313] rounded-full text-xs font-black uppercase mb-2">
          <span>{currentConfig.badge} ONBOARDING</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#171313] tracking-tight">
          {role === "admin"
            ? "Admin Control Panel"
            : step === "details"
            ? `Join as ${currentConfig.title}`
            : "Verify Contact Code"}
        </h1>
        <p className="text-xs sm:text-sm font-medium text-neutral-600 mt-1 max-w-md mx-auto">
          {currentConfig.description}
        </p>
      </div>

      {/* ─── 4-Role Selector Tabs ─── */}
      <div className="mb-6">
        <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313] block mb-2 text-center">
          Select Your Workspace Role
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 bg-[#FAF7F2] border-[3px] border-[#171313] rounded-2xl shadow-[3px_3px_0px_#171313]">
          {(Object.keys(ROLE_CONFIGS) as OnboardingRole[]).map((r) => {
            const config = ROLE_CONFIGS[r];
            const RoleIcon = config.icon;
            const isSelected = role === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setErrors({});
                  if (r === "admin") {
                    setStep("details");
                  }
                }}
                className={`py-2.5 px-2 rounded-xl font-display text-xs flex flex-col items-center justify-center gap-1.5 border-[2.5px] transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#171313] text-white border-[#171313] shadow-[3px_3px_0px_#E51919] -translate-y-0.5"
                    : "bg-white text-[#171313] border-[#171313]/20 hover:border-[#171313] hover:bg-[#F3ECE2]"
                }`}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: config.color }}
                >
                  <RoleIcon className="w-4 h-4" />
                </div>
                <span className="font-black tracking-tight">{config.badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Role Banner Info */}
      <div
        className="p-3 mb-6 border-2 border-[#171313] rounded-xl flex items-center gap-2.5 text-xs font-bold text-[#171313]"
        style={{ backgroundColor: `${currentConfig.color}15` }}
      >
        <IconComponent
          className="w-5 h-5 flex-shrink-0"
          style={{ color: currentConfig.color }}
        />
        <span>{currentConfig.bannerNote}</span>
      </div>

      {/* ─── CASE A: ADMIN SELECTED (Admin ID & Password) ─── */}
      {role === "admin" ? (
        <form onSubmit={handleAdminSubmit} className="flex flex-col gap-4">
          <NeoInput
            label="Admin ID / Email"
            name="adminId"
            placeholder="admin@tripzyy.com"
            value={adminData.adminId}
            onChange={(e) =>
              setAdminData({ ...adminData, adminId: e.target.value })
            }
            error={errors.adminId}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <NeoInput
            label="Admin Password"
            type="password"
            name="adminPassword"
            placeholder="••••••••••••"
            value={adminData.adminPassword}
            onChange={(e) =>
              setAdminData({ ...adminData, adminPassword: e.target.value })
            }
            error={errors.adminPassword}
            leftIcon={<Lock className="w-4 h-4" />}
            required
          />

          <NeoButton
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-5 h-5" />}
            className="w-full mt-2"
          >
            Access Admin Command Station
          </NeoButton>
        </form>
      ) : (
        /* ─── CASE B: EXPLORER, COORDINATOR, OPERATOR ─── */
        <>
          {/* Step Progress Pills */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 border-[#171313] text-xs font-extrabold ${
                step === "details"
                  ? "bg-[#E51919] text-[#FFFFFF] shadow-[2px_2px_0px_#171313]"
                  : "bg-[#15803D] text-[#FFFFFF]"
              }`}
            >
              {step === "otp" ? <Check className="w-3.5 h-3.5" /> : "1"}
              <span>1 Details & Credentials</span>
            </div>
            <div className="w-4 h-0.5 bg-[#171313]" />
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 border-[#171313] text-xs font-extrabold ${
                step === "otp"
                  ? "bg-[#E51919] text-[#FFFFFF] shadow-[2px_2px_0px_#171313]"
                  : "bg-[#FAF7F2] text-[#171313]"
              }`}
            >
              <span>2</span>
              <span>2 Code Confirmation</span>
            </div>
          </div>

          {step === "details" ? (
            <form onSubmit={handleProceedToOtp} className="flex flex-col gap-4">
              {/* Photo Upload */}
              <div className="flex items-center gap-4 p-3 bg-[#FAF7F2] border-2 border-[#171313] rounded-xl">
                <div className="relative w-16 h-16 rounded-xl border-2 border-[#171313] bg-[#FFFFFF] overflow-hidden flex items-center justify-center text-neutral-400 flex-shrink-0 shadow-[2px_2px_0px_#171313]">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-8 h-8 text-neutral-400" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="font-display font-extrabold text-xs uppercase block text-[#171313] mb-1">
                    Profile Avatar / Station Photo
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FFFAF3] text-[#171313] border-2 border-[#171313] rounded-lg text-xs font-bold shadow-[2px_2px_0px_#171313] cursor-pointer transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Picture</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Role-Specific: Organization / Company Name for Operator & Coordinator */}
              {role !== "user" && (
                <NeoInput
                  label={
                    role === "operator"
                      ? "Tour Operator / Agency Brand"
                      : "Tour Agency / Operating Company"
                  }
                  name="companyName"
                  placeholder="e.g. Tripzyy Journeys or Himalayan Treks"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  error={errors.companyName}
                  leftIcon={<Building2 className="w-4 h-4" />}
                  required
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <NeoInput
                  label="First Name"
                  name="firstName"
                  placeholder="Sanket"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  error={errors.firstName}
                  required
                />
                <NeoInput
                  label="Last Name"
                  name="lastName"
                  placeholder="Bhandari"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  error={errors.lastName}
                  required
                />
              </div>

              <NeoInput
                label="Email Address"
                type="email"
                name="email"
                placeholder={
                  role === "operator"
                    ? "ops@tripzyy.com"
                    : role === "coordinator"
                    ? "coordinator@tripzyy.com"
                    : "sanket@tripzyy.com"
                }
                value={formData.email}
                onChange={handleInputChange}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <NeoInput
                label="Phone Number"
                type="tel"
                name="phone"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={handleInputChange}
                leftIcon={<Phone className="w-4 h-4" />}
              />

              <NeoInput
                label="Password"
                type="password"
                name="password"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={handleInputChange}
                error={errors.password}
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <div>
                <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313] block mb-1.5">
                  {role === "user"
                    ? "Explorer Bio & Travel Style"
                    : role === "coordinator"
                    ? "Field Credentials & Experience"
                    : "Agency Description & Regional Speciality"}
                </label>
                <textarea
                  name="bio"
                  rows={2}
                  placeholder={
                    role === "user"
                      ? "Passionate mountain trekker and coastal explorer from Mumbai..."
                      : role === "coordinator"
                      ? "5+ years leading high-altitude Himalayan treks and coastal expeditions..."
                      : "Boutique multi-city tour operator specializing in Western Ghats & North-East tours..."
                  }
                  value={formData.bio}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl text-sm font-medium text-[#171313] placeholder:text-neutral-500 shadow-[3px_3px_0px_#171313] focus:outline-none focus:bg-[#FFFAF3] focus:shadow-[4px_4px_0px_#E51919] transition-all resize-none"
                />
              </div>

              <NeoButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="w-5 h-5" />}
                className="w-full mt-2"
              >
                Continue to Verification
              </NeoButton>
            </form>
          ) : (
            <form
              onSubmit={handleCompleteRegistration}
              className="flex flex-col gap-5"
            >
              <div className="p-4 bg-[#FFF4E6] border-2 border-[#171313] rounded-xl text-center">
                <span className="text-xs font-bold text-neutral-600 block">
                  We sent a 6-digit verification token to:
                </span>
                <span className="font-display font-extrabold text-sm text-[#171313] block">
                  {formData.email}
                </span>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-md border border-[#171313] text-[10px] font-extrabold uppercase bg-[#FFFFFF]">
                  Role: {ROLE_CONFIGS[role].badge}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                    Enter 6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setStep("details")}
                    className="text-xs font-bold text-[#E51919] hover:underline cursor-pointer"
                  >
                    Edit Info
                  </button>
                </div>

                <div className="py-2">
                  <OtpInput
                    length={6}
                    value={otp}
                    onChange={setOtp}
                    onComplete={(code) => setOtp(code)}
                  />
                </div>

                {errors.otp && (
                  <span className="text-xs font-bold text-red-600 block mt-1">
                    {errors.otp}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs font-bold text-neutral-600">
                <span>Resend available in {countdown}s</span>
                <button
                  type="button"
                  disabled={countdown > 0}
                  onClick={handleProceedToOtp}
                  className={`hover:underline ${
                    countdown > 0
                      ? "opacity-50 cursor-not-allowed"
                      : "text-[#E51919] cursor-pointer"
                  }`}
                >
                  Resend Code
                </button>
              </div>

              <NeoButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                rightIcon={<ShieldCheck className="w-5 h-5" />}
                className="w-full"
              >
                Verify & Create {ROLE_CONFIGS[role].badge} Account
              </NeoButton>
            </form>
          )}
        </>
      )}

      {/* ─── 1-Click Instant Demo Login Roster ─── */}
      <div className="mt-8 pt-6 border-t-[3px] border-[#171313] bg-[#FAF7F2] -mx-5 -mb-5 sm:-mx-8 sm:-mb-8 p-5 sm:p-6 rounded-b-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[#E51919]" />
          <span className="font-display font-black text-xs uppercase tracking-wider text-[#171313]">
            Quick Role Testing Switcher (1-Click Login)
          </span>
        </div>
        <p className="text-[11px] font-medium text-neutral-600 mb-3">
          Jump directly into any role to evaluate its specialized dashboard:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() =>
              handleQuickDemoLogin(
                "tester@tripzyy.com",
                "TestUser@123",
                "user",
                "/dashboard"
              )
            }
            className="p-2 bg-white border-2 border-[#171313] rounded-xl text-left shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#E51919] uppercase">
              <Compass className="w-3 h-3" />
              <span>Explorer</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-700 block truncate">
              Yash (Loaded Test Account)
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleQuickDemoLogin(
                "coordinator@tripzyy.com",
                "Coord@123",
                "coordinator",
                "/dashboard"
              )
            }
            className="p-2 bg-white border-2 border-[#171313] rounded-xl text-left shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#7C3AED] uppercase">
              <Users className="w-3 h-3" />
              <span>Coordinator</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-700 block truncate">
              Meera (Field Lead)
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleQuickDemoLogin(
                "operator@tripzyy.com",
                "Operate@123",
                "operator",
                "/dashboard"
              )
            }
            className="p-2 bg-white border-2 border-[#171313] rounded-xl text-left shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#D97706] uppercase">
              <Building2 className="w-3 h-3" />
              <span>Operator</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-700 block truncate">
              Kabir (Agency Dir)
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleQuickDemoLogin(
                "admin@tripzyy.com",
                "Adm1n!Pass",
                "admin",
                "/admin"
              )
            }
            className="p-2 bg-white border-2 border-[#171313] rounded-xl text-left shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#171313] uppercase">
              <Shield className="w-3 h-3" />
              <span>Admin</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-700 block truncate">
              Aditi (Station Admin)
            </span>
          </button>
        </div>
      </div>

      {/* Login Link */}
      <div className="text-center text-xs sm:text-sm font-bold text-neutral-700 pt-6 mt-6 border-t-2 border-[#171313]">
        Already registered?{" "}
        <Link
          href="/login"
          className="text-[#E51919] underline underline-offset-4 hover:text-[#B91C1C]"
        >
          Sign In to Workspace
        </Link>
      </div>
    </NeoCard>
  );
}
