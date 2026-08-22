"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  MapPin,
  Sparkles,
  Layers,
  Wallet,
  Users,
  ChevronRight,
  CheckCircle2,
  Calendar,
  Clock,
  Globe2,
} from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { NeoCard } from "@/components/ui/neo-card";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { TravelMotionScene } from "@/components/landing/travel-motion-scene";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";
import { mockDestinations } from "@/data/mock";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FFF5E9] text-[#171313] flex flex-col selection:bg-[#E51919] selection:text-white">
      {/* ─── 🧭 TOP NAVIGATION ─── */}
      <LandingNavbar />

      {/* ─── 🌍 HERO SECTION — MAIN EXPERIENCE ─── */}
      <section className="relative px-4 sm:px-8 lg:px-12 pt-8 sm:pt-14 pb-12 sm:pb-20 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* LEFT: Large Editorial Typography & Short Powerful Action */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="lg:col-span-6 flex flex-col items-start"
          >
            {/* Minimal Tag Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl font-display font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#E51919] animate-pulse" />
              <span>Smart Travel Architecture</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display font-black text-4xl sm:text-6xl lg:text-[64px] xl:text-[72px] text-[#171313] tracking-[-0.04em] leading-[0.98] uppercase mb-5">
              YOUR NEXT <br />
              <span className="text-[#E51919] underline decoration-[#171313] decoration-[4px] underline-offset-4">
                ADVENTURE
              </span> <br />
              STARTS HERE.
            </h1>

            {/* Short Supporting Sentence */}
            <p className="text-base sm:text-lg font-medium text-neutral-700 leading-relaxed max-w-md mb-8">
              Plan unforgettable journeys, one destination at a time.
            </p>

            {/* Primary Action CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mb-8">
              <Link href="/register">
                <NeoButton
                  variant="primary"
                  size="lg"
                  rightIcon={<ArrowRight className="w-5 h-5 stroke-[2.5]" />}
                  className="w-full sm:w-auto text-sm sm:text-base py-3.5 px-8 shadow-[5px_5px_0px_#171313]"
                >
                  Start Planning
                </NeoButton>
              </Link>
              <Link href="/explore">
                <NeoButton
                  variant="white"
                  size="lg"
                  className="w-full sm:w-auto text-sm sm:text-base py-3.5 px-6"
                >
                  Explore Circuits
                </NeoButton>
              </Link>
            </div>

            {/* Minimal Feature Trust Micro-Checks */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-neutral-700">
              <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-3 py-1.5 rounded-xl border-2 border-[#171313] shadow-[2px_2px_0px_#171313]">
                <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                <span>Multi-Stop Route Mapping</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-3 py-1.5 rounded-xl border-2 border-[#171313] shadow-[2px_2px_0px_#171313]">
                <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                <span>Shared Budget Splits</span>
              </div>
            </div>
          </motion.div>

          {/* RIGHT: THE INTERACTIVE TRAVEL MOTION SCENE */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="lg:col-span-6 w-full"
          >
            <TravelMotionScene />
          </motion.div>
        </div>
      </section>

      {/* ─── 🟥 BRAND MOMENT MARQUEE RIBBON ─── */}
      <section className="bg-[#171313] text-[#FFF5E9] border-y-[4px] border-[#171313] py-4 select-none overflow-hidden">
        <div className="flex items-center gap-10 whitespace-nowrap font-display font-black text-sm sm:text-base uppercase tracking-widest animate-[marquee_20s_linear_infinite]">
          <span>PLAN</span>
          <span className="text-[#E51919]">✦</span>
          <span>EXPLORE</span>
          <span className="text-[#E51919]">✦</span>
          <span>GO</span>
          <span className="text-[#E51919]">✦</span>
          <span>ONE EXPEDITION • ENDLESS STORIES</span>
          <span className="text-[#E51919]">✦</span>
          <span>INTERACTIVE ROUTE POLYLINES</span>
          <span className="text-[#E51919]">✦</span>
          <span>REAL-TIME EXPENSE TRACKING</span>
          <span className="text-[#E51919]">✦</span>
          <span>1-CLICK COMMUNITY CLONING</span>
          <span className="text-[#E51919]">✦</span>
        </div>
      </section>

      {/* ─── 📊 3 COMPACT PILLARS SECTION ─── */}
      <section className="px-4 sm:px-8 lg:px-12 py-16 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-block px-3 py-1 rounded-lg border-2 border-[#171313] bg-[#E51919] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-3">
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
              <div className="w-12 h-12 rounded-2xl bg-[#E51919] text-white border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
                <Compass className="w-6 h-6" />
              </div>
              <div className="font-display font-black text-xs uppercase tracking-widest text-[#E51919] mb-1">
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
              <span className="text-[#E51919]">Instant Plotted →</span>
            </div>
          </NeoCard>

          {/* Card 2 */}
          <NeoCard className="p-7 bg-[#FAECDC] border-[3px] border-[#171313] shadow-[5px_5px_0px_#E51919] flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#171313] text-[#FFF5E9] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
                <Layers className="w-6 h-6 text-[#E51919]" />
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
              <div className="w-12 h-12 rounded-2xl bg-[#FFF5E9] text-[#15803D] border-2 border-[#171313] flex items-center justify-center shadow-[3px_3px_0px_#171313] mb-5">
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
      <section className="px-4 sm:px-8 lg:px-12 py-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <span className="inline-block px-3 py-1 rounded-lg border-2 border-[#171313] bg-[#E51919] text-white font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-2">
              Featured Stops
            </span>
            <h2 className="font-display font-black text-3xl sm:text-4xl text-[#171313] tracking-tight uppercase">
              Top Travel Circuits
            </h2>
          </div>
          <Link href="/explore">
            <NeoButton variant="white" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
              View Full Catalog
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
                  <h3 className="font-display font-black text-lg text-[#171313] mb-1">
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
      <section className="px-4 sm:px-8 lg:px-12 py-16 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl border-[4px] border-[#171313] bg-[#E51919] p-8 sm:p-12 md:p-16 text-white shadow-[8px_8px_0px_#171313] overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#171313] text-[#FFF5E9] border-2 border-white rounded-lg font-display font-black text-xs uppercase mb-4 shadow-[2px_2px_0px_#FFFFFF]">
              <Sparkles className="w-4 h-4 fill-white" />
              <span>Ready for departure?</span>
            </div>

            <h2 className="font-display font-black text-3xl sm:text-5xl md:text-6xl text-white tracking-tight uppercase leading-[1.05] mb-4">
              Start your next expedition today.
            </h2>

            <p className="text-sm sm:text-base text-[#FFF5E9]/90 font-medium mb-8">
              Join fellow travelers building dynamic itineraries, interactive maps, and shared ledgers on Tripzyy.
            </p>

            <Link href="/register">
              <NeoButton
                variant="white"
                size="lg"
                rightIcon={<ArrowRight className="w-5 h-5 stroke-[2.5]" />}
                className="py-4 px-8 text-base shadow-[5px_5px_0px_#171313]"
              >
                Start Planning Free
              </NeoButton>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 🧭 CLEAN FOOTER ─── */}
      <footer className="mt-auto bg-[#171313] text-[#FFF5E9] border-t-[4px] border-[#171313] py-12 px-4 sm:px-8 lg:px-12">
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
