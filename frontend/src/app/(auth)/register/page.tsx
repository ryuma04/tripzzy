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
  KeyRound,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoInput } from "@/components/ui/neo-input";
import { NeoButton } from "@/components/ui/neo-button";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { register, login } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [role, setRole] = useState<"user" | "admin">("user");
  const [step, setStep] = useState<"details" | "otp">("details");

  // User details state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    bio: "",
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarPreview(URL.createObjectURL(file));
      showToast("Profile photo selected.", "info");
    }
  };

  // User form validation
  const validateUserForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!formData.email.trim() || !formData.email.includes("@")) {
      newErrors.email = "Valid email address is required.";
    }
    if (!formData.password || formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }
    return newErrors;
  };

  const handleProceedToOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateUserForm();
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

  const handleCompleteUserRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setErrors({ otp: "Please enter the complete 6-digit OTP code." });
      return;
    }

    setIsLoading(true);
    try {
      await register({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: "user",
        bio: formData.bio,
        travel_preferences: formData.travelPreferences.split(",").map((s) => s.trim()),
        avatar_url: avatarPreview || undefined,
      });

      showToast("Explorer account created! Welcome to Tripzyy.", "success");
      router.push("/dashboard");
    } catch (err: any) {
      showToast(err.message || "Failed to create account. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Admin direct login (only Admin ID & Password)
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};
    if (!adminData.adminId.trim()) newErrors.adminId = "Admin ID or Email is required.";
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
      await login(adminData.adminId, adminData.adminPassword, "admin");
      showToast("Admin credentials verified! Entering Admin Panel...", "success");
      router.push("/admin");
    } catch (err: any) {
      showToast(err.message || "Failed to access admin panel.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NeoCard className="p-6 sm:p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313]">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#E51919] border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[3px_3px_0px_#171313]">
          {role === "admin" ? <Shield className="w-7 h-7" /> : <Sparkles className="w-7 h-7" />}
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#171313] tracking-tight">
          {role === "admin"
            ? "Admin Control Panel"
            : step === "details"
            ? "Join Tripzyy"
            : "Verify Email"}
        </h1>
        <p className="text-xs sm:text-sm font-medium text-neutral-600 mt-1">
          {role === "admin"
            ? "Enter your Station Admin ID and Password to access the Admin Panel."
            : step === "details"
            ? "Create your explorer profile to build multi-city itineraries and routes."
            : `Enter the 6-digit confirmation code transmitted to ${formData.email}`}
        </p>
      </div>

      {/* ─── Simple Role Selector (User vs Admin) ─── */}
      <div className="grid grid-cols-2 gap-2.5 mb-6 p-1.5 bg-[#FAF7F2] border-[3px] border-[#171313] rounded-2xl shadow-[3px_3px_0px_#171313]">
        <button
          type="button"
          onClick={() => {
            setRole("user");
            setErrors({});
          }}
          className={`py-2.5 px-4 rounded-xl font-display font-black text-sm flex items-center justify-center gap-2 border-[2.5px] transition-all cursor-pointer ${
            role === "user"
              ? "bg-[#E51919] text-white border-[#171313] shadow-[3px_3px_0px_#171313] -translate-y-0.5"
              : "bg-transparent text-[#171313] border-transparent hover:bg-[#F3ECE2]"
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>User</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRole("admin");
            setErrors({});
          }}
          className={`py-2.5 px-4 rounded-xl font-display font-black text-sm flex items-center justify-center gap-2 border-[2.5px] transition-all cursor-pointer ${
            role === "admin"
              ? "bg-[#171313] text-white border-[#171313] shadow-[3px_3px_0px_#E51919] -translate-y-0.5"
              : "bg-transparent text-[#171313] border-transparent hover:bg-[#F3ECE2]"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Admin</span>
        </button>
      </div>

      {/* ─── CASE A: ADMIN SELECTED (Only Admin ID & Password) ─── */}
      {role === "admin" ? (
        <form onSubmit={handleAdminSubmit} className="flex flex-col gap-4">
          <div className="p-3 bg-[#FFF0F0] border-2 border-[#171313] rounded-xl flex items-center gap-2.5 text-xs font-bold text-[#171313]">
            <ShieldCheck className="w-5 h-5 text-[#E51919] flex-shrink-0" />
            <span>Station Admin Gateway: Enter Admin ID and Password for immediate access.</span>
          </div>

          <NeoInput
            label="Admin ID / Email"
            name="adminId"
            placeholder="admin@tripzyy.com"
            value={adminData.adminId}
            onChange={(e) => setAdminData({ ...adminData, adminId: e.target.value })}
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
            onChange={(e) => setAdminData({ ...adminData, adminPassword: e.target.value })}
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
            Access Admin Panel
          </NeoButton>
        </form>
      ) : (
        /* ─── CASE B: USER SELECTED (All details & bio + OTP) ─── */
        <>
          {/* Step Progress Pills for User */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 border-[#171313] text-xs font-extrabold ${
                step === "details"
                  ? "bg-[#E51919] text-[#FFFFFF] shadow-[2px_2px_0px_#171313]"
                  : "bg-[#15803D] text-[#FFFFFF]"
              }`}
            >
              {step === "otp" ? <Check className="w-3.5 h-3.5" /> : "1"}
              <span>Details & Bio</span>
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
              <span>OTP Confirmation</span>
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
                    Profile Avatar Photo
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
                placeholder="sanket@tripzyy.com"
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
                  Explorer Bio & Travel Style
                </label>
                <textarea
                  name="bio"
                  rows={2}
                  placeholder="Passionate mountain trekker and coastal explorer from Mumbai..."
                  value={formData.bio}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl text-sm font-medium text-[#171313] placeholder:text-neutral-500 shadow-[3px_3px_0px_#171313] focus:outline-none focus:bg-[#FFFAF3] focus:shadow-[4px_4px_0px_#D94B3D] transition-all resize-none"
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
            <form onSubmit={handleCompleteUserRegistration} className="flex flex-col gap-5">
              <div className="p-4 bg-[#FFF4E6] border-2 border-[#171313] rounded-xl text-center">
                <span className="text-xs font-bold text-neutral-600 block">
                  We sent a 6-digit verification token to:
                </span>
                <span className="font-display font-extrabold text-sm text-[#171313] block">
                  {formData.email}
                </span>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-md border border-[#171313] text-[10px] font-extrabold uppercase bg-[#FFFFFF]">
                  🎒 Explorer Profile
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                    Enter 6-Digit OTP
                  </label>
                  <button
                    type="button"
                    onClick={() => setStep("details")}
                    className="text-xs font-bold text-[#D94B3D] hover:underline"
                  >
                    Edit Info
                  </button>
                </div>

                <div className="py-2">
                  <OtpInput
                    length={6}
                    value={otp}
                    onChange={setOtp}
                    onComplete={(code) => {
                      setOtp(code);
                    }}
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
                    countdown > 0 ? "opacity-50 cursor-not-allowed" : "text-[#D94B3D] cursor-pointer"
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
                Verify & Create Explorer Account
              </NeoButton>
            </form>
          )}
        </>
      )}

      {/* Login Link */}
      <div className="text-center text-xs sm:text-sm font-bold text-neutral-700 pt-6 mt-6 border-t-2 border-[#171313]">
        Already have a station?{" "}
        <Link href="/login" className="text-[#D94B3D] underline underline-offset-4 hover:text-[#A8322A]">
          Sign In to Workspace
        </Link>
      </div>
    </NeoCard>
  );
}
