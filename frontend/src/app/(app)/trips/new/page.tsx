"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Users,
  Wallet,
  MapPin,
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Compass,
  X,
  RefreshCw,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { TripMap } from "@/components/map";
import { destinationService } from "@/services/destinations";
import { activityService } from "@/services/activities";
import { tripService } from "@/services/trips";
import { SearchBar } from "@/components/ui/search-bar";
import { placesService, PlaceSuggestion } from "@/services/places";
import { resolvePlaceImageUrl } from "@/lib/place-images";
import type { Destination, Activity, AITravelPlan, AITwoOptionsResponse } from "@/types";


function formatDuration(minutes?: number, hours?: number): string {
  if (minutes !== undefined && minutes !== null && minutes > 0) {
    if (minutes < 60) return `${minutes} mins`;
    const hrs = minutes / 60;
    return hrs % 1 === 0 ? `${hrs} hours` : `${hrs.toFixed(1)} hours`;
  }
  if (hours !== undefined && hours !== null && hours > 0) {
    return hours % 1 === 0 ? `${hours} hours` : `${hours.toFixed(1)} hours`;
  }
  return "3 hours";
}

/**
 * Curated fallback suggestions, keyed by the city they actually belong to.
 *
 * This used to be one flat list that the wizard seeded itself from on mount
 * and then topped up with whenever it had fewer than four suggestions --
 * which is exactly how a trip to Amritsar ended up recommending Marine Drive
 * and the Gateway of India. Keying by city means a curated entry can only
 * ever surface for its own destination; there is no global pool to fall into.
 */
const CURATED_ACTIVITIES_BY_CITY: Record<string, Activity[]> = {
  mumbai: [
    {
      id: "rec-gateway-mumbai",
      destination_id: "mumbai-dest",
      destination_name: "Mumbai",
      title: "Gateway of India & Colaba Heritage Walk",
      category: "SIGHTSEEING",
      estimated_cost: 400,
      duration_hours: 3.0,
      description: "Explore the iconic arch-monument and historic colonial streets of South Mumbai.",
      rating: 4.8,
    },
    {
      id: "rec-marine-drive",
      destination_id: "mumbai-dest",
      destination_name: "Mumbai",
      title: "Marine Drive Sunset & Street Food",
      category: "FOOD & LEISURE",
      estimated_cost: 350,
      duration_hours: 2.5,
      description: "Stroll along Queen's Necklace and enjoy local beach delicacies at Chowpatty.",
      rating: 4.9,
    },
    {
      id: "rec-elephanta-caves",
      destination_id: "mumbai-dest",
      destination_name: "Mumbai",
      title: "Elephanta Caves Ferry & Tour",
      category: "HISTORICAL",
      estimated_cost: 850,
      duration_hours: 4.5,
      description: "Scenic ferry ride and guided exploration of UNESCO rock-cut cave temples.",
      rating: 4.7,
    },
  ],
  goa: [
    {
      id: "rec-scuba-goa",
      destination_id: "goa-dest",
      destination_name: "Goa",
      title: "Scuba Diving & Island Trip at Grande Island",
      category: "ADVENTURE",
      estimated_cost: 2800,
      duration_hours: 5.0,
      description: "Clear-water scuba diving with certified instructors and dolphin sightings.",
      rating: 4.9,
    },
    {
      id: "rec-chapora-goa",
      destination_id: "goa-dest",
      destination_name: "Goa",
      title: "Chapora Fort Sunset & Vagator Shack Dinner",
      category: "LEISURE",
      estimated_cost: 1200,
      duration_hours: 3.5,
      description: "Panoramic cliff views of the Arabian Sea followed by beachfront dining.",
      rating: 4.8,
    },
  ],
};

/** The names a place has to mention to count as being in this destination. */
function destinationAliases(dest: Destination): string[] {
  return [dest.name, dest.city, dest.region]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim().toLowerCase());
}

/**
 * Is this activity verifiably part of one of the selected destinations?
 *
 * Only fields the app controls are trusted: the catalogue's own
 * ``destination_id`` (the API filtered on it) and the ``destination_name``
 * stamped on a curated or Google-sourced entry after its address was
 * checked. Free text like the description is deliberately not searched --
 * "a short drive from Goa" is not evidence of being in Goa.
 */
function belongsToDestination(act: Activity, dests: Destination[]): boolean {
  if (dests.length === 0) return false;

  if (act.destination_id && dests.some((d) => d.id === act.destination_id)) {
    return true;
  }

  const claimed = (act.destination_name || "").trim().toLowerCase();
  if (!claimed) return false;
  return dests.some((d) =>
    destinationAliases(d).some(
      (alias) => claimed === alias || claimed.includes(alias)
    )
  );
}

/**
 * Does a Google Places result actually sit in this destination?
 *
 * The search is phrased as "<city> top attractions", but Places happily
 * returns near-misses from neighbouring cities, and the old code stamped the
 * selected destination onto every result regardless. Checking the formatted
 * address before converting is what makes the stamp meaningful.
 */
function placeIsInDestination(place: any, dest: Destination): boolean {
  const address = [
    place.formattedAddress,
    place.shortFormattedAddress,
    place.displayName?.text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!address) return false;
  return destinationAliases(dest).some((alias) => address.includes(alias));
}

function convertGooglePlaceToActivity(place: any, destName: string, destId: string): Activity {
  const title = place.displayName?.text || place.formattedAddress?.split(",")[0] || "Attraction";
  const types: string[] = place.types || [];
  
  let category = "SIGHTSEEING";
  let cost = 400;
  let duration = 3.0;

  if (types.some((t: string) => t.includes("history") || t.includes("museum") || t.includes("monument") || t.includes("place_of_worship"))) {
    category = "HISTORICAL";
    cost = 500;
    duration = 3.0;
  } else if (types.some((t: string) => t.includes("food") || t.includes("restaurant") || t.includes("cafe") || t.includes("meal"))) {
    category = "FOOD & LEISURE";
    cost = 350;
    duration = 2.5;
  } else if (types.some((t: string) => t.includes("park") || t.includes("hiking") || t.includes("camp") || t.includes("adventure"))) {
    category = "ADVENTURE";
    cost = 1500;
    duration = 4.5;
  } else if (types.some((t: string) => t.includes("beach") || t.includes("spa") || t.includes("resort"))) {
    category = "LEISURE";
    cost = 600;
    duration = 3.5;
  }

  const photoUrl = resolvePlaceImageUrl(title, place.photos);

  return {
    id: `gplace-${place.id || Math.random().toString(36).substring(2, 9)}`,
    destination_id: destId,
    destination_name: destName,
    title: title,
    name: title,
    category: category,
    description: place.formattedAddress || `${category} experience in ${destName}`,
    duration_hours: duration,
    duration_minutes: duration * 60,
    estimated_cost: cost,
    image_url: photoUrl,
    rating: place.rating || 4.8,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  };
}

