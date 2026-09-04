"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  MapPin,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Wallet,
  ArrowUpDown,
  MoveUp,
  MoveDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Globe2,
  Scale,
  Hotel,
  Train,
  Plane,
  Bus,
  Car,
  Ship,
  ExternalLink,
  Navigation,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SearchBar } from "@/components/ui/search-bar";
import { useToast } from "@/components/ui/toast";
import { tripService } from "@/services/trips";
import { destinationService } from "@/services/destinations";
import { placesService, PlaceSuggestion } from "@/services/places";
import { resolvePlaceImageUrl } from "@/lib/place-images";
import { CompareAlternatives } from "@/components/itinerary/compare-alternatives";
import type {
  Trip,
  TripStop,
  ItineraryActivity,
  Destination,
  ServiceType,
  Accommodation,
  Transport,
  TransportType,
} from "@/types";

/** Nights between two ISO dates; at least one, so a day trip still prices. */
function nightsBetween(arrival?: string, departure?: string): number {
  if (!arrival || !departure) return 1;
  const ms = new Date(departure).getTime() - new Date(arrival).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

interface ComparisonTarget {
  city: string;
  serviceType: ServiceType;
  onDate?: string;
  nights: number;
}

interface ItineraryBuilderProps {
  trip: Trip;
  onUpdateTrip?: (updated: Trip) => void;
}

export const ItineraryBuilder: React.FC<ItineraryBuilderProps> = ({
  trip,
  onUpdateTrip,
}) => {
  const { showToast } = useToast();
  const [stops, setStops] = useState<TripStop[]>(trip.stops || []);
  const [transports, setTransports] = useState<Transport[]>(trip.transports || []);
  const [comparing, setComparing] = useState<ComparisonTarget | null>(null);
  const [availableDestinations, setAvailableDestinations] = useState<Destination[]>([]);

  // Modal for adding a new section/stop
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [selectedDestId, setSelectedDestId] = useState<string>("");
  const [arrivalDate, setArrivalDate] = useState(trip.start_date || "2026-10-12");
  const [departureDate, setDepartureDate] = useState(trip.end_date || "2026-10-18");

  // Google Places search for stop creation
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);

  // Modal for adding an activity to a specific stop
  const [activeStopForActivity, setActiveStopForActivity] = useState<string | null>(null);
  const [actTitle, setActTitle] = useState("");
  const [actDate, setActDate] = useState(trip.start_date || "2026-10-12");
  const [actStart, setActStart] = useState("10:00");
  const [actEnd, setActEnd] = useState("13:00");
  const [actCost, setActCost] = useState(500);

  // Modal for adding an accommodation to a specific stop
  const [activeStopForAcc, setActiveStopForAcc] = useState<string | null>(null);
  const [accName, setAccName] = useState("");
  const [accCheckIn, setAccCheckIn] = useState(trip.start_date || "2026-10-12");
  const [accCheckOut, setAccCheckOut] = useState(trip.end_date || "2026-10-18");
  const [accCost, setAccCost] = useState(3500);
  const [accAddress, setAccAddress] = useState("");
  const [accUrl, setAccUrl] = useState("");
  const [accNotes, setAccNotes] = useState("");

  // Modal for adding transport leg
  const [isAddTransportOpen, setIsAddTransportOpen] = useState(false);
  const [transType, setTransType] = useState<TransportType>("train");
  const [transOriginStopId, setTransOriginStopId] = useState("");
  const [transDestStopId, setTransDestStopId] = useState("");
  const [transDepTime, setTransDepTime] = useState(`${trip.start_date || "2026-10-12"}T09:00`);
  const [transArrTime, setTransArrTime] = useState(`${trip.start_date || "2026-10-12"}T14:00`);
  const [transCost, setTransCost] = useState(1200);
  const [transNotes, setTransNotes] = useState("");

  useEffect(() => {
    async function loadDestinations() {
      try {
        const res = await destinationService.search({ limit: 50 });
        if (res.success && res.data) {
          const items = Array.isArray(res.data)
            ? res.data
            : (res.data as any).items || [];
          setAvailableDestinations(items);
          if (items.length > 0 && !selectedDestId) {
            setSelectedDestId(items[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load destinations in builder:", err);
      }
    }
    loadDestinations();
  }, []);

  // Places autocomplete effect
  useEffect(() => {
    if (placeQuery.length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await placesService.autocomplete(placeQuery, "in");
        if (res.success && res.data?.predictions) {
          setPlaceSuggestions(res.data.predictions);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  // Sync stops if trip changes
  useEffect(() => {
    if (trip.stops) {
      setStops(trip.stops);
    }
  }, [trip]);

  // Handle Google place selection for stop
  const handleSelectGooglePlaceForStop = async (suggestion: PlaceSuggestion) => {
    setIsResolvingPlace(true);
    setPlaceQuery(suggestion.description);
    setPlaceSuggestions([]);
    try {
      let placeDetails = null;
      if (suggestion.place_id) {
        const detailRes = await placesService.getDetails(suggestion.place_id);
        if (detailRes.success && detailRes.data) {
          placeDetails = detailRes.data;
        }
      }

      if (!placeDetails) {
        const searchRes = await placesService.search(suggestion.description);
        if (searchRes.success && searchRes.data?.places && searchRes.data.places.length > 0) {
          placeDetails = searchRes.data.places[0];
        }
      }

      if (placeDetails) {
        const dest = await placesService.saveAsDestination(placeDetails);
        setSelectedDestId(dest.id);
        setAvailableDestinations((prev) => [dest, ...prev.filter((d) => d.id !== dest.id)]);
        showToast(`Selected "${dest.name}"!`, "success");
      } else {
        showToast("Could not retrieve place details.", "error");
      }
    } catch (e) {
      console.error("Failed to resolve place for stop:", e);
      showToast("Failed to resolve place.", "error");
    } finally {
      setIsResolvingPlace(false);
    }
  };

  // Add new section/stop
  const handleAddSection = async () => {
    if (!selectedDestId) return;
    try {
      const res = await tripService.createStop(trip.id, {
        destination_id: selectedDestId,
        arrival_date: arrivalDate,
        departure_date: departureDate,
        order: stops.length,
      });

      if (res.success && res.data) {
        const updated = [...stops, res.data];
        setStops(updated);
        setIsAddSectionOpen(false);
        setPlaceQuery("");
        showToast("Added stop section to itinerary!", "success");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
      } else {
        showToast(res.message || "Failed to add stop.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add stop.", "error");
    }
  };

  // Remove stop
  const handleRemoveStop = async (stopId: string) => {
    try {
      const res = await tripService.deleteStop(stopId);
      if (res.success) {
        const updated = stops.filter((s) => s.id !== stopId);
        setStops(updated);
        showToast("Stop section removed.", "info");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
      } else {
        showToast(res.message || "Failed to delete stop.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete stop.", "error");
    }
  };

  // Reorder stops
  const handleMoveStop = async (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === stops.length - 1)
    ) {
      return;
    }

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const reordered = [...stops];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    // Update order property
    const updatedWithOrder = reordered.map((s, idx) => ({
      ...s,
      order: idx + 1,
    }));

    setStops(updatedWithOrder);

    try {
      await tripService.reorderStops(trip.id, updatedWithOrder.map((s) => s.id));
      showToast("Stops reordered successfully.", "info");
      if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updatedWithOrder });
    } catch (err) {
      console.error("Failed to reorder stops:", err);
    }
  };

  // Add activity to a stop
  const handleAddActivity = async () => {
    if (!activeStopForActivity || !actTitle) return;

    try {
      const res = await tripService.addActivity(activeStopForActivity, {
        title: actTitle,
        date: actDate,
        start_time: actStart,
        end_time: actEnd,
        estimated_cost: Number(actCost),
        order: 99,
      });

      if (res.success && res.data) {
        const updatedStops = stops.map((s) => {
          if (s.id === activeStopForActivity) {
            return {
              ...s,
              activities: [...(s.activities || []), res.data as ItineraryActivity],
            };
          }
          return s;
        });

        setStops(updatedStops);
        setActiveStopForActivity(null);
        setActTitle("");
        showToast("Activity added to stop!", "success");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updatedStops });
      } else {
        showToast(res.message || "Failed to add activity.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add activity.", "error");
    }
  };

  // Delete activity
  const handleDeleteActivity = async (stopId: string, activityId: string) => {
    try {
      const res = await tripService.deleteActivity(activityId);
      if (res.success) {
        const updatedStops = stops.map((s) => {
          if (s.id === stopId) {
            return {
              ...s,
              activities: (s.activities || []).filter((a) => a.id !== activityId),
            };
          }
          return s;
        });

        setStops(updatedStops);
        showToast("Activity removed.", "info");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updatedStops });
      } else {
        showToast(res.message || "Failed to delete activity.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete activity.", "error");
    }
  };

  // Sync transports if trip changes
  useEffect(() => {
    if (trip.transports) {
      setTransports(trip.transports);
    }
  }, [trip]);

  // Add accommodation to stop
  const handleAddAccommodation = async () => {
    if (!activeStopForAcc || !accName.trim()) return;
    try {
      const res = await tripService.createAccommodation(activeStopForAcc, {
        name: accName.trim(),
        check_in: accCheckIn,
        check_out: accCheckOut,
        estimated_cost: Number(accCost),
        address: accAddress.trim() || undefined,
        booking_url: accUrl.trim() || undefined,
        notes: accNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        const updatedStops = stops.map((s) => {
          if (s.id === activeStopForAcc) {
            return {
              ...s,
              accommodations: [...(s.accommodations || []), res.data as Accommodation],
            };
          }
          return s;
        });

        setStops(updatedStops);
        setActiveStopForAcc(null);
        setAccName("");
        setAccAddress("");
        setAccUrl("");
        setAccNotes("");
        showToast("Accommodation added to stop!", "success");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updatedStops, transports });
      } else {
        showToast(res.message || "Failed to add accommodation.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add accommodation.", "error");
    }
  };

  // Delete accommodation
  const handleDeleteAccommodation = async (stopId: string, accommodationId: string) => {
    try {
      const res = await tripService.deleteAccommodation(accommodationId);
      if (res.success) {
        const updatedStops = stops.map((s) => {
          if (s.id === stopId) {
            return {
              ...s,
              accommodations: (s.accommodations || []).filter((a) => a.id !== accommodationId),
            };
          }
          return s;
        });

        setStops(updatedStops);
        showToast("Accommodation removed.", "info");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updatedStops, transports });
      } else {
        showToast(res.message || "Failed to delete accommodation.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete accommodation.", "error");
    }
  };

  // Add transport leg
  const handleAddTransport = async () => {
    if (!transOriginStopId || !transDestStopId) {
      showToast("Please select origin and destination stops.", "error");
      return;
    }
    if (transOriginStopId === transDestStopId) {
      showToast("Origin and destination stops must be different.", "error");
      return;
    }

    try {
      const depIso = new Date(transDepTime).toISOString();
      const arrIso = new Date(transArrTime).toISOString();
      const res = await tripService.createTransport(trip.id, {
        transport_type: transType,
        origin_stop_id: transOriginStopId,
        destination_stop_id: transDestStopId,
        departure_time: depIso,
        arrival_time: arrIso,
        cost: Number(transCost),
        notes: transNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        const updatedTransports = [...transports, res.data];
        setTransports(updatedTransports);
        setIsAddTransportOpen(false);
        setTransNotes("");
        showToast("Transport leg added successfully!", "success");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops, transports: updatedTransports });
      } else {
        showToast(res.message || "Failed to add transport.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add transport.", "error");
    }
  };

  // Delete transport leg
  const handleDeleteTransport = async (transportId: string) => {
    try {
      const res = await tripService.deleteTransport(transportId);
      if (res.success) {
        const updatedTransports = transports.filter((t) => t.id !== transportId);
        setTransports(updatedTransports);
        showToast("Transport leg removed.", "info");
        if (onUpdateTrip) onUpdateTrip({ ...trip, stops, transports: updatedTransports });
      } else {
        showToast(res.message || "Failed to delete transport.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete transport.", "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
        <div>
          <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#E51919]">
            Itinerary Multi-Stop Organizer
          </span>
          <h3 className="font-display font-extrabold text-xl text-[#171313]">
            {stops.length} Planned City Sections & Activities
          </h3>
        </div>

        <NeoButton
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => setIsAddSectionOpen(true)}
        >
          Add Stop Section
        </NeoButton>
      </div>

      {/* Stop Sections List */}
      {stops.length === 0 ? (
        <div className="p-12 text-center bg-white border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] flex flex-col items-center gap-3">
          <MapPin className="w-12 h-12 text-neutral-300" />
          <h4 className="font-display font-extrabold text-lg text-[#171313]">
            No Destination Stops Added Yet
          </h4>
          <p className="text-xs text-neutral-600 max-w-sm">
            Add your first city stop section to begin planning days, times, and activities.
          </p>
          <NeoButton
            variant="yellow"
            size="md"
            className="mt-2"
            onClick={() => setIsAddSectionOpen(true)}
          >
            + Add First Stop
          </NeoButton>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {stops.map((stop, index) => {
            const placeName = stop.destination?.name || stop.destination?.city || stop.city_name || "Destination";
            const imageUrl = resolvePlaceImageUrl(placeName, undefined, stop.destination?.image_url);
            const totalStopCost = (stop.activities || []).reduce(
              (acc, a) => acc + Number(a.estimated_cost || 0),
              0
            );

            return (
              <div
                key={stop.id}
                className="bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] p-5 md:p-6"
              >
                {/* Section Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b-2 border-[#171313]">
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-xl border-2 border-[#171313] overflow-hidden flex-shrink-0 bg-neutral-100 shadow-[2px_2px_0px_#171313]">
                      <img
                        src={imageUrl}
                        alt={placeName}
                        className="object-cover w-full h-full"
                      />
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-md bg-[#E51919] text-white flex items-center justify-center font-display font-extrabold text-[10px] border border-[#171313]">
                        {index + 1}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#E51919]">
                          Stop {index + 1}
                        </span>
                        {stop.destination?.latitude && (
                          <span className="text-[10px] font-extrabold text-neutral-500">
                            📍 {Number(stop.destination.latitude).toFixed(3)}, {Number(stop.destination.longitude).toFixed(3)}
                          </span>
                        )}
                      </div>
                      <h3 className="font-display font-extrabold text-2xl text-[#171313]">
                        {placeName}
                      </h3>
                    </div>
                  </div>

                  {/* Section Meta & Reorder / Delete Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFF4E6] border border-[#171313] rounded-lg text-xs font-bold">
                      <Calendar className="w-3.5 h-3.5 text-[#E51919]" />
                      <span>
                        {stop.arrival_date} → {stop.departure_date}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFF4E6] border border-[#171313] rounded-lg text-xs font-bold">
                      <Wallet className="w-3.5 h-3.5 text-[#E51919]" />
                      <span>Est: ₹{totalStopCost.toLocaleString("en-IN")}</span>
                    </div>

                    {/* Opens the ranked alternatives for this stop. Nights
                        come from the stop's own dates, so capacity and
                        seasonal pricing are checked against the real stay. */}
                    <button
                      type="button"
                      onClick={() =>
                        setComparing({
                          city: placeName,
                          serviceType: "accommodation",
                          onDate: stop.arrival_date,
                          nights: nightsBetween(
                            stop.arrival_date,
                            stop.departure_date
                          ),
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1 bg-[#FFFFFF] border border-[#171313] rounded-lg text-xs font-bold hover:bg-[#FAECDC] cursor-pointer"
                      title="Compare stays for this stop"
                    >
                      <Scale className="w-3.5 h-3.5 text-[#107038]" />
                      <span>Compare stays</span>
                    </button>

                    {/* Reorder Buttons */}
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleMoveStop(index, "up")}
                        disabled={index === 0}
                        className="p-1.5 rounded-lg border border-[#171313] bg-[#FFF4E6] hover:bg-[#FFFAF3] disabled:opacity-30 cursor-pointer"
                        title="Move Stop Up"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveStop(index, "down")}
                        disabled={index === stops.length - 1}
                        className="p-1.5 rounded-lg border border-[#171313] bg-[#FFF4E6] hover:bg-[#FFFAF3] disabled:opacity-30 cursor-pointer"
                        title="Move Stop Down"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveStop(stop.id)}
                        className="p-1.5 rounded-lg border border-[#171313] bg-[#FFF4E6] hover:bg-[#E51919] hover:text-white text-red-600 transition-colors cursor-pointer ml-1"
                        title="Delete Stop"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stop Activities List */}
                <div className="mt-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-600">
                      Planned Activities ({stop.activities?.length || 0})
                    </span>
                    <NeoButton
                      variant="cream"
                      size="sm"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setActiveStopForActivity(stop.id);
                        setActDate(stop.arrival_date);
                      }}
                    >
                      + Add Activity
                    </NeoButton>
                  </div>

                  {stop.activities && stop.activities.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5">
                      {stop.activities.map((act) => (
                        <div
                          key={act.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-neutral-50 border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-white transition-colors"
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#FFF4E6] border border-[#171313] flex items-center justify-center text-xs font-bold">
                              <Clock className="w-4 h-4 text-[#E51919]" />
                            </div>
                            <div>
                              <h5 className="font-display font-bold text-sm text-[#171313]">
                                {act.title}
                              </h5>
                              <div className="flex items-center gap-3 text-xs text-neutral-600 font-medium">
                                <span>
                                  {act.date} • {act.start_time} - {act.end_time}
                                </span>
                                {act.notes && <span>• {act.notes}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="font-display font-extrabold text-sm text-[#E51919]">
                              ₹{act.estimated_cost}
                            </span>
                            <button
                              onClick={() => handleDeleteActivity(stop.id, act.id)}
                              className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                              title="Delete Activity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-neutral-300 text-center text-xs text-neutral-500 font-medium">
                      No activities added for this destination stop yet.
                    </div>
                  )}
                </div>

                {/* Stop Accommodations List */}
                <div className="mt-5 flex flex-col gap-3 pt-4 border-t-2 border-dashed border-neutral-200">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-extrabold text-xs uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                      <Hotel className="w-3.5 h-3.5 text-[#107038]" />
                      Stays & Accommodations ({stop.accommodations?.length || 0})
                    </span>
                    <NeoButton
                      variant="cream"
                      size="sm"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setActiveStopForAcc(stop.id);
                        setAccCheckIn(stop.arrival_date);
                        setAccCheckOut(stop.departure_date);
                      }}
                    >
                      + Add Stay / Hotel
                    </NeoButton>
                  </div>

                  {stop.accommodations && stop.accommodations.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5">
                      {stop.accommodations.map((acc) => (
                        <div
                          key={acc.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#F4F9F5] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-white transition-colors"
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#E6F4EA] border border-[#171313] flex items-center justify-center text-xs font-bold">
                              <Hotel className="w-4 h-4 text-[#107038]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-display font-bold text-sm text-[#171313]">
                                  {acc.name}
                                </h5>
                                {acc.booking_url && (
                                  <a
                                    href={acc.booking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-neutral-400 hover:text-[#107038]"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span>
                                  {acc.check_in} → {acc.check_out} ({acc.nights || 1} nights)
                                </span>
                                {acc.address && <span>• {acc.address}</span>}
                                {acc.notes && <span>• {acc.notes}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="font-display font-extrabold text-sm text-[#107038]">
                              ₹{Number(acc.estimated_cost).toLocaleString("en-IN")}
                            </span>
                            <button
                              onClick={() => handleDeleteAccommodation(stop.id, acc.id)}
                              className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                              title="Delete Accommodation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-neutral-300 text-center text-xs text-neutral-500 font-medium">
                      No hotel or stay added for this stop yet. Click &ldquo;+ Add Stay / Hotel&rdquo; to record lodging.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transfers & Transport Legs Between Cities */}
      <div className="flex flex-col gap-4 p-5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#107038]">
              Inter-City Logistics
            </span>
            <h4 className="font-display font-extrabold text-lg text-[#171313] flex items-center gap-2">
              <Navigation className="w-5 h-5 text-[#107038]" />
              Transfers & Transport Legs ({transports.length})
            </h4>
          </div>

          <NeoButton
            variant="cream"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5 stroke-[3]" />}
            onClick={() => {
              if (stops.length >= 2) {
                setTransOriginStopId(stops[0].id);
                setTransDestStopId(stops[1].id);
              }
              setIsAddTransportOpen(true);
            }}
            disabled={stops.length < 2}
          >
            + Add Transfer Leg
          </NeoButton>
        </div>

        {stops.length < 2 && (
          <p className="text-xs text-neutral-500 font-medium">
            Add at least two destination stops to plan transport connections between them.
          </p>
        )}

        {transports.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {transports.map((trans) => {
              const orig = stops.find((s) => s.id === trans.origin_stop_id);
              const dest = stops.find((s) => s.id === trans.destination_stop_id);
              const origName = orig?.destination?.name || orig?.city_name || "Origin";
              const destName = dest?.destination?.name || dest?.city_name || "Destination";
              const depFormatted = new Date(trans.departure_time).toLocaleString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const arrFormatted = new Date(trans.arrival_time).toLocaleString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={trans.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#FFFDFB] border-2 border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313]"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF4E6] border-2 border-[#171313] flex items-center justify-center font-bold">
                      {trans.transport_type === "flight" && <Plane className="w-4 h-4 text-[#E51919]" />}
                      {trans.transport_type === "train" && <Train className="w-4 h-4 text-[#107038]" />}
                      {trans.transport_type === "bus" && <Bus className="w-4 h-4 text-[#D97706]" />}
                      {trans.transport_type === "car" && <Car className="w-4 h-4 text-[#2563EB]" />}
                      {trans.transport_type === "ferry" && <Ship className="w-4 h-4 text-[#0D9488]" />}
                      {trans.transport_type === "other" && <Navigation className="w-4 h-4 text-neutral-600" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black text-xs uppercase px-2 py-0.5 bg-neutral-100 border border-[#171313] rounded-md">
                          {trans.transport_type}
                        </span>
                        <span className="font-display font-extrabold text-sm text-[#171313]">
                          {origName} → {destName}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 font-medium mt-1">
                        <span>{depFormatted} → {arrFormatted}</span>
                        {trans.notes && <span className="ml-2">• {trans.notes}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className="font-display font-extrabold text-sm text-[#171313]">
                      ₹{Number(trans.cost).toLocaleString("en-IN")}
                    </span>
                    <button
                      onClick={() => handleDeleteTransport(trans.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                      title="Delete Transport Leg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          stops.length >= 2 && (
            <div className="p-4 rounded-xl border border-dashed border-neutral-300 text-center text-xs text-neutral-500 font-medium">
              No transfers scheduled yet. Click &ldquo;+ Add Transfer Leg&rdquo; to connect your stops by flight, train, bus, or car.
            </div>
          )
        )}
      </div>

      {/* Bottom Button */}
      <div className="flex justify-center pt-2">
        <NeoButton
          variant="cream"
          size="md"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => setIsAddSectionOpen(true)}
        >
          Add Another Section
        </NeoButton>
      </div>

      {/* Modal: Add Destination Section */}
      <Modal
        isOpen={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        title="Add Stop / Destination Section"
        subtitle="Search Google Places across India or pick from catalog"
      >
        <div className="flex flex-col gap-4">
          {/* India-Wide Google Places Search */}
          <div className="flex flex-col gap-1.5">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
              Search Any Place in India (Google Places)
            </label>
            <div className="relative w-full">
              <SearchBar
                value={placeQuery}
                onChange={setPlaceQuery}
                placeholder="e.g. Marine Drive Mumbai, Taj Mahal, Mysore Palace..."
              />
              {placeSuggestions.length > 0 && (
                <div className="absolute z-30 w-full mt-2 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-56 overflow-y-auto">
                  {placeSuggestions.map((s) => (
                    <button
                      key={s.place_id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 border-b border-neutral-100 hover:bg-[#FFF4E6] transition-colors cursor-pointer"
                      onClick={() => handleSelectGooglePlaceForStop(s)}
                    >
                      <span className="font-display font-extrabold text-xs text-[#171313] block">
                        📍 {s.structured_formatting.main_text}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {s.structured_formatting.secondary_text || s.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
            <div className="h-px bg-neutral-200 flex-1" />
            <span>OR PICK FROM CATALOG</span>
            <div className="h-px bg-neutral-200 flex-1" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
              Destination City
            </label>
            <select
              value={selectedDestId}
              onChange={(e) => setSelectedDestId(e.target.value)}
              className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
            >
              {availableDestinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.region || d.country})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NeoInput
              label="Arrival Date"
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              required
            />
            <NeoInput
              label="Departure Date"
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => setIsAddSectionOpen(false)}
            >
              Cancel
            </NeoButton>
            <NeoButton
              variant="yellow"
              size="sm"
              onClick={handleAddSection}
              isLoading={isResolvingPlace}
            >
              Add Stop Section
            </NeoButton>
          </div>
        </div>
      </Modal>

      {/* Modal: Add Activity to Stop */}
      <Modal
        isOpen={!!activeStopForActivity}
        onClose={() => setActiveStopForActivity(null)}
        title="Add Planned Activity"
        subtitle="Attach activity timing and estimated expense"
      >
        <div className="flex flex-col gap-4">
          <NeoInput
            label="Activity Name"
            placeholder="e.g. Sunset Boat Cruise or Heritage Walk"
            value={actTitle}
            onChange={(e) => setActTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-2">
            <NeoInput
              label="Date"
              type="date"
              value={actDate}
              onChange={(e) => setActDate(e.target.value)}
              required
            />
            <NeoInput
              label="Start"
              type="time"
              value={actStart}
              onChange={(e) => setActStart(e.target.value)}
              required
            />
            <NeoInput
              label="End"
              type="time"
              value={actEnd}
              onChange={(e) => setActEnd(e.target.value)}
              required
            />
          </div>

          <NeoInput
            label="Estimated Cost (₹)"
            type="number"
            value={actCost}
            onChange={(e) => setActCost(Number(e.target.value))}
            required
          />

          <div className="flex justify-end gap-3 pt-4">
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => setActiveStopForActivity(null)}
            >
              Cancel
            </NeoButton>
            <NeoButton variant="yellow" size="sm" onClick={handleAddActivity}>
              Add Activity
            </NeoButton>
          </div>
        </div>
      </Modal>

      {/* Modal: Add Accommodation to Stop */}
      <Modal
        isOpen={activeStopForAcc !== null}
        onClose={() => setActiveStopForAcc(null)}
        title="Add Hotel or Lodging Stay"
        subtitle="Record hotel, resort, hostel, or homestay booking details"
      >
        <div className="flex flex-col gap-4">
          <NeoInput
            label="Hotel or Property Name"
            placeholder="e.g. Grand Hyatt Goa / Zostel Mumbai"
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <NeoInput
              label="Check-in Date"
              type="date"
              value={accCheckIn}
              onChange={(e) => setAccCheckIn(e.target.value)}
              required
            />
            <NeoInput
              label="Check-out Date"
              type="date"
              value={accCheckOut}
              onChange={(e) => setAccCheckOut(e.target.value)}
              required
            />
          </div>

          <NeoInput
            label="Total Estimated Cost (₹)"
            type="number"
            value={accCost}
            onChange={(e) => setAccCost(Number(e.target.value))}
            required
          />

          <NeoInput
            label="Address (optional)"
            placeholder="e.g. Candolim Beach Road, North Goa"
            value={accAddress}
            onChange={(e) => setAccAddress(e.target.value)}
          />

          <NeoInput
            label="Booking Link / URL (optional)"
            placeholder="https://..."
            value={accUrl}
            onChange={(e) => setAccUrl(e.target.value)}
          />

          <NeoInput
            label="Notes (optional)"
            placeholder="e.g. Ocean view deluxe room, includes breakfast"
            value={accNotes}
            onChange={(e) => setAccNotes(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4">
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => setActiveStopForAcc(null)}
            >
              Cancel
            </NeoButton>
            <NeoButton variant="primary" size="sm" onClick={handleAddAccommodation}>
              Add Accommodation
            </NeoButton>
          </div>
        </div>
      </Modal>

      {/* Modal: Add Transport Leg */}
      <Modal
        isOpen={isAddTransportOpen}
        onClose={() => setIsAddTransportOpen(false)}
        title="Add Transport / Transfer Leg"
        subtitle="Connect two destination stops by flight, train, bus, or road transfer"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
              Transport Mode
            </label>
            <select
              value={transType}
              onChange={(e) => setTransType(e.target.value as TransportType)}
              className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
            >
              <option value="flight">Flight (Airplane)</option>
              <option value="train">Train (Rail)</option>
              <option value="bus">Bus (Coach)</option>
              <option value="car">Car / Taxi / Cab</option>
              <option value="ferry">Ferry / Boat</option>
              <option value="other">Other Transit</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
                Origin Stop
              </label>
              <select
                value={transOriginStopId}
                onChange={(e) => setTransOriginStopId(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
              >
                <option value="">Select departure stop</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.destination?.name || s.city_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-[#171313]">
                Destination Stop
              </label>
              <select
                value={transDestStopId}
                onChange={(e) => setTransDestStopId(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#171313] font-bold text-sm border-[3px] border-[#171313] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#171313]"
              >
                <option value="">Select arrival stop</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.destination?.name || s.city_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NeoInput
              label="Departure Time"
              type="datetime-local"
              value={transDepTime}
              onChange={(e) => setTransDepTime(e.target.value)}
              required
            />
            <NeoInput
              label="Arrival Time"
              type="datetime-local"
              value={transArrTime}
              onChange={(e) => setTransArrTime(e.target.value)}
              required
            />
          </div>

          <NeoInput
            label="Estimated Cost (₹)"
            type="number"
            value={transCost}
            onChange={(e) => setTransCost(Number(e.target.value))}
            required
          />

          <NeoInput
            label="Notes / Provider / Ref (optional)"
            placeholder="e.g. IndiGo 6E-204 / Tejas Express Coach B2"
            value={transNotes}
            onChange={(e) => setTransNotes(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4">
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => setIsAddTransportOpen(false)}
            >
              Cancel
            </NeoButton>
            <NeoButton variant="primary" size="sm" onClick={handleAddTransport}>
              Add Transfer Leg
            </NeoButton>
          </div>
        </div>
      </Modal>

      {/* Ranked alternatives for one stop. Selection is display-only until
          the booking layer lands -- there is nothing to persist a chosen
          service against yet, and silently discarding the choice would be
          worse than saying so. */}
      <CompareAlternatives
        isOpen={comparing !== null}
        onClose={() => setComparing(null)}
        serviceType={comparing?.serviceType ?? "accommodation"}
        city={comparing?.city}
        onDate={comparing?.onDate}
        nights={comparing?.nights ?? 1}
        quantity={trip.traveller_count || 1}
        onSelect={(option) => {
          showToast(
            `${option.name} — ₹${Number(option.total_price).toLocaleString("en-IN")}. ` +
              "Saving a selection needs the booking step.",
            "info"
          );
          setComparing(null);
        }}
      />
    </div>
  );
};
