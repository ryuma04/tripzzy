"use client";

import React from "react";
import {
  Clock,
  MapPin,
  Calendar,
  Wallet,
  Train,
  CheckCircle2,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { Badge } from "@/components/ui/badge";
import type { Trip, ItineraryActivity } from "@/types";

interface ItineraryViewProps {
  trip: Trip;
}

export const ItineraryView: React.FC<ItineraryViewProps> = ({ trip }) => {
  // Collect and group all activities across stops by Day/Date
  const allActivities: (ItineraryActivity & { stopName: string; city: string })[] = [];

  trip.stops?.forEach((stop) => {
    stop.activities?.forEach((act) => {
      allActivities.push({
        ...act,
        stopName: stop.destination?.name || "Destination",
        city: stop.destination?.city || "City",
      });
    });
  });

  // Group activities by date
  const groupedByDate: Record<
    string,
    (ItineraryActivity & { stopName: string; city: string })[]
  > = {};

  allActivities.forEach((act) => {
    const d = act.date || "Day 1";
    if (!groupedByDate[d]) groupedByDate[d] = [];
    groupedByDate[d].push(act);
  });

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="flex flex-col gap-8">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313]">
        <div>
          <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#D94B3D]">
            Chronological Timeline
          </span>
          <h3 className="font-display font-extrabold text-xl text-[#171313]">
            Itinerary for {trip.title}
          </h3>
        </div>
        <Badge variant="red">{allActivities.length} Physical Activities</Badge>
      </div>

      {/* Day by Day List (Wireframe Screen 9 Day 1, Day 2...) */}
      <div className="flex flex-col gap-6">
        {sortedDates.length > 0 ? (
          sortedDates.map((dateStr, dayIndex) => {
            const dayActs = groupedByDate[dateStr];
            const dayTotal = dayActs.reduce(
              (acc, curr) => acc + (curr.estimated_cost || 0),
              0
            );

            return (
              <NeoCard key={dateStr} className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313]">
                {/* Day Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-6 border-b-2 border-[#171313]">
                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-1 rounded-xl bg-[#D94B3D] text-white border-2 border-[#171313] font-display font-extrabold text-sm uppercase shadow-[2px_2px_0px_#171313]">
                      Day {dayIndex + 1}
                    </div>
                    <span className="font-display font-bold text-base text-[#171313]">
                      {new Date(dateStr).toLocaleDateString("en-IN", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-500 uppercase">
                      Est. Expense:
                    </span>
                    <span className="font-display font-extrabold text-sm text-[#171313] px-2.5 py-0.5 bg-[#FFF4E6] border border-[#171313] rounded-md">
                      ₹{dayTotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Timeline activity stream */}
                <div className="relative pl-6 border-l-[3px] border-[#171313] ml-4 flex flex-col gap-6">
                  {dayActs.map((act) => (
                    <div key={act.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[33px] top-1.5 w-5 h-5 rounded-full bg-[#D94B3D] border-2 border-[#171313] shadow-[1px_1px_0px_#171313] group-hover:scale-125 transition-transform" />

                      <div className="p-4 bg-[#FFFAF3] border-2 border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:-translate-y-0.5 transition-all">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-[#FFF4E6] border border-[#171313] text-[#D94B3D]">
                              {act.city}
                            </span>
                            <span className="text-xs text-neutral-500 font-bold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {act.start_time} - {act.end_time}
                            </span>
                          </div>
                          <h4 className="font-display font-extrabold text-base text-[#171313]">
                            {act.title}
                          </h4>
                          {act.notes && (
                            <p className="text-xs text-neutral-600 font-medium mt-1">
                              {act.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#171313]/20">
                          <span className="text-xs text-neutral-500 font-bold">Cost</span>
                          <span className="font-display font-extrabold text-base text-[#171313]">
                            ₹{act.estimated_cost}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </NeoCard>
            );
          })
        ) : (
          <NeoCard className="p-8 text-center bg-[#FFFFFF] border-[3px] border-[#171313]">
            <h4 className="font-display font-extrabold text-lg text-[#171313] mb-1">
              No Activities Scheduled Yet
            </h4>
            <p className="text-xs text-neutral-600 font-medium max-w-sm mx-auto">
              Switch to the Itinerary Builder tab to organize activities and day plans.
            </p>
          </NeoCard>
        )}
      </div>
    </div>
  );
};
