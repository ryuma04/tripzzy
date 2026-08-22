"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  MapPin,
  Compass,
  Plane,
  Camera,
  Luggage,
  Sparkles,
  Ticket,
  Navigation,
} from "lucide-react";

export const TravelMotionScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mouse parallax motion values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 120 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  // Multi-layer parallax depth transforms
  const bgX = useTransform(smoothMouseX, [-200, 200], [10, -10]);
  const bgY = useTransform(smoothMouseY, [-200, 200], [10, -10]);

  const midX = useTransform(smoothMouseX, [-200, 200], [18, -18]);
  const midY = useTransform(smoothMouseY, [-200, 200], [18, -18]);

  const fgX = useTransform(smoothMouseX, [-200, 200], [28, -28]);
  const fgY = useTransform(smoothMouseY, [-200, 200], [28, -28]);

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
    setIsHovered(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="relative w-full aspect-[4/3] sm:aspect-[16/11] lg:aspect-[16/12] max-w-xl mx-auto rounded-3xl border-[4px] border-[#171313] bg-[#FFFDF9] shadow-[8px_8px_0px_#171313] overflow-hidden select-none"
    >
      {/* ─── Layer 1: Background Sky, Sun & Distant Hills ─── */}
      <motion.div
        style={{ x: bgX, y: bgY }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Warm Sky Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FFF5E9] via-[#FFFAF3] to-[#FDF0E1]" />

        {/* Vintage Rising Sun with concentric contour rings */}
        <div className="absolute top-12 right-16 w-32 h-32 rounded-full bg-[#FAECDC] border-[3px] border-[#171313] flex items-center justify-center opacity-85">
          <div className="w-20 h-20 rounded-full bg-[#FCA5A5]/30 border-2 border-dashed border-[#E51919]/50 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-[#E51919]/20" />
          </div>
        </div>

        {/* Drifting Clouds (Layer 1 - Slow) */}
        <motion.div
          animate={{ x: [-40, 480] }}
          transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
          className="absolute top-8 left-[-40px] flex items-center gap-1 opacity-90"
        >
          <div className="px-3.5 py-1.5 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313] flex items-center gap-1 text-[10px] font-bold text-neutral-500">
            <span className="w-2 h-2 rounded-full bg-[#E51919]" />
            <span>3,000 FT</span>
          </div>
        </motion.div>

        <motion.div
          animate={{ x: [-60, 480] }}
          transition={{ duration: 42, repeat: Infinity, ease: "linear", delay: 12 }}
          className="absolute top-20 left-[-60px] opacity-75"
        >
          <div className="w-16 h-6 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313]" />
        </motion.div>

        {/* Distant Minimalist Mountain Ranges */}
        <svg
          viewBox="0 0 500 220"
          className="absolute bottom-16 left-0 right-0 w-full"
          fill="none"
        >
          {/* Back Mountain Range */}
          <polygon
            points="0,220 80,110 160,180 270,90 380,200 450,130 500,220"
            fill="#F3ECE2"
            stroke="#171313"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Peak accent markers */}
          <line x1="270" y1="90" x2="270" y2="120" stroke="#E51919" strokeWidth="2.5" strokeDasharray="3 3" />
          <circle cx="270" cy="86" r="4" fill="#E51919" stroke="#171313" strokeWidth="2" />
        </svg>
      </motion.div>

      {/* ─── Layer 2: Middle Landscape & Winding Road ─── */}
      <motion.div
        style={{ x: midX, y: midY }}
        className="absolute inset-0 pointer-events-none"
      >
        <svg
          viewBox="0 0 500 360"
          className="w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* Rolling Mid Hills */}
          <path
            d="M-20 260 Q 120 180, 260 220 T 520 200 L 520 380 L -20 380 Z"
            fill="#FAECDC"
            stroke="#171313"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Foreground Hill */}
          <path
            d="M-20 310 Q 180 250, 520 300 L 520 380 L -20 380 Z"
            fill="#F5E5D3"
            stroke="#171313"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* 🛣️ THE WINDING HIGHWAY ROAD */}
          {/* Road Asphalt Bed */}
          <path
            d="M 60 380 C 140 330, 200 290, 280 270 C 350 250, 420 230, 460 170"
            stroke="#171313"
            strokeWidth="52"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Inner Road Surface */}
          <path
            d="M 60 380 C 140 330, 200 290, 280 270 C 350 250, 420 230, 460 170"
            stroke="#2A2424"
            strokeWidth="44"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Red Edge Stripe Left */}
          <path
            d="M 46 380 C 126 330, 186 290, 266 270 C 336 250, 406 230, 446 170"
            stroke="#E51919"
            strokeWidth="3.5"
            fill="none"
          />
          {/* Red Edge Stripe Right */}
          <path
            d="M 74 380 C 154 330, 214 290, 294 270 C 364 250, 434 230, 474 170"
            stroke="#E51919"
            strokeWidth="3.5"
            fill="none"
          />

          {/* Animated Dashed Lane Center Markings */}
          <path
            d="M 60 380 C 140 330, 200 290, 280 270 C 350 250, 420 230, 460 170"
            stroke="#FFF5E9"
            strokeWidth="4"
            strokeDasharray="14 12"
            className="animate-[dash_1.5s_linear_infinite]"
            fill="none"
          />
        </svg>

        {/* ─── Animated Flight Path & Flying Airplane ─── */}
        <svg
          viewBox="0 0 500 360"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Flight Trajectory Arc */}
          <path
            d="M 30 140 Q 220 40, 450 110"
            stroke="#E51919"
            strokeWidth="3"
            strokeDasharray="6 6"
            fill="none"
            opacity="0.85"
          />
        </svg>

        {/* ✈️ THE MOVING AIRPLANE (Smooth loop along curved sky arc) */}
        <motion.div
          animate={{
            x: [30, 220, 430],
            y: [140, 45, 110],
            rotate: [-12, 5, 22],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0"
        >
          {/* Airplane Silhouette Badge */}
          <div className="flex items-center gap-1.5 p-2 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] -translate-x-1/2 -translate-y-1/2">
            <Plane className="w-5 h-5 text-[#E51919] fill-[#E51919]" />
            <span className="font-display font-black text-[10px] text-[#171313]">
              AI-602
            </span>
          </div>
        </motion.div>

        {/* 🚗 THE MOVING EXPEDITION CAMPERVAN BUS (Cruising along the road) */}
        <motion.div
          animate={{
            x: [70, 160, 260, 370],
            y: [320, 275, 230, 175],
            scale: [1.15, 1.0, 0.85, 0.7],
            rotate: [-18, -12, -8, -14],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0 z-20 pointer-events-auto cursor-pointer"
        >
          {/* Road Tire Drop Shadow */}
          <div className="absolute -bottom-1 left-2 w-16 h-4 bg-[#171313]/60 rounded-full blur-[2px]" />

          {/* Red Campervan Bus Vector */}
          <div className="relative p-1 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-110 transition-transform">
            <svg width="48" height="34" viewBox="0 0 76 56" fill="none">
              {/* Roof Compass Wheel */}
              <circle cx="50" cy="18" r="9" stroke="#E51919" strokeWidth="3" fill="#FFF5E9" />
              <circle cx="50" cy="18" r="3" fill="#E51919" />
              <line x1="50" y1="6" x2="50" y2="30" stroke="#E51919" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="38" y1="18" x2="62" y2="18" stroke="#E51919" strokeWidth="2.5" strokeLinecap="round" />

              {/* Red Bus Body */}
              <path
                d="M20 20 C24 16, 32 16, 56 16 L58 24 L60 48 L14 48 C14 48, 12 40, 14 34 L18 24 Z"
                fill="#E51919"
                stroke="#171313"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              {/* Windshield */}
              <path d="M18 25 L15 34 L28 34 L28 25 Z" fill="#FFFFFF" stroke="#171313" strokeWidth="2" />
              {/* Side Window */}
              <rect x="36" y="25" width="14" height="10" rx="2" fill="#FFFFFF" stroke="#171313" strokeWidth="2" />
              {/* Wheels */}
              <circle cx="23" cy="48" r="7" fill="#FFFFFF" stroke="#171313" strokeWidth="3" />
              <circle cx="23" cy="48" r="2.5" fill="#E51919" />
              <circle cx="50" cy="48" r="7" fill="#FFFFFF" stroke="#171313" strokeWidth="3" />
              <circle cx="50" cy="48" r="2.5" fill="#E51919" />
            </svg>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── Layer 3: Floating Destination Pins & UI Artifacts ─── */}
      <motion.div
        style={{ x: fgX, y: fgY }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* 📍 PIN 1: GOA (Coastal Beach Stop) */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-28 left-10 pointer-events-auto"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] animate-ping" />
            <div className="flex flex-col">
              <span className="font-display font-black text-[11px] uppercase tracking-wider text-[#171313] leading-none">
                📍 GOA COAST
              </span>
              <span className="text-[9px] font-bold text-[#E51919]">
                Day 01 • Start
              </span>
            </div>
          </div>
        </motion.div>

        {/* 📍 PIN 2: MANALI (Alpine Circuit) */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute top-16 right-10 pointer-events-auto"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E51919] text-white border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 fill-white" />
            <div className="flex flex-col text-left">
              <span className="font-display font-black text-[11px] uppercase tracking-wider leading-none">
                MANALI SUMMIT
              </span>
              <span className="text-[9px] font-bold text-white/90">
                2,050m Altitude
              </span>
            </div>
          </div>
        </motion.div>

        {/* 📍 PIN 3: JAIPUR (Heritage Hub) */}
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          className="absolute top-44 left-1/3 pointer-events-auto"
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FAECDC] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] cursor-pointer hover:bg-[#FFFFFF] transition-colors">
            <span className="w-2 h-2 rounded-full bg-[#E51919]" />
            <span className="font-display font-black text-[10px] uppercase text-[#171313]">
              JAIPUR FORT
            </span>
          </div>
        </motion.div>

        {/* 🎫 FLOATING ARTIFACT 1: VIP EXPEDITION BOARDING PASS */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [4, 2, 4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-8 left-8 pointer-events-auto hidden sm:block"
        >
          <div className="p-2.5 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313]">
            <div className="flex items-center gap-2 mb-1">
              <Ticket className="w-4 h-4 text-[#E51919]" />
              <span className="font-display font-black text-[10px] uppercase tracking-widest text-[#171313]">
                EXP-PASS #089
              </span>
            </div>
            <div className="text-[9px] font-extrabold text-neutral-600 border-t border-neutral-200 pt-1 flex items-center justify-between gap-3">
              <span>BOM ➔ GOI</span>
              <span className="text-[#15803D]">CONFIRMED ✓</span>
            </div>
          </div>
        </motion.div>

        {/* 🧭 FLOATING ARTIFACT 2: VINTAGE COMPASS BADGE */}
        <motion.div
          animate={{ y: [0, -10, 0], rotate: [-6, -2, -6] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-6 right-8 pointer-events-auto"
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[4px_4px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-[#E51919] text-white flex items-center justify-center border border-[#171313]">
              <Navigation className="w-4 h-4 rotate-45 fill-white" />
            </div>
            <div>
              <div className="font-display font-black text-[10px] uppercase text-[#171313] leading-none">
                MULTI-STOP
              </div>
              <div className="text-[9px] font-bold text-[#E51919]">
                Interactive Route
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── Bottom-Right Live Scene Watermark Badge ─── */}
      <div className="absolute top-4 right-4 z-30 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#171313] text-[#FFF5E9] border-2 border-[#171313] rounded-lg shadow-[2px_2px_0px_#171313] text-[9px] font-display font-black uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#E51919] animate-pulse" />
          <span>Live Motion Scene</span>
        </div>
      </div>
    </div>
  );
};
