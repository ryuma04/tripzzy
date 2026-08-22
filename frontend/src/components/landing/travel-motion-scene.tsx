"use client";

import React, { useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Ticket,
  Sparkles,
  Plane,
  Navigation,
  Compass,
  MapPin,
} from "lucide-react";

export const TravelMotionScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mouse parallax motion values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 100 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  // Subtle multi-layer parallax transforms (kept calm and gentle)
  const bgX = useTransform(smoothMouseX, [-250, 250], [8, -8]);
  const bgY = useTransform(smoothMouseY, [-250, 250], [8, -8]);

  const midX = useTransform(smoothMouseX, [-250, 250], [14, -14]);
  const midY = useTransform(smoothMouseY, [-250, 250], [14, -14]);

  const fgX = useTransform(smoothMouseX, [-250, 250], [20, -20]);
  const fgY = useTransform(smoothMouseY, [-250, 250], [20, -20]);

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
      className="relative w-full aspect-[4/3] sm:aspect-[16/11] lg:aspect-[16/11] min-h-[400px] sm:min-h-[450px] lg:min-h-[480px] rounded-3xl border-[4px] border-[#171313] bg-[#FFFDF9] shadow-[8px_8px_0px_#171313] overflow-hidden select-none"
    >
      {/* ══════════════════════════════════════════════════════════════
          LAYER 1: BACKGROUND SKY, SUN & MINIMALIST HILLS
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        style={{ x: bgX, y: bgY }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Soft Warm Sky Canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FFF5E9] via-[#FFFAF3] to-[#FCEEE0]" />

        {/* Vintage Sun Contour on Horizon */}
        <div className="absolute top-10 right-16 w-28 h-28 rounded-full bg-[#FAECDC] border-[3px] border-[#171313] flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#FCA5A5]/25 border-2 border-dashed border-[#E51919]/40" />
        </div>

        {/* Slow Minimalist Clouds */}
        <motion.div
          animate={{ x: [-40, 520] }}
          transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
          className="absolute top-8 left-[-40px] opacity-80"
        >
          <div className="px-3 py-1 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313] flex items-center gap-1.5 text-[9px] font-black text-neutral-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E51919]" />
            <span>ALT 4,200 FT</span>
          </div>
        </motion.div>

        <motion.div
          animate={{ x: [-60, 520] }}
          transition={{ duration: 48, repeat: Infinity, ease: "linear", delay: 16 }}
          className="absolute top-20 left-[-60px] opacity-70"
        >
          <div className="w-14 h-5 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313]" />
        </motion.div>

        {/* Distant Minimal Landscape Hills */}
        <svg
          viewBox="0 0 540 380"
          className="absolute inset-0 w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* Back Mountains */}
          <polygon
            points="0,380 90,210 180,270 290,180 400,280 470,220 540,380"
            fill="#F3ECE2"
            stroke="#171313"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Peak accent line */}
          <line x1="290" y1="180" x2="290" y2="210" stroke="#E51919" strokeWidth="2.5" strokeDasharray="3 3" />
          <circle cx="290" cy="176" r="3.5" fill="#E51919" stroke="#171313" strokeWidth="1.5" />

          {/* Rolling Mid Horizon Hill */}
          <path
            d="M -20 290 Q 140 220, 290 260 T 560 230 L 560 400 L -20 400 Z"
            fill="#FAECDC"
            stroke="#171313"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════
          LAYER 2: PERSPECTIVE WINDING ROAD & MOVING VEHICLE
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        style={{ x: midX, y: midY }}
        className="absolute inset-0 pointer-events-none"
      >
        <svg
          viewBox="0 0 540 380"
          className="w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* Foreground Terrain */}
          <path
            d="M -20 340 Q 200 270, 560 320 L 560 400 L -20 400 Z"
            fill="#F5E4D1"
            stroke="#171313"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* 🛣️ THE PERSPECTIVE WINDING ROAD */}
          {/* Outer Road Base (Tapering from 64px in foreground to 24px near horizon) */}
          <path
            d="M 50 400 C 130 340, 190 295, 270 270 C 340 245, 410 225, 450 160"
            stroke="#171313"
            strokeWidth="56"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dark Road Surface Asphalt */}
          <path
            d="M 50 400 C 130 340, 190 295, 270 270 C 340 245, 410 225, 450 160"
            stroke="#1C1818"
            strokeWidth="48"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Red Left Shoulder Border */}
          <path
            d="M 36 400 C 116 340, 176 295, 256 270 C 326 245, 396 225, 436 160"
            stroke="#E51919"
            strokeWidth="3.5"
            fill="none"
          />
          {/* Red Right Shoulder Border */}
          <path
            d="M 64 400 C 144 340, 204 295, 284 270 C 354 245, 424 225, 464 160"
            stroke="#E51919"
            strokeWidth="3.5"
            fill="none"
          />

          {/* Animated Dashed Center Markings */}
          <path
            d="M 50 400 C 130 340, 190 295, 270 270 C 340 245, 410 225, 450 160"
            stroke="#FFF5E9"
            strokeWidth="3.5"
            strokeDasharray="14 10"
            className="animate-[dash_1.5s_linear_infinite]"
            fill="none"
          />
        </svg>

        {/* ✈️ AIRPLANE CURVED FLIGHT PATH TRAJECTORY */}
        <svg
          viewBox="0 0 540 380"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <path
            d="M 40 130 Q 240 35, 480 95"
            stroke="#E51919"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            fill="none"
            opacity="0.8"
          />
        </svg>

        {/* ✈️ THE ELEGANT FLYING AIRPLANE (Smooth loop along sky arc) */}
        <motion.div
          animate={{
            x: [35, 240, 460],
            y: [130, 40, 95],
            rotate: [-10, 4, 18],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0 z-20 pointer-events-auto"
        >
          <div className="flex items-center gap-1.5 p-1.5 px-2.5 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] -translate-x-1/2 -translate-y-1/2">
            <Plane className="w-4 h-4 text-[#E51919] fill-[#E51919]" />
            <span className="font-display font-black text-[10px] text-[#171313] tracking-wider">
              AI-804
            </span>
          </div>
        </motion.div>

        {/* 🚗 🚌 THE MOVING RED CAMPERVAN (Physically sitting on the road) */}
        {/* Exact perspective path tracking road center coordinates with natural scale & rotation */}
        <motion.div
          animate={{
            x: [75, 160, 260, 360],
            y: [330, 285, 240, 190],
            scale: [1.1, 0.95, 0.8, 0.65],
            rotate: [-20, -15, -10, -16],
          }}
          transition={{
            duration: 11,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-0 z-20 pointer-events-auto cursor-pointer"
        >
          {/* Ground Contact Tire Shadow (Placed under the vehicle wheels) */}
          <div className="absolute -bottom-1.5 left-1 w-14 h-3 bg-[#171313]/60 rounded-full blur-[1.5px]" />

          {/* Red Campervan Vehicle Vector */}
          <div className="relative p-1 bg-[#FFFFFF] border-[2.5px] border-[#171313] rounded-xl shadow-[3px_3px_0px_#171313] hover:scale-110 transition-transform">
            <svg width="44" height="30" viewBox="0 0 76 56" fill="none">
              {/* Roof Compass Wheel */}
              <circle cx="50" cy="18" r="9" stroke="#E51919" strokeWidth="3" fill="#FFF5E9" />
              <circle cx="50" cy="18" r="3" fill="#E51919" />
              <line x1="50" y1="6" x2="50" y2="30" stroke="#E51919" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="38" y1="18" x2="62" y2="18" stroke="#E51919" strokeWidth="2.5" strokeLinecap="round" />

              {/* Solid Red Bus Body */}
              <path
                d="M20 20 C24 16, 32 16, 56 16 L58 24 L60 48 L14 48 C14 48, 12 40, 14 34 L18 24 Z"
                fill="#E51919"
                stroke="#171313"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              {/* Windshield Glass */}
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

      {/* ══════════════════════════════════════════════════════════════
          LAYER 3: FLOATING CARDS PUSHED TO THE PERIPHERAL EDGES
          (Center kept completely clear for Road, Route & Vehicle)
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        style={{ x: fgX, y: fgY }}
        className="absolute inset-0 pointer-events-none p-4 sm:p-6 flex flex-col justify-between"
      >
        {/* ─── TOP EDGE ROW ─── */}
        <div className="flex items-start justify-between w-full">
          {/* 🎫 TOP LEFT EDGE: EXP-PASS BOARDING CARD */}
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [3, 1, 3] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-auto"
          >
            <div className="p-3 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-y-0.5 transition-transform cursor-pointer">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1 bg-[#E51919] text-white rounded-lg border border-[#171313]">
                  <Ticket className="w-3.5 h-3.5" />
                </div>
                <span className="font-display font-black text-xs uppercase tracking-widest text-[#171313]">
                  EXP-PASS #089
                </span>
              </div>
              <div className="text-[10px] font-extrabold text-neutral-600 border-t-2 border-neutral-100 pt-1.5 flex items-center justify-between gap-4">
                <span>BOM ➔ GOI</span>
                <span className="px-1.5 py-0.5 rounded bg-[#15803D]/15 text-[#15803D] border border-[#15803D]/30">
                  CONFIRMED ✓
                </span>
              </div>
            </div>
          </motion.div>

          {/* 📍 TOP RIGHT EDGE: MANALI SUMMIT MARKER */}
          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="pointer-events-auto"
          >
            <div className="flex items-center gap-2 px-3.5 py-2 bg-[#E51919] text-white border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
              <Sparkles className="w-4 h-4 fill-white" />
              <div className="flex flex-col text-left">
                <span className="font-display font-black text-xs uppercase tracking-wider leading-none">
                  MANALI SUMMIT
                </span>
                <span className="text-[9px] font-bold text-white/90 mt-0.5">
                  2,050m Altitude
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ─── BOTTOM EDGE ROW ─── */}
        <div className="flex items-end justify-between w-full">
          {/* 📍 BOTTOM LEFT EDGE: GOA COAST (START PIN) */}
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="pointer-events-auto"
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] animate-ping" />
              <div className="flex flex-col">
                <span className="font-display font-black text-xs uppercase tracking-wider text-[#171313] leading-none">
                  📍 GOA COAST
                </span>
                <span className="text-[10px] font-bold text-[#E51919] mt-0.5">
                  Day 01 • Departure
                </span>
              </div>
            </div>
          </motion.div>

          {/* 🧭 BOTTOM RIGHT EDGE: MULTI-STOP ROUTE COMPASS BADGE */}
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [-4, -1, -4] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
            className="pointer-events-auto"
          >
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
              <div className="w-7 h-7 rounded-xl bg-[#E51919] text-white flex items-center justify-center border border-[#171313]">
                <Navigation className="w-3.5 h-3.5 rotate-45 fill-white" />
              </div>
              <div>
                <div className="font-display font-black text-[11px] uppercase text-[#171313] leading-none">
                  MULTI-STOP
                </div>
                <div className="text-[9px] font-bold text-[#E51919] mt-0.5">
                  Sequential Route
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ─── Top-Right Subtle Watermark Indicator ─── */}
      <div className="absolute top-3 right-3 z-30 pointer-events-none opacity-90 hidden sm:block">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#171313] text-[#FFF5E9] border border-[#171313] rounded-md shadow-[1px_1px_0px_#171313] text-[9px] font-display font-black uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E51919] animate-pulse" />
          <span>Interactive World</span>
        </div>
      </div>
    </div>
  );
};
