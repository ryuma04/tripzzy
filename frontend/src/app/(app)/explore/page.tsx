"use client";

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Navigation,
  Sparkles,
  Bookmark,
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
import { resolvePlaceImageUrl } from "@/lib/place-images";
import type { Destination, Activity, Trip } from "@/types";

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || searchParams?.get("city") || "";

  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userTrips, setUserTrips] = useState<Trip[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedPlaceForTrip, setSelectedPlaceForTrip] = useState<PlaceDetails | null>(null);
  const [isAddToTripOpen, setIsAddToTripOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Google Places State
  const [placesQuery, setPlacesQuery] = useState("");
  const [placesSuggestions, setPlacesSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesResults, setPlacesResults] = useState<PlaceDetails[]>([]);
  const [isPlacesSearching, setIsPlacesSearching] = useState(false);
  const [placesCategory, setPlacesCategory] = useState("");
  const [isAddingPlace, setIsAddingPlace] = useState(false);

  // Autocomplete debounce for Google Places across India
  useEffect(() => {
    if (placesQuery.length < 2) {
      setPlacesSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await placesService.autocomplete(placesQuery, "in");
        if (res.success && res.data?.predictions) {
          setPlacesSuggestions(res.data.predictions);
        }
      } catch (e) {
        console.error("Places autocomplete error:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [placesQuery]);

  // Initial search for places tab
  const handleSearchPlaces = async (query: string, type?: string) => {
    if (!query || query.trim().length < 2) return;
    setIsPlacesSearching(true);
    setPlacesSuggestions([]);
    try {
      const q = query.trim();
      const res = await placesService.search(q, type || undefined);
      if (res.success && res.data?.places) {
        setPlacesResults(res.data.places);
      } else {
        // If text search returned empty, attempt fetching place details if query is a single place
        setPlacesResults([]);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to search Google Places", "error");
    } finally {
      setIsPlacesSearching(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    setPlacesQuery(suggestion.description);
    setPlacesSuggestions([]);
    setIsPlacesSearching(true);

    try {
      // First try fetching detailed place info for the place ID
      if (suggestion.place_id) {
        const detailRes = await placesService.getDetails(suggestion.place_id);
        if (detailRes.success && detailRes.data) {
          setPlacesResults([detailRes.data]);
          setIsPlacesSearching(false);
          return;
        }
      }
      // Otherwise fallback to text search
      await handleSearchPlaces(suggestion.description, placesCategory);
    } catch (e) {
      await handleSearchPlaces(suggestion.description, placesCategory);
    } finally {
      setIsPlacesSearching(false);
    }
  };

  // Load user's saved destinations
  useEffect(() => {
    async function loadSaved() {
      try {
        const res = await destinationService.getSaved();
        if (res.success && res.data) {
          const items = Array.isArray(res.data)
            ? res.data
            : (res.data as any).items || [];
          setSavedIds(new Set(items.map((d: Destination) => d.id)));
        }
      } catch (err) {
        // Unauthenticated or network issue
      }
    }
    loadSaved();
  }, []);

  const handleToggleSave = async (destinationId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isSaved = savedIds.has(destinationId);
    try {
      if (isSaved) {
        const res = await destinationService.unsave(destinationId);
        if (res.success) {
          setSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(destinationId);
            return next;
          });
          showToast("Destination removed from bookmarks.", "info");
        }
      } else {
        const res = await destinationService.save(destinationId);
        if (res.success) {
          setSavedIds((prev) => new Set([...prev, destinationId]));
          showToast("Destination saved to your bookmarks!", "success");
        }
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update bookmark.", "error");
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
          destinationService.search({
            query: searchQuery || undefined,
            category: selectedCategory !== "all" ? selectedCategory : undefined,
            limit: 50,
          }),
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
    { id: "saved", label: `Saved (${savedIds.size})`, icon: <Bookmark className="w-4 h-4" /> },
    { id: "map", label: "Interactive Map", count: destinations.length, icon: <MapPin className="w-4 h-4" /> },
    { id: "google_places", label: "India & Global Places (Google)", count: placesResults.length, icon: <Globe2 className="w-4 h-4" /> },
    { id: "destinations", label: "Destinations & Cities", count: destinations.length },
    { id: "activities", label: "Activities & Tours", count: activities.length },
  ];

  const filteredDestinations =
    activeTab === "activities"
      ? []
      : activeTab === "saved"
      ? destinations.filter((d) => savedIds.has(d.id))
      : destinations;
  const filteredActivities =
    activeTab === "destinations" || activeTab === "saved" ? [] : activities;

  const handleAddActivityToTrip = (act: Activity) => {
    setSelectedActivity(act);
    setSelectedPlaceForTrip(null);
    setIsAddToTripOpen(true);
  };

  const handleAddPlaceToTrip = (place: PlaceDetails) => {
    setSelectedPlaceForTrip(place);
    setSelectedActivity(null);
    setIsAddToTripOpen(true);
  };

  const handleConfirmAddToTrip = async (trip: Trip) => {
    setIsAddingPlace(true);
    try {
      if (selectedPlaceForTrip) {
        // 1. Permanently register / find Destination in PostgreSQL
        const savedDest = await placesService.saveAsDestination(selectedPlaceForTrip);

        // 2. Add Stop to the selected trip
        const stopRes = await tripService.createStop(trip.id, {
          destination_id: savedDest.id,
          arrival_date: trip.start_date,
          departure_date: trip.end_date,
          order: (trip.stops?.length || 0) + 1,
        });

        if (stopRes.success) {
          showToast(`"${savedDest.name}" added as a stop to "${trip.title}"!`, "success");
          router.push(`/trips/${trip.id}`);
        } else {
          showToast(stopRes.message || "Failed to attach stop to trip.", "error");
        }
      } else if (selectedActivity) {
        const actTitle = selectedActivity.title || selectedActivity.name || "Curated Activity";
        const cost = typeof selectedActivity.estimated_cost === "number"
          ? selectedActivity.estimated_cost
          : parseFloat(String(selectedActivity.estimated_cost || 0));
        if (trip.stops && trip.stops.length > 0) {
          await tripService.addActivity(trip.stops[0].id, {
            title: actTitle,
            date: trip.start_date,
            start_time: "10:00",
            end_time: "13:00",
            estimated_cost: isNaN(cost) ? 0 : cost,
            order: 99,
            notes: selectedActivity.description || undefined,
          });
          showToast(`"${actTitle}" added to "${trip.title}"!`, "success");
          router.push(`/trips/${trip.id}`);
        } else {
          showToast("Please add at least one stop to that trip first.", "error");
        }
      }
    } catch (err: any) {
      showToast(err.message || "Failed to attach location to trip.", "error");
    } finally {
      setIsAddingPlace(false);
      setIsAddToTripOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Header ─── */}
      <SectionHeader
        tag="Discovery Hub"
        tagColor="red"
        title="Real Place Search & City Discovery"
        subtitle="Discover real monuments, beaches, heritage spots across India via Google Places, explore curated catalog stops, and plot trips seamlessly."
      />

      {/* ─── Search & Filter Bar ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        <div className="flex-1 max-w-md">
          {activeTab === "google_places" ? (
            <div className="relative w-full">
              <SearchBar
                value={placesQuery}
                onChange={setPlacesQuery}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") handleSearchPlaces(placesQuery, placesCategory);
                }}
                placeholder="Search real places (e.g. Marine Drive Mumbai, Taj Mahal Agra)..."
              />
              {placesSuggestions.length > 0 && (
                <div className="absolute z-30 w-full mt-2 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-72 overflow-y-auto">
                  {placesSuggestions.map((s) => (
                    <button
                      key={s.place_id}
                      type="button"
                      className="w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-[#FFF4E6] transition-colors cursor-pointer"
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <span className="font-display font-extrabold text-sm text-[#171313] block">
                        📍 {s.structured_formatting.main_text}
                      </span>
                      <span className="text-xs text-neutral-500 font-medium">
                        {s.structured_formatting.secondary_text || s.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by city, beach, trek, or heritage..."
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeTab === "google_places" ? (
            <div className="flex items-center gap-2">
              <Dropdown
                value={placesCategory}
                onChange={(val) => {
                  setPlacesCategory(val);
                  if (placesQuery) handleSearchPlaces(placesQuery, val);
                }}
                options={[
                  { value: "", label: "All Attractions" },
                  { value: "tourist_attraction", label: "🏛️ Tourist Attraction" },
                  { value: "point_of_interest", label: "📍 Points of Interest" },
                  { value: "natural_feature", label: "🌿 Nature & Beaches" },
                  { value: "hindu_temple", label: "🛕 Religious & Heritage" },
                  { value: "restaurant", label: "🍴 Food & Dining" },
                  { value: "shopping_mall", label: "🛍️ Shopping" },
                ]}
              />
              <NeoButton
                variant="primary"
                size="md"
                onClick={() => handleSearchPlaces(placesQuery, placesCategory)}
                isLoading={isPlacesSearching}
                leftIcon={<Search className="w-4 h-4 stroke-[2.5]" />}
              >
                Search Places
              </NeoButton>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Google Places Discovery Tab ─── */}
      {activeTab === "google_places" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
            <div>
              <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#E51919]">
                Live Google Places Discovery
              </span>
              <h3 className="font-display font-extrabold text-xl text-[#171313]">
                Real Place Information, Photos & Coordinates
              </h3>
            </div>
            <Badge variant="red">{placesResults.length} Real Places Found</Badge>
          </div>

          {isPlacesSearching ? (
            <div className="text-center py-16 bg-white border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFF4E6] border-2 border-[#171313] rounded-xl font-display font-extrabold text-sm shadow-[2px_2px_0px_#171313]">
                <Sparkles className="w-4 h-4 text-[#E51919] animate-spin" />
                Discovering real Google Places across India...
              </div>
            </div>
          ) : placesResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {placesResults.map((place) => {
                const placeName = place.displayName?.text || place.formattedAddress || "Place";
                const imageUrl = resolvePlaceImageUrl(placeName, place.photos);
                const hasCoords = place.location?.latitude && place.location?.longitude;

                return (
                  <NeoCard
                    key={place.id}
                    interactive
                    className="p-0 overflow-hidden flex flex-col justify-between bg-white border-[3px] border-[#171313]"
                  >
                    {/* Place Photo with Real Fallbacks */}
                    <div className="relative h-48 w-full border-b-[3px] border-[#171313] bg-neutral-100 overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={placeName}
                        className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80";
                        }}
                      />
                      {place.rating && (
                        <span className="absolute top-3 right-3 text-xs font-display font-extrabold flex items-center gap-1 px-2.5 py-1 bg-[#FFF4E6] border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]">
                          <Star className="w-3.5 h-3.5 fill-[#E51919] text-[#E51919]" />
                          {place.rating} ({place.userRatingCount || 0})
                        </span>
                      )}
                      {hasCoords && (
                        <span className="absolute bottom-3 left-3 text-[10px] font-display font-extrabold px-2 py-0.5 bg-[#171313] text-[#FFF4E6] rounded border border-white">
                          📍 {place.location!.latitude.toFixed(4)}, {place.location!.longitude.toFixed(4)}
                        </span>
                      )}
                    </div>

                    {/* Place Details Content */}
                    <div className="p-5 flex flex-col flex-1 justify-between gap-4">
                      <div>
                        <h4 className="font-display font-extrabold text-xl text-[#171313] leading-snug">
                          {placeName}
                        </h4>
                        <span className="text-xs font-semibold text-neutral-600 block mt-1 line-clamp-2">
                          {place.formattedAddress}
                        </span>
                      </div>

                      <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between gap-2">
                        <NeoButton
                          variant="yellow"
                          size="sm"
                          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
                          onClick={() => handleAddPlaceToTrip(place)}
                        >
                          Add to Trip
                        </NeoButton>

                        {place.googleMapsUri && (
                          <a
                            href={place.googleMapsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-neutral-50 hover:bg-neutral-100 border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]"
                            title="Open in Google Maps"
                          >
                            <Navigation className="w-4 h-4 text-[#171313]" />
                          </a>
                        )}
                      </div>
                    </div>
                  </NeoCard>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] flex flex-col items-center gap-3">
              <Globe2 className="w-12 h-12 text-neutral-300" />
              <h4 className="font-display font-extrabold text-lg text-[#171313]">
                Search Any Place across India
              </h4>
              <p className="text-xs text-neutral-600 max-w-md">
                Try searching for <strong>Marine Drive Mumbai</strong>, <strong>Taj Mahal Agra</strong>,{" "}
                <strong>Baga Beach Goa</strong>, <strong>Mysore Palace</strong>, <strong>Lalbagh Bengaluru</strong>, or any Indian city.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {["Marine Drive Mumbai", "Taj Mahal Agra", "Baga Beach Goa", "Mysore Palace", "Lalbagh Bengaluru"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setPlacesQuery(s);
                      handleSearchPlaces(s);
                    }}
                    className="px-3 py-1 bg-[#FFF4E6] border-2 border-[#171313] rounded-lg text-xs font-display font-bold shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Map View Tab ─── */}
      {activeTab === "map" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
            <div>
              <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#E51919]">
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
            height="580px"
            showControls={true}
            showLegend={true}
          />
        </div>
      )}

      {/* ─── Destinations Section ─── */}
      {activeTab !== "activities" && activeTab !== "map" && activeTab !== "google_places" && filteredDestinations.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-display font-extrabold text-lg uppercase tracking-wide text-neutral-800 flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#E51919]" />
            Destinations & Regional Stops ({filteredDestinations.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDestinations.map((dest) => (
              <NeoCard key={dest.id} interactive className="p-0 overflow-hidden flex flex-col justify-between bg-white border-[3px] border-[#171313]">
                <div className="relative h-44 w-full border-b-[3px] border-[#171313] bg-neutral-100">
                  <img
                    src={resolvePlaceImageUrl(dest.name, undefined, dest.image_url)}
                    alt={dest.name}
                    className="object-cover w-full h-full"
                  />
                  <span className="absolute top-3 left-3 text-[10px] font-display font-extrabold uppercase px-2.5 py-1 bg-[#FFF4E6] border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313]">
                    {dest.region || dest.country}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleToggleSave(dest.id, e)}
                    className={`absolute top-3 right-3 p-2 rounded-xl border-2 border-[#171313] shadow-[2px_2px_0px_#171313] transition-all cursor-pointer ${
                      savedIds.has(dest.id)
                        ? "bg-[#E51919] text-white"
                        : "bg-[#FFF4E6] text-[#171313] hover:bg-white"
                    }`}
                    title={savedIds.has(dest.id) ? "Remove from bookmarks" : "Save destination"}
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                  </button>
                </div>

                <div className="p-5 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h4 className="font-display font-extrabold text-xl text-[#171313]">
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

      {/* ─── Activities Section ─── */}
      {activeTab !== "destinations" && activeTab !== "google_places" && filteredActivities.length > 0 && (
        <div className="flex flex-col gap-4 mt-4">
          <h3 className="font-display font-extrabold text-lg uppercase tracking-wide text-neutral-800 flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#E51919]" />
            Curated Activities & Experiences ({filteredActivities.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActivities.map((act) => {
              const title = act.title || act.name || "Curated Experience";
              const cost = typeof act.estimated_cost === "number"
                ? act.estimated_cost
                : parseFloat(String(act.estimated_cost || 0));
              const durationStr = act.duration_minutes
                ? (act.duration_minutes < 60 ? `${act.duration_minutes} mins` : `${(act.duration_minutes / 60) % 1 === 0 ? act.duration_minutes / 60 : (act.duration_minutes / 60).toFixed(1)} hours`)
                : (act.duration_hours ? `${act.duration_hours} hours` : "2 hours");

              return (
                <div
                  key={act.id}
                  className="neo-card-interactive p-4 md:p-5 flex flex-col sm:flex-row gap-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]"
                >
                  <div className="relative w-full sm:w-32 h-32 rounded-xl border-2 border-[#171313] overflow-hidden flex-shrink-0 bg-neutral-100">
                    <img
                      src={resolvePlaceImageUrl(title, undefined, act.image_url)}
                      alt={title}
                      className="object-cover w-full h-full"
                    />
                    <span className="absolute top-2 left-2 text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-white border border-[#171313] rounded">
                      {act.category}
                    </span>
                  </div>

                  <div className="flex flex-col justify-between flex-1 gap-2">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-display font-extrabold text-base text-[#171313] leading-snug">
                          {title}
                        </h4>
                        <span className="font-display font-extrabold text-base text-[#E51919] whitespace-nowrap">
                          ₹{(isNaN(cost) ? 0 : cost).toLocaleString("en-IN")}
                        </span>
                      </div>

                      {act.destination_name && (
                        <span className="text-[11px] font-bold text-neutral-500 block mt-0.5">
                          📍 {act.destination_name}
                        </span>
                      )}

                      <p className="text-xs font-medium text-neutral-600 line-clamp-2 mt-1">
                        {act.description}
                      </p>

                      <div className="flex items-center gap-3 text-xs font-bold text-neutral-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {durationStr}
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
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Add Location / Activity to Trip Modal ─── */}
      <Modal
        isOpen={isAddToTripOpen}
        onClose={() => setIsAddToTripOpen(false)}
        title="Add to Trip Itinerary"
        subtitle={
          selectedPlaceForTrip
            ? `Attach "${selectedPlaceForTrip.displayName?.text || selectedPlaceForTrip.formattedAddress}" as a destination stop`
            : `Select which trip to add "${selectedActivity?.name}"`
        }
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
                  disabled={isAddingPlace}
                  onClick={() => handleConfirmAddToTrip(t)}
                  className="flex items-center justify-between p-3.5 bg-white border-2 border-[#171313] rounded-xl hover:bg-[#FFF4E6] transition-colors text-left cursor-pointer shadow-[2px_2px_0px_#171313]"
                >
                  <div>
                    <h5 className="font-display font-extrabold text-sm text-[#171313]">
                      {t.title}
                    </h5>
                    <span className="text-xs text-neutral-600 font-medium">
                      {t.start_date} → {t.end_date} • {t.stops?.length || 0} stops
                    </span>
                  </div>
                  <NeoButton variant="cream" size="sm">
                    {isAddingPlace ? "Adding..." : "Select"}
                  </NeoButton>
                </button>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-neutral-500 font-bold bg-neutral-50 border-2 border-[#171313] rounded-xl">
                No existing trips found.{" "}
                <Link href="/trips/new" className="text-[#E51919] underline font-extrabold ml-1">
                  Create a new trip first!
                </Link>
              </div>
            )}
          </div>
        </div>
      </Modal>
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
