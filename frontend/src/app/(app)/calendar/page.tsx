"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  ArrowRight,
  Filter,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { tripService } from "@/services/trips";
import type { CalendarEvent, Trip } from "@/types";

export default function CalendarPage() {
  const now = new Date();
  const [currentMonthIndex, setCurrentMonthIndex] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewFilter, setViewFilter] = useState("all");

  useEffect(() => {
    async function loadCalendar() {
      try {
        const res = await tripService.list({ limit: 50 });
        if (res.success && res.data) {
          const trips: Trip[] = Array.isArray(res.data)
            ? res.data
            : (res.data as any).items || [];
          
          const extractedEvents: CalendarEvent[] = [];
          for (const trip of trips) {
            if (trip.stops) {
              for (const stop of trip.stops) {
                // Stop arrival
                if (stop.arrival_date) {
                  extractedEvents.push({
                    id: `stop_${stop.id}`,
                    tripId: trip.id,
                    title: `Arrive in ${stop.destination?.city || stop.destination?.name || "City"}`,
                    date: stop.arrival_date,
                    start_time: "09:00",
                    end_time: "10:00",
                    type: "transport",
                    city: stop.destination?.city || stop.destination?.name || "Stop",
                  });
                }
                // Stop activities
                if (stop.activities) {
                  for (const act of stop.activities) {
                    extractedEvents.push({
                      id: `act_${act.id}`,
                      tripId: trip.id,
                      title: act.title,
                      date: act.date,
                      start_time: act.start_time || "10:00",
                      end_time: act.end_time || "13:00",
                      type: "activity",
                      city: stop.destination?.city || stop.destination?.name || "Stop",
                    });
                  }
                }
              }
            }
          }
          setEvents(extractedEvents);
        }
      } catch (err) {
        console.error("Failed to load calendar events:", err);
      }
    }

    loadCalendar();
  }, []);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonthIndex((m) => m + 1);
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonthIndex, 1).getDay();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const getEventsForDay = (day: number) => {
    const formattedDate = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((ev) => {
      if (viewFilter !== "all" && ev.type !== viewFilter) return false;
      return ev.date === formattedDate;
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Schedule"
        tagColor="red"
        title="Calendar View Screen"
        subtitle="Visual timeline of all booked flights, train connections, and scheduled activities"
        action={
          <Link href="/trips/new">
            <NeoButton variant="primary" size="sm">
              + Plan New Date
            </NeoButton>
          </Link>
        }
      />

      {/* ─── Month Navigation & Filter Controls (Wireframe Screen 11 Header) ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        {/* Month Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevMonth}
            className="w-9 h-9 rounded-xl border-2 border-[#171313] bg-[#FFFFFF] flex items-center justify-center text-[#171313] shadow-[2px_2px_0px_#171313] hover:bg-[#D94B3D] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <h3 className="font-display font-extrabold text-xl text-[#171313] min-w-[180px] text-center">
            {monthNames[currentMonthIndex]} {currentYear}
          </h3>

          <button
            onClick={handleNextMonth}
            className="w-9 h-9 rounded-xl border-2 border-[#171313] bg-[#FFFFFF] flex items-center justify-center text-[#171313] shadow-[2px_2px_0px_#171313] hover:bg-[#D94B3D] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* View Filters */}
        <div className="flex items-center gap-2">
          <Dropdown
            value={viewFilter}
            onChange={setViewFilter}
            options={[
              { value: "all", label: "All Scheduled Events" },
              { value: "activity", label: "Activities & Treks" },
              { value: "transport", label: "Transit & Trains" },
              { value: "accommodation", label: "Hotel Check-ins" },
            ]}
          />
        </div>
      </div>

      {/* ─── Calendar Grid (Wireframe Screen 11 Grid) ─── */}
      <NeoCard className="p-4 md:p-6 bg-[#FFFFFF] overflow-x-auto">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-2 mb-3 min-w-[700px]">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
            <div
              key={day}
              className="text-center font-display font-extrabold text-xs uppercase tracking-wider py-2 bg-neutral-100 border-2 border-[#111111] rounded-lg shadow-[2px_2px_0px_#111111]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Month Day Cells */}
        <div className="grid grid-cols-7 gap-2 min-w-[700px]">
          {emptyDays.map((_, i) => (
            <div
              key={`empty-${i}`}
              className="h-28 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50"
            />
          ))}

          {daysArray.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isToday = day === 22 && currentMonthIndex === 7 && currentYear === 2026;

            return (
              <div
                key={`day-${day}`}
                className={`h-28 p-2 rounded-xl border-2 border-[#111111] flex flex-col justify-between transition-all select-none ${
                  isToday
                    ? "bg-[#FFD54A]/30 shadow-[3px_3px_0px_#111111]"
                    : "bg-white hover:bg-neutral-50 shadow-[2px_2px_0px_#111111]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-display font-extrabold text-xs w-6 h-6 rounded-md flex items-center justify-center ${
                      isToday
                        ? "bg-[#111111] text-[#FFD54A]"
                        : dayEvents.length > 0
                        ? "bg-neutral-100 border border-[#111111] text-[#111111]"
                        : "text-neutral-500"
                    }`}
                  >
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-[#4F7DF9]" />
                  )}
                </div>

                {/* Event Tags inside Day Cell */}
                <div className="flex flex-col gap-1 overflow-y-auto max-h-16 scrollbar-none">
                  {dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-[#111111] truncate text-left cursor-pointer transition-transform hover:scale-102 ${
                        ev.type === "transport"
                          ? "bg-[#6EE7B7] text-[#111111]"
                          : "bg-[#FFD54A] text-[#111111]"
                      }`}
                    >
                      {ev.start_time} {ev.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </NeoCard>

      {/* ─── Event Details Modal ─── */}
      {selectedEvent && (
        <Modal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title={selectedEvent.title}
          subtitle={`Scheduled for ${selectedEvent.date}`}
          maxWidth="sm"
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-neutral-50 border-2 border-[#111111] rounded-xl flex flex-col gap-2 text-xs font-bold">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#4F7DF9]" />
                <span>
                  Timing: {selectedEvent.start_time} - {selectedEvent.end_time}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#FFB347]" />
                <span>Location: {selectedEvent.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-neutral-200 border border-[#111111]">
                  Category: {selectedEvent.type}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <NeoButton
                variant="white"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </NeoButton>
              <Link href={selectedEvent.tripId ? `/trips/${selectedEvent.tripId}` : "/trips"}>
                <NeoButton
                  variant="yellow"
                  size="sm"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  View Itinerary
                </NeoButton>
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
