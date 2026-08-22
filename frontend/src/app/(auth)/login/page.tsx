"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Compass,
  Shield,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoInput } from "@/components/ui/neo-input";
import { NeoButton } from "@/components/ui/neo-button";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { login, requestLoginOtp, loginWithOtp } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [selectedRole, setSelectedRole] = useState<"user" | "admin">("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrors({ email: "Please provide a valid email address." });
      return;
    }
    setErrors({});
    setIsLoading(true);

    try {
      const res = await requestLoginOtp(email);
      setIsOtpSent(true);
      setCountdown(60);
      if (res.data?.debug_verification_code) {
        showToast(
          `OTP sent! Dev Code: ${res.data.debug_verification_code}`,
          "info"
        );
        setOtp(res.data.debug_verification_code);
      } else {
        showToast(`6-digit verification code sent to ${email}`, "info");
      }

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      showToast(err.message || "Failed to send OTP code.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!email) newErrors.email = "Email is required.";
    if (!password) newErrors.password = "Password is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(email, password, selectedRole);
      if (res && res.success) {
        if (selectedRole === "admin" || email.toLowerCase().includes("admin")) {
          showToast("Signed in as Admin Commander! Opening Admin Panel...", "success");
          router.push("/admin");
        } else {
          showToast("Signed in successfully! Welcome to Explorer Dashboard.", "success");
          router.push("/dashboard");
        }
      } else {
        showToast(res?.message || "Invalid credentials. Please verify.", "error");
      }
    } catch (err: any) {
      showToast(
        err.message || "Failed to sign in. Please verify credentials.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setErrors({ otp: "Please enter the complete 6-digit OTP." });
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginWithOtp(email, otp, selectedRole);
      if (res && res.success) {
        if (selectedRole === "admin" || email.toLowerCase().includes("admin")) {
          showToast("OTP verified! Welcome back, Admin.", "success");
          router.push("/admin");
        } else {
          showToast("OTP verified! Access granted to Explorer Dashboard.", "success");
          router.push("/dashboard");
        }
      } else {
        showToast(res?.message || "Invalid verification code.", "error");
      }
    } catch (err: any) {
      showToast("Invalid verification code. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPreset = (role: "user" | "admin") => {
    setSelectedRole(role);
    if (role === "admin") {
      setEmail("admin@tripzyy.com");
      setPassword("admin12345");
      showToast("Admin credentials loaded.", "info");
    } else {
      setEmail("sanket@tripzyy.com");
      setPassword("explorer123");
      showToast("Explorer credentials loaded.", "info");
    }
  };

  return (
    <NeoCard className="p-6 sm:p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313]">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#E51919] border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[3px_3px_0px_#171313]">
          <KeyRound className="w-7 h-7" />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#171313] tracking-tight">
          Welcome Back
        </h1>
        <p className="text-xs sm:text-sm font-medium text-neutral-600 mt-1">
          Access your {selectedRole === "admin" ? "Admin Control Center" : "Explorer Workspace"} & routes.
        </p>
      </div>

      {/* Role Selection / Quick Presets */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-display font-extrabold text-[10px] uppercase tracking-wider text-[#171313]">
            Login Role Perspective
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Quick Switch</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleQuickPreset("user")}
            className={`py-2 px-3 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
              selectedRole === "user"
                ? "bg-[#FFF5E9] text-[#171313] border-[#171313] shadow-[2px_2px_0px_#E51919]"
                : "bg-[#FAF7F2] text-neutral-600 border-neutral-300 hover:bg-[#FFFFFF]"
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#E51919]" />
            <span>User / Explorer</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset("admin")}
            className={`py-2 px-3 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-display font-extrabold uppercase transition-all cursor-pointer ${
              selectedRole === "admin"
                ? "bg-[#FFF0F0] text-[#171313] border-[#171313] shadow-[2px_2px_0px_#E51919]"
                : "bg-[#FAF7F2] text-neutral-600 border-neutral-300 hover:bg-[#FFFFFF]"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#E51919]" />
            <span>Admin Panel</span>
          </button>
        </div>
      </div>

      {/* Auth Mode Toggle */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#FAF7F2] border-[2.5px] border-[#171313] rounded-xl mb-6 shadow-[2px_2px_0px_#171313]">
        <button
          type="button"
          onClick={() => {
            setAuthMode("password");
            setIsOtpSent(false);
            setErrors({});
          }}
          className={`py-2 text-xs font-display font-extrabold uppercase rounded-lg border-2 transition-all cursor-pointer ${
            authMode === "password"
              ? "bg-[#E51919] text-[#FFFFFF] border-[#171313] shadow-[2px_2px_0px_#171313] -translate-y-0.5"
              : "border-transparent text-[#171313] hover:bg-[#F3ECE2]"
          }`}
        >
          Password Login
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode("otp");
            setErrors({});
          }}
          className={`py-2 text-xs font-display font-extrabold uppercase rounded-lg border-2 transition-all cursor-pointer ${
            authMode === "otp"
              ? "bg-[#E51919] text-[#FFFFFF] border-[#171313] shadow-[2px_2px_0px_#171313] -translate-y-0.5"
              : "border-transparent text-[#171313] hover:bg-[#F3ECE2]"
          }`}
        >
          Instant OTP Code
        </button>
      </div>

      {/* Mode 1: Password Form */}
      {authMode === "password" && (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <NeoInput
            label="Email Address"
            type="email"
            placeholder="wanderer@tripzyy.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <NeoInput
            label="Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={<Lock className="w-4 h-4" />}
            required
          />

          <div className="flex items-center justify-between text-xs font-bold text-neutral-600 my-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded border-2 border-[#171313] accent-[#D94B3D] cursor-pointer"
              />
              <span>Remember this station</span>
            </label>
            <a href="#" className="hover:underline text-[#D94B3D]">
              Forgot password?
            </a>
          </div>

          <NeoButton
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-5 h-5" />}
            className="w-full mt-2"
          >
            Sign In as {selectedRole === "admin" ? "Admin Commander" : "Explorer"}
          </NeoButton>
        </form>
      )}

      {/* Mode 2: 6-Digit OTP Form */}
      {authMode === "otp" && (
        <div className="flex flex-col gap-4">
          {!isOtpSent ? (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              <NeoInput
                label="Email Address for OTP"
                type="email"
                placeholder="wanderer@tripzyy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />
              <p className="text-xs text-neutral-600 font-medium">
                We will transmit a 6-digit instant verification token to your registered email.
              </p>
              <NeoButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                rightIcon={<Sparkles className="w-5 h-5" />}
                className="w-full mt-2"
              >
                Send 6-Digit Code
              </NeoButton>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313]">
                    Enter 6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsOtpSent(false)}
                    className="text-xs font-bold text-[#D94B3D] hover:underline"
                  >
                    Change Email
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
                <span>Code expires in {countdown}s</span>
                <button
                  type="button"
                  disabled={countdown > 0}
                  onClick={handleSendOtp}
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
                className="w-full mt-2"
              >
                Verify Code & Enter
              </NeoButton>
            </form>
          )}
        </div>
      )}

      {/* Register Link */}
      <div className="text-center text-xs sm:text-sm font-bold text-neutral-700 pt-6 mt-6 border-t-2 border-[#171313]">
        New expedition planner?{" "}
        <Link href="/register" className="text-[#D94B3D] underline underline-offset-4 hover:text-[#A8322A]">
          Create a Tripzyy Account
        </Link>
      </div>
    </NeoCard>
  );
}
