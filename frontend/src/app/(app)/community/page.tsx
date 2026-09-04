// ════════════════════════════════════════════════════════════════
// TRIPZYY — Shared Trip View
//
// This was the "Community Trips" feed: a browse grid of public trips with a
// preview modal. The feed is gone — it listed whatever happened to be public
// and its preview showed the same hardcoded three-day itinerary ("Scuba
// Diving Session", "Beachside Seafood Dinner") for every trip, whatever the
// destination.
//
// What remains is the other half of the route, which is load-bearing: every
// link "Share Itinerary" hands out is /community?slug=..., and this is what
// renders it. It now shows the trip's real stops and real activities, and
// nothing it cannot read from the API.
// ════════════════════════════════════════════════════════════════

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Copy,
  Calendar,
  MapPin,
  Compass,
  Wallet,
  Loader2,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { communityService } from "@/services/community";

/** The shape `/public/trips/{slug}` actually returns. */
interface SharedActivity {
  id: string;
  title: string;
  description?: string | null;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_cost?: string | number | null;
}

interface SharedStop {
  id: string;
  city_name: string;
  country?: string | null;
  arrival_date: string;
  departure_date: string;
  nights?: number;
  activities?: SharedActivity[];
}

interface SharedTrip {
  id: string;
  share_slug?: string | null;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  duration_days?: number;
  budget?: string | number | null;
  estimated_cost?: string | number | null;
  traveller_count: number;
  currency?: string;
  cities?: string[];
  stops?: SharedStop[];
  owner?: {
    id: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  };
  viewer?: {
    is_authenticated: boolean;
    is_owner: boolean;
    can_clone: boolean;
  };
}

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function SharedTripContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams?.get("slug");
  const { showToast } = useToast();

  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(slug));
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    // No setState needed on this branch: `isLoading` is initialised from
    // `Boolean(slug)`, so it is already false when there is nothing to fetch.
    if (!slug) return;
    let cancelled = false;

    communityService
      .getPublicTrip(slug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setTrip(res.data as unknown as SharedTrip);
        } else {
          setError(res.message || "That shared trip could not be found.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the Tripzyy API.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleClone = async () => {
    if (!trip || !slug) return;
    setIsCloning(true);
    try {
      const res = await communityService.cloneTrip(slug);
      if (res.success && res.data) {
        showToast(`Cloned "${trip.title}" into your trips.`, "success");
        router.push(`/trips/${res.data.id}`);
        return;
      }
      // A 401 here means the stored session has expired, which used to
      // surface as a bare "Invalid or expired token" with no way forward.
      if (res.error?.code === "UNAUTHORIZED") {
        showToast("Your session has expired. Please sign in again.", "error");
        router.push("/login");
        return;
      }
      showToast(res.message || "Could not clone this trip.", "error");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not clone this trip.",
        "error"
      );
    } finally {
      setIsCloning(false);
    }
  };

  if (!slug) {
    return (
      <div className="flex flex-col gap-8">
        <SectionHeader
          tag="Shared Trip"
          tagColor="red"
          title="Shared Trip"
          subtitle="Open a Tripzyy share link to view someone's itinerary here."
        />
        <EmptyState
          icon={<Compass className="w-10 h-10 text-[#111111]" />}
          title="No trip in this link"
          description="This page shows a trip someone shared with you. Ask them for the link, or plan your own."
          action={
            <Link href="/trips/new">
              <NeoButton variant="primary" size="sm">
                Plan a trip
              </NeoButton>
            </Link>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading the shared trip...
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex flex-col gap-8">
        <SectionHeader tag="Shared Trip" tagColor="red" title="Shared Trip" />
        <EmptyState
          icon={<Compass className="w-10 h-10 text-[#111111]" />}
          title="This trip is not available"
          description={
            error ||
            "The link may have expired, or the owner may have stopped sharing it."
          }
          action={
            <Link href="/trips">
              <NeoButton variant="primary" size="sm">
                Back to my trips
              </NeoButton>
            </Link>
          }
        />
      </div>
    );
  }

  const stops = trip.stops || [];
  const owner = trip.owner;
  const canClone = trip.viewer?.can_clone ?? true;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <SectionHeader
        tag="Shared Trip"
        tagColor="red"
        title={trip.title}
        subtitle={trip.description || undefined}
      />

      {/* Owner + headline figures */}
      <NeoCard className="p-6 bg-[#FFFFFF] flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-[#171313]">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={owner?.avatar_url || undefined}
              name={`${owner?.first_name || "Tripzyy"} ${owner?.last_name || "Traveller"}`}
              size="sm"
            />
            <div>
              <h5 className="font-display font-extrabold text-xs text-[#111111]">
                {owner?.first_name || "A Tripzyy traveller"} {owner?.last_name || ""}
              </h5>
              <span className="text-[10px] text-neutral-500 font-medium">
                shared this itinerary
              </span>
            </div>
          </div>

          {canClone && (
            <NeoButton
              variant="yellow"
              size="sm"
              isLoading={isCloning}
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={handleClone}
            >
              Clone into my trips
            </NeoButton>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold text-neutral-700">
          <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-lg border-2 border-[#171313]">
            <Calendar className="w-4 h-4 shrink-0" />
            <span>
              {trip.start_date} → {trip.end_date}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-lg border-2 border-[#171313]">
            <Users className="w-4 h-4 shrink-0" />
            <span>
              {trip.traveller_count}{" "}
              {trip.traveller_count === 1 ? "traveller" : "travellers"}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-lg border-2 border-[#171313]">
            <Wallet className="w-4 h-4 shrink-0" />
            <span>
              {trip.currency || "INR"} {money(trip.budget)}
            </span>
          </div>
        </div>

        {(trip.cities || []).length > 0 && (
          <div className="flex items-center gap-2 text-xs font-bold text-[#D94B3D]">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>{(trip.cities || []).join(" → ")}</span>
          </div>
        )}
      </NeoCard>

      {/* The actual itinerary. Only what the trip really contains -- this is
          where a hardcoded sample used to sit. */}
      {stops.length === 0 ? (
        <NeoCard className="p-6 bg-[#FFF4E6] border-dashed">
          <p className="font-display font-extrabold text-sm text-[#171313]">
            This trip has no stops yet.
          </p>
        </NeoCard>
      ) : (
        <div className="flex flex-col gap-4">
          {stops.map((stop, idx) => {
            const activities = stop.activities || [];
            return (
              <NeoCard key={stop.id} className="p-5 bg-[#FFFFFF] flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#171313]">
                  <span className="font-display font-extrabold text-sm text-[#171313] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#D94B3D]" />
                    Stop {idx + 1}: {stop.city_name}
                    {stop.country ? `, ${stop.country}` : ""}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-500">
                    {stop.arrival_date} → {stop.departure_date}
                  </span>
                </div>

                {activities.length === 0 ? (
                  <p className="text-xs font-semibold text-neutral-500">
                    No activities planned for this stop.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activities.map((act) => (
                      <div
                        key={act.id}
                        className="p-2.5 bg-neutral-50 border-2 border-[#171313] rounded-lg flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="font-display font-bold text-xs text-[#171313]">
                            {act.title}
                          </div>
                          <div className="text-[11px] text-neutral-600 mt-0.5">
                            {act.activity_date}
                            {act.start_time ? ` · ${act.start_time}` : ""}
                            {act.description ? ` — ${act.description}` : ""}
                          </div>
                        </div>
                        <span className="font-display font-extrabold text-xs text-[#171313] shrink-0">
                          ₹{money(act.estimated_cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </NeoCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SharedTripPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-display font-bold">Loading shared trip...</div>
      }
    >
      <SharedTripContent />
    </Suspense>
  );
}
