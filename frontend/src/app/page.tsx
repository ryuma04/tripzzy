"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  MapPin,
  Calendar,
  Wallet,
  Compass,
  Users,
  CheckCircle2,
  ChevronRight,
  Shield,
  Layers,
  Clock,
  Globe2,
} from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoCard } from "@/components/ui/neo-card";
import { SearchBar } from "@/components/ui/search-bar";
import { Badge } from "@/components/ui/badge";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { mockDestinations, mockTrips } from "@/data/mock";

export default function LandingPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/explore");
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF5E9] text-[#171313] flex flex-col selection:bg-[#E51919] selection:text-white">
      {/* ─── Top Public Navigation ─── */}
      <header className="sticky top-0 z-40 bg-[#FFF5E9]/95 backdrop-blur-md border-b-[3px] border-[#171313] px-4 md:px-10 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Official Tripzyy Logo */}
          <Link
            href="/"
            className="p-2 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[3px_3px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform block"
          >
            <TripzyyLogo size="md" />
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6 font-display font-bold text-sm uppercase tracking-wide">
            <Link href="/explore" className="hover:text-[#E51919] transition-colors">
              Explore Cities
            </Link>
            <Link href="/community" className="hover:text-[#E51919] transition-colors">
              Community Feed
            </Link>
            <Link href="/calendar" className="hover:text-[#E51919] transition-colors">
              Calendar
            </Link>
            <Link href="/admin" className="hover:text-[#E51919] transition-colors">
              Admin Demo
            </Link>
          </nav>

          {/* Auth CTA Buttons */}
          <div className="flex items-center gap-3">
            <Link href="/login">
              <NeoButton variant="cream" size="sm">
                Log In
              </NeoButton>
            </Link>
            <Link href="/dashboard">
              <NeoButton
                variant="primary"
                size="sm"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Launch App
              </NeoButton>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero Section (Image 2 Style - Rich Warm Card + Red Bus) ─── */}
      <section className="relative px-4 md:px-10 pt-10 pb-16 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#FAECDC] p-6 sm:p-10 md:p-14 shadow-[8px_8px_0px_#E51919] overflow-hidden">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
            <div className="max-w-2xl flex-1">
              {/* Tag Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#E51919] text-white border-2 border-[#171313] rounded-lg font-display font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-5">
                <Sparkles className="w-4 h-4 fill-white" />
                <span>Smart Multi-City Travel Planner</span>
              </div>

              {/* Headline */}
              <h1 className="font-display font-black text-4xl sm:text-5xl md:text-6xl text-[#171313] tracking-tight leading-[1.08] mb-4">
                Where is your next expedition heading?
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base md:text-lg font-medium text-neutral-700 leading-relaxed mb-8 max-w-2xl">
                Plan complex multi-city circuits, connect day-by-day itineraries, track budgets in real-time, and discover curated activities across India and beyond.
              </p>

              {/* Hero Quick Search Box */}
              <div className="flex flex-col sm:flex-row items-stretch gap-3 bg-[#FFFFFF] p-2.5 sm:p-3 rounded-2xl border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] max-w-2xl mb-8">
                <div className="flex-1">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onSearch={handleSearch}
                    placeholder="Search cities, beaches, treks, heritage circuits..."
                  />
                </div>
                <NeoButton
                  variant="primary"
                  size="md"
                  onClick={handleSearch}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Explore Now
                </NeoButton>
              </div>

              {/* Feature Checkpoints */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#171313]">
                <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-3 py-1.5 rounded-lg border-2 border-[#171313] shadow-[2px_2px_0px_#171313]">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Multi-Stop Route Mapping</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-3 py-1.5 rounded-lg border-2 border-[#171313] shadow-[2px_2px_0px_#171313]">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Real-Time Expense Breakdown</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-3 py-1.5 rounded-lg border-2 border-[#171313] shadow-[2px_2px_0px_#171313]">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Community Itinerary Cloning</span>
                </div>
              </div>
            </div>

            {/* Red Expedition Bus Graphic */}
            <div className="hidden lg:flex flex-col items-center justify-center p-6 bg-[#FFFFFF] border-[4px] border-[#171313] rounded-3xl shadow-[6px_6px_0px_#171313] flex-shrink-0">
              <div className="mb-3">
                <TripzyyLogo variant="icon" size="xl" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#E51919] text-white border-2 border-[#171313] rounded-lg text-xs font-display font-black uppercase shadow-[2px_2px_0px_#171313]">
                <Sparkles className="w-3.5 h-3.5 fill-white" />
                <span>Expedition Red Bus</span>
              </div>
              <span className="text-xs font-bold text-neutral-600 mt-2">
                Hop in & start planning
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Curated Regional Circuits (Option Cards) ─── */}
      <section className="px-4 md:px-10 py-12 max-w-7xl mx-auto w-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-md border-2 border-[#171313] bg-[#E51919] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-2">
              Featured Routes
            </span>
            <h2 className="font-display font-black text-3xl text-[#171313] tracking-tight">
              Top Regional Destination Circuits
            </h2>
          </div>
          <Link href="/explore">
            <NeoButton variant="cream" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
              View All Destinations
            </NeoButton>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockDestinations.slice(0, 4).map((dest) => (
            <NeoCard
              key={dest.id}
              interactive
              className="p-0 overflow-hidden flex flex-col justify-between group bg-[#FFFFFF]"
            >
              <div className="relative h-48 w-full border-b-[3px] border-[#171313] overflow-hidden">
                <Image
                  src={dest.image_url || "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600"}
                  alt={dest.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-0.5 bg-[#E51919] text-white border-2 border-[#171313] rounded-md font-display font-extrabold text-[11px] uppercase shadow-[2px_2px_0px_#171313]">
                    {dest.region}
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
                      Explore <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      </section>

      {/* ─── 4 Pillar Features Grid ─── */}
      <section className="px-4 md:px-10 py-12 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="inline-block px-2.5 py-0.5 rounded-md border-2 border-[#171313] bg-[#E51919] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-2">
            Why Tripzyy
          </span>
          <h2 className="font-display font-black text-3xl md:text-4xl text-[#171313] tracking-tight">
            Built for Modern Expedition Leaders
          </h2>
          <p className="text-sm font-medium text-neutral-600 mt-2">
            Everything you need from initial destination brainstorming to live journey execution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#E51919] text-white border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-4">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-[#171313] mb-2">
                Multi-City Architect
              </h3>
              <p className="text-xs text-neutral-600 font-medium leading-relaxed">
                Connect destinations sequentially. Calculate transit times and distribute days logically.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t-2 border-neutral-200 text-[11px] font-bold text-[#E51919]">
              Sequential Stops →
            </div>
          </NeoCard>

          <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FAF7F2] text-[#E51919] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-4">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-[#171313] mb-2">
                Interactive Travel Map
              </h3>
              <p className="text-xs text-neutral-600 font-medium leading-relaxed">
                Visualise route polylines, start points, and day-filtered activity markers in real-time.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t-2 border-neutral-200 text-[11px] font-bold text-[#E51919]">
              Interactive Polylines →
            </div>
          </NeoCard>

          <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FAF7F2] text-[#171313] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-4">
                <Wallet className="w-6 h-6 text-[#15803D]" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-[#171313] mb-2">
                Budget & Split Ledger
              </h3>
              <p className="text-xs text-neutral-600 font-medium leading-relaxed">
                Categorize expenses into Stay, Food, Transit, and Activities with visual Neo-Brutalist charts.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t-2 border-neutral-200 text-[11px] font-bold text-[#15803D]">
              Real-Time Tracking →
            </div>
          </NeoCard>

          <NeoCard className="p-6 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[4px_4px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FCA5A5]/40 text-[#171313] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-4">
                <Users className="w-6 h-6 text-[#E51919]" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-[#171313] mb-2">
                1-Click Trip Clone
              </h3>
              <p className="text-xs text-neutral-600 font-medium leading-relaxed">
                Browse public community itineraries and clone them into your private workspace with a single click.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t-2 border-neutral-200 text-[11px] font-bold text-[#E51919]">
              Community Sharing →
            </div>
          </NeoCard>
        </div>
      </section>

      {/* ─── Footer with Tripzyy Logo ─── */}
      <footer className="mt-auto bg-[#171313] text-[#FAF7F2] border-t-[4px] border-[#171313] py-12 px-4 md:px-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E51919] rounded-xl flex items-center justify-center text-white border-2 border-white">
              <TripzyyLogo variant="icon" size="sm" inverted />
            </div>
            <div>
              <div className="font-display font-black text-xl text-white tracking-tight">
                TRIPZYY
              </div>
              <p className="text-xs text-[#E6DCD1] font-medium">
                The Smart Travel Architecture Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-bold text-[#E6DCD1]">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/trips" className="hover:text-white transition-colors">
              My Trips
            </Link>
            <Link href="/explore" className="hover:text-white transition-colors">
              Catalog
            </Link>
            <Link href="/calendar" className="hover:text-white transition-colors">
              Calendar
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>

          <div className="text-xs text-[#E6DCD1] font-medium">
            © 2026 Tripzyy Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
