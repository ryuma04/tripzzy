"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Copy,
  ArrowRight,
  Sparkles,
  Calendar,
  MapPin,
  Eye,
  Check,
  Compass,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { SearchBar } from "@/components/ui/search-bar";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mockCommunityTrips, mockCurrentUser } from "@/data/mock";
import type { CommunityTrip } from "@/types";

export default function CommunityPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPreviewTrip, setSelectedPreviewTrip] = useState<CommunityTrip | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  const filteredCommunityTrips = mockCommunityTrips.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.destinations.some((d) => d.toLowerCase().includes(q)) ||
      `${t.creator.first_name} ${t.creator.last_name}`.toLowerCase().includes(q)
    );
  });

  const handleCloneTrip = async (trip: CommunityTrip) => {
    setIsCloning(true);
    try {
      await new Promise((res) => setTimeout(res, 700));
      showToast(
        `Cloned "${trip.title}" into your personal trips as an editable copy!`,
        "success"
      );
      setSelectedPreviewTrip(null);
      router.push("/trips");
    } catch {
      showToast("Failed to clone itinerary.", "error");
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Shared Feed"
        tagColor="red"
        title="Community Expeditions"
        subtitle="Discover curated public travel routes designed by other explorers and clone them directly to your workspace."
      />

      {/* ─── Search Bar (Wireframe Screen 10 Header) ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        <div className="flex-1 max-w-lg">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by circuit, city, or creator..."
          />
        </div>
        <span className="text-xs font-bold text-neutral-600">
          Showing {filteredCommunityTrips.length} Shared Trips
        </span>
      </div>

      {/* ─── Community Trip Cards Grid (Wireframe Screen 10 Cards) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCommunityTrips.map((trip) => (
          <NeoCard key={trip.id} className="p-6 flex flex-col justify-between gap-5 bg-[#FFFFFF]">
            <div>
              {/* Creator Info Header */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-100 mb-3">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={trip.creator.avatar_url}
                    name={`${trip.creator.first_name} ${trip.creator.last_name}`}
                    size="sm"
                  />
                  <div>
                    <h5 className="font-display font-extrabold text-xs text-[#111111]">
                      {trip.creator.first_name} {trip.creator.last_name}
                    </h5>
                    <span className="text-[10px] text-neutral-500 font-medium">
                      Published {new Date(trip.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#FFD54A] border border-[#111111]">
                  Verified Route
                </span>
              </div>

              {/* Trip Title & Route */}
              <h3 className="font-display font-extrabold text-xl text-[#111111] leading-snug mb-2">
                {trip.title}
              </h3>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[#4F7DF9] mb-4">
                <MapPin className="w-3.5 h-3.5" />
                <span>{trip.destinations.join(" → ")}</span>
              </div>

              {/* Meta Badges */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-neutral-700">
                <div className="flex items-center gap-1.5 bg-neutral-50 px-2.5 py-1 rounded-lg border border-[#111111]/15">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {trip.start_date} to {trip.end_date}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-neutral-50 px-2.5 py-1 rounded-lg border border-[#111111]/15">
                  <Users className="w-3.5 h-3.5" />
                  <span>{trip.traveller_count} Travelers</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions: View & Clone */}
            <div className="flex items-center justify-between pt-3 border-t-2 border-neutral-100">
              <NeoButton
                variant="white"
                size="sm"
                leftIcon={<Eye className="w-4 h-4" />}
                onClick={() => setSelectedPreviewTrip(trip)}
              >
                View Itinerary
              </NeoButton>

              <NeoButton
                variant="yellow"
                size="sm"
                leftIcon={<Copy className="w-4 h-4" />}
                onClick={() => handleCloneTrip(trip)}
              >
                Clone Trip
              </NeoButton>
            </div>
          </NeoCard>
        ))}
      </div>

      {/* ─── Trip Preview Modal ─── */}
      {selectedPreviewTrip && (
        <Modal
          isOpen={!!selectedPreviewTrip}
          onClose={() => setSelectedPreviewTrip(null)}
          title={selectedPreviewTrip.title}
          subtitle={`Published by ${selectedPreviewTrip.creator.first_name} ${selectedPreviewTrip.creator.last_name}`}
          maxWidth="lg"
        >
          <div className="flex flex-col gap-5">
            <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#4F7DF9]" />
                <span>Stops: {selectedPreviewTrip.destinations.join(" → ")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {selectedPreviewTrip.start_date} → {selectedPreviewTrip.end_date}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h5 className="font-display font-extrabold text-xs uppercase tracking-wider text-[#111111]">
                Sample Itinerary Breakdown
              </h5>
              <div className="p-3 bg-white border-2 border-[#111111] rounded-xl text-xs flex flex-col gap-2">
                <div className="font-bold text-[#111111]">
                  Day 1: Arrival, Heritage Harbor Walk & Evening Sunset
                </div>
                <div className="font-bold text-[#111111]">
                  Day 2: Scuba Diving Session & Beachside Seafood Dinner
                </div>
                <div className="font-bold text-[#111111]">
                  Day 3: Scenic Cliffside Trek & Temple Visit
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t-2 border-neutral-100">
              <NeoButton
                variant="white"
                size="sm"
                onClick={() => setSelectedPreviewTrip(null)}
              >
                Close
              </NeoButton>
              <NeoButton
                variant="yellow"
                size="md"
                isLoading={isCloning}
                leftIcon={<Copy className="w-4 h-4" />}
                onClick={() => handleCloneTrip(selectedPreviewTrip)}
              >
                Clone into My Account
              </NeoButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
