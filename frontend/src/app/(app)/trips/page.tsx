"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Filter, ArrowUpDown, MapPin, Share2, Copy, Check } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs } from "@/components/ui/tabs";
import { SearchBar } from "@/components/ui/search-bar";
import { Dropdown } from "@/components/ui/dropdown";
import { NeoButton } from "@/components/ui/neo-button";
import { TripCard } from "@/components/trips/trip-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { tripService } from "@/services/trips";
import { generateTripReportPDF } from "@/lib/report-generator";
import { DEMO_TRIPS, DEMO_TRIP_EXPENSES } from "@/lib/demo-data";
import { DEMO_MODE, noteDemoFallback } from "@/lib/demo-mode";
import { unwrapItems } from "@/lib/api";
import type { Trip, TripStatus, Expense } from "@/types";

export default function TripsPage() {
  const { showToast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedShareTrip, setSelectedShareTrip] = useState<Trip | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrips() {
      setIsLoading(true);
      try {
        const res = await tripService.list({ limit: 50 });
        if (res.success) {
          const items = unwrapItems<Trip>(res.data);
          // Zero trips is a legitimate state for a new account; only stand in
          // for it when demo mode is explicitly on.
          setTrips(items.length === 0 && DEMO_MODE ? DEMO_TRIPS : items);
        } else if (DEMO_MODE) {
          noteDemoFallback("trips list", res.message);
          setTrips(DEMO_TRIPS);
        } else {
          setError(res.message || "Could not load your trips.");
        }
      } catch (err) {
        if (DEMO_MODE) {
          noteDemoFallback("trips list", err);
          setTrips(DEMO_TRIPS);
        } else {
          console.error("Failed to load trips:", err);
          setError("Could not reach the Tripzyy API.");
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadTrips();
  }, []);

  // Tab counts
  const ongoingCount = trips.filter((t) => t.status === "ongoing").length;
  const upcomingCount = trips.filter((t) => t.status === "upcoming").length;
  const completedCount = trips.filter((t) => t.status === "completed").length;

  const tabs = [
    { id: "all", label: "All Trips", count: trips.length },
    { id: "ongoing", label: "Ongoing", count: ongoingCount },
    { id: "upcoming", label: "Upcoming", count: upcomingCount },
    { id: "completed", label: "Completed", count: completedCount },
  ];

  // Filtering
  const filteredTrips = trips.filter((trip) => {
    // Tab filter
    if (activeTab !== "all" && trip.status !== activeTab) return false;
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = trip.title.toLowerCase().includes(q);
      const matchStops = trip.stops?.some(
        (s) =>
          s.destination?.name?.toLowerCase().includes(q) ||
          s.destination?.city?.toLowerCase().includes(q)
      );
      if (!matchTitle && !matchStops) return false;
    }
    return true;
  });

  // Sorting
  const sortedTrips = [...filteredTrips].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
    }
    if (sortBy === "budget-high") return b.budget - a.budget;
    if (sortBy === "budget-low") return a.budget - b.budget;
    return 0;
  });

  const handleShare = async (trip: Trip) => {
    setSelectedShareTrip(trip);
    setHasCopied(false);
    try {
      const res = await tripService.share(trip.id);
      if (res.success && res.data?.share_slug) {
        setSelectedShareTrip({ ...trip, share_slug: res.data.share_slug, is_shared: true });
      }
    } catch {
      // Keep existing slug if already shared
    }
  };

  const handleCopyLink = () => {
    if (!selectedShareTrip) return;
    const shareUrl = `${window.location.origin}/community?slug=${selectedShareTrip.share_slug || selectedShareTrip.id}`;
    navigator.clipboard.writeText(shareUrl);
    setHasCopied(true);
    showToast("Shareable link copied to clipboard!", "success");
    setTimeout(() => setHasCopied(false), 3000);
  };

  const handleDownloadReport = async (trip: Trip) => {
    try {
      showToast(`Generating ${trip.title} travel dossier PDF...`, "info");
      // Fetch the trip's real expenses. This previously always used the demo
      // dataset, so a genuine trip's report was printed with somebody else's
      // Goa receipts on it.
      let expenses: Expense[] = [];
      const res = await tripService.getExpenses(trip.id);
      if (res.success) {
        expenses = unwrapItems<Expense>(res.data);
      }
      if (expenses.length === 0 && DEMO_MODE) {
        noteDemoFallback(`expenses for ${trip.id}`);
        expenses = DEMO_TRIP_EXPENSES[trip.id] || [];
      }
      generateTripReportPDF({ trip, expenses });
      showToast("Trip Report PDF downloaded successfully!", "success");
    } catch (err) {
      showToast("Failed to generate PDF report.", "error");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Page Header ─── */}
      <SectionHeader
        tag="Workspaces"
        tagColor="red"
        title="My Expeditions"
        subtitle="Manage and organize your multi-city travel itineraries, expenses, and maps."
        action={
          <Link href="/trips/new">
            <NeoButton variant="primary" size="md" leftIcon={<Plus className="w-5 h-5" />}>
              Create New Trip
            </NeoButton>
          </Link>
        }
      />

      {/* ─── Filter & Search Bar (Wireframe Screen 6 Header) ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313]">
        <div className="flex-1 max-w-md">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search trips by destination city, title..."
          />
        </div>

        <div className="flex items-center gap-3">
          <Dropdown
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "newest", label: "Date (Upcoming First)" },
              { value: "budget-high", label: "Budget (High to Low)" },
              { value: "budget-low", label: "Budget (Low to High)" },
            ]}
          />
        </div>
      </div>

      {/* Status Category Tabs (Wireframe Ongoing / Upcoming / Completed) */}
      <div>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Trip Cards Grid */}
      {error && !isLoading ? (
        <ErrorState
          title="Could not load your trips"
          message={error}
          onRetry={() => window.location.reload()}
        />
      ) : sortedTrips.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onShare={handleShare}
              onDownloadReport={handleDownloadReport}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<MapPin className="w-10 h-10 text-[#111111]" />}
          title="No Trips Found"
          description={
            searchQuery
              ? `No itineraries matching "${searchQuery}". Try adjusting your search query.`
              : `You don't have any ${activeTab !== "all" ? activeTab : ""} trips planned yet.`
          }
          action={
            <Link href="/trips/new">
              <NeoButton variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
                Plan a New Trip
              </NeoButton>
            </Link>
          }
        />
      )}

      {/* Share Modal */}
      {selectedShareTrip && (
        <Modal
          isOpen={!!selectedShareTrip}
          onClose={() => setSelectedShareTrip(null)}
          title="Share Itinerary"
          subtitle={`Generate public link for "${selectedShareTrip.title}"`}
          maxWidth="md"
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-neutral-700">
              Anyone with this link will be able to view this itinerary, budget breakdown, and clone it into their own account.
            </p>

            <div className="flex items-center gap-2 p-3 bg-neutral-100 border-[2px] border-[#111111] rounded-xl text-xs font-mono select-all">
              <span className="truncate">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/community?slug=${selectedShareTrip.share_slug || selectedShareTrip.id}`
                  : `https://tripzyy.io/community?slug=${selectedShareTrip.share_slug}`}
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <NeoButton
                variant="white"
                size="sm"
                onClick={() => setSelectedShareTrip(null)}
              >
                Close
              </NeoButton>
              <NeoButton
                variant="yellow"
                size="sm"
                leftIcon={hasCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                onClick={handleCopyLink}
              >
                {hasCopied ? "Link Copied!" : "Copy Public Link"}
              </NeoButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
