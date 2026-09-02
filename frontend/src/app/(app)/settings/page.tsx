"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Bell,
  Shield,
  Palette,
  Save,
  Globe,
  Lock,
  KeyRound,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { useToast } from "@/components/ui/toast";
import { userService } from "@/services/users";
import type { ComfortTier, UpdatePreferencesPayload } from "@/types";

const COMFORT_OPTIONS: [ComfortTier | "", string][] = [
  ["", "Not specified"],
  ["budget", "Budget"],
  ["standard", "Standard"],
  ["premium", "Premium"],
  ["luxury", "Luxury"],
];

/** "street food, trekking" -> ["street food", "trekking"] */
function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Generic over the option value, so `onChange` hands back the union type
 * (`TravelStyle`, `ComfortTier`, …) rather than a bare string that then has
 * to be cast at every call site.
 */
function Selector<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: T | "";
  onChange: (value: T | "") => void;
  options: [T | "", string][];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {hint && (
        <span className="text-[10px] font-semibold text-neutral-500">{hint}</span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { showToast } = useToast();

  // Mirrors the API's preference shape exactly. The previous version tracked
  // `default_budget_tier`, `dietary_preferences`, `default_currency` and
  // `notification_preferences`, none of which the backend accepts -- Pydantic
  // dropped them as unknown fields, so this form returned "saved
  // successfully" while changing nothing. The currency select also submitted
  // "INR (₹)", which the 3-letter ISO validator would have rejected outright.
  const [prefs, setPrefs] = useState<UpdatePreferencesPayload>({
    travel_style: null,
    pace: null,
    accommodation_class: null,
    transport_class: null,
    interests: [],
    dietary_requirements: [],
    mobility_needs: "",
    daily_budget_cap: null,
    currency: "INR",
    email_notifications: true,
  });
  const [interestsText, setInterestsText] = useState("");
  const [dietaryText, setDietaryText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof UpdatePreferencesPayload>(
    key: K,
    value: UpdatePreferencesPayload[K]
  ) => setPrefs((prev) => ({ ...prev, [key]: value }));

  // Password change state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      setIsLoading(true);
      try {
        const res = await userService.getPreferences();
        if (res.success && res.data) {
          setPrefs(res.data);
          setInterestsText((res.data.interests ?? []).join(", "));
          setDietaryText((res.data.dietary_requirements ?? []).join(", "));
        }
      } catch (err) {
        console.error("Failed to load preferences:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPrefs();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await userService.updatePreferences({
        ...prefs,
        // Comma-separated in the UI, a list on the wire. The server folds
        // case and de-duplicates, so "Street Food" and "street food" cannot
        // split one stated interest across two tags.
        interests: splitTags(interestsText),
        dietary_requirements: splitTags(dietaryText),
        mobility_needs: prefs.mobility_needs?.trim() || null,
      });

      if (res.success) {
        showToast("Application preferences saved successfully!", "success");
      } else {
        showToast(res.message || "Failed to update preferences.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save preferences.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showToast("Please fill in current and new password.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters.", "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast("New passwords do not match.", "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await userService.changePassword({
        current_password: oldPassword,
        new_password: newPassword,
      });
      if (res.success) {
        showToast("Password updated successfully!", "success");
        setOldPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        showToast(res.message || "Failed to update password.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update password.", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <SectionHeader
        tag="Preferences"
        tagColor="red"
        title="Settings & System Preferences"
        subtitle="Customize your default travel planning parameters, notifications, and security."
      />

      <form onSubmit={handleSaveSettings} className="flex flex-col gap-6">
        {/* Travel Preferences */}
        <NeoCard className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313]">
          <div className="flex items-center gap-2 pb-4 border-b-2 border-[#171313] mb-6">
            <Palette className="w-5 h-5 text-[#D94B3D]" />
            <h3 className="font-display font-extrabold text-xl text-[#171313]">
              Travel & Itinerary Preferences
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Selector
              label="Travel style"
              value={prefs.travel_style ?? ""}
              onChange={(v) => set("travel_style", v || null)}
              options={[
                ["", "Not specified"],
                ["solo", "Solo"],
                ["couple", "Couple"],
                ["family", "Family"],
                ["friends", "Friends"],
                ["business", "Business"],
                ["backpacking", "Backpacking"],
                ["luxury", "Luxury"],
              ]}
            />

            <Selector
              label="Pace"
              hint="How much we pack into a day"
              value={prefs.pace ?? ""}
              onChange={(v) => set("pace", v || null)}
              options={[
                ["", "Not specified"],
                ["relaxed", "Relaxed — a couple of things a day"],
                ["balanced", "Balanced"],
                ["packed", "Packed — see as much as possible"],
              ]}
            />

            <Selector
              label="Accommodation class"
              value={prefs.accommodation_class ?? ""}
              onChange={(v) => set("accommodation_class", v || null)}
              options={COMFORT_OPTIONS}
            />

            <Selector
              label="Transport class"
              value={prefs.transport_class ?? ""}
              onChange={(v) => set("transport_class", v || null)}
              options={COMFORT_OPTIONS}
            />

            <NeoInput
              label="Interests"
              placeholder="street food, trekking, architecture"
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
            />

            <NeoInput
              label="Dietary requirements"
              placeholder="vegetarian, no nuts"
              value={dietaryText}
              onChange={(e) => setDietaryText(e.target.value)}
            />

            <NeoInput
              label="Daily budget cap (₹)"
              type="number"
              placeholder="Optional"
              value={prefs.daily_budget_cap ?? ""}
              onChange={(e) =>
                set("daily_budget_cap", e.target.value || null)
              }
            />

            <Selector
              label="Display currency"
              value={prefs.currency ?? "INR"}
              onChange={(v) => set("currency", v)}
              options={[
                ["INR", "INR (₹) — Indian Rupee"],
                ["USD", "USD ($) — US Dollar"],
                ["EUR", "EUR (€) — Euro"],
                ["GBP", "GBP (£) — British Pound"],
              ]}
            />

            <div className="md:col-span-2">
              <NeoInput
                label="Accessibility & mobility needs"
                placeholder="Anything we should account for when suggesting options"
                value={prefs.mobility_needs ?? ""}
                onChange={(e) => set("mobility_needs", e.target.value)}
              />
            </div>
          </div>

          <p className="text-[11px] font-semibold text-neutral-500 mt-4">
            These shape which options we suggest, and how replacements are
            ranked if something on your trip has to change.
          </p>
        </NeoCard>

        {/* Notifications & Security */}
        <NeoCard className="p-6 md:p-8 bg-[#FFFFFF]">
          <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111] mb-6">
            <Bell className="w-5 h-5 text-[#FFB347]" />
            <h3 className="font-display font-extrabold text-xl text-[#111111]">
              Notifications & Alerts
            </h3>
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between p-3.5 bg-neutral-50 border-2 border-[#111111] rounded-xl cursor-pointer">
              <div>
                <span className="font-display font-extrabold text-sm text-[#111111] block">
                  Trip Departure & Activity Reminders
                </span>
                <span className="text-xs text-neutral-600 font-medium">
                  Receive notifications before departure dates & scheduled activities
                </span>
              </div>
              <input
                type="checkbox"
                checked={prefs.email_notifications ?? true}
                onChange={(e) => set("email_notifications", e.target.checked)}
                className="w-5 h-5 border-2 border-[#111111] accent-[#FFD54A]"
              />
            </label>
          </div>
        </NeoCard>

        <div className="flex justify-end">
          <NeoButton
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Preferences
          </NeoButton>
        </div>
      </form>

      {/* Security & Password Card */}
      <NeoCard className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313]">
        <div className="flex items-center gap-2 pb-4 border-b-2 border-[#171313] mb-6">
          <KeyRound className="w-5 h-5 text-[#D94B3D]" />
          <h3 className="font-display font-extrabold text-xl text-[#171313]">
            Security & Account Password
          </h3>
        </div>

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <NeoInput
            label="Current Password"
            type="password"
            placeholder="••••••••••••"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NeoInput
              label="New Password (min 8 chars)"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />
            <NeoInput
              label="Confirm New Password"
              type="password"
              placeholder="••••••••••••"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />
          </div>

          <div className="flex justify-end pt-2">
            <NeoButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isChangingPassword}
              leftIcon={<Lock className="w-4 h-4" />}
            >
              Update Password
            </NeoButton>
          </div>
        </form>
      </NeoCard>
    </div>
  );
}
