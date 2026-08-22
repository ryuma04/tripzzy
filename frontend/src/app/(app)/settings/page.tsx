"use client";

import React, { useState } from "react";
import {
  Settings,
  Bell,
  Shield,
  Palette,
  Save,
  Globe,
  Lock,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { useToast } from "@/components/ui/toast";

export default function SettingsPage() {
  const { showToast } = useToast();

  const [travelStyle, setTravelStyle] = useState("Backpacking & Adventure");
  const [budgetPreference, setBudgetPreference] = useState("budget");
  const [dietary, setDietary] = useState("Vegetarian Friendly");
  const [currency, setCurrency] = useState("INR (₹)");
  const [emailNotifications, setEmailNotifications] = useState(true);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Application preferences saved successfully!", "success");
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
            <div className="flex flex-col gap-1.5">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
                Default Travel Style
              </label>
              <select
                value={travelStyle}
                onChange={(e) => setTravelStyle(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
              >
                <option value="Backpacking & Adventure">Backpacking & Adventure</option>
                <option value="Luxury & Comfort">Luxury & Comfort</option>
                <option value="Heritage & Culture">Heritage & Culture</option>
                <option value="Roadtrips & Coastal">Roadtrips & Coastal</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-[#111111]">
                Default Budget Category
              </label>
              <select
                value={budgetPreference}
                onChange={(e) => setBudgetPreference(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#111111] font-bold text-sm border-[3px] border-[#111111] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#111111]"
              >
                <option value="budget">Budget / Hostels (₹1k - ₹3k/day)</option>
                <option value="moderate">Moderate / Boutique (₹3k - ₹8k/day)</option>
                <option value="luxury">Luxury / 5-Star (₹10k+/day)</option>
              </select>
            </div>

            <NeoInput
              label="Dietary Restrictions"
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-[#111111]">
                Primary Display Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#111111] font-bold text-sm border-[3px] border-[#111111] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#111111]"
              >
                <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                <option value="USD ($)">USD ($) - US Dollar</option>
                <option value="EUR (€)">EUR (€) - Euro</option>
                <option value="GBP (£)">GBP (£) - British Pound</option>
              </select>
            </div>
          </div>
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
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="w-5 h-5 border-2 border-[#111111] accent-[#FFD54A]"
              />
            </label>
          </div>
        </NeoCard>

        <div className="flex justify-end">
          <NeoButton
            type="submit"
            variant="yellow"
            size="md"
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Preferences
          </NeoButton>
        </div>
      </form>
    </div>
  );
}
