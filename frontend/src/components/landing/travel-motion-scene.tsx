"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Globe,
  Plane,
  Mountain,
  Palmtree,
  Play,
  Castle,
  MapPin,
  Sparkles,
} from "lucide-react";

export const TravelMotionScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Subtle mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 90 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const bgX = useTransform(smoothMouseX, [-200, 200], [5, -5]);
  const bgY = useTransform(smoothMouseY, [-200, 200], [5, -5]);

  const fgX = useTransform(smoothMouseX, [-200, 200], [10, -10]);
  const fgY = useTransform(smoothMouseY, [-200, 200], [10, -10]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mouseX.set(e.clientX - centerX);
    mouseY.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full aspect-[4/3] sm:aspect-[16/12] lg:aspect-[16/12] max-w-2xl mx-auto select-none"
    >
      {/* ══════════════════════════════════════════════════════════════
          LAYER 1: BACKGROUND DOTTED WORLD MAP & SUN DISK
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        style={{ x: bgX, y: bgY }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Dotted Halftone World Map Silhouette */}
        <div className="absolute top-2 right-4 w-72 h-44 opacity-25">
          <svg viewBox="0 0 300 160" fill="none" className="w-full h-full">
            <pattern id="world-dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.5" fill="#CBBBAA" />
            </pattern>
            {/* Continents rough dot shapes */}
            <path
              d="M 20 40 Q 60 20, 90 50 Q 80 90, 40 100 Z M 140 30 Q 220 20, 260 60 Q 240 110, 160 100 Z M 180 110 Q 220 100, 240 140 Q 200 150, 170 130 Z"
              fill="url(#world-dots)"
            />
          </svg>
        </div>

        {/* Large Warm Sand Sun Disk on Horizon */}
        <div className="absolute top-28 right-24 sm:right-32 w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-[#FAECDC]/90 border-[2.5px] border-[#171313]/20 flex items-center justify-center pointer-events-none">
          {/* Subtle Bird Silhouettes */}
          <div className="absolute top-12 left-10 text-neutral-600 text-xs font-serif font-black tracking-widest opacity-60">
            ~ ~
          </div>
          <div className="absolute top-16 right-12 text-neutral-600 text-[10px] font-serif font-black tracking-widest opacity-50">
            ~
          </div>
        </div>

        {/* 🏔️ GEOMETRIC ALPINE MOUNTAIN PEAKS WITH SNOW CAPS & PINE TREES */}
        <svg
          viewBox="0 0 640 480"
          className="absolute inset-0 w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* Background Sandy Dunes / Distant Hills */}
          <path
            d="M 220 330 Q 380 270, 640 290 L 640 480 L 220 480 Z"
            fill="#F6ECE0"
          />

          {/* Back Mountain Peaks (Dark & Sand) */}
          <polygon
            points="280,320 350,210 420,320"
            fill="#171313"
            stroke="#171313"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polygon
            points="350,210 325,250 350,240 375,250"
            fill="#FFFFFF"
          />

          {/* Main Dramatic Snow Peak */}
          <polygon
            points="380,310 460,180 540,310"
            fill="#EFE5D8"
            stroke="#171313"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Dark Shadow Side of Mountain */}
          <polygon
            points="460,180 460,310 540,310"
            fill="#231E1E"
            stroke="#171313"
            strokeWidth="3"
          />
          {/* White Snow Cap */}
          <polygon
            points="460,180 435,225 460,215 485,225"
            fill="#FFFFFF"
          />

          {/* Right Alpine Ridge */}
          <polygon
            points="490,300 570,215 640,290"
            fill="#E8DC CD"
            stroke="#171313"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polygon
            points="570,215 570,290 640,290"
            fill="#2A2424"
            stroke="#171313"
            strokeWidth="3"
          />

          {/* Pine Trees Silhouettes along the Ridge */}
          <polygon points="290,305 295,285 300,305" fill="#171313" />
          <polygon points="302,310 307,288 312,310" fill="#171313" />
          <polygon points="314,312 319,292 324,312" fill="#171313" />
          <polygon points="330,315 335,295 340,315" fill="#171313" />
          <polygon points="345,318 350,300 355,318" fill="#171313" />

          {/* Red Mountain Pin Pole Marker (MANALI) */}
          <line x1="595" y1="230" x2="595" y2="280" stroke="#171313" strokeWidth="2.5" />
          <circle cx="595" cy="280" r="3.5" fill="#D94B3D" stroke="#171313" strokeWidth="1.5" />

          {/* Red Fort Pin Pole Marker (JAIPUR) */}
          <line x1="310" y1="260" x2="310" y2="295" stroke="#171313" strokeWidth="2.5" />
          <circle cx="310" cy="295" r="3.5" fill="#D94B3D" stroke="#171313" strokeWidth="1.5" />
        </svg>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════
          LAYER 2: THE WINDING HIGHWAY ROAD & DRIVING RED BUS
          ══════════════════════════════════════════════════════════════ */}
      <div className="absolute inset-0 pointer-events-none">
        <svg
          viewBox="0 0 640 480"
          className="w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* 🛣️ THE MAJESTIC S-CURVE HIGHWAY ROAD */}
          {/* Black Outer Bed Base */}
          <path
            d="M 320 490 C 390 440, 480 390, 460 320 C 440 260, 560 270, 640 270"
            stroke="#171313"
            strokeWidth="90"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Inner Asphalt Bed */}
          <path
            d="M 320 490 C 390 440, 480 390, 460 320 C 440 260, 560 270, 640 270"
            stroke="#1E1919"
            strokeWidth="78"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dual Red Outer Edge Stripes */}
          <path
            d="M 302 490 C 372 440, 462 390, 442 320 C 422 260, 542 270, 640 270"
            stroke="#D94B3D"
            strokeWidth="4"
            fill="none"
          />
          <path
            d="M 338 490 C 408 440, 498 390, 478 320 C 458 260, 578 270, 640 270"
            stroke="#D94B3D"
            strokeWidth="4"
            fill="none"
          />
          {/* White Center Dashed Line */}
          <path
            d="M 320 490 C 390 440, 480 390, 460 320 C 440 260, 560 270, 640 270"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeDasharray="18 12"
            className="animate-[dash_1.5s_linear_infinite]"
            fill="none"
          />

          {/* 🔴 RED DASHED TRAIL ACROSS MOUNTAINS */}
          <path
            d="M 310 295 Q 400 240, 430 250 T 485 270 T 560 230"
            stroke="#D94B3D"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            fill="none"
          />
          {/* Pin 1 on trail */}
          <circle cx="450" cy="240" r="5" fill="#D94B3D" stroke="#171313" strokeWidth="2" />
          {/* Pin 2 on trail */}
          <circle cx="485" cy="270" r="4" fill="#D94B3D" stroke="#171313" strokeWidth="1.5" />

          {/* ✈️ RED DASHED FLIGHT PATH IN SKY */}
          <path
            d="M 430 250 C 420 150, 480 80, 580 110 C 620 120, 640 130, 650 140"
            stroke="#D94B3D"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            fill="none"
          />
        </svg>

        {/* ✈️ THE AIRPLANE GLIDING ALONG THE CURVED FLIGHT PATH */}
        <motion.div
          animate={{
            x: [390, 450, 510],
            y: [170, 130, 115],
            rotate: [-20, -10, 5],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0 z-20 pointer-events-auto"
        >
          {/* Sleek Passenger Jet Illustration */}
          <div className="relative -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform cursor-pointer">
            <svg width="84" height="42" viewBox="0 0 120 60" fill="none">
              {/* Airplane Body */}
              <path
                d="M 10 32 L 60 28 L 85 26 C 105 26, 115 28, 118 30 C 115 32, 105 34, 85 34 L 60 32 L 10 32 Z"
                fill="#FFFFFF"
                stroke="#171313"
                strokeWidth="2.5"
              />
              {/* Red Tail Fin */}
              <path
                d="M 12 32 L 2 10 L 16 10 L 26 32 Z"
                fill="#D94B3D"
                stroke="#171313"
                strokeWidth="2.5"
              />
              {/* Main Wing (Left / Foreground) */}
              <polygon
                points="50,30 35,54 48,54 75,30"
                fill="#FFFFFF"
                stroke="#171313"
                strokeWidth="2"
              />
              {/* Top Wing (Right / Background) */}
              <polygon
                points="56,28 65,8 74,8 78,28"
                fill="#E0D8D0"
                stroke="#171313"
                strokeWidth="2"
              />
              {/* Cockpit Windows & Cabin Windows */}
              <path d="M 104 28 L 112 29 L 106 30 Z" fill="#171313" />
              <circle cx="95" cy="29" r="1" fill="#D94B3D" />
              <circle cx="90" cy="29" r="1" fill="#171313" />
              <circle cx="85" cy="29" r="1" fill="#171313" />
              <circle cx="80" cy="29" r="1" fill="#171313" />
            </svg>
          </div>
        </motion.div>

        {/* 🚗 🚌 THE VINTAGE RED CAMPERVAN BUS DRIVING SMOOTHLY ON THE ROAD */}
        <motion.div
          animate={{
            x: [350, 420, 460, 520],
            y: [400, 345, 305, 270],
            scale: [1.2, 1.0, 0.85, 0.7],
            rotate: [-28, -20, 0, 12],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0 z-20 pointer-events-auto cursor-pointer"
        >
          {/* Ground Tire Shadow */}
          <div className="absolute -bottom-2 left-2 w-16 h-4 bg-[#171313]/60 rounded-full blur-[2px]" />

          {/* Detailed Two-Tone Red & Cream Campervan Bus with Luggage on Roof */}
          <div className="relative hover:scale-110 transition-transform">
            <svg width="68" height="54" viewBox="0 0 90 72" fill="none">
              {/* Roof Luggage Rack with Suitcases */}
              <rect x="25" y="10" width="40" height="8" rx="2" fill="#D94B3D" stroke="#171313" strokeWidth="2.5" />
              <rect x="30" y="5" width="18" height="7" rx="1.5" fill="#FAECDC" stroke="#171313" strokeWidth="2" />
              <rect x="50" y="6" width="12" height="6" rx="1.5" fill="#171313" />

              {/* White Upper Cabin / Roof */}
              <path
                d="M 18 20 C 22 16, 32 15, 72 15 C 76 15, 78 20, 78 35 L 12 35 C 12 25, 14 20, 18 20 Z"
                fill="#FFFFFF"
                stroke="#171313"
                strokeWidth="3"
              />
              {/* Rear Windshield Windows */}
              <rect x="18" y="22" width="16" height="11" rx="2" fill="#2A2424" stroke="#171313" strokeWidth="2" />
              <rect x="38" y="22" width="16" height="11" rx="2" fill="#2A2424" stroke="#171313" strokeWidth="2" />
              <rect x="58" y="22" width="16" height="11" rx="2" fill="#2A2424" stroke="#171313" strokeWidth="2" />

              {/* Red Lower Body */}
              <path
                d="M 12 35 L 78 35 L 80 56 C 80 58, 76 60, 72 60 L 18 60 C 14 60, 10 58, 10 56 Z"
                fill="#D94B3D"
                stroke="#171313"
                strokeWidth="3"
              />
              {/* Chrome Rear Bumper & License / Badge */}
              <rect x="36" y="44" width="18" height="8" rx="1.5" fill="#FAECDC" stroke="#171313" strokeWidth="2" />
              <rect x="14" y="54" width="62" height="4" rx="2" fill="#E8DCD0" stroke="#171313" strokeWidth="2" />

              {/* Wheels with White Walls and Red Hubcaps */}
              <circle cx="24" cy="60" r="9" fill="#171313" />
              <circle cx="24" cy="60" r="6" fill="#FFFFFF" />
              <circle cx="24" cy="60" r="3" fill="#D94B3D" />

              <circle cx="66" cy="60" r="9" fill="#171313" />
              <circle cx="66" cy="60" r="6" fill="#FFFFFF" />
              <circle cx="66" cy="60" r="3" fill="#D94B3D" />
            </svg>
          </div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          LAYER 3: THE FLOATING TRAVEL CARDS & BADGES (MATCHING REFERENCE)
          ══════════════════════════════════════════════════════════════ */}
      <motion.div style={{ x: fgX, y: fgY }} className="absolute inset-0 pointer-events-none">
        {/* 🎫 1. TOP-RIGHT: EXP-PASS #089 TICKET */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [6, 4, 6] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 sm:top-2 right-2 sm:right-6 z-30 pointer-events-auto"
        >
          <div className="p-3 sm:p-3.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="w-4 h-4 text-[#D94B3D]" />
              <span className="font-display font-black text-xs uppercase tracking-widest text-[#171313]">
                EXP-PASS #089
              </span>
            </div>
            <div className="text-[11px] font-extrabold text-neutral-800 border-t-2 border-neutral-100 pt-1.5 flex items-center justify-between gap-4">
              <span>BOM ➔ GOI</span>
              <span className="px-2 py-0.5 rounded-md bg-[#D94B3D] text-white font-black text-[10px]">
                CONFIRMED ✓
              </span>
            </div>
          </div>
        </motion.div>

        {/* ✈️ 2. TOP-LEFT OF AIRPLANE: AI-802 TICKET TAG */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-10, -7, -10] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          className="absolute top-16 sm:top-20 left-10 sm:left-14 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <Plane className="w-4 h-4 text-[#D94B3D] fill-[#D94B3D]" />
            <span className="font-display font-black text-xs text-[#171313] tracking-wider">
              AI-802
            </span>
          </div>
        </motion.div>

        {/* 🏰 3. MID-LEFT: JAIPUR FORT PIN CARD */}
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-44 sm:top-48 left-2 sm:left-4 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <Castle className="w-4 h-4 text-[#D94B3D]" />
            <span className="font-display font-black text-xs uppercase text-[#171313] tracking-wide">
              JAIPUR FORT
            </span>
          </div>
        </motion.div>

        {/* 🏔️ 4. MID-RIGHT: MANALI SUMMIT PIN CARD */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [4, 2, 4] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
          className="absolute top-36 sm:top-40 right-2 sm:right-6 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <Mountain className="w-4 h-4 text-[#D94B3D]" />
            <div className="flex flex-col text-left">
              <span className="font-display font-black text-[11px] uppercase tracking-wider text-[#171313] leading-none">
                MANALI SUMMIT
              </span>
              <span className="text-[9px] font-bold text-neutral-500 mt-0.5">
                2,050m Altitude
              </span>
            </div>
          </div>
        </motion.div>

        {/* 🌴 5. LOWER-LEFT: GOA COAST BEACH TICKET */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-8, -5, -8] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute bottom-20 sm:bottom-24 left-10 sm:left-14 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <Palmtree className="w-5 h-5 text-[#D94B3D]" />
            <div className="flex flex-col text-left">
              <span className="font-display font-black text-xs uppercase tracking-wider text-[#171313] leading-none">
                GOA COAST
              </span>
              <span className="text-[10px] font-bold text-[#D94B3D] mt-0.5">
                Day 01 - Start
              </span>
            </div>
          </div>
        </motion.div>

        {/* ▶️ 6. BOTTOM-RIGHT: MULTI-STOP ROUTE CARD */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [6, 4, 6] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
          className="absolute bottom-10 sm:bottom-14 right-2 sm:right-6 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-[#D94B3D] text-white flex items-center justify-center border border-[#171313]">
              <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
            </div>
            <div>
              <div className="font-display font-black text-xs uppercase text-[#171313] leading-none">
                MULTI-STOP
              </div>
              <div className="text-[10px] font-bold text-[#D94B3D] mt-0.5">
                Interactive Route
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
