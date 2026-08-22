"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Calendar,
  Users,
  MapPin,
  Share2,
  ArrowRight,
  MoreVertical,
  Download,
  Sparkles,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import type { Trip } from "@/types";

interface TripCardProps {
  trip: Trip;
  onShare?: (trip: Trip) => void;
  onDownloadReport?: (trip: Trip) => void;
  redShadow?: boolean;
}

export const TripCard: React.FC<TripCardProps> = ({
  trip,
  onShare,
  onDownloadReport,
  redShadow = false,
}) => {
  const cities = trip.stops?.map((s) => s.destination?.city || s.destination?.name) || [];
  const primaryImage =
    trip.cover_image_url ||
    trip.stops?.[0]?.destination?.image_url ||
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800";

  return (
    <NeoCard
      interactive
      redShadow={redShadow}
      className="p-0 overflow-hidden flex flex-col justify-between group bg-[#FFFFFF]"
    >
      {/* Top Banner Image with Badges */}
      <div className="relative h-48 w-full border-b-[3px] border-[#171313] overflow-hidden">
        <Image
          src={primaryImage}
          alt={trip.title}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          unoptimized
        />

        {/* Status Badge */}
        <div className="absolute top-3 left-3 z-10">
          <Badge status={trip.status} />
        </div>

        {/* Budget Pill */}
        <div className="absolute top-3 right-3 z-10">
          <span className="px-2.5 py-1 bg-[#D94B3D] text-white border-2 border-[#171313] rounded-lg font-display font-extrabold text-xs shadow-[2px_2px_0px_#171313]">
            ₹{trip.budget.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Card Content Body */}
      <div className="p-5 flex flex-col flex-1 justify-between">
        <div>
          {/* Route Sequence Pills */}
          {cities.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-display font-extrabold uppercase text-[#D94B3D] mb-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{cities.join(" → ")}</span>
            </div>
          )}

          <h3 className="font-display font-extrabold text-xl text-[#171313] line-clamp-1">
            {trip.title}
          </h3>

          <p className="text-xs text-neutral-600 font-medium line-clamp-2 mt-1">
            {trip.description}
          </p>
        </div>

        <div className="mt-4 pt-4 border-t-2 border-[#171313]">
          {/* Meta Details */}
          <div className="flex items-center justify-between text-xs font-bold text-neutral-600 mb-4">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#D94B3D]" />
              <span>
                {trip.start_date} - {trip.end_date}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#D94B3D]" />
              <span>{trip.traveller_count} Crew</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <Link href={`/trips/${trip.id}`} className="flex-1">
              <NeoButton
                variant="primary"
                size="sm"
                className="w-full"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Open Itinerary
              </NeoButton>
            </Link>

            {onDownloadReport && (
              <button
                type="button"
                onClick={() => onDownloadReport(trip)}
                title="Download Trip Report PDF"
                className="p-2 bg-[#FFD54A] hover:bg-[#ffe285] text-[#171313] border-[2px] border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            )}

            {onShare && (
              <button
                type="button"
                onClick={() => onShare(trip)}
                title="Share Itinerary"
                className="p-2 bg-[#FFF4E6] hover:bg-[#FFFAF3] text-[#171313] border-[2px] border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:-translate-y-0.5 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </NeoCard>
  );
};
