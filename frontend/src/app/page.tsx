"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Compass,
  Layers,
  Wallet,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { NeoCard } from "@/components/ui/neo-card";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { TravelMotionScene } from "@/components/landing/travel-motion-scene";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { mockDestinations } from "@/data/mock";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDF4EB] text-[#171313] flex flex-col selection:bg-[#D94B3D] selection:text-white">
      {/* ─── 🧭 TOP NAVIGATION (MATCHING REFERENCE EXACTLY) ─── */}
      <LandingNavbar />

      {/* ─── 🌍 HERO SECTION (EXACT VISUAL REPLICA OF REFERENCE) ─── */}
      <section className="relative px-6 sm:px-10 lg:px-16 pt-8 sm:pt-12 pb-10 sm:pb-14 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-2 items-center">
          {/* LEFT COLUMN: Exact Reference Typography & Action Composition - Shifted Left */}
          <div className="lg:col-span-5 flex flex-col items-start text-left pl-0 -ml-2 sm:-ml-6 lg:-ml-10 z-10">
            {/* Main Headline */}
            <h1 className="font-display font-black text-5xl sm:text-7xl lg:text-[70px] xl:text-[80px] text-[#171313] tracking-[-0.04em] leading-[0.93] uppercase mb-6 text-left">
              YOUR NEXT <br />
              <span className="text-[#D94B3D]">ADVENTURE</span> <br />
              STARTS HERE<span className="text-[#D94B3D]">.</span>
            </h1>

            {/* Subtext */}
            <p className="text-base sm:text-lg font-medium text-neutral-700 leading-snug mb-8 max-w-sm">
              Plan unforgettable journeys,<br />
              one destination at a time.
            </p>

            {/* CTAs Matching Reference */}
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <Link href="/register">
                <button className="flex items-center gap-2 py-3.5 sm:py-4 px-6 sm:px-7 bg-[#D94B3D] hover:bg-[#A8322A] text-white border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] font-display font-black text-xs sm:text-sm uppercase tracking-wider hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer">
                  <span>START PLANNING</span>
                  <ArrowRight className="w-5 h-5 stroke-[3]" />
                </button>
              </Link>
              <Link href="/explore">
                <button className="py-3.5 sm:py-4 px-6 sm:px-7 bg-[#FFFFFF] text-[#171313] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] font-display font-black text-xs sm:text-sm uppercase tracking-wider hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer">
                  EXPLORE ROUTES
                </button>
              </Link>
            </div>

            {/* SCROLL TO EXPLORE ↓ Static Indicator */}
            <div className="mt-12 sm:mt-16 flex flex-col items-start gap-1 text-[11px] font-display font-black uppercase tracking-widest text-[#171313]">
              <span>SCROLL TO EXPLORE</span>
              <span className="text-[#D94B3D] text-base leading-none font-black">
                ↓
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: Static Travel Artwork (Exact Reference Visual) */}
          <div className="lg:col-span-7 w-full flex justify-center items-center">
            <TravelMotionScene />
          </div>
        </div>
      </section>

      {/* ─── 🟥 BRAND MOMENT MARQUEE RIBBON ─── */}
      <section className="bg-[#171313] text-[#FDF4EB] border-y-[4px] border-[#171313] py-3.5 select-none overflow-hidden">
        <div className="flex items-center gap-10 whitespace-nowrap font-display font-black text-xs sm:text-sm uppercase tracking-widest">
          <span>PLAN</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>EXPLORE</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>GO</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>ONE EXPEDITION • ENDLESS STORIES</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>INTERACTIVE ROUTE POLYLINES</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>REAL-TIME EXPENSE TRACKING</span>
          <span className="text-[#D94B3D]">✦</span>
          <span>1-CLICK COMMUNITY CLONING</span>
          <span className="text-[#D94B3D]">✦</span>
        </div>
      </section>

      {/* ─── 📊 3 COMPACT PILLARS SECTION ─── */}
      <section className="px-6 sm:px-10 lg:px-16 py-16 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-block px-3 py-1 rounded-lg border-2 border-[#171313] bg-[#D94B3D] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-3">
            Core Workflow
          </span>
          <h2 className="font-display font-black text-3xl sm:text-4xl md:text-5xl text-[#171313] tracking-tight uppercase">
            Everything for your next journey
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <NeoCard className="p-7 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#D94B3D] text-white border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
                <Compass className="w-6 h-6" />
              </div>
              <div className="font-display font-black text-xs uppercase tracking-widest text-[#D94B3D] mb-1">
                01 / DISCOVER
              </div>
              <h3 className="font-display font-black text-2xl text-[#171313] mb-3">
                Explore Destinations
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 font-medium leading-relaxed">
                Discover vetted stops, scenic beach circuits, mountain summits, and cultural heritage across regions.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-[#171313] flex items-center justify-between text-xs font-bold">
              <span>Curated Cities</span>
              <span className="text-[#D94B3D]">Instant Plotted →</span>
            </div>
          </NeoCard>

          {/* Card 2 */}
          <NeoCard className="p-7 bg-[#FAECDC] border-[3px] border-[#171313] shadow-[5px_5px_0px_#D94B3D] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#171313] text-[#FDF4EB] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
                <Layers className="w-6 h-6 text-[#D94B3D]" />
              </div>
              <div className="font-display font-black text-xs uppercase tracking-widest text-[#171313] mb-1">
                02 / ARCHITECT
              </div>
              <h3 className="font-display font-black text-2xl text-[#171313] mb-3">
                Multi-City Itinerary
              </h3>
              <p className="text-xs sm:text-sm text-neutral-700 font-medium leading-relaxed">
                Connect stops chronologically. Calculate transit times and organize activities day-by-day on interactive maps.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-[#171313] flex items-center justify-between text-xs font-bold">
              <span>Smart Sequencing</span>
              <span className="text-[#171313]">Polyline Route →</span>
            </div>
          </NeoCard>

          {/* Card 3 */}
          <NeoCard className="p-7 bg-[#FFFFFF] border-[3px] border-[#171313] shadow-[5px_5px_0px_#171313] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#FDF4EB] text-[#15803D] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
                <Wallet className="w-6 h-6 text-[#15803D]" />
              </div>
              <div className="font-display font-black text-xs uppercase tracking-widest text-[#15803D] mb-1">
                03 / EXPEDITION LEDGER
              </div>
              <h3 className="font-display font-black text-2xl text-[#171313] mb-3">
                Budget & Split Ledger
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 font-medium leading-relaxed">
                Manage group travel costs across accommodation, transit, and activities with real-time Neo-Brutalist charts.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-[#171313] flex items-center justify-between text-xs font-bold">
              <span>Cost Transparency</span>
              <span className="text-[#15803D]">Zero Stress →</span>
            </div>
          </NeoCard>
        </div>
      </section>

      {/* ─── 🌄 FEATURED REGIONAL CIRCUITS (Curated Destinations) ─── */}
      <section className="px-6 sm:px-10 lg:px-16 py-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <span className="inline-block px-3 py-1 rounded-lg border-2 border-[#171313] bg-[#D94B3D] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-2">
              Featured Stops
            </span>
            <h2 className="font-display font-black text-3xl sm:text-4xl text-[#171313] tracking-tight uppercase">
              Top Travel Circuits
            </h2>
          </div>
          <Link href="/explore">
            <button className="py-2 px-4 bg-[#FFFFFF] border-[2px] border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] font-display font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer">
              <span>View Full Catalog</span>
              <ChevronRight className="w-4 h-4" />
            </button>
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
                  <span className="px-2.5 py-0.5 bg-[#D94B3D] text-white border-2 border-[#171313] rounded-md font-display font-extrabold text-[11px] uppercase shadow-[2px_2px_0px_#171313]">
                    {dest.region}
                  </span>
                </div>
              </div>

              <div className="p-5 flex flex-col flex-1 justify-between">
                <div>
                  <h3 className="font-display font-black text-lg text-[#171313] mb-1">
                    {dest.name}
                  </h3>
                  <p className="text-xs text-neutral-600 line-clamp-2 font-medium">
                    {dest.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t-2 border-[#171313] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#D94B3D]">
                    {dest.city}, {dest.country}
                  </span>
                  <Link href={`/explore?city=${encodeURIComponent(dest.city)}`}>
                    <button className="text-xs font-display font-black uppercase hover:underline flex items-center gap-1 cursor-pointer text-[#171313]">
                      Plan Stop <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                </div>
              </div>
            </NeoCard>
          ))}
        </div>
      </section>

      {/* ─── 🚀 BOTTOM CTA EXPERIENCE BANNER ─── */}
      <section className="px-6 sm:px-10 lg:px-16 py-16 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#D94B3D] p-8 sm:p-12 md:p-16 text-white shadow-[8px_8px_0px_#171313] overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#171313] text-[#FDF4EB] border-2 border-white rounded-lg font-display font-black text-xs uppercase mb-4 shadow-[2px_2px_0px_#FFFFFF]">
              <Sparkles className="w-4 h-4 fill-white" />
              <span>Ready for departure?</span>
            </div>

            <h2 className="font-display font-black text-3xl sm:text-5xl md:text-6xl text-white tracking-tight uppercase leading-[1.05] mb-4">
              Start your next expedition today.
            </h2>

            <p className="text-sm sm:text-base text-[#FDF4EB]/90 font-medium mb-8">
              Join fellow travelers building dynamic itineraries, interactive maps, and shared ledgers on Tripzyy.
            </p>

            <Link href="/register">
              <button className="flex items-center gap-2 py-4 px-8 bg-[#FFFFFF] text-[#171313] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] font-display font-black text-base uppercase hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer">
                <span>START PLANNING FREE</span>
                <ArrowRight className="w-5 h-5 stroke-[3]" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 🧭 CLEAN FOOTER ─── */}
      <footer className="mt-auto bg-[#171313] text-[#FDF4EB] border-t-[4px] border-[#171313] py-12 px-6 sm:px-10 lg:px-16">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-[#FFFFFF] rounded-2xl border-2 border-[#171313] shadow-[3px_3px_0px_#FFFFFF]">
              <TripzyyLogo size="sm" />
            </div>
            <div>
              <div className="font-display font-black text-lg text-white tracking-tight">
                TRIPZYY
              </div>
              <p className="text-xs text-neutral-400 font-medium">
                The Smart Travel Architecture Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-bold text-neutral-300">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/explore" className="hover:text-white transition-colors">
              Explore
            </Link>
            <Link href="/community" className="hover:text-white transition-colors">
              Community
            </Link>
            <Link href="/calendar" className="hover:text-white transition-colors">
              Calendar
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>

          <div className="text-xs text-neutral-400 font-medium">
            © 2026 Tripzyy Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