/**
 * The wizard draft, kept in sessionStorage.
 *
 * Every step lives in one component, so moving between them never lost state
 * on its own -- but a browser Back, a refresh, or a detour through the
 * sidebar unmounts the page and took the whole form with it. Persisting the
 * draft makes the answer to "is my data still there?" the same however the
 * user arrived back. It is session-scoped, so it does not outlive the tab.
 */
const DRAFT_KEY = "tripzyy_trip_wizard_draft";

interface WizardDraft {
  currentStep: number;
  title: string;
  startDate: string;
  endDate: string;
  budget: string;
  travellerCount: string;
  selectedDestinations: Destination[];
  selectedActivities: Activity[];
}

const EMPTY_DRAFT: WizardDraft = {
  currentStep: 1,
  title: "",
  startDate: "",
  endDate: "",
  budget: "30000",
  travellerCount: "2",
  selectedDestinations: [],
  selectedActivities: [],
};

function readDraft(): WizardDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    // Spread over the defaults so a draft written by an older build, or one
    // missing a field, still hydrates instead of throwing.
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<WizardDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Travellers per trip. The wizard's own rule, enforced on both sides. */
const MIN_TRAVELLERS = 1;
const MAX_TRAVELLERS = 10;
const TRAVELLER_ERROR = `Please enter between ${MIN_TRAVELLERS} and ${MAX_TRAVELLERS} travelers.`;

/**
 * Parse the traveller field without ever rescuing a bad value.
 *
 * Returns ``null`` for anything that is not a whole number in range --
 * empty, 0, negative, 2.5, 1000000000000, "abc". The caller shows the error
 * rather than clamping, because silently turning 1000000000000 into 10 tells
 * the user their input was accepted when it was not.
 */
function parseTravellers(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  if (n < MIN_TRAVELLERS || n > MAX_TRAVELLERS) return null;
  return n;
}

