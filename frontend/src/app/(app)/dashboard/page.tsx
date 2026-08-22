"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Compass,
  Plus,
  MapPin,
  Calendar,
  Wallet,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Users,
  Search,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { NeoCard } from "@/components/ui/neo-card";
import { NeoButton } from "@/components/ui/neo-button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { SearchBar } from "@/components/ui/search-bar";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { tripService } from "@/services/trips";
import { destinationService } from "@/services/destinations";
import { getStoredUser, getCurrentUser } from "@/lib/auth";
import type { Trip, Destination, User } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true);
      try {
        const [tripsRes, destsRes, userRes] = await Promise.all([
          tripService.list({ limit: 20 }),
          destinationService.search({ limit: 6 }),
          getCurrentUser(),
        ]);

        if (userRes.success && userRes.data) {
          setUser(userRes.data);
        }

        if (tripsRes.success && tripsRes.data) {
          const items = Array.isArray(tripsRes.data)
            ? tripsRes.data
            : (tripsRes.data as any).items || [];
          setTrips(items);
        }

        if (destsRes.success && destsRes.data) {
          const items = Array.isArray(destsRes.data)
            ? destsRes.data
            : (destsRes.data as any).items || [];
          setDestinations(items);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const activeTrip =
    trips.find((t) => t.status === "ongoing") ||
    trips.find((t) => t.status === "upcoming") ||
    trips[0];

  const totalBudget = trips.reduce((acc, t) => acc + (t.budget || 0), 0);
  const totalStops = trips.reduce(
    (acc, t) => acc + (t.stops?.length || 0),
    0
  );
  const totalTravellers = trips.reduce(
    (acc, t) => acc + (t.traveller_count || 1),
    0
  );

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─── Hero Action & Discovery Box (Image 2 - Richer Warm Card Contrast + Red Bus) ─── */}
      <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#FAECDC] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#E51919] overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="max-w-2xl flex-1">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="px-2.5 py-0.5 bg-[#E51919] text-white border-2 border-[#171313] rounded-md font-display font-black text-[11px] uppercase shadow-[2px_2px_0px_#171313] tracking-wider">
                ACTIVE EXPLORER STATION
              </span>
              <span className="text-xs font-bold text-neutral-700">
                Welcome back, {user?.first_name || "Explorer"}!
              </span>
            </div>

            <h1 className="font-display font-black text-3xl sm:text-4xl md:text-5xl text-[#171313] tracking-tight leading-[1.1] mb-3">
              Where is your next expedition heading?
            </h1>

            <p className="text-xs sm:text-sm font-medium text-neutral-700 mb-6 max-w-xl">
              Search multi-stop destinations, coordinate activities, and build budgets in your interactive workspace.
            </p>

            {/* Quick Search Input inside Hero Card */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 bg-[#FFFFFF] p-2 sm:p-2.5 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
              <div className="flex-1">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  placeholder="Search cities, beaches, treks or activities..."
                />
              </div>
              <NeoButton
                variant="primary"
                size="md"
                onClick={handleSearch}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Explore
              </NeoButton>
            </div>
          </div>

          {/* Red Expedition Campervan Bus Hero Illustration */}
          <div className="hidden lg:flex flex-col items-center justify-center p-4 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] flex-shrink-0">
            <div className="mb-2">
              <TripzyyLogo variant="icon" size="lg" />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#E51919] text-white border border-[#171313] rounded-lg text-[10px] font-display font-black uppercase shadow-[2px_2px_0px_#171313]">
              <Sparkles className="w-3 h-3 fill-white" />
              <span>Red Bus Co-Pilot</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-600 mt-1">
              Ready for Route Departure
            </span>
          </div>
        </div>
      </div>

      {/* ─── Platform Quick Stats ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Total Expeditions"
          value={trips.length}
          icon={<Compass className="w-6 h-6 text-[#FFFFFF]" />}
          color="red"
          trend="+1 new"
          trendPositive={true}
        />
        <StatCard
          label="Planned Budget"
          value={`₹${totalBudget.toLocaleString("en-IN")}`}
          icon={<Wallet className="w-6 h-6 text-[#E51919]" />}
          color="cream"
          trend="Within Limit"
          trendPositive={true}
        />
        <StatCard
          label="Active Stops"
          value={`${totalStops} Stops`}
          icon={<MapPin className="w-6 h-6 text-[#E51919]" />}
          color="white"
          trend={`${trips.length} Routes`}
          trendPositive={true}
        />
        <StatCard
          label="Expedition Crew"
          value={`${totalTravellers} Travellers`}
          icon={<Users className="w-6 h-6 text-[#171313]" />}
          color="soft-red"
          trend="Synced"
          trendPositive={true}
        />
      </div>

      {/* ─── Active Expedition Showcase (Screen 3 Live Banner) ─── */}
      {activeTrip && (
        <div>
          <SectionHeader
            tag="In Progress"
            tagColor="red"
            title="Live Active Expedition"
            subtitle="Your current journey is active on the map route timeline."
            action={
              <Link href={`/trips/${activeTrip.id}`}>
                <NeoButton variant="primary" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Open Command Center
                </NeoButton>
              </Link>
            }
          />

          <NeoCard className="p-6 md:p-8 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Badge status={activeTrip.status} />
                  <span className="font-display font-extrabold text-xs uppercase tracking-wider text-[#E51919]">
                    {activeTrip.stops?.map((s) => s.destination?.city || s.destination?.name).join(" → ")}
                  </span>
                </div>

                <h3 className="font-display font-extrabold text-2xl md:text-3xl text-[#171313]">
                  {activeTrip.title}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 font-medium mt-1 max-w-xl">
                  {activeTrip.description || "Multi-city journey across regional stops"}
                </p>

                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-neutral-700 mt-4">
                  <div className="flex items-center gap-1.5 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#171313]">
                    <Calendar className="w-3.5 h-3.5 text-[#E51919]" />
                    <span>
                      {activeTrip.start_date} to {activeTrip.end_date}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#171313]">
                    <Users className="w-3.5 h-3.5 text-[#E51919]" />
                    <span>{activeTrip.traveller_count} Travellers</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#171313]">
                    <span>Budget: ₹{activeTrip.budget.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              {/* Quick Jump Stop Pills */}
              <div className="flex flex-col gap-2 bg-[#F3ECE2] p-4 rounded-xl border-2 border-[#171313] min-w-[280px]">
                <span className="font-display font-extrabold text-xs uppercase text-neutral-700">
                  Route Stops ({activeTrip.stops?.length || 0})
                </span>
                <div className="flex flex-col gap-2">
                  {activeTrip.stops && activeTrip.stops.length > 0 ? (
                    activeTrip.stops.map((stop, i) => (
                      <div
                        key={stop.id}
                        className="flex items-center justify-between text-xs font-bold p-2 bg-[#FFFFFF] rounded-lg border border-[#171313]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-[#E51919] text-white flex items-center justify-center text-[10px] font-extrabold">
                            0{i + 1}
                          </span>
                          <span>{stop.destination?.city || stop.destination?.name || `Stop ${i + 1}`}</span>
                        </div>
                        <span className="text-neutral-500 font-medium">
                          {stop.activities?.length || 0} activities
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-500 font-medium">
                      No stops added yet.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </NeoCard>
        </div>
      )}

      {/* ─── Regional Destination Discovery (Wireframe Option Cards) ─── */}
      <div>
        <SectionHeader
          tag="Top Circuits"
          tagColor="cream"
          title="Curated Regional Circuits"
          subtitle="Explore preplanned multi-city itineraries and add stops with 1-click."
          action={
            <Link href="/explore">
              <NeoButton variant="cream" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
                View Catalog
              </NeoButton>
            </Link>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {destinations.slice(0, 3).map((dest) => (
            <NeoCard
              key={dest.id}
              interactive
              className="p-0 overflow-hidden flex flex-col justify-between group bg-[#FFFFFF]"
            >
              <div className="relative h-44 w-full border-b-[3px] border-[#171313] overflow-hidden">
                <Image
                  src={dest.image_url || "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600"}
                  alt={dest.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-0.5 bg-[#E51919] text-white border-2 border-[#171313] rounded-md font-display font-extrabold text-[11px] uppercase shadow-[2px_2px_0px_#171313]">
                    {dest.region || dest.country}
                  </span>
                </div>
              </div>

              <div className="p-5 flex flex-col flex-1 justify-between">
                <div>
                  <h3 className="font-display font-extrabold text-lg text-[#171313] mb-1">
                    {dest.name}
                  </h3>
                  <p className="text-xs text-neutral-600 line-clamp-2 font-medium">
                    {dest.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t-2 border-[#171313] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#E51919]">
                    {dest.city}, {dest.country}
                  </span>
                  <Link href={`/explore?city=${encodeURIComponent(dest.city)}`}>
                    <button className="text-xs font-display font-extrabold uppercase hover:underline flex items-center gap-1 cursor-pointer text-[#171313]">
                      Plan Stop <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      </div>

      {/* ─── AI Trip Assistant Feature Card ─── */}
      <NeoCard className="p-6 md:p-8 bg-[#171313] text-[#FAF7F2] border-[4px] border-[#171313] shadow-[6px_6px_0px_#E51919]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#E51919] text-white border border-white font-display font-extrabold text-xs uppercase mb-3 shadow-[2px_2px_0px_#FFFFFF]">
              <Sparkles className="w-3.5 h-3.5 fill-white" />
              <span>AI Route Co-Pilot</span>
            </div>
            <h3 className="font-display font-extrabold text-2xl md:text-3xl text-white tracking-tight">
              Need inspiration for your next itinerary?
            </h3>
            <p className="text-xs sm:text-sm text-[#E6DCD1] font-medium mt-1">
              Tell our routing co-pilot your budget and target vibes, and we will generate a multi-city schedule with realistic transit timings.
            </p>
          </div>

          <Link href="/trips/new">
            <NeoButton variant="primary" size="lg" rightIcon={<ArrowRight className="w-5 h-5" />}>
              Start Smart Planner
            </NeoButton>
          </Link>
        </div>
      </NeoCard>
    </div>
  );
}
