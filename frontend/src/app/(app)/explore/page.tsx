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
import { destinationService } from "@/services/destinations";
import { activityService } from "@/services/activities";
import { tripService } from "@/services/trips";
import { placesService, PlaceSuggestion, PlaceDetails } from "@/services/places";
import type { Destination, Activity, Trip } from "@/types";

function ExploreContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || searchParams?.get("city") || "";

  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userTrips, setUserTrips] = useState<Trip[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isAddToTripOpen, setIsAddToTripOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [placesQuery, setPlacesQuery] = useState("");
  const [placesSuggestions, setPlacesSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesResults, setPlacesResults] = useState<PlaceDetails[]>([]);
  const [isPlacesSearching, setIsPlacesSearching] = useState(false);
  const [placesCategory, setPlacesCategory] = useState("");

  useEffect(() => {
    if (activeTab !== "google_places" || placesQuery.length < 3) {
      setPlacesSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await placesService.autocomplete(placesQuery);
        if (res.success && res.data?.predictions) {
          setPlacesSuggestions(res.data.predictions);
        }
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [placesQuery, activeTab]);

  const handleSearchPlaces = async (query: string, type: string) => {
    setIsPlacesSearching(true);
    try {
      const q = query + (type ? ` ${type}` : "");
      const res = await placesService.search(q, "tourist_attraction");
      if (res.success && res.data?.places) {
        setPlacesResults(res.data.places);
      } else {
        setPlacesResults([]);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to search places", "error");
    } finally {
      setIsPlacesSearching(false);
    }
  };


  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    async function fetchCatalog() {
      setIsLoading(true);
      try {
        const [destsRes, actsRes, tripsRes] = await Promise.all([
          destinationService.search({ query: searchQuery || undefined, limit: 50 }),
          activityService.search({
            query: searchQuery || undefined,
            category: selectedCategory !== "all" ? selectedCategory : undefined,
            limit: 50,
          }),
          tripService.list({ limit: 20 }),
        ]);

        if (destsRes.success && destsRes.data) {
          const items = Array.isArray(destsRes.data)
            ? destsRes.data
            : (destsRes.data as any).items || [];
          setDestinations(items);
        }

        if (actsRes.success && actsRes.data) {
          const items = Array.isArray(actsRes.data)
            ? actsRes.data
            : (actsRes.data as any).items || [];
          setActivities(items);
        }

        if (tripsRes.success && tripsRes.data) {
          const items = Array.isArray(tripsRes.data)
            ? tripsRes.data
            : (tripsRes.data as any).items || [];
          setUserTrips(items);
        }
      } catch (err) {
        console.error("Failed to load explore catalog:", err);
      } finally {
        setIsLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchCatalog();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  const tabs = [
    { id: "all", label: "All Catalog", count: destinations.length + activities.length },
    { id: "map", label: "Interactive Map", count: destinations.length, icon: <MapPin className="w-4 h-4" /> },
    { id: "destinations", label: "Destinations & Cities", count: destinations.length },
    { id: "activities", label: "Activities & Tours", count: activities.length },
    { id: "google_places", label: "Global Discovery (Google)", count: placesResults.length, icon: <Globe2 className="w-4 h-4" /> },
  ];

  const filteredDestinations = activeTab === "activities" ? [] : destinations;
  const filteredActivities = activeTab === "destinations" ? [] : activities;

  const handleAddActivityToTrip = (act: Activity) => {
    setSelectedActivity(act);
    setIsAddToTripOpen(true);
  };

  const handleConfirmAddToTrip = async (trip: Trip) => {
    if (!selectedActivity) return;
    try {
      if (trip.stops && trip.stops.length > 0) {
        await tripService.addActivity(trip.stops[0].id, {
          title: selectedActivity.name,
          date: trip.start_date,
          start_time: "10:00",
          end_time: "13:00",
          estimated_cost: selectedActivity.estimated_cost || 0,
          order: 99,
          notes: selectedActivity.description,
        });
        showToast(`"${selectedActivity.name}" added to "${trip.title}"!`, "success");
      } else {
        showToast("Please add at least one stop to that trip first.", "error");
      }
    } catch {
      showToast("Failed to attach activity to trip.", "error");
    } finally {
      setIsAddToTripOpen(false);
    }
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
      {activeTab !== "activities" && activeTab !== "map" && activeTab !== "google_places" && filteredDestinations.length > 0 && (
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
      {activeTab !== "destinations" && activeTab !== "google_places" && filteredActivities.length > 0 && (
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


      {/* ─── Google Places Discovery Tab ─── */}
      {activeTab === "google_places" && (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="relative flex-1 w-full">
              <SearchBar
                value={placesQuery}
                onChange={setPlacesQuery}
                placeholder="Search any global city or region (e.g., Mumbai, Paris)..."
              />
              {placesSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white border-2 border-[#111] rounded-xl shadow-[4px_4px_0px_#111]">
                  {placesSuggestions.map(s => (
                    <button
                      key={s.place_id}
                      className="w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-[#FFFAF3] transition-colors"
                      onClick={() => {
                        setPlacesQuery(s.description);
                        setPlacesSuggestions([]);
                        handleSearchPlaces(s.description, placesCategory);
                      }}
                    >
                      <span className="font-bold text-[#111] block">{s.structured_formatting.main_text}</span>
                      <span className="text-xs text-neutral-500">{s.structured_formatting.secondary_text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Dropdown
              value={placesCategory}
              onChange={(val) => {
                setPlacesCategory(val);
                if (placesQuery) handleSearchPlaces(placesQuery, val);
              }}
              options={[
                { value: "", label: "All Attractions" },
                { value: "Adventure", label: "🏔️ Adventure" },
                { value: "Nature", label: "🌿 Nature" },
                { value: "Historical", label: "🏛️ Historical" },
                { value: "Beaches", label: "🏖️ Beaches" },
                { value: "Religious", label: "🛕 Religious" },
                { value: "Food", label: "🍴 Food" },
                { value: "Shopping", label: "🛍️ Shopping" },
              ]}
            />
          </div>

          {isPlacesSearching ? (
            <div className="text-center py-12 font-bold text-neutral-500">Searching Google Places...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {placesResults.map((place) => (
                <NeoCard key={place.id} interactive className="p-0 overflow-hidden flex flex-col justify-between">
                  <div className="relative h-44 w-full border-b-[3px] border-[#111111] bg-neutral-100 flex items-center justify-center">
                    {place.photos && place.photos.length > 0 ? (
                      <img
                        src={`https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}`}
                        alt={place.displayName.text}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <Globe2 className="w-12 h-12 text-neutral-300" />
                    )}
                    {place.rating && (
                      <span className="absolute top-3 right-3 text-xs font-extrabold flex items-center gap-1 px-2.5 py-1 bg-[#FFD54A] border-2 border-[#111111] rounded-md shadow-[2px_2px_0px_#111111]">
                        <Star className="w-3.5 h-3.5 fill-[#111]" />
                        {place.rating} ({place.userRatingCount || 0})
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1 justify-between gap-3">
                    <div>
                      <h4 className="font-display font-extrabold text-xl text-[#111111]">
                        {place.displayName.text}
                      </h4>
                      <span className="text-xs font-bold text-neutral-500 block mb-2 line-clamp-2">
                        {place.formattedAddress}
                      </span>
                    </div>
                    <div className="pt-3 border-t-2 border-neutral-100">
                      <NeoButton variant="yellow" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => handleAddActivityToTrip({
                        id: place.id,
                        name: place.displayName.text,
                        description: place.formattedAddress,
                        estimated_cost: 0,
                        duration_hours: 2,
                        category: placesCategory || "Attraction"
                      } as Activity)}>
                        Add to Trip
                      </NeoButton>
                    </div>
                  </div>
                </NeoCard>
              ))}
            </div>
          )}
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
              {userTrips.length > 0 ? (
                userTrips.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleConfirmAddToTrip(t)}
                    className="flex items-center justify-between p-3.5 bg-neutral-50 border-2 border-[#111111] rounded-xl hover:bg-[#FFD54A]/30 transition-colors text-left cursor-pointer"
                  >
                    <div>
                      <h5 className="font-display font-extrabold text-sm text-[#111111]">
                        {t.title}
                      </h5>
                      <span className="text-xs text-neutral-600">
                        {t.start_date} → {t.end_date} • {t.stops?.length || 0} stops
                      </span>
                    </div>
                    <NeoButton variant="white" size="sm">
                      Select
                    </NeoButton>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-neutral-500 font-bold">
                  No expeditions found. Create a trip first!
                </div>
              )}
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
