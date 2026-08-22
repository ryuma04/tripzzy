"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Phone, ArrowRight, Upload, Sparkles, ShieldCheck, Check } from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoInput } from "@/components/ui/neo-input";
import { NeoButton } from "@/components/ui/neo-button";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { register, verifyOtp, resendOtp, uploadAvatar } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState<"details" | "otp">("details");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "Mumbai",
    country: "India",
    password: "",
    confirmPassword: "",
    bio: "",
  });
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
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
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      showToast("Profile photo selected.", "info");
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim())
      newErrors.firstName = "First name is required.";
    if (!formData.lastName.trim())
      newErrors.lastName = "Last name is required.";
    if (!formData.email.trim() || !formData.email.includes("@")) {
      newErrors.email = "Valid email address is required.";
    }
    if (!formData.phone.trim() || formData.phone.length < 7) {
      newErrors.phone = "Valid phone number is required (min 7 digits).";
    }
    if (!formData.city.trim()) newErrors.city = "City is required.";
    if (!formData.country.trim()) newErrors.country = "Country is required.";
    
    if (!formData.password || formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    } else {
      const missing = [];
      if (!/[A-Z]/.test(formData.password)) missing.push("an uppercase letter");
      if (!/[a-z]/.test(formData.password)) missing.push("a lowercase letter");
      if (!/[0-9]/.test(formData.password)) missing.push("a digit");
      if (!/[^A-Za-z0-9]/.test(formData.password)) missing.push("a special character (e.g. @, #, $)");
      if (missing.length > 0) {
        newErrors.password = "Must contain " + missing.join(", ");
      }
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }
    return newErrors;
  };

  const handleProceedToOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("Please fix the validation errors before proceeding.", "error");
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const res = await register({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        password: formData.password,
        confirm_password: formData.confirmPassword,
        additional_info: formData.bio.trim() || undefined,
      });

      if (!res.success) {
        if (res.error?.details && (res.error.details as any).fields) {
          const fieldMap = (res.error.details as any).fields;
          const mappedErrors: Record<string, string> = {};
          if (fieldMap.first_name) mappedErrors.firstName = fieldMap.first_name;
          if (fieldMap.last_name) mappedErrors.lastName = fieldMap.last_name;
          if (fieldMap.email) mappedErrors.email = fieldMap.email;
          if (fieldMap.phone) mappedErrors.phone = fieldMap.phone;
          if (fieldMap.city) mappedErrors.city = fieldMap.city;
          if (fieldMap.country) mappedErrors.country = fieldMap.country;
          if (fieldMap.password) mappedErrors.password = fieldMap.password;
          if (fieldMap.confirm_password) mappedErrors.confirmPassword = fieldMap.confirm_password;
          setErrors(mappedErrors);

          const firstErr = Object.values(fieldMap)[0] as string;
          showToast(firstErr || res.message, "error");
        } else {
          showToast(res.message || "Failed to create account.", "error");
        }
        return;
      }

      if (res.data?.verification_required) {
        setStep("otp");
        setCountdown(60);
        if (res.data.debug_verification_code) {
          showToast(
            `Verification code (dev): ${res.data.debug_verification_code}`,
            "info"
          );
          setOtp(res.data.debug_verification_code);
        } else {
          showToast(
            `Verification token dispatched to ${formData.email}`,
            "info"
          );
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
      } else {
        // Verification was not required, already signed in
        if (avatarFile) {
          try {
            await uploadAvatar(avatarFile);
          } catch {}
        }
        showToast("Account created successfully! Welcome to Tripzyy.", "success");
        router.push("/dashboard");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to submit registration.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      const res = await resendOtp(formData.email);
      setCountdown(60);
      if (res.data?.debug_verification_code) {
        showToast(
          `Verification code (dev): ${res.data.debug_verification_code}`,
          "info"
        );
        setOtp(res.data.debug_verification_code);
      } else {
        showToast("Fresh verification token sent.", "info");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to resend code.", "error");
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setErrors({ otp: "Please enter the complete 6-digit OTP code." });
      return;
    }

    setIsLoading(true);
    try {
      const res = await verifyOtp(formData.email, otp);
      if (res.success) {
        if (avatarFile) {
          try {
            await uploadAvatar(avatarFile);
          } catch {}
        }
        showToast("Email verified successfully! Welcome to Tripzyy.", "success");
        router.push("/dashboard");
      } else {
        showToast(res.message || "Invalid verification code.", "error");
      }
    } catch (err: any) {
      showToast(
        err.message || "Failed to verify account. Please try again.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NeoCard className="p-6 sm:p-8 bg-[#FFFFFF] border-[4px] border-[#171313] shadow-[8px_8px_0px_#171313]">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#E51919] border-[3px] border-[#171313] rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[3px_3px_0px_#171313]">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#171313] tracking-tight">
          {step === "details" ? "Join Tripzyy" : "Verify Email"}
        </h1>
        <p className="text-xs sm:text-sm font-medium text-neutral-600 mt-1">
          {step === "details"
            ? "Create your explorer profile to build multi-city itineraries and routes."
            : `Enter the 6-digit confirmation code transmitted to ${formData.email}`}
        </p>
      </div>

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
                <User className="w-8 h-8 text-neutral-400" />
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

          <div className="grid grid-cols-2 gap-3">
            <NeoInput
              label="City"
              name="city"
              placeholder="Mumbai"
              value={formData.city}
              onChange={handleInputChange}
              error={errors.city}
              required
            />
            <NeoInput
              label="Country"
              name="country"
              placeholder="India"
              value={formData.country}
              onChange={handleInputChange}
              error={errors.country}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NeoInput
              label="Password (min 8 chars)"
              type="password"
              name="password"
              placeholder="••••••••••••"
              value={formData.password}
              onChange={handleInputChange}
              error={errors.password}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />
            <NeoInput
              label="Confirm Password"
              type="password"
              name="confirmPassword"
              placeholder="••••••••••••"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              error={errors.confirmPassword}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />
          </div>

          <div>
            <label className="font-display font-extrabold text-xs uppercase tracking-wider text-[#171313] block mb-1.5">
              Explorer Bio & Travel Style
            </label>
            <textarea
              name="bio"
              rows={2}
              placeholder="Passionate mountain trekker and coastal explorer..."
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
            Create Account & Verify
          </NeoButton>
        </form>
      ) : (
        <form onSubmit={handleCompleteRegistration} className="flex flex-col gap-5">
          <div className="p-4 bg-[#FFF4E6] border-2 border-[#171313] rounded-xl text-center">
            <span className="text-xs font-bold text-neutral-600 block">
              We sent a 6-digit verification token to:
            </span>
            <span className="font-display font-extrabold text-sm text-[#171313]">
              {formData.email}
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
              onClick={handleResend}
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
            Verify & Create Account
          </NeoButton>
        </form>
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
