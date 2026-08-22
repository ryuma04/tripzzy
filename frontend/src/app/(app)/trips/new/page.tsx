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
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { TripMap } from "@/components/map";
import { destinationService } from "@/services/destinations";
import { activityService } from "@/services/activities";
import { tripService } from "@/services/trips";
import type { Destination, Activity } from "@/types";

export default function CreateTripPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);

  // Available catalog
  const [availableDestinations, setAvailableDestinations] = useState<Destination[]>([]);
  const [availableActivities, setAvailableActivities] = useState<Activity[]>([]);

  // Form State
  const [title, setTitle] = useState("Goa & Coastal Route Expedition");
  const [startDate, setStartDate] = useState("2026-10-12");
  const [endDate, setEndDate] = useState("2026-10-18");
  const [budget, setBudget] = useState(30000);
  const [travellerCount, setTravellerCount] = useState(2);
  const [selectedDestinations, setSelectedDestinations] = useState<Destination[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<Activity[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const [destsRes, actsRes] = await Promise.all([
          destinationService.search({ limit: 30 }),
          activityService.search({ limit: 30 }),
        ]);

        if (destsRes.success && destsRes.data) {
          const items = Array.isArray(destsRes.data)
            ? destsRes.data
            : (destsRes.data as any).items || [];
          setAvailableDestinations(items);
          if (items.length > 0) {
            setSelectedDestinations(items.slice(0, 2));
          }
        }

        if (actsRes.success && actsRes.data) {
          const items = Array.isArray(actsRes.data)
            ? actsRes.data
            : (actsRes.data as any).items || [];
          setAvailableActivities(items);
          if (items.length > 0) {
            setSelectedActivities(items.slice(0, 2));
          }
        }
      } catch (err) {
        console.error("Failed to load catalog for wizard:", err);
      }
    }

    loadCatalog();
  }, []);

  // Validation
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Trip title is required";
    if (!startDate) errs.startDate = "Start date is required";
    if (!endDate) errs.endDate = "End date is required";
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errs.endDate = "End date cannot be earlier than start date";
    }
    if (budget < 0) errs.budget = "Budget cannot be negative";
    if (travellerCount < 1) errs.travellerCount = "Must have at least 1 traveller";

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
      setSelectedDestinations(selectedDestinations.filter((d) => d.id !== dest.id));
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

  const handleCreateTrip = async () => {
    setIsSubmitting(true);
    try {
      // 1. Create Trip
      const createRes = await tripService.create({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        budget: Number(budget),
        traveller_count: Number(travellerCount),
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
          try {
            await tripService.addActivity(firstStopId, {
              title: act.name,
              date: startDate,
              start_time: "10:00",
              end_time: "13:00",
              estimated_cost: act.estimated_cost || 0,
              order: j,
              notes: act.description,
            });
          } catch (err) {
            console.warn("Failed to attach activity", act.id, err);
          }
        }
      }

      showToast("Trip and multi-city itinerary initialized!", "success");
      router.push(`/trips/${tripId}`);
    } catch (err: any) {
      showToast(err.message || "Failed to initialize trip. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleGenerateAITrip = async () => {
    if (!title || !startDate || !endDate || selectedDestinations.length === 0) {
      showToast("Please fill all required fields and select at least one destination.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      showToast("AI Route Co-Pilot is generating your itinerary...", "success");
      
      const res = await tripService.generate({
        destination_ids: selectedDestinations.map(d => d.id),
        start_date: startDate,
        end_date: endDate,
        budget_tier: budget > 50000 ? "Luxury" : budget > 20000 ? "Moderate" : "Budget",
        travel_style: selectedActivities.map(a => a.name).join(", ") || "General Sightseeing",
        traveller_count: Number(travellerCount),
      });

      if (!res.success || !res.data) {
        throw new Error(res.message || "Failed to generate AI trip");
      }

      showToast("AI Itinerary successfully generated!", "success");
      router.push(`/trips/${res.data.id}`);
    } catch (err: any) {
      showToast(err.message || "AI Generation failed. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = [
    { num: 1, label: "01 — Basic Details" },
    { num: 2, label: "02 — Destinations" },
    { num: 3, label: "03 — Suggestions" },
    { num: 4, label: "04 — Review & Plan" },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
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
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all select-none ${
                isCurrent
                  ? "bg-[#D94B3D] text-[#FFFFFF] border-[#171313] shadow-[2px_2px_0px_#171313] font-extrabold"
                  : isDone
                  ? "bg-[#5F8F6B] text-[#FFFFFF] border-[#171313] font-bold"
                  : "bg-[#FFFAF3] border-neutral-300 text-neutral-500 font-medium"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg border border-[#171313] flex items-center justify-center text-xs font-display font-extrabold ${
                  isCurrent
                    ? "bg-[#171313] text-[#FFF4E6]"
                    : isDone
                    ? "bg-[#171313] text-[#FFF4E6]"
                    : "bg-white text-neutral-500"
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span className="text-xs font-display tracking-tight truncate">
                {s.label}
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
                    onChange={(e) => setBudget(Number(e.target.value))}
                    error={errors.budget}
                    leftIcon={<Wallet className="w-4 h-4" />}
                    required
                  />
                  <NeoInput
                    label="Number of Travellers"
                    type="number"
                    min="1"
                    placeholder="2"
                    value={travellerCount}
                    onChange={(e) => setTravellerCount(Number(e.target.value))}
                    error={errors.travellerCount}
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
                        className="hover:text-neutral-200"
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
                    height="320px"
                    showControls={true}
                    showLegend={true}
                  />
                </div>
              )}

              {/* Destination Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {availableDestinations.map((dest) => {
                  const isSelected = selectedDestinations.some((d) => d.id === dest.id);
                  return (
                    <div
                      key={dest.id}
                      onClick={() => toggleDestination(dest)}
                      className={`p-4 rounded-xl border-[3px] border-[#171313] transition-all cursor-pointer select-none flex flex-col justify-between ${
                        isSelected
                          ? "bg-[#F3B5A8]/30 shadow-[4px_4px_0px_#D94B3D] -translate-x-0.5 -translate-y-0.5 border-[#171313]"
                          : "bg-white hover:bg-[#FFFAF3] shadow-[2px_2px_0px_#171313]"
                      }`}
                    >
                      <div className="relative h-32 w-full rounded-lg border-2 border-[#171313] overflow-hidden mb-3">
                        <Image
                          src={dest.image_url || "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=400&auto=format&fit=crop&q=80"}
                          alt={dest.name}
                          fill
                          sizes="250px"
                          className="object-cover"
                          unoptimized
                        />
                        <span className="absolute top-2 left-2 text-[10px] font-extrabold uppercase px-2 py-0.5 bg-[#FFF4E6] border border-[#171313] rounded text-[#171313]">
                          {dest.region || dest.country}
                        </span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#D94B3D] border-2 border-[#171313] flex items-center justify-center text-white">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="mb-3">
                        <h4 className="font-display font-extrabold text-base text-[#171313]">
                          {dest.name}
                        </h4>
                        <span className="text-xs font-bold text-[#D94B3D]">
                          {dest.city}, {dest.country}
                        </span>
                      </div>

                      <NeoButton
                        variant={isSelected ? "green" : "cream"}
                        size="sm"
                        className="w-full"
                      >
                        {isSelected ? "Selected ✓" : "+ Add Stop"}
                      </NeoButton>
                    </div>
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
              <div className="flex items-center justify-between pb-4 border-b-2 border-[#111111]">
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
                <Badge variant="green">{selectedActivities.length} Activities Added</Badge>
              </div>

              {/* Activity Recommendations Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableActivities.map((act) => {
                  const isSelected = selectedActivities.some((a) => a.id === act.id);
                  return (
                    <div
                      key={act.id}
                      onClick={() => toggleActivity(act)}
                      className={`p-4 rounded-xl border-[3px] border-[#111111] transition-all cursor-pointer select-none flex gap-4 ${
                        isSelected
                          ? "bg-[#6EE7B7]/25 shadow-[4px_4px_0px_#111111] -translate-x-0.5 -translate-y-0.5"
                          : "bg-white hover:bg-neutral-50 shadow-[2px_2px_0px_#111111]"
                      }`}
                    >
                      <div className="relative w-24 h-24 rounded-lg border-2 border-[#111111] overflow-hidden flex-shrink-0">
                        <Image
                          src={act.image_url || "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&auto=format&fit=crop&q=80"}
                          alt={act.name || "Activity image"}
                          fill
                          sizes="100px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>

                      <div className="flex flex-col justify-between flex-1">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-neutral-100 border border-[#111111]">
                              {act.category}
                            </span>
                            <span className="font-display font-extrabold text-xs text-[#111111]">
                              ₹{act.estimated_cost}
                            </span>
                          </div>
                          <h4 className="font-display font-bold text-sm text-[#111111] leading-tight">
                            {act.name}
                          </h4>
                          <span className="text-[11px] text-neutral-500 block mt-1">
                            Duration: {act.duration_hours} hours
                          </span>
                        </div>

                        <div className="flex justify-end pt-2">
                          <NeoButton
                            variant={isSelected ? "green" : "white"}
                            size="sm"
                          >
                            {isSelected ? "Added ✓" : "+ Add to Trip"}
                          </NeoButton>
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
          >
            <NeoCard className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center gap-2 pb-4 border-b-2 border-[#111111]">
                <Check className="w-5 h-5 text-[#6EE7B7]" />
                <h3 className="font-display font-extrabold text-xl text-[#111111]">
                  Step 4: Review Trip Summary
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
                    ₹{budget.toLocaleString("en-IN")} • {travellerCount} Travellers
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-display font-bold text-sm text-[#111111] uppercase tracking-wide mb-2">
                  Stops & Activities Included:
                </h4>
                <div className="p-4 bg-[#FFD54A]/20 border-2 border-[#111111] rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <MapPin className="w-4 h-4" />
                    <span>Stops: {selectedDestinations.map((d) => d.name).join(" → ")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>Activities Selected: {selectedActivities.length} planned</span>
                  </div>
                </div>
              </div>
            </NeoCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        <NeoButton
          variant="white"
          size="md"
          onClick={handleBack}
          disabled={currentStep === 1 || isSubmitting}
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
              isLoading={isSubmitting}
              rightIcon={<Sparkles className="w-5 h-5 stroke-[2.5]" />}
            >
              Generate with AI Co-Pilot
            </NeoButton>
          </div>
        )}
      </div>
    </div>
  );
}
