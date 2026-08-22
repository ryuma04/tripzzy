"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Edit,
  Save,
  Camera,
  Calendar,
  Compass,
  ArrowRight,
  Eye,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { mockTrips } from "@/data/mock";
import { useAuthUser } from "@/lib/auth";

export default function ProfilePage() {
  const { showToast } = useToast();
  const { user, updateUser, isAdmin, setRole } = useAuthUser();
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    country: user.country,
    additional_info: user.additional_info || "",
    role: user.role,
  });

  const preplannedTrips = mockTrips.filter(
    (t) => t.status === "upcoming" || t.status === "draft"
  );
  const previousTrips = mockTrips.filter((t) => t.status === "completed");

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser(formData);
    setIsEditing(false);
    showToast("Profile details updated successfully!", "success");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Account"
        tagColor="red"
        title="User Profile & Settings"
        subtitle="Manage your personal travel bio, account details, preplanned upcoming trips, and past journey history."
      />

      {/* ─── User Profile Card (Wireframe Screen 7 User Details with Edit option) ─── */}
      <NeoCard className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313]">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-6 pb-6 border-b-2 border-[#171313]">
          {/* Avatar & Basic Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="relative">
              <Avatar
                src={user.avatar_url}
                name={`${formData.first_name} ${formData.last_name}`}
                size="xl"
              />
              <button
                title="Change Photo"
                className="absolute bottom-0 right-0 p-2 rounded-xl bg-[#D94B3D] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313] hover:bg-[#A8322A] cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <h2 className="font-display font-extrabold text-2xl text-[#171313]">
                  {formData.first_name} {formData.last_name}
                </h2>
                <Badge variant={isAdmin ? "red" : "cream"}>
                  {isAdmin ? "🛡️ Admin" : "🎒 Explorer"}
                </Badge>
              </div>

              <p className="text-xs font-semibold text-neutral-600 max-w-md">
                {formData.additional_info}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs font-bold text-neutral-700 mt-3">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {formData.email}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {formData.city}, {formData.country}
                </span>
              </div>
            </div>
          </div>

          {/* Edit Toggle Button */}
          <NeoButton
            variant={isEditing ? "green" : "white"}
            size="sm"
            leftIcon={isEditing ? <Save className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Close Editing" : "Edit Profile Info"}
          </NeoButton>
        </div>

        {/* Edit Form (Expanded when isEditing is true) */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-6 pt-2 flex flex-col gap-4">
            <h4 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#111111]">
              Edit Profile Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NeoInput
                label="First Name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
                required
              />
              <NeoInput
                label="Last Name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NeoInput
                label="Phone Number"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
              />
              <NeoInput
                label="City"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                required
              />
            </div>

            <NeoInput
              label="Bio / Additional Information"
              value={formData.additional_info}
              onChange={(e) =>
                setFormData({ ...formData, additional_info: e.target.value })
              }
            />

            <div className="flex justify-end pt-2">
              <NeoButton type="submit" variant="yellow" size="sm">
                Save Changes
              </NeoButton>
            </div>
          </form>
        )}
      </NeoCard>

      {/* ─── Preplanned Trips Section (Wireframe Screen 7 Preplanned Trips) ─── */}
      <section>
        <SectionHeader
          tag="Upcoming"
          tagColor="blue"
          title="Preplanned Trips"
          subtitle="Your scheduled upcoming itineraries ready for departure"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {preplannedTrips.map((trip) => (
            <NeoCard key={trip.id} interactive className="p-5 flex flex-col justify-between gap-4 bg-[#FFFFFF]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge status={trip.status} />
                  <span className="text-xs font-bold text-neutral-500">
                    {trip.stops.length} Stops
                  </span>
                </div>
                <h4 className="font-display font-extrabold text-lg text-[#111111]">
                  {trip.title}
                </h4>
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 mt-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {trip.start_date} → {trip.end_date}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between">
                <span className="font-display font-extrabold text-sm text-[#111111]">
                  ₹{trip.budget.toLocaleString("en-IN")}
                </span>
                <Link href={`/trips/${trip.id}`}>
                  <NeoButton variant="yellow" size="sm" rightIcon={<Eye className="w-3.5 h-3.5" />}>
                    View
                  </NeoButton>
                </Link>
              </div>
            </NeoCard>
          ))}
        </div>
      </section>

      {/* ─── Previous Trips Section (Wireframe Screen 7 Previous Trips) ─── */}
      <section>
        <SectionHeader
          tag="History"
          tagColor="green"
          title="Previous Trips"
          subtitle="Completed travel journeys, logs, and archived expense reports"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {previousTrips.map((trip) => (
            <NeoCard key={trip.id} interactive className="p-5 flex flex-col justify-between gap-4 bg-[#FFFFFF]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge status="completed" />
                  <span className="text-xs font-bold text-neutral-500">Archived</span>
                </div>
                <h4 className="font-display font-extrabold text-lg text-[#111111]">
                  {trip.title}
                </h4>
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 mt-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {trip.start_date} → {trip.end_date}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between">
                <span className="font-display font-extrabold text-sm text-[#111111]">
                  ₹{trip.budget.toLocaleString("en-IN")}
                </span>
                <Link href={`/trips/${trip.id}`}>
                  <NeoButton variant="white" size="sm" rightIcon={<Eye className="w-3.5 h-3.5" />}>
                    View
                  </NeoButton>
                </Link>
              </div>
            </NeoCard>
          ))}
        </div>
      </section>
    </div>
  );
}
