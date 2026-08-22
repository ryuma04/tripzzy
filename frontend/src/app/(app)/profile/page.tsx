"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  User as UserIcon,
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
  Upload,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { userService } from "@/services/users";
import { tripService } from "@/services/trips";
import { uploadAvatar, getCurrentUser } from "@/lib/auth";
import type { User, Trip } from "@/types";

export default function ProfilePage() {
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    additional_info: "",
  });

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const [userRes, tripsRes] = await Promise.all([
          getCurrentUser(),
          tripService.list({ limit: 50 }),
        ]);

        if (userRes.success && userRes.data) {
          const u = userRes.data;
          setUser(u);
          setFormData({
            first_name: u.first_name || "",
            last_name: u.last_name || "",
            email: u.email || "",
            phone: u.phone || "",
            city: u.city || "",
            country: u.country || "",
            additional_info: u.additional_info || "",
          });
        }

        if (tripsRes.success && tripsRes.data) {
          const items = Array.isArray(tripsRes.data)
            ? tripsRes.data
            : (tripsRes.data as any).items || [];
          setTrips(items);
        }
      } catch (err) {
        console.error("Failed to load profile details:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  const preplannedTrips = trips.filter(
    (t) => t.status === "upcoming" || t.status === "ongoing" || t.status === "draft"
  );
  const previousTrips = trips.filter((t) => t.status === "completed");

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast("Uploading avatar to ImageKit...", "info");
      const res = await uploadAvatar(file);
      if (res.success && res.data) {
        if (res.data.user) {
          setUser(res.data.user);
        } else if (res.data.avatar_url) {
          setUser((prev) => (prev ? { ...prev, avatar_url: res.data!.avatar_url } : null));
        }
        showToast("Profile avatar photo updated!", "success");
      } else {
        showToast(res.message || "Failed to update avatar photo.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to upload avatar.", "error");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await userService.updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        city: formData.city,
        country: formData.country,
        additional_info: formData.additional_info,
      });

      if (res.success && res.data) {
        setUser(res.data);
        setIsEditing(false);
        showToast("Profile details updated successfully!", "success");
      } else {
        showToast(res.message || "Failed to update profile.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update profile.", "error");
    } finally {
      setIsSaving(false);
    }
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
                src={user?.avatar_url}
                name={`${formData.first_name} ${formData.last_name}`}
                size="xl"
              />
              <label
                title="Change Avatar Photo"
                className="absolute bottom-0 right-0 p-2 rounded-xl bg-[#D94B3D] text-white border-2 border-[#171313] shadow-[2px_2px_0px_#171313] hover:bg-[#A8322A] cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <h2 className="font-display font-extrabold text-2xl text-[#171313]">
                  {formData.first_name} {formData.last_name}
                </h2>
                <Badge variant="red">{user?.role || "user"}</Badge>
              </div>

              <p className="text-xs font-semibold text-neutral-600 max-w-md">
                {formData.additional_info || "Passionate explorer and multi-city traveler."}
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
