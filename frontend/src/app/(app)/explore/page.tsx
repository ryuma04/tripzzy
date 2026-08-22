"use client";

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  MapPin,
  Clock,
  Wallet,
  Plus,
  Compass,
  Filter,
  Check,
  Star,
  Globe2,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import { Tabs } from "@/components/ui/tabs";
import { Dropdown } from "@/components/ui/dropdown";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { TripMap } from "@/components/map";
import { mockDestinations, mockActivities, mockTrips } from "@/data/mock";
import type { Destination, Activity } from "@/types";

function ExploreContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || searchParams?.get("city") || "";

  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isAddToTripOpen, setIsAddToTripOpen] = useState(false);

  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery);
  }, [initialQuery]);

  const tabs = [
    { id: "all", label: "All Catalog", count: mockDestinations.length + mockActivities.length },
    { id: "map", label: "Interactive Map", count: mockDestinations.length, icon: <MapPin className="w-4 h-4" /> },
    { id: "destinations", label: "Destinations & Cities", count: mockDestinations.length },
    { id: "activities", label: "Activities & Tours", count: mockActivities.length },
  ];

  // Filtering Destinations
  const filteredDestinations = mockDestinations.filter((d) => {
    if (activeTab === "activities") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtering Activities
  const filteredActivities = mockActivities.filter((a) => {
    if (activeTab === "destinations") return false;
    if (selectedCategory !== "all" && a.category.toLowerCase() !== selectedCategory.toLowerCase())
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAddActivityToTrip = (act: Activity) => {
    setSelectedActivity(act);
    setIsAddToTripOpen(true);
  };

  const handleConfirmAddToTrip = (tripTitle: string) => {
    setIsAddToTripOpen(false);
    showToast(`"${selectedActivity?.name}" added to "${tripTitle}"!`, "success");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Header ─── */}
      <SectionHeader
        tag="Catalog"
        tagColor="red"
        title="Activity Search & City Discovery"
        subtitle="Search dynamic destinations across regions, explore curated experiences, and add activities to your itineraries."
      />

      {/* ─── Search & Filter Bar (Wireframe Screen 8 Header) ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        <div className="flex-1 max-w-md">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by city, beach, trek, or heritage..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Dropdown
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[
              { value: "all", label: "All Categories" },
              { value: "adventure", label: "Adventure" },
              { value: "historical", label: "Historical" },
              { value: "food & leisure", label: "Food & Leisure" },
              { value: "trekking", label: "Trekking" },
              { value: "sightseeing", label: "Sightseeing" },
            ]}
          />
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Map View Tab ─── */}
      {activeTab === "map" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
            <div>
              <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#D94B3D]">
                Geographic Catalog Discovery
              </span>
              <h3 className="font-display font-extrabold text-xl text-[#171313]">
                Interactive India & Global Destination Map
              </h3>
            </div>
            <Badge variant="red">{filteredDestinations.length} Cities Plotted</Badge>
          </div>

          <TripMap
            destinations={filteredDestinations}
            activities={filteredActivities}
            height="560px"
            showControls={true}
            showLegend={true}
          />
        </div>
      )}

      {/* ─── Destinations Section (Wireframe Option & Details cards) ─── */}
      {activeTab !== "activities" && activeTab !== "map" && filteredDestinations.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-display font-extrabold text-lg uppercase tracking-wide text-neutral-800 flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#D94B3D]" />
            Destinations & Regional Stops ({filteredDestinations.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDestinations.map((dest) => (
              <NeoCard key={dest.id} interactive className="p-0 overflow-hidden flex flex-col justify-between">
                <div className="relative h-44 w-full border-b-[3px] border-[#111111] bg-neutral-100">
                  <Image
                    src={dest.image_url || "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600&auto=format&fit=crop&q=80"}
                    alt={dest.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-cover"
                    unoptimized
                  />
                  <span className="absolute top-3 left-3 text-[10px] font-extrabold uppercase px-2.5 py-1 bg-[#FFD54A] border-2 border-[#111111] rounded-md shadow-[2px_2px_0px_#111111]">
                    {dest.region}
                  </span>
                </div>

                <div className="p-5 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h4 className="font-display font-extrabold text-xl text-[#111111]">
                      {dest.name}
                    </h4>
                    <span className="text-xs font-bold text-neutral-500 block mb-2">
                      {dest.country}
                    </span>
                    <p className="text-xs font-medium text-neutral-600 line-clamp-2">
                      {dest.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between">
                    <Link href={`/trips/new`}>
                      <NeoButton variant="yellow" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                        Plan Trip Here
                      </NeoButton>
                    </Link>
                  </div>
                </div>
              </NeoCard>
            ))}
          </div>
        </div>
      )}

      {/* ─── Activities Section (Wireframe Option and its details) ─── */}
      {activeTab !== "destinations" && filteredActivities.length > 0 && (
        <div className="flex flex-col gap-4 mt-4">
          <h3 className="font-display font-extrabold text-lg uppercase tracking-wide text-neutral-800 flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#FFB347]" />
            Curated Activities & Experiences ({filteredActivities.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActivities.map((act) => (
              <div
                key={act.id}
                className="neo-card-interactive p-4 md:p-5 flex flex-col sm:flex-row gap-4 bg-[#FFFFFF]"
              >
                <div className="relative w-full sm:w-32 h-32 rounded-xl border-2 border-[#111111] overflow-hidden flex-shrink-0 bg-neutral-100">
                  <Image
                    src={act.image_url || "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&auto=format&fit=crop&q=80"}
                    alt={act.name}
                    fill
                    sizes="150px"
                    className="object-cover"
                    unoptimized
                  />
                  <span className="absolute top-2 left-2 text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-white border border-[#111111] rounded">
                    {act.category}
                  </span>
                </div>

                <div className="flex flex-col justify-between flex-1 gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display font-extrabold text-base text-[#111111] leading-snug">
                        {act.name}
                      </h4>
                      <span className="font-display font-extrabold text-base text-[#111111] whitespace-nowrap">
                        ₹{act.estimated_cost}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-neutral-600 line-clamp-2 mt-1">
                      {act.description}
                    </p>

                    <div className="flex items-center gap-3 text-xs font-bold text-neutral-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {act.duration_hours} hours
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <NeoButton
                      variant="yellow"
                      size="sm"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => handleAddActivityToTrip(act)}
                    >
                      Add to Trip
                    </NeoButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Activity to Trip Modal */}
      {selectedActivity && (
        <Modal
          isOpen={isAddToTripOpen}
          onClose={() => setIsAddToTripOpen(false)}
          title="Add to Itinerary"
          subtitle={`Select which trip to add "${selectedActivity.name}"`}
          maxWidth="md"
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-neutral-600">
              Select one of your existing upcoming or draft trips:
            </p>

            <div className="flex flex-col gap-2">
              {mockTrips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleConfirmAddToTrip(t.title)}
                  className="flex items-center justify-between p-3.5 bg-neutral-50 border-2 border-[#111111] rounded-xl hover:bg-[#FFD54A]/30 transition-colors text-left cursor-pointer"
                >
                  <div>
                    <h5 className="font-display font-extrabold text-sm text-[#111111]">
                      {t.title}
                    </h5>
                    <span className="text-xs text-neutral-600">
                      {t.start_date} → {t.end_date} • {t.stops.length} stops
                    </span>
                  </div>
                  <NeoButton variant="white" size="sm">
                    Select
                  </NeoButton>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="p-8 font-display font-bold">Loading explore catalog...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
