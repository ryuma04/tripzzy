"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Users,
  MapPin,
  Share2,
  Trash2,
  Edit,
  ArrowLeft,
  Sparkles,
  Train,
  Building2,
  Receipt,
  Layers,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useToast } from "@/components/ui/toast";
import { ItineraryBuilder } from "@/components/itinerary/itinerary-builder";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { BudgetOverview } from "@/components/budget/budget-overview";
import { TripMap } from "@/components/map";
import { mockTrips } from "@/data/mock";
import type { Trip } from "@/types";

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const tripId = params.tripId as string;

  // Find trip by ID (fallback to first trip)
  const [trip, setTrip] = useState<Trip>(
    mockTrips.find((t) => t.id === tripId) || mockTrips[0]
  );

  const [activeTab, setActiveTab] = useState("map");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [selectedMapStopId, setSelectedMapStopId] = useState<string | undefined>(undefined);

  const tabs = [
    {
      id: "map",
      label: "Interactive Route Map",
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      id: "builder",
      label: "Itinerary Builder",
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: "timeline",
      label: "Day-by-Day View",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: "budget",
      label: "Budget & Expenses",
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: "transport",
      label: "Transport & Stays",
      icon: <Train className="w-4 h-4" />,
    },
  ];

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/community?slug=${trip.share_slug || trip.id}`;
    navigator.clipboard.writeText(url);
    setHasCopied(true);
    showToast("Shareable link copied to clipboard!", "success");
    setTimeout(() => setHasCopied(false), 3000);
  };

  const handleDeleteTrip = () => {
    setIsDeleteModalOpen(false);
    showToast("Trip deleted from workspace.", "info");
    router.push("/trips");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Back Link & Actions Bar ─── */}
      <div className="flex items-center justify-between">
        <Link
          href="/trips"
          className="inline-flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider text-neutral-700 hover:text-[#111111] hover:-translate-x-0.5 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Trips</span>
        </Link>

        <div className="flex items-center gap-2">
          <NeoButton
            variant="white"
            size="sm"
            leftIcon={<Share2 className="w-3.5 h-3.5" />}
            onClick={() => setIsShareModalOpen(true)}
          >
            Share Itinerary
          </NeoButton>
          <NeoButton
            variant="white"
            size="sm"
            leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-600" />}
            onClick={() => setIsDeleteModalOpen(true)}
          >
            Delete
          </NeoButton>
        </div>
      </div>

      {/* ─── Trip Header Showcase Banner ─── */}
      <NeoCard className="p-6 md:p-8 bg-[#FFFAF3] border-[4px] border-[#171313] shadow-[6px_6px_0px_#D94B3D]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge status={trip.status} />
              <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#D94B3D]">
                {trip.stops?.map((s) => s.destination?.city).join(" → ")}
              </span>
            </div>

            <h1 className="font-display font-extrabold text-3xl md:text-4xl text-[#171313] leading-tight">
              {trip.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-neutral-700 mt-3">
              <div className="flex items-center gap-1.5 bg-[#FFF4E6] px-2.5 py-1 rounded-lg border border-[#171313]">
                <Calendar className="w-3.5 h-3.5 text-[#D94B3D]" />
                <span>
                  {trip.start_date} to {trip.end_date}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#FFF4E6] px-2.5 py-1 rounded-lg border border-[#171313]">
                <Users className="w-3.5 h-3.5 text-[#D94B3D]" />
                <span>{trip.traveller_count} Travellers</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#FFF4E6] px-2.5 py-1 rounded-lg border border-[#171313]">
                <span>Budget: ₹{trip.budget.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
        </div>
      </NeoCard>

      {/* ─── Main Sub-Navigation Tabs ─── */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Tab Content ─── */}
      <div>
        {activeTab === "map" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#FFFFFF] border-[3px] border-[#111111] rounded-2xl shadow-[4px_4px_0px_#111111]">
              <div>
                <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#4F7DF9]">
                  Live Visual Route Map
                </span>
                <h3 className="font-display font-extrabold text-xl text-[#111111]">
                  Multi-City Journey Pathway & Activity Pins
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="yellow">{trip.stops?.length || 0} Destination Stops</Badge>
                <Badge variant="green">Interactive</Badge>
              </div>
            </div>

            <TripMap
              trip={trip}
              selectedStopId={selectedMapStopId}
              onSelectStop={(s) => setSelectedMapStopId(s.id)}
              height="580px"
              showControls={true}
              showLegend={true}
            />

            {/* Quick Stop Jump Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {trip.stops?.map((stop, i) => (
                <div
                  key={stop.id}
                  onClick={() => setSelectedMapStopId(stop.id)}
                  className={`p-4 rounded-xl border-[3px] border-[#171313] cursor-pointer transition-all ${
                    selectedMapStopId === stop.id
                      ? "bg-[#D94B3D] text-[#FFFFFF] shadow-[4px_4px_0px_#171313] -translate-y-0.5 font-extrabold"
                      : "bg-[#FFFFFF] hover:bg-[#FFF4E6] text-[#171313] shadow-[2px_2px_0px_#171313]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      selectedMapStopId === stop.id ? "bg-[#171313] text-[#FFF4E6]" : "bg-[#171313] text-[#FFFFFF]"
                    }`}>
                      0{i + 1}
                    </span>
                    <span className={`text-xs font-bold ${selectedMapStopId === stop.id ? "text-[#FFF4E6]/90" : "text-neutral-600"}`}>
                      {stop.activities?.length || 0} Activities
                    </span>
                  </div>
                  <h4 className="font-display font-extrabold text-base">
                    {stop.destination?.city || stop.destination?.name}
                  </h4>
                  <span className={`text-xs ${selectedMapStopId === stop.id ? "text-[#FFF4E6]/80" : "text-neutral-600"}`}>
                    {stop.arrival_date} → {stop.departure_date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "builder" && (
          <ItineraryBuilder trip={trip} onUpdateTrip={setTrip} />
        )}

        {activeTab === "timeline" && <ItineraryView trip={trip} />}

        {activeTab === "budget" && <BudgetOverview trip={trip} />}

        {activeTab === "transport" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transport Section */}
            <NeoCard className="p-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111] mb-4">
                <Train className="w-5 h-5 text-[#4F7DF9]" />
                <h3 className="font-display font-extrabold text-lg text-[#111111]">
                  Inter-City Transit & Transport
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-display font-extrabold text-xs uppercase px-2 py-0.5 rounded bg-[#FFD54A] border border-[#111111]">
                      Train
                    </span>
                    <h5 className="font-display font-bold text-sm text-[#111111] mt-1">
                      Mumbai CST → Madgaon Junction (Goa)
                    </h5>
                    <span className="text-xs text-neutral-600">
                      Tejas Express • Departs 05:50 AM
                    </span>
                  </div>
                  <span className="font-display font-extrabold text-sm text-[#111111]">
                    ₹3,400
                  </span>
                </div>

                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-display font-extrabold text-xs uppercase px-2 py-0.5 rounded bg-[#6EE7B7] border border-[#111111]">
                      Cab / Auto
                    </span>
                    <h5 className="font-display font-bold text-sm text-[#111111] mt-1">
                      South Goa → Gokarna Om Beach
                    </h5>
                    <span className="text-xs text-neutral-600">
                      Scenic Coastal Highway (140 km)
                    </span>
                  </div>
                  <span className="font-display font-extrabold text-sm text-[#111111]">
                    ₹2,800
                  </span>
                </div>
              </div>
            </NeoCard>

            {/* Accommodation Section */}
            <NeoCard className="p-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111] mb-4">
                <Building2 className="w-5 h-5 text-[#FFB347]" />
                <h3 className="font-display font-extrabold text-lg text-[#111111]">
                  Booked Stays & Hotels
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-display font-extrabold text-xs uppercase text-neutral-500 block">
                      Mumbai Stop
                    </span>
                    <h5 className="font-display font-bold text-sm text-[#111111]">
                      Colaba Heritage Seafront Hotel
                    </h5>
                    <span className="text-xs text-neutral-600">
                      Sep 10 - Sep 12 (2 Nights)
                    </span>
                  </div>
                  <span className="font-display font-extrabold text-sm text-[#111111]">
                    ₹7,200
                  </span>
                </div>

                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-display font-extrabold text-xs uppercase text-neutral-500 block">
                      Goa Stop
                    </span>
                    <h5 className="font-display font-bold text-sm text-[#111111]">
                      Anjuna Beachside Boutique Villa
                    </h5>
                    <span className="text-xs text-neutral-600">
                      Sep 12 - Sep 15 (3 Nights)
                    </span>
                  </div>
                  <span className="font-display font-extrabold text-sm text-[#111111]">
                    ₹9,500
                  </span>
                </div>
              </div>
            </NeoCard>
          </div>
        )}
      </div>

      {/* Share Modal */}
      <Modal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title="Share Itinerary"
        subtitle={`Generate public link for "${trip.title}"`}
        maxWidth="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold text-neutral-700">
            Publish this itinerary to the community tab and let fellow travelers clone or view your multi-city route.
          </p>

          <div className="flex items-center gap-2 p-3 bg-neutral-100 border-[2px] border-[#111111] rounded-xl text-xs font-mono select-all">
            <span className="truncate">
              {typeof window !== "undefined"
                ? `${window.location.origin}/community?slug=${trip.share_slug || trip.id}`
                : `https://tripzyy.io/community?slug=${trip.share_slug}`}
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => setIsShareModalOpen(false)}
            >
              Close
            </NeoButton>
            <NeoButton
              variant="yellow"
              size="sm"
              leftIcon={hasCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopyShareLink}
            >
              {hasCopied ? "Link Copied!" : "Copy Public Link"}
            </NeoButton>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteTrip}
        title="Delete Trip"
        message={`Are you sure you want to permanently delete "${trip.title}"? All associated stops, activities and recorded expenses will be removed.`}
        confirmLabel="Yes, Delete Trip"
      />
    </div>
  );
}
