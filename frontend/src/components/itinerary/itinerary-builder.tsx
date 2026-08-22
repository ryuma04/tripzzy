"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoInput } from "@/components/ui/neo-input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mockDestinations, mockActivities } from "@/data/mock";
import type { Trip, TripStop, ItineraryActivity } from "@/types";

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

  // Modal for adding a new section/stop
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [selectedDestId, setSelectedDestId] = useState(mockDestinations[0].id);
  const [arrivalDate, setArrivalDate] = useState("2026-09-18");
  const [departureDate, setDepartureDate] = useState("2026-09-20");

  // Modal for adding an activity to a specific stop
  const [activeStopForActivity, setActiveStopForActivity] = useState<string | null>(null);
  const [actTitle, setActTitle] = useState("");
  const [actDate, setActDate] = useState("2026-09-10");
  const [actStart, setActStart] = useState("10:00");
  const [actEnd, setActEnd] = useState("13:00");
  const [actCost, setActCost] = useState(500);

  // Add new section/stop (Wireframe Screen 5 "Add another Section")
  const handleAddSection = () => {
    const dest = mockDestinations.find((d) => d.id === selectedDestId) || mockDestinations[0];
    const newStop: TripStop = {
      id: `stop_${Date.now()}`,
      trip_id: trip.id,
      destination_id: dest.id,
      destination: dest,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      order: stops.length + 1,
      accommodations: [],
      activities: [],
    };
    const updated = [...stops, newStop];
    setStops(updated);
    setIsAddSectionOpen(false);
    showToast(`Added stop for ${dest.name} to itinerary!`, "success");
    if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
  };

  // Remove stop
  const handleRemoveStop = (stopId: string) => {
    const updated = stops.filter((s) => s.id !== stopId);
    setStops(updated);
    showToast("Stop section removed.", "info");
    if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
  };

  // Reorder stop
  const handleMoveStop = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === stops.length - 1)
    )
      return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const newStops = [...stops];
    const temp = newStops[index];
    newStops[index] = newStops[targetIndex];
    newStops[targetIndex] = temp;
    setStops(newStops);
    showToast("Stops reordered successfully.", "success");
  };

  // Add activity to stop
  const handleAddActivity = () => {
    if (!activeStopForActivity || !actTitle.trim()) return;
    const newAct: ItineraryActivity = {
      id: `act_${Date.now()}`,
      stop_id: activeStopForActivity,
      title: actTitle,
      date: actDate,
      start_time: actStart,
      end_time: actEnd,
      estimated_cost: actCost,
      order: 99,
    };
    const updated = stops.map((s) => {
      if (s.id === activeStopForActivity) {
        return { ...s, activities: [...s.activities, newAct] };
      }
      return s;
    });
    setStops(updated);
    setActiveStopForActivity(null);
    setActTitle("");
    showToast("Activity added to destination stop!", "success");
    if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
  };

  // Remove activity
  const handleRemoveActivity = (stopId: string, actId: string) => {
    const updated = stops.map((s) => {
      if (s.id === stopId) {
        return {
          ...s,
          activities: s.activities.filter((a) => a.id !== actId),
        };
      }
      return s;
    });
    setStops(updated);
    showToast("Activity removed.", "info");
    if (onUpdateTrip) onUpdateTrip({ ...trip, stops: updated });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
        <div>
          <h3 className="font-display font-extrabold text-xl text-[#171313]">
            Multi-Stop Route Workspace
          </h3>
          <p className="text-xs font-semibold text-neutral-600">
            {stops.length} Destination Stops • Reorder stops & organize activities per city
          </p>
        </div>
        <NeoButton
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => setIsAddSectionOpen(true)}
        >
          Add Another Section
        </NeoButton>
      </div>

      {/* Multi-Section List (Wireframe Screen 5 Sections) */}
      <div className="flex flex-col gap-6">
        {stops.map((stop, index) => {
          const totalStopCost = stop.activities.reduce(
            (acc, curr) => acc + (curr.estimated_cost || 0),
            0
          );
          return (
            <NeoCard key={stop.id} className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313]">
              {/* Section Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b-2 border-[#171313]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border-2 border-[#171313] bg-[#D94B3D] text-white flex items-center justify-center font-display font-extrabold text-base shadow-[2px_2px_0px_#171313]">
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#D94B3D]">
                        Section {index + 1}: Destination Stop
                      </span>
                    </div>
                    <h3 className="font-display font-extrabold text-2xl text-[#171313]">
                      {stop.destination?.name || stop.destination?.city}
                    </h3>
                  </div>
                </div>

                {/* Section Meta & Reorder / Delete Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFF4E6] border border-[#171313] rounded-lg text-xs font-bold">
                    <Calendar className="w-3.5 h-3.5 text-[#D94B3D]" />
                    <span>
                      {stop.arrival_date} → {stop.departure_date}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F3B5A8]/40 border border-[#171313] rounded-lg text-xs font-bold">
                    <Wallet className="w-3.5 h-3.5 text-[#D94B3D]" />
                    <span>Est: ₹{totalStopCost.toLocaleString("en-IN")}</span>
                  </div>

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
                      className="p-1.5 rounded-lg border border-[#171313] bg-[#FFF4E6] hover:bg-[#D94B3D] hover:text-white text-red-600 transition-colors cursor-pointer ml-1"
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
                    Planned Activities ({stop.activities.length})
                  </span>
                  <NeoButton
                    variant="white"
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

                {stop.activities.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {stop.activities.map((act) => (
                      <div
                        key={act.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-neutral-50 border-2 border-[#111111] rounded-xl shadow-[2px_2px_0px_#111111] hover:bg-white transition-colors"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFD54A] border border-[#111111] flex items-center justify-center text-xs font-bold">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="font-display font-bold text-sm text-[#111111]">
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

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <span className="font-display font-extrabold text-sm text-[#111111]">
                            ₹{act.estimated_cost}
                          </span>
                          <button
                            onClick={() => handleRemoveActivity(stop.id, act.id)}
                            className="p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove Activity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-neutral-50 border-2 border-dashed border-[#111111]/30 rounded-xl text-center">
                    <p className="text-xs font-semibold text-neutral-500">
                      No activities added for {stop.destination?.city} yet. Click &quot;+ Add Activity&quot; above.
                    </p>
                  </div>
                )}
              </div>
            </NeoCard>
          );
        })}
      </div>

      {/* Wireframe Screen 5 "Add another Section" Main CTA */}
      <div className="flex justify-center pt-2">
        <NeoButton
          variant="primary"
          size="lg"
          leftIcon={<Plus className="w-5 h-5 stroke-[3]" />}
          onClick={() => setIsAddSectionOpen(true)}
          className="w-full sm:w-auto"
        >
          Add Another Section
        </NeoButton>
      </div>

      {/* Modal: Add Destination Section */}
      <Modal
        isOpen={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        title="Add Stop / Destination Section"
        subtitle="Attach a new city stop to this trip itinerary"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-[#111111]">
              Select Destination City
            </label>
            <select
              value={selectedDestId}
              onChange={(e) => setSelectedDestId(e.target.value)}
              className="w-full bg-[#FFFFFF] text-[#111111] font-bold text-sm border-[3px] border-[#111111] rounded-xl p-3 outline-none shadow-[3px_3px_0px_#111111]"
            >
              {mockDestinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.region}, {d.country})
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
            <NeoButton variant="yellow" size="sm" onClick={handleAddSection}>
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
            placeholder="e.g. Scuba Diving at Grande Island"
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
    </div>
  );
};
