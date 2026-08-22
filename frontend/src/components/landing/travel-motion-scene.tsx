"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Globe,
  Plane,
  Mountain,
  Palmtree,
  Play,
  Castle,
} from "lucide-react";

export const TravelMotionScene: React.FC = () => {
  return (
    <div className="relative w-full flex items-center justify-center lg:justify-end select-none">
      {/* ─── Main Artwork Container with Overlaid In-Place Floating Badges ─── */}
      <div className="relative w-full max-w-[660px] aspect-[654/684] flex items-center justify-center">
        {/* Base Master Illustrated Artwork */}
        <Image
          src="/hero-artwork.png"
          alt="Tripzyy Travel Master Illustration"
          fill
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-contain object-center lg:object-right pointer-events-none"
          priority
          unoptimized
        />

        {/* ══════════════════════════════════════════════════════════════
            IN-PLACE FLOATING MICRO-ANIMATIONS FOR CIRCLED BADGES
            ══════════════════════════════════════════════════════════════ */}

        {/* 🎫 1. EXP-PASS #089 (Top Right) */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [6, 4.5, 6] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[2%] right-[3%] sm:right-[5%] z-20"
        >
          <div className="p-2.5 sm:p-3 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <div className="flex items-center gap-1.5 mb-1">
              <Globe className="w-3.5 h-3.5 text-[#D94B3D]" />
              <span className="font-display font-black text-[10px] sm:text-xs uppercase tracking-widest text-[#171313]">
                EXP-PASS #089
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-extrabold text-neutral-800 border-t-2 border-neutral-100 pt-1 flex items-center justify-between gap-3 sm:gap-4">
              <span>BOM ➔ GOI</span>
              <span className="px-1.5 py-0.5 rounded bg-[#D94B3D] text-white font-black text-[9px] sm:text-[10px]">
                CONFIRMED ✓
              </span>
            </div>
          </div>
        </motion.div>

        {/* ✈️ 2. AI-802 (Upper Left of Airplane) */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-12, -9, -12] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          className="absolute top-[16%] left-[10%] sm:left-[13%] z-20"
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <Plane className="w-3.5 h-3.5 text-[#D94B3D] fill-[#D94B3D]" />
            <span className="font-display font-black text-[10px] sm:text-xs text-[#171313] tracking-wider">
              AI-802
            </span>
          </div>
        </motion.div>

        {/* 🏰 3. JAIPUR FORT (Mid Left) */}
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute top-[38%] left-[4%] sm:left-[6%] z-20"
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <Castle className="w-3.5 h-3.5 text-[#D94B3D]" />
            <span className="font-display font-black text-[10px] sm:text-xs uppercase text-[#171313] tracking-wide">
              JAIPUR FORT
            </span>
          </div>
        </motion.div>

        {/* 🏔️ 4. MANALI SUMMIT (Mid Right) */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [3, 1.5, 3] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          className="absolute top-[34%] right-[3%] sm:right-[5%] z-20"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <Mountain className="w-4 h-4 text-[#D94B3D]" />
            <div className="flex flex-col text-left">
              <span className="font-display font-black text-[10px] sm:text-[11px] uppercase tracking-wider text-[#171313] leading-none">
                MANALI SUMMIT
              </span>
              <span className="text-[8px] sm:text-[9px] font-bold text-neutral-500 mt-0.5">
                2,050m Altitude
              </span>
            </div>
          </div>
        </motion.div>

        {/* 🌴 5. GOA COAST (Lower Left) */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [-8, -6, -8] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          className="absolute bottom-[22%] left-[8%] sm:left-[12%] z-20"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <Palmtree className="w-4 h-4 text-[#D94B3D]" />
            <div className="flex flex-col text-left">
              <span className="font-display font-black text-[10px] sm:text-xs uppercase tracking-wider text-[#171313] leading-none">
                GOA COAST
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold text-[#D94B3D] mt-0.5">
                Day 01 - Start
              </span>
            </div>
          </div>
        </motion.div>

        {/* ▶️ 6. MULTI-STOP (Bottom Right) */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [6, 4, 6] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
          className="absolute bottom-[13%] right-[3%] sm:right-[5%] z-20"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#D94B3D] text-white flex items-center justify-center border border-[#171313]">
              <Play className="w-3 h-3 fill-white ml-0.5" />
            </div>
            <div>
              <div className="font-display font-black text-[10px] sm:text-xs uppercase text-[#171313] leading-none">
                MULTI-STOP
              </div>
              <div className="text-[9px] sm:text-[10px] font-bold text-[#D94B3D] mt-0.5">
                Interactive Route
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