export default function CreateTripPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // The draft is restored *after* mount, not during render. This page is
  // prerendered, so reading sessionStorage in a state initialiser would give
  // the client a different first render than the server HTML and React would
  // flag a hydration mismatch. ``isHydrated`` also gates the save below, so
  // the initial empty state can never overwrite a stored draft.
  const [isHydrated, setIsHydrated] = useState(false);

  const [currentStep, setCurrentStep] = useState(EMPTY_DRAFT.currentStep);

  // Available catalog. Activities start empty: there is nothing honest to
  // suggest until a destination has been picked.
  const [availableDestinations, setAvailableDestinations] = useState<Destination[]>([]);
  const [availableActivities, setAvailableActivities] = useState<Activity[]>([]);

  // Form State
  const [title, setTitle] = useState(EMPTY_DRAFT.title);
  const [startDate, setStartDate] = useState(EMPTY_DRAFT.startDate);
  const [endDate, setEndDate] = useState(EMPTY_DRAFT.endDate);
  const [budget, setBudget] = useState(EMPTY_DRAFT.budget);
  // Held as the raw string so an invalid entry stays visible and rejectable
  // instead of being coerced (``Number("")`` is 0, which read as a valid
  // party of zero).
  const [travellerCount, setTravellerCount] = useState(EMPTY_DRAFT.travellerCount);
  const [selectedDestinations, setSelectedDestinations] = useState<Destination[]>(
    EMPTY_DRAFT.selectedDestinations
  );
  const [selectedActivities, setSelectedActivities] = useState<Activity[]>(
    EMPTY_DRAFT.selectedActivities
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const budgetValue = Number(budget) || 0;
  const travellers = parseTravellers(travellerCount);

  // Restore whatever the user had entered before, once, on mount.
  //
  // The rule below flags setState in an effect body as a cascading-render
  // risk. It does not apply here: sessionStorage cannot be read during
  // render without a hydration mismatch, and this runs exactly once, on
  // mount, with every value set in a single batch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const draft = readDraft();
    setCurrentStep(draft.currentStep);
    setTitle(draft.title);
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    setBudget(draft.budget);
    setTravellerCount(draft.travellerCount);
    setSelectedDestinations(draft.selectedDestinations);
    setSelectedActivities(draft.selectedActivities);
    setIsHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save on every change, so going back -- by button, step bar, or browser --
  // always finds the latest values.
  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          currentStep,
          title,
          startDate,
          endDate,
          budget,
          travellerCount,
          selectedDestinations,
          selectedActivities,
        } satisfies WizardDraft)
      );
    } catch {
      // A full or blocked sessionStorage must not break the wizard; the
      // in-memory state is still the source of truth for this mount.
    }
  }, [
    isHydrated,
    currentStep,
    title,
    startDate,
    endDate,
    budget,
    travellerCount,
    selectedDestinations,
    selectedActivities,
  ]);

  // Google Places Search State for Wizard Destinations (Step 2)
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Google Places Search State for Step 3 Activities
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activitySuggestions, setActivitySuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingStep3Activities, setIsSearchingStep3Activities] = useState(false);
  const [selectedActivityCategory, setSelectedActivityCategory] = useState("all");

  useEffect(() => {
    if (placeSearchQuery.length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await placesService.autocomplete(placeSearchQuery, "in");
        if (res.success && res.data?.predictions) {
          setPlaceSuggestions(res.data.predictions);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [placeSearchQuery]);

  // Autocomplete for Step 3 Activities Search
  useEffect(() => {
    if (activitySearchQuery.length < 2) {
      setActivitySuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const destContext = selectedDestinations.map(d => d.name).join(" ");
        const queryWithContext = `${activitySearchQuery} ${destContext}`.trim();
        const res = await placesService.autocomplete(queryWithContext, "in");
        if (res.success && res.data?.predictions) {
          setActivitySuggestions(res.data.predictions);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [activitySearchQuery, selectedDestinations]);

  const handleSelectGooglePlace = async (suggestion: PlaceSuggestion) => {
    setIsSearchingPlaces(true);
    setPlaceSearchQuery("");
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
        if (!selectedDestinations.some((d) => d.id === dest.id || d.name.toLowerCase() === dest.name.toLowerCase())) {
          setSelectedDestinations((prev) => [...prev, dest]);
          showToast(`Added "${dest.name}" to route!`, "success");
        }
      } else {
        showToast("Could not retrieve place details.", "error");
      }
    } catch (e) {
      console.error("Failed to add place to route:", e);
      showToast("Failed to add place to route.", "error");
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  // Select / Search Google Place as Activity in Step 3
  const handleSelectStep3PlaceActivity = async (suggestion: PlaceSuggestion) => {
    setIsSearchingStep3Activities(true);
    setActivitySearchQuery("");
    setActivitySuggestions([]);
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
        // Stamp the destination the place is actually in, not just the first
        // one on the route. Searching "Taj Mahal" on an Amritsar trip used to
        // add it labelled Amritsar, which then passed every later check.
        const host = selectedDestinations.find((d) =>
          placeIsInDestination(placeDetails, d)
        );
        if (!host) {
          showToast(
            "That place is not in any of your selected destinations, so it was not added.",
            "error"
          );
          return;
        }
        const newAct = convertGooglePlaceToActivity(placeDetails, host.name, host.id);
        setAvailableActivities((prev) => [newAct, ...prev.filter(a => a.id !== newAct.id)]);
        setSelectedActivities((prev) => [...prev, newAct]);
        showToast(`Added "${newAct.title}" to trip activities!`, "success");
      }
    } catch (err) {
      console.error("Failed to add activity place:", err);
    } finally {
      setIsSearchingStep3Activities(false);
    }
  };

  useEffect(() => {
    async function loadCatalog() {
      try {
        // Destinations only. The activity catalogue is deliberately *not*
        // pre-loaded here: an unfiltered ``/activities/search`` returns a
        // global list, and seeding the wizard from it -- plus auto-selecting
        // the first two destinations and the first two activities -- is what
        // produced a "Golden Temple + Taj Mahal + Holy Cross" itinerary for a
        // destination the user never picked. Suggestions are fetched per
        // destination in the step-3 effect below.
        const destsRes = await destinationService.search({ limit: 30 });

        if (destsRes.success && destsRes.data) {
          const items = Array.isArray(destsRes.data)
            ? destsRes.data
            : (destsRes.data as any).items || [];
          setAvailableDestinations(items);
        }
      } catch (err) {
        console.error("Failed to load catalog for wizard:", err);
      }
    }

    loadCatalog();
  }, []);

  // Suggestions for the selected destinations, and nothing else.
  useEffect(() => {
    let cancelled = false;

    async function loadActivitiesForStep() {
      if (currentStep !== 3) return;

      if (selectedDestinations.length === 0) {
        setAvailableActivities([]);
        return;
      }

      setIsSearchingStep3Activities(true);
      const collected: Activity[] = [];

      try {
        // 1. The catalogue, filtered server-side by destination.
        const dbResults = await Promise.all(
          selectedDestinations.map((d) =>
            activityService.search({ destination_id: d.id, limit: 8 } as any)
          )
        );
        dbResults.forEach((res, idx) => {
          if (!res.success || !res.data) return;
          const items: Activity[] = Array.isArray(res.data)
            ? res.data
            : (res.data as any).items || [];
          const dest = selectedDestinations[idx];
          // Stamp the destination we asked for, so the entry carries its own
          // provenance even if the row came back without one.
          items.forEach((a) =>
            collected.push({
              ...a,
              destination_id: a.destination_id || dest.id,
              destination_name: a.destination_name || dest.name,
            })
          );
        });

        // 2. Live Google Places attractions -- kept only when the address
        //    actually places them in the destination that was searched for.
        const googleResults = await Promise.all(
          selectedDestinations.map((d) =>
            placesService
              .search(`${d.name} top attractions tourist places`)
              .catch(() => null)
          )
        );
        googleResults.forEach((res, idx) => {
          if (!res || !res.success || !res.data?.places) return;
          const dest = selectedDestinations[idx];
          res.data.places
            .filter((p) => placeIsInDestination(p, dest))
            .slice(0, 5)
            .forEach((p) => {
              collected.push(convertGooglePlaceToActivity(p, dest.name, dest.id));
            });
        });

        // 3. Curated fallbacks -- only the ones filed under a selected city.
        //    The old code topped up from a global list whenever it had fewer
        //    than four suggestions, which is how Mumbai and Goa entries
        //    turned up on an Amritsar trip.
        selectedDestinations.forEach((dest) => {
          destinationAliases(dest).forEach((alias) => {
            (CURATED_ACTIVITIES_BY_CITY[alias] || []).forEach((rec) =>
              collected.push(rec)
            );
          });
        });
      } catch (e) {
        console.warn("Could not load destination-specific activities", e);
      }

      if (cancelled) return;

      // Nothing is displayed until its destination checks out.
      const verified = collected.filter((a) =>
        belongsToDestination(a, selectedDestinations)
      );
      const deduped = Array.from(
        new Map(
          verified.map((a) => [(a.title || a.name || "").toLowerCase().trim(), a])
        ).values()
      );

      // Assigned unconditionally, empty included: leaving the previous list in
      // place is what let the last destination's attractions linger after the
      // route changed.
      setAvailableActivities(deduped);
      setIsSearchingStep3Activities(false);
    }

    loadActivitiesForStep();
    return () => {
      cancelled = true;
    };
  }, [currentStep, selectedDestinations]);

  // Validation
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Trip title is required";
    if (!startDate) errs.startDate = "Start date is required";
    if (!endDate) errs.endDate = "End date is required";
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errs.endDate = "End date cannot be earlier than start date";
    }
    if (!budget.trim() || Number.isNaN(Number(budget)) || Number(budget) < 0) {
      errs.budget = "Budget cannot be negative";
    }
    // One rule, one place: empty, 0, negative, fractional, non-numeric and
    // absurdly large all come back as null and are refused rather than
    // rounded into something that looks acceptable.
    if (travellers === null) errs.travellerCount = TRAVELLER_ERROR;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
    }
    if (currentStep === 2) {
      if (selectedDestinations.length === 0) {
        showToast("Please select at least one destination stop.", "error");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const toggleDestination = (dest: Destination) => {
    if (selectedDestinations.some((d) => d.id === dest.id)) {
      const remaining = selectedDestinations.filter((d) => d.id !== dest.id);
      setSelectedDestinations(remaining);
      // Drop anything that was only on the trip because of the stop just
      // removed. Without this an activity for a dropped destination rode
      // along into the review step and into the created trip.
      setSelectedActivities((prev) =>
        prev.filter((a) => belongsToDestination(a, remaining))
      );
    } else {
      setSelectedDestinations([...selectedDestinations, dest]);
    }
  };

  const toggleActivity = (act: Activity) => {
    if (selectedActivities.some((a) => a.id === act.id)) {
      setSelectedActivities(selectedActivities.filter((a) => a.id !== act.id));
    } else {
      setSelectedActivities([...selectedActivities, act]);
    }
  };

  /** The draft has served its purpose once the trip exists. */
  const clearDraft = () => {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do: a draft we cannot clear is a stale draft, not a bug
      // worth failing a successful creation over.
    }
  };

  const handleCreateTrip = async () => {
    // The same rule the step-1 form applies, re-checked here: the review step
    // is reachable by clicking the step bar, and a trip must never be created
    // with a party size the wizard would have refused.
    if (travellers === null) {
      setCurrentStep(1);
      setErrors((prev) => ({ ...prev, travellerCount: TRAVELLER_ERROR }));
      showToast(TRAVELLER_ERROR, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create Trip
      const createRes = await tripService.create({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        budget: budgetValue,
        traveller_count: travellers,
      });

      if (!createRes.success || !createRes.data) {
        throw new Error(createRes.message || "Failed to create trip");
      }

      const tripId = createRes.data.id;

      // 2. Create Stops
      const createdStops = [];
      for (let i = 0; i < selectedDestinations.length; i++) {
        const dest = selectedDestinations[i];
        try {
          const stopRes = await tripService.createStop(tripId, {
            destination_id: dest.id,
            arrival_date: startDate,
            departure_date: endDate,
            order: i,
          });
          if (stopRes.success && stopRes.data) {
            createdStops.push(stopRes.data);
          }
        } catch (err) {
          console.warn("Failed to create stop for dest", dest.id, err);
        }
      }

      // 3. Attach selected activities to the first stop if available
      if (createdStops.length > 0 && selectedActivities.length > 0) {
        const firstStopId = createdStops[0].id;
        for (let j = 0; j < selectedActivities.length; j++) {
          const act = selectedActivities[j];
          const actTitle = act.title || act.name || "Curated Activity";
          const cost = typeof act.estimated_cost === "number"
            ? act.estimated_cost
            : parseFloat(String(act.estimated_cost || 0));
          try {
            await tripService.addActivity(firstStopId, {
              title: actTitle,
              date: startDate,
              start_time: "10:00",
              end_time: "13:00",
              estimated_cost: isNaN(cost) ? 0 : cost,
              order: j,
              notes: act.description || undefined,
            });
          } catch (err) {
            console.warn("Failed to attach activity", act.id, err);
          }
        }
      }

      clearDraft();
      showToast("Trip and multi-city itinerary initialized!", "success");
      router.push(`/trips/${tripId}`);
    } catch (err: any) {
      showToast(err.message || "Failed to initialize trip. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };


  // AI Two Options State
  const [aiOptions, setAiOptions] = useState<AITwoOptionsResponse | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [inspectingPlan, setInspectingPlan] = useState<AITravelPlan | null>(null);
  const [isSelectingPlan, setIsSelectingPlan] = useState(false);

  const handleGenerateAITrip = async () => {
    if (!title || !startDate || !endDate || selectedDestinations.length === 0) {
      showToast("Please fill all required fields and select at least one destination.", "error");
      return;
    }
    if (travellers === null) {
      setCurrentStep(1);
      setErrors((prev) => ({ ...prev, travellerCount: TRAVELLER_ERROR }));
      showToast(TRAVELLER_ERROR, "error");
      return;
    }

    setIsGeneratingAI(true);
    setAiError(null);
    setAiOptions(null);
    try {
      showToast("AI Route Co-Pilot is architecting two tailored itineraries...", "info");

      const res = await tripService.generateOptions({
        destination_ids: selectedDestinations.map((d) => d.id),
        destination_names: selectedDestinations.map((d) => d.name),
        start_date: startDate,
        end_date: endDate,
        budget_tier:
          budgetValue > 50000 ? "Luxury" : budgetValue > 20000 ? "Moderate" : "Budget",
        travel_style: selectedActivities.map((a) => a.title || a.name).join(", ") || "General Sightseeing",
        traveller_count: travellers,
      });

      if (res.success && res.data?.budget_plan && res.data?.premium_plan) {
        setAiOptions(res.data);
        showToast("2 tailored travel plans ready for comparison!", "success");
      } else {
        throw new Error(res.message || "Failed to generate AI plans");
      }
    } catch (err: any) {
      console.error("AI Generation failed:", err);
      setAiError(err.message || "AI Generation failed. Please try again.");
      showToast(err.message || "AI Generation failed. Please try again.", "error");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSelectAIPlan = async (plan: AITravelPlan) => {
    if (travellers === null) {
      setCurrentStep(1);
      setErrors((prev) => ({ ...prev, travellerCount: TRAVELLER_ERROR }));
      showToast(TRAVELLER_ERROR, "error");
      return;
    }
    setIsSelectingPlan(true);
    try {
      showToast(`Saving ${plan.badge} itinerary to workspace...`, "info");
      const res = await tripService.selectPlan({
        selected_plan: plan,
        destination_ids: selectedDestinations.map((d) => d.id),
        start_date: startDate,
        end_date: endDate,
        traveller_count: travellers,
      });

      if (res.success && res.data) {
        clearDraft();
        showToast("Expedition successfully initialized and saved!", "success");
        router.push(`/trips/${res.data.id}`);
      } else {
        throw new Error(res.message || "Failed to persist trip");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save selected plan.", "error");
    } finally {
      setIsSelectingPlan(false);
    }
  };

  const stepLabels = [
    { num: 1, label: "01 — Basic Details" },
    { num: 2, label: "02 — Destinations" },
    { num: 3, label: "03 — Suggestions" },
    { num: 4, label: "04 — Review & Plan" },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-24">
      <SectionHeader
        tag="Trip Architect"
        tagColor="red"
        title="Create a New Trip"
        subtitle="Set up dates, multi-destination stops, estimated budget and curated activities."
      />

      {/* Progress Step Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#FFFFFF] p-3 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        {stepLabels.map((s) => {
          const isDone = currentStep > s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div
              key={s.num}
              onClick={() => {
                if (s.num < currentStep) setCurrentStep(s.num);
              }}
              className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2.5 select-none ${
                isCurrent
                  ? "bg-[#FFD54A] border-[#171313] shadow-[2px_2px_0px_#171313] font-black"
                  : isDone
                  ? "bg-[#B7F4D8] border-[#171313] cursor-pointer"
                  : "bg-neutral-100 border-neutral-300 text-neutral-400"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black border ${
                  isCurrent
                    ? "bg-[#171313] text-white border-[#171313]"
                    : isDone
                    ? "bg-[#107038] text-white border-[#171313]"
                    : "bg-white text-neutral-400 border-neutral-300"
                }`}
              >
                {isDone ? "✓" : s.num}
              </span>
              <span className="text-xs font-display font-extrabold uppercase tracking-wide truncate">
                {s.label.split("— ")[1]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* ─── STEP 1: Basic Information ─── */}
        {currentStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <NeoCard className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111]">
                <Compass className="w-5 h-5 text-[#4F7DF9]" />
                <h3 className="font-display font-extrabold text-xl text-[#111111]">
                  Step 1: Plan a New Trip
                </h3>
              </div>

              <div className="flex flex-col gap-5">
                <NeoInput
                  label="Trip Title"
                  placeholder="e.g. Konkan to Goa Beach Discovery"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  error={errors.title}
                  required
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <NeoInput
                    label="Start Date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    error={errors.startDate}
                    leftIcon={<Calendar className="w-4 h-4" />}
                    required
                  />
                  <NeoInput
                    label="End Date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    error={errors.endDate}
                    leftIcon={<Calendar className="w-4 h-4" />}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <NeoInput
                    label="Total Estimated Budget (₹)"
                    type="number"
                    min="0"
                    placeholder="30000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    error={errors.budget}
                    leftIcon={<Wallet className="w-4 h-4" />}
                    required
                  />
                  <NeoInput
                    label="Number of Travellers"
                    type="number"
                    min={MIN_TRAVELLERS}
                    max={MAX_TRAVELLERS}
                    step="1"
                    placeholder="2"
                    // Kept as the raw string: coercing here would turn a
                    // cleared field into 0 and hide the mistake.
                    value={travellerCount}
                    onChange={(e) => setTravellerCount(e.target.value)}
                    error={errors.travellerCount}
                    helperText={`Between ${MIN_TRAVELLERS} and ${MAX_TRAVELLERS} travellers.`}
                    leftIcon={<Users className="w-4 h-4" />}
                    required
                  />
                </div>
              </div>
            </NeoCard>
          </motion.div>
        )}

        {/* ─── STEP 2: Select Destinations / Multi-city stops ─── */}
        {currentStep === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <NeoCard className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center justify-between pb-4 border-b-2 border-[#111111]">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#4F7DF9]" />
                  <h3 className="font-display font-extrabold text-xl text-[#111111]">
                    Step 2: Select Destinations / Route Stops
                  </h3>
                </div>
                <Badge variant="yellow">{selectedDestinations.length} Selected</Badge>
              </div>

              {/* India-Wide Place Search Input */}
              <div className="relative w-full">
                <SearchBar
                  value={placeSearchQuery}
                  onChange={setPlaceSearchQuery}
                  placeholder="Search & add any Indian city or landmark (e.g. Marine Drive Mumbai, Taj Mahal, Mysore Palace)..."
                />
                {placeSuggestions.length > 0 && (
                  <div className="absolute z-30 w-full mt-2 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-64 overflow-y-auto">
                    {placeSuggestions.map((s) => (
                      <button
                        key={s.place_id}
                        type="button"
                        className="w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-[#FFF4E6] transition-colors cursor-pointer"
                        onClick={() => handleSelectGooglePlace(s)}
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

              {/* Selected Route Pills */}
              {selectedDestinations.length > 0 && (
                <div className="p-3 bg-[#FFF4E6] border-2 border-[#171313] rounded-xl flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase text-neutral-600 mr-1">
                    Route Order:
                  </span>
                  {selectedDestinations.map((d, i) => (
                    <div
                      key={d.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#D94B3D] text-white border-2 border-[#171313] rounded-lg text-xs font-extrabold shadow-[2px_2px_0px_#171313]"
                    >
                      <span>
                        {i + 1}. {d.name}
                      </span>
                      <button
                        onClick={() => toggleDestination(d)}
                        className="hover:text-neutral-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Interactive Route Map */}
              {selectedDestinations.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#D94B3D]">
                      Live Visual Route Preview
                    </span>
                    <span className="text-[11px] font-bold text-neutral-600">
                      {selectedDestinations.length} Stops Connected
                    </span>
                  </div>
                  <TripMap
                    destinations={selectedDestinations}
                    activities={selectedActivities}
                    height="200px"
                    showControls={true}
                    showLegend={true}
                  />
                </div>
              )}

              {/* Destination Grid.

                  Four across on a wide screen instead of three, with the
                  image, padding and heading trimmed: the whole card is the
                  click target, so the full-width button underneath was
                  ~40px of pure height per card for no extra affordance. The
                  selected state still reads at a glance from the tint, the
                  shadow and the corner tick. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableDestinations.map((dest) => {
                  const isSelected = selectedDestinations.some((d) => d.id === dest.id || d.name.toLowerCase() === dest.name.toLowerCase());
                  const imgUrl = resolvePlaceImageUrl(dest.name, undefined, dest.image_url);
                  return (
                    <button
                      key={dest.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleDestination(dest)}
                      className={`p-2.5 text-left rounded-xl border-[3px] border-[#171313] transition-all cursor-pointer select-none flex flex-col ${
                        isSelected
                          ? "bg-[#F3B5A8]/30 shadow-[4px_4px_0px_#D94B3D] -translate-x-0.5 -translate-y-0.5 border-[#171313]"
                          : "bg-white hover:bg-[#FFFAF3] shadow-[2px_2px_0px_#171313]"
                      }`}
                    >
                      {/* A fixed height, not an aspect ratio: at four
                          columns an aspect-ratio thumbnail grows with the
                          column and ends up taller than the 128px one it
                          replaced, which is the opposite of the point. */}
                      <div className="relative h-24 w-full rounded-lg border-2 border-[#171313] overflow-hidden mb-2 bg-neutral-100">
                        <img
                          src={imgUrl}
                          alt={dest.name}
                          className="object-cover w-full h-full"
                        />
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-[#FFF4E6] border border-[#171313] rounded text-[#171313]">
                          {dest.region || dest.country}
                        </span>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#D94B3D] border-2 border-[#171313] flex items-center justify-center text-white">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <h4 className="font-display font-extrabold text-sm text-[#171313] leading-tight truncate">
                        {dest.name}
                      </h4>
                      <span className="text-[11px] font-bold text-[#D94B3D] truncate">
                        {isSelected ? "Selected ✓" : `${dest.city}, ${dest.country}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </NeoCard>
          </motion.div>
        )}

        {/* ─── STEP 3: Suggestions for Places & Activities (Wireframe Suggestions Section) ─── */}
        {currentStep === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <NeoCard className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-[#111111]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#FFB347]" />
                  <div>
                    <h3 className="font-display font-extrabold text-xl text-[#111111]">
                      Step 3: Suggestions for Places to Visit / Activities
                    </h3>
                    <p className="text-xs font-semibold text-neutral-600">
                      Curated dynamic recommendations for your selected destinations
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center px-3 py-1 bg-[#107038] text-white border-2 border-[#111111] rounded-lg text-xs font-extrabold uppercase shadow-[2px_2px_0px_#111111]">
                  {selectedActivities.length} {selectedActivities.length === 1 ? "ACTIVITY" : "ACTIVITIES"} ADDED
                </div>
              </div>

              {/* Google Places Live Search for Activities */}
              <div className="relative w-full">
                <SearchBar
                  value={activitySearchQuery}
                  onChange={setActivitySearchQuery}
                  placeholder={`Search spots, monuments, street food or attractions in ${selectedDestinations.map(d => d.name).join(", ") || "destinations"}...`}
                />
                {activitySuggestions.length > 0 && (
                  <div className="absolute z-30 w-full mt-2 bg-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] max-h-64 overflow-y-auto">
                    {activitySuggestions.map((s) => (
                      <button
                        key={s.place_id}
                        type="button"
                        className="w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-[#FFF4E6] transition-colors cursor-pointer"
                        onClick={() => handleSelectStep3PlaceActivity(s)}
                      >
                        <span className="font-display font-extrabold text-sm text-[#171313] block">
                          ✨ {s.structured_formatting?.main_text || s.description}
                        </span>
                        <span className="text-xs text-neutral-500 font-medium">
                          {s.structured_formatting?.secondary_text || s.description}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "all", label: "All Suggestions" },
                  { id: "SIGHTSEEING", label: "Sightseeing" },
                  { id: "FOOD & LEISURE", label: "Food & Leisure" },
                  { id: "HISTORICAL", label: "Historical" },
                  { id: "ADVENTURE", label: "Adventure" },
                  { id: "LEISURE", label: "Leisure" },
                  { id: "TREKKING", label: "Trekking" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedActivityCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg border-2 border-[#111111] text-xs font-extrabold uppercase transition-all cursor-pointer ${
                      selectedActivityCategory === cat.id
                        ? "bg-[#171313] text-white shadow-[2px_2px_0px_#111111]"
                        : "bg-white text-[#171313] hover:bg-[#FFF4E6]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Nothing verified for this route: say so rather than filling
                  the grid with attractions from somewhere else. */}
              {!isSearchingStep3Activities && availableActivities.length === 0 && (
                <div className="p-6 bg-[#FFF4E6] border-2 border-dashed border-[#171313] rounded-xl text-center">
                  <p className="font-display font-extrabold text-sm text-[#171313]">
                    {selectedDestinations.length === 0
                      ? "Select a destination first to see suggestions."
                      : "No verified activities available for this destination."}
                  </p>
                  {selectedDestinations.length > 0 && (
                    <p className="text-xs font-semibold text-neutral-600 mt-1">
                      Search above to add a specific place, or continue and let the
                      AI Co-Pilot plan the days.
                    </p>
                  )}
                </div>
              )}

              {isSearchingStep3Activities && availableActivities.length === 0 && (
                <div className="p-6 text-center text-sm font-semibold text-neutral-500">
                  Finding verified activities for{" "}
                  {selectedDestinations.map((d) => d.name).join(", ")}...
                </div>
              )}

              {/* Activity Recommendations Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableActivities
                  .filter((act) => {
                    if (selectedActivityCategory === "all") return true;
                    return (act.category || "").toUpperCase().includes(selectedActivityCategory.toUpperCase());
                  })
                  .map((act) => {
                    const isSelected = selectedActivities.some((a) => a.id === act.id || a.title === act.title);
                    const title = act.title || act.name || "Curated Experience";
                    const imgUrl = resolvePlaceImageUrl(title, undefined, act.image_url);
                    const duration = formatDuration(act.duration_minutes, act.duration_hours);
                    const cost = typeof act.estimated_cost === "number"
                      ? act.estimated_cost
                      : parseFloat(String(act.estimated_cost || 0));

                    return (
                      <div
                        key={act.id}
                        onClick={() => toggleActivity(act)}
                        className={`p-4 rounded-xl border-[3px] border-[#171313] transition-all cursor-pointer select-none flex gap-4 ${
                          isSelected
                            ? "bg-[#B7F4D8] shadow-[4px_4px_0px_#171313] -translate-x-0.5 -translate-y-0.5"
                            : "bg-white hover:bg-[#FFFAF3] shadow-[2px_2px_0px_#171313]"
                        }`}
                      >
                        <div className="relative w-28 h-28 rounded-lg border-2 border-[#171313] overflow-hidden flex-shrink-0 bg-neutral-100">
                          <img
                            src={imgUrl}
                            alt={title}
                            className="object-cover w-full h-full"
                          />
                        </div>

                        <div className="flex flex-col justify-between flex-1 min-w-0">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-neutral-100 border border-[#171313] text-[#171313]">
                                {act.category || "ACTIVITY"}
                              </span>
                              <span className="font-display font-extrabold text-sm text-[#171313]">
                                ₹{(isNaN(cost) ? 0 : cost).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <h4 className="font-display font-extrabold text-sm text-[#171313] leading-snug line-clamp-2">
                              {title}
                            </h4>
                            <span className="text-xs text-neutral-500 font-medium block mt-1">
                              Duration: {duration}
                            </span>
                          </div>

                          <div className="flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActivity(act);
                              }}
                              className={`px-3 py-1.5 rounded-lg border-2 border-[#171313] text-xs font-extrabold uppercase transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-[#1E7246] text-white shadow-[2px_2px_0px_#171313]"
                                  : "bg-white hover:bg-neutral-100 text-[#171313] shadow-[2px_2px_0px_#171313]"
                              }`}
                            >
                              {isSelected ? "ADDED ✓" : "+ ADD TO TRIP"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </NeoCard>
          </motion.div>
        )}

        {/* ─── STEP 4: Review & Generate Itinerary ─── */}
        {currentStep === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-6"
          >
            <NeoCard className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111]">
                <Check className="w-5 h-5 text-[#107038]" />
                <h3 className="font-display font-extrabold text-xl text-[#111111]">
                  Step 4: Review Trip Summary & AI Planner
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl">
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block mb-1">
                    Trip Title
                  </span>
                  <div className="font-display font-extrabold text-base text-[#111111]">
                    {title}
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl">
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block mb-1">
                    Travel Dates
                  </span>
                  <div className="font-display font-extrabold text-base text-[#111111]">
                    {startDate} → {endDate}
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 border-2 border-[#111111] rounded-xl">
                  <span className="text-[10px] font-extrabold uppercase text-neutral-500 block mb-1">
                    Budget & Group
                  </span>
                  <div className="font-display font-extrabold text-base text-[#111111]">
                    ₹{budgetValue.toLocaleString("en-IN")} • {travellers ?? "—"} Travellers
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-display font-bold text-sm text-[#111111] uppercase tracking-wide mb-2">
                  Stops & Activities Included:
                </h4>
                <div className="p-4 bg-[#FFD54A]/20 border-2 border-[#111111] rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <MapPin className="w-4 h-4 text-[#D94B3D]" />
                    <span>Stops: {selectedDestinations.map((d) => d.name).join(" → ")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Sparkles className="w-4 h-4 text-[#FFB347]" />
                    <span>
                      Activities Selected: {selectedActivities.length > 0
                        ? selectedActivities.map((a) => a.title || a.name).join(", ")
                        : "None selected (AI Co-Pilot will suggest best activities)"}
                    </span>
                  </div>
                </div>
              </div>
            </NeoCard>

            {/* ─── AI Two-Options Generation Banner / Results ─── */}
            {isGeneratingAI && (
              <NeoCard className="p-8 border-[3px] border-[#171313] bg-[#FFF8EE] shadow-[6px_6px_0px_#171313] flex flex-col items-center justify-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFD54A] border-[3px] border-[#171313] flex items-center justify-center animate-spin shadow-[3px_3px_0px_#171313]">
                  <Sparkles className="w-6 h-6 text-[#171313]" />
                </div>
                <div>
                  <h4 className="font-display font-black text-xl text-[#171313]">
                    Generating your 2 Tripzyy travel plans...
                  </h4>
                  <p className="text-xs font-semibold text-neutral-600 max-w-md mt-1">
                    AI Co-Pilot is architecting two tailored options: Option #1 (💰 Best Value) and Option #2 (✨ Premium Experience).
                  </p>
                </div>
              </NeoCard>
            )}

            {aiError && (
              <NeoCard className="p-6 border-[3px] border-[#D94B3D] bg-[#FFEBEA] shadow-[4px_4px_0px_#D94B3D] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#D94B3D] text-white border-2 border-[#171313] flex items-center justify-center font-black">
                    !
                  </div>
                  <div>
                    <h5 className="font-display font-bold text-sm text-[#171313]">AI Generation Notice</h5>
                    <p className="text-xs text-neutral-700">{aiError}</p>
                  </div>
                </div>
                <NeoButton variant="primary" size="sm" onClick={handleGenerateAITrip}>
                  Try Again
                </NeoButton>
              </NeoCard>
            )}

            {aiOptions && !isGeneratingAI && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-black text-2xl text-[#171313]">
                      Compare AI Travel Options
                    </h3>
                    <p className="text-xs font-semibold text-neutral-600">
                      Choose the plan that fits your travel style best. Clicking &quot;Select&quot; will create your active workspace itinerary.
                    </p>
                  </div>
                  <NeoButton
                    variant="white"
                    size="sm"
                    onClick={handleGenerateAITrip}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Regenerate
                  </NeoButton>
                </div>

                {/* Side-by-Side 2 Comparison Cards (Matching Prompt Spec 4 & 5 & 6) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* OPTION 1: 💰 BUDGET SMART / BEST VALUE */}
                  <div className="p-6 rounded-2xl border-[3.5px] border-[#171313] bg-[#FFFFFF] shadow-[6px_6px_0px_#107038] flex flex-col justify-between transition-transform hover:-translate-y-1">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313]">
                        <span className="px-3 py-1 bg-[#B7F4D8] text-[#107038] border-2 border-[#171313] rounded-lg font-display font-black text-xs uppercase shadow-[2px_2px_0px_#171313]">
                          💰 BEST VALUE
                        </span>
                        <span className="text-xs font-extrabold uppercase text-neutral-600">
                          {aiOptions.budget_plan.duration_days} DAYS
                        </span>
                      </div>

                      <div>
                        <div className="font-display font-black text-3xl text-[#171313]">
                          ₹{aiOptions.budget_plan.total_cost.toLocaleString("en-IN")}
                        </div>
                        <h4 className="font-display font-extrabold text-base text-[#171313] mt-1 leading-snug">
                          {aiOptions.budget_plan.title}
                        </h4>
                        <p className="text-xs text-neutral-600 font-medium mt-1">
                          {aiOptions.budget_plan.description}
                        </p>
                      </div>

                      {/* Cost Breakdown Table */}
                      <div className="p-3 bg-neutral-50 border-2 border-[#171313] rounded-xl flex flex-col gap-2 text-xs">
                        <span className="font-display font-extrabold text-[11px] uppercase tracking-wider text-neutral-500">
                          Estimated Cost Breakdown:
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Hotel / Stays:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.budget_plan.cost_breakdown.accommodation.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Transport:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.budget_plan.cost_breakdown.transport.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Activities & Tours:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.budget_plan.cost_breakdown.activities.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Food & Dining:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.budget_plan.cost_breakdown.food.toLocaleString("en-IN")}</span>
                        </div>
                      </div>

                      {/* Key Value Proposition */}
                      <div className="p-3 bg-[#EAF7EE] border-2 border-[#107038] rounded-xl text-xs flex flex-col gap-1">
                        <span className="font-display font-black text-[11px] text-[#107038] uppercase">
                          ✓ Why this plan is cheaper:
                        </span>
                        <p className="text-neutral-700 font-medium leading-relaxed">
                          {aiOptions.budget_plan.why_cheaper || aiOptions.budget_plan.advantages}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-6 border-t-2 border-[#171313] mt-4">
                      <NeoButton
                        variant="white"
                        size="md"
                        className="flex-1"
                        onClick={() => setInspectingPlan(aiOptions.budget_plan)}
                      >
                        View Plan
                      </NeoButton>
                      <NeoButton
                        variant="primary"
                        size="md"
                        className="flex-1 bg-[#107038] text-white hover:bg-[#0d592d]"
                        onClick={() => handleSelectAIPlan(aiOptions.budget_plan)}
                        isLoading={isSelectingPlan}
                        rightIcon={<ArrowRight className="w-4 h-4" />}
                      >
                        Select This Plan
                      </NeoButton>
                    </div>
                  </div>

                  {/* OPTION 2: ✨ PREMIUM EXPERIENCE / BEST EXPERIENCE */}
                  <div className="p-6 rounded-2xl border-[3.5px] border-[#171313] bg-[#FFFFFF] shadow-[6px_6px_0px_#FFD54A] flex flex-col justify-between transition-transform hover:-translate-y-1">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313]">
                        <span className="px-3 py-1 bg-[#FFD54A] text-[#171313] border-2 border-[#171313] rounded-lg font-display font-black text-xs uppercase shadow-[2px_2px_0px_#171313]">
                          ✨ PREMIUM EXPERIENCE
                        </span>
                        <span className="text-xs font-extrabold uppercase text-neutral-600">
                          {aiOptions.premium_plan.duration_days} DAYS
                        </span>
                      </div>

                      <div>
                        <div className="font-display font-black text-3xl text-[#171313]">
                          ₹{aiOptions.premium_plan.total_cost.toLocaleString("en-IN")}
                        </div>
                        <h4 className="font-display font-extrabold text-base text-[#171313] mt-1 leading-snug">
                          {aiOptions.premium_plan.title}
                        </h4>
                        <p className="text-xs text-neutral-600 font-medium mt-1">
                          {aiOptions.premium_plan.description}
                        </p>
                      </div>

                      {/* Cost Breakdown Table */}
                      <div className="p-3 bg-neutral-50 border-2 border-[#171313] rounded-xl flex flex-col gap-2 text-xs">
                        <span className="font-display font-extrabold text-[11px] uppercase tracking-wider text-neutral-500">
                          Estimated Cost Breakdown:
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Premium Hotel / Resort:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.premium_plan.cost_breakdown.accommodation.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Private Transport:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.premium_plan.cost_breakdown.transport.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">VIP Activities & Passes:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.premium_plan.cost_breakdown.activities.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-700">Fine Dining & Tastings:</span>
                          <span className="font-extrabold font-mono">₹{aiOptions.premium_plan.cost_breakdown.food.toLocaleString("en-IN")}</span>
                        </div>
                      </div>

                      {/* Key Value Proposition */}
                      <div className="p-3 bg-[#FFF9E6] border-2 border-[#B28900] rounded-xl text-xs flex flex-col gap-1">
                        <span className="font-display font-black text-[11px] text-[#B28900] uppercase">
                          ★ Premium Perks & Advantages:
                        </span>
                        <p className="text-neutral-700 font-medium leading-relaxed">
                          {aiOptions.premium_plan.why_more || aiOptions.premium_plan.advantages}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-6 border-t-2 border-[#171313] mt-4">
                      <NeoButton
                        variant="white"
                        size="md"
                        className="flex-1"
                        onClick={() => setInspectingPlan(aiOptions.premium_plan)}
                      >
                        View Plan
                      </NeoButton>
                      <NeoButton
                        variant="yellow"
                        size="md"
                        className="flex-1 font-black"
                        onClick={() => handleSelectAIPlan(aiOptions.premium_plan)}
                        isLoading={isSelectingPlan}
                        rightIcon={<ArrowRight className="w-4 h-4" />}
                      >
                        Select This Plan
                      </NeoButton>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Navigation Buttons.

          Sticky, so Continue stays reachable however long the step's content
          runs -- on the destinations step the grid used to push it several
          screens below the fold. */}
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 py-3 px-3 -mx-3 bg-[#FAF7F2]/95 backdrop-blur-sm border-t-[3px] border-[#171313]">
        <NeoButton
          variant="white"
          size="md"
          onClick={handleBack}
          disabled={currentStep === 1 || isSubmitting || isGeneratingAI}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Previous Step
        </NeoButton>


        {currentStep < 4 ? (
          <NeoButton
            variant="primary"
            size="md"
            onClick={handleNext}
            rightIcon={<ArrowRight className="w-4 h-4 stroke-[2.5]" />}
          >
            Continue to Step {currentStep + 1}
          </NeoButton>
        ) : (
          <div className="flex items-center gap-3">
            <NeoButton
              variant="white"
              size="lg"
              onClick={handleCreateTrip}
              isLoading={isSubmitting}
            >
              Manual Init
            </NeoButton>
            <NeoButton
              variant="yellow"
              size="lg"
              onClick={handleGenerateAITrip}
              isLoading={isGeneratingAI || isSubmitting}
              rightIcon={<Sparkles className="w-5 h-5 stroke-[2.5]" />}
            >
              {aiOptions ? "Regenerate AI Plans" : "Generate with AI Co-Pilot"}
            </NeoButton>
          </div>
        )}
      </div>

      {/* Detailed Plan Inspection Modal */}
      {inspectingPlan && (
        <Modal
          isOpen={!!inspectingPlan}
          onClose={() => setInspectingPlan(null)}
          title={inspectingPlan.badge}
          subtitle={inspectingPlan.title}
          maxWidth="lg"
        >
          <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
            <div className="p-4 bg-[#FAECDC] border-2 border-[#171313] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-neutral-600 block">
                  Total Estimated Cost ({inspectingPlan.duration_days} Days)
                </span>
                <span className="font-display font-black text-2xl text-[#171313]">
                  ₹{inspectingPlan.total_cost.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-extrabold uppercase text-neutral-600 block">
                  Daily Spending
                </span>
                <span className="font-display font-extrabold text-lg text-[#171313]">
                  ₹{inspectingPlan.daily_budget.toLocaleString("en-IN")} / day
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h5 className="font-display font-extrabold text-sm uppercase tracking-wide text-[#171313]">
                Day-by-Day Stops & Activities:
              </h5>
              {inspectingPlan.stops.map((stop, sIdx) => (
                <div
                  key={sIdx}
                  className="p-4 bg-white border-2 border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                    <span className="font-display font-extrabold text-sm text-[#171313] flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#D94B3D]" />
                      Stop {sIdx + 1}: {stop.destination_name}
                    </span>
                    <span className="text-xs text-neutral-500 font-semibold">
                      {stop.arrival_date} → {stop.departure_date}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {stop.activities.map((act, aIdx) => (
                      <div
                        key={aIdx}
                        className="p-2.5 bg-neutral-50 border border-[#171313] rounded-lg flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-display font-bold text-xs text-[#171313]">
                            {act.title}
                          </div>
                          {act.notes && (
                            <div className="text-[11px] text-neutral-600 mt-0.5">{act.notes}</div>
                          )}
                        </div>
                        <span className="font-display font-extrabold text-xs text-[#171313] flex-shrink-0">
                          ₹{act.estimated_cost}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <NeoButton variant="white" size="sm" onClick={() => setInspectingPlan(null)}>
                Back to Comparison
              </NeoButton>
              <NeoButton
                variant={inspectingPlan.plan_type === "PREMIUM" ? "yellow" : "primary"}
                size="sm"
                onClick={() => {
                  const p = inspectingPlan;
                  setInspectingPlan(null);
                  handleSelectAIPlan(p);
                }}
              >
                Select &amp; Create Trip
              </NeoButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
