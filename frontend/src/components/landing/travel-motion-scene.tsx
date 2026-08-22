"use client";

import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Ticket,
  Sparkles,
  Plane,
  Navigation,
} from "lucide-react";

export const TravelMotionScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Subtle mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 100 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const bgX = useTransform(smoothMouseX, [-250, 250], [6, -6]);
  const bgY = useTransform(smoothMouseY, [-250, 250], [6, -6]);

  const fgX = useTransform(smoothMouseX, [-250, 250], [14, -14]);
  const fgY = useTransform(smoothMouseY, [-250, 250], [14, -14]);

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
      className="relative w-full max-w-2xl mx-auto py-8 px-2 sm:px-6 select-none"
    >
      {/* ══════════════════════════════════════════════════════════════
          MAIN CINEMATIC TRAVEL WORLD FRAME
          ══════════════════════════════════════════════════════════════ */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/11] rounded-3xl border-[4px] border-[#171313] bg-[#FFFDF9] shadow-[8px_8px_0px_#171313] overflow-hidden">
        {/* ─── Background Sky, Distant Hills & Rising Sun ─── */}
        <motion.div
          style={{ x: bgX, y: bgY }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* Warm Sky Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#FFF5E9] via-[#FFFAF3] to-[#FCEEE0]" />

          {/* Minimalist Horizon Sun */}
          <div className="absolute top-8 right-16 w-32 h-32 rounded-full bg-[#FAECDC] border-[3px] border-[#171313] flex items-center justify-center">
            <div className="w-18 h-18 rounded-full bg-[#FCA5A5]/25 border-2 border-dashed border-[#E51919]/40" />
          </div>

          {/* Drifting Clouds */}
          <motion.div
            animate={{ x: [-40, 560] }}
            transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
            className="absolute top-10 left-[-40px] opacity-80"
          >
            <div className="px-3.5 py-1 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313] flex items-center gap-1.5 text-[10px] font-black text-neutral-500">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E51919]" />
              <span>ALT 4,500 FT</span>
            </div>
          </motion.div>

          <motion.div
            animate={{ x: [-60, 560] }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear", delay: 15 }}
            className="absolute top-22 left-[-60px] opacity-70"
          >
            <div className="w-16 h-6 bg-[#FFFFFF] border-2 border-[#171313] rounded-full shadow-[2px_2px_0px_#171313]" />
          </motion.div>

          {/* Distant Hills & Mountains */}
          <svg
            viewBox="0 0 600 420"
            className="absolute inset-0 w-full h-full"
            fill="none"
            preserveAspectRatio="none"
          >
            {/* Back Mountain Peaks */}
            <polygon
              points="0,420 100,230 200,300 320,190 440,300 520,230 600,420"
              fill="#F3ECE2"
              stroke="#171313"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Mountain Summit Marker */}
            <line x1="320" y1="190" x2="320" y2="225" stroke="#E51919" strokeWidth="2.5" strokeDasharray="3 3" />
            <circle cx="320" cy="186" r="4" fill="#E51919" stroke="#171313" strokeWidth="2" />

            {/* Rolling Mid Hills */}
            <path
              d="M -20 320 Q 160 240, 320 280 T 620 250 L 620 440 L -20 440 Z"
              fill="#FAECDC"
              stroke="#171313"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />

            {/* Foreground Landscape */}
            <path
              d="M -20 365 Q 220 290, 620 345 L 620 440 L -20 440 Z"
              fill="#F5E4D1"
              stroke="#171313"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>

        {/* ─── The Perspective Road & Driving Car ─── */}
        <div className="absolute inset-0 pointer-events-none">
          <svg
            viewBox="0 0 600 420"
            className="w-full h-full"
            fill="none"
            preserveAspectRatio="none"
          >
            {/* 🛣️ PERSPECTIVE HIGHWAY ROAD */}
            {/* Black Road Bed */}
            <path
              d="M 60 440 C 130 350, 200 290, 310 260 C 400 235, 480 205, 525 135"
              stroke="#171313"
              strokeWidth="76"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dark Asphalt Surface */}
            <path
              d="M 60 440 C 130 350, 200 290, 310 260 C 400 235, 480 205, 525 135"
              stroke="#201C1C"
              strokeWidth="66"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Left Red Shoulder */}
            <path
              d="M 44 440 C 114 350, 184 290, 294 260 C 384 235, 464 205, 509 135"
              stroke="#E51919"
              strokeWidth="4"
              fill="none"
            />
            {/* Right Red Shoulder */}
            <path
              d="M 76 440 C 146 350, 216 290, 326 260 C 416 235, 496 205, 541 135"
              stroke="#E51919"
              strokeWidth="4"
              fill="none"
            />
            {/* Animated Dashed Center Markings */}
            <path
              d="M 60 440 C 130 350, 200 290, 310 260 C 400 235, 480 205, 525 135"
              stroke="#FFF5E9"
              strokeWidth="4"
              strokeDasharray="16 12"
              className="animate-[dash_1.5s_linear_infinite]"
              fill="none"
            />
          </svg>

          {/* ✈️ AIRPLANE CURVED FLIGHT TRAJECTORY */}
          <svg
            viewBox="0 0 600 420"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <path
              d="M 30 110 Q 280 20, 540 85"
              stroke="#E51919"
              strokeWidth="3"
              strokeDasharray="7 7"
              fill="none"
              opacity="0.85"
            />
          </svg>

          {/* ✈️ LARGER & BOLDER FLYING AIRPLANE */}
          <motion.div
            animate={{
              x: [25, 275, 510],
              y: [110, 25, 85],
              rotate: [-12, 3, 16],
            }}
            transition={{
              duration: 14,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute top-0 left-0 z-20 pointer-events-auto"
          >
            <div className="flex items-center gap-2 p-2 px-3.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] -translate-x-1/2 -translate-y-1/2">
              <Plane className="w-6 h-6 text-[#E51919] fill-[#E51919] stroke-[2.5]" />
              <div className="flex flex-col">
                <span className="font-display font-black text-xs text-[#171313] tracking-wider leading-none">
                  AI-804
                </span>
                <span className="text-[9px] font-bold text-[#E51919] leading-none mt-0.5">
                  AIR ROUTE
                </span>
              </div>
            </div>
          </motion.div>

          {/* 🚗 🚌 LARGER & PROPERLY POSITIONED RED CAMPERVAN (DRIVING DIRECTLY ON THE ROAD) */}
          <motion.div
            animate={{
              x: [75, 175, 290, 405, 490],
              y: [360, 305, 255, 220, 165],
              scale: [1.25, 1.1, 0.95, 0.8, 0.65],
              rotate: [-32, -26, -18, -22, -32],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute top-0 left-0 z-20 pointer-events-auto cursor-pointer"
          >
            {/* Ground Contact Tire Shadow Directly on Asphalt */}
            <div className="absolute -bottom-2 left-2 w-18 h-4 bg-[#171313]/70 rounded-full blur-[2px]" />

            {/* Red Campervan Vehicle Vector (Substantial & Bold) */}
            <div className="relative p-1.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[4px_4px_0px_#171313] hover:scale-110 transition-transform">
              <svg width="60" height="40" viewBox="0 0 76 56" fill="none">
                {/* Roof Navigation Wheel / Compass */}
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
                {/* Windshield */}
                <path d="M18 25 L15 34 L28 34 L28 25 Z" fill="#FFFFFF" stroke="#171313" strokeWidth="2.5" />
                {/* Side Window */}
                <rect x="36" y="25" width="14" height="10" rx="2" fill="#FFFFFF" stroke="#171313" strokeWidth="2.5" />
                {/* Wheels with Red Hubs */}
                <circle cx="23" cy="48" r="7.5" fill="#FFFFFF" stroke="#171313" strokeWidth="3.5" />
                <circle cx="23" cy="48" r="3" fill="#E51919" />
                <circle cx="50" cy="48" r="7.5" fill="#FFFFFF" stroke="#171313" strokeWidth="3.5" />
                <circle cx="50" cy="48" r="3" fill="#E51919" />
              </svg>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          OUTER PERIPHERAL FLOATING CARDS (PLACED AT THE EDGES FROM OUTSIDE)
          ══════════════════════════════════════════════════════════════ */}
      <motion.div style={{ x: fgX, y: fgY }} className="pointer-events-none">
        {/* 🎫 TOP LEFT OUTER EDGE: EXP-PASS BOARDING PASS */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-2, 1, -2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-3 -left-2 sm:-top-4 sm:-left-4 z-30 pointer-events-auto"
        >
          <div className="p-3 sm:p-3.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 bg-[#E51919] text-white rounded-lg border border-[#171313]">
                <Ticket className="w-4 h-4" />
              </div>
              <span className="font-display font-black text-xs uppercase tracking-widest text-[#171313]">
                EXP-PASS #089
              </span>
            </div>
            <div className="text-[10px] font-extrabold text-neutral-700 border-t-2 border-neutral-100 pt-1.5 flex items-center justify-between gap-4">
              <span>BOM ➔ GOI</span>
              <span className="px-1.5 py-0.5 rounded bg-[#15803D]/15 text-[#15803D] border border-[#15803D]/30 font-black">
                CONFIRMED ✓
              </span>
            </div>
          </div>
        </motion.div>

        {/* 📍 TOP RIGHT OUTER EDGE: MANALI SUMMIT BADGE */}
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute -top-3 -right-2 sm:-top-4 sm:-right-4 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#E51919] text-white border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
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

        {/* 📍 BOTTOM LEFT OUTER EDGE: GOA COAST (START PIN) */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          className="absolute -bottom-3 -left-2 sm:-bottom-4 sm:-left-4 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] hover:-translate-y-1 transition-transform cursor-pointer">
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

        {/* 🧭 BOTTOM RIGHT OUTER EDGE: MULTI-STOP ROUTE COMPASS BADGE */}
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-3, 0, -3] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          className="absolute -bottom-3 -right-2 sm:-bottom-4 sm:-right-4 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] hover:scale-105 transition-transform cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-[#E51919] text-white flex items-center justify-center border border-[#171313]">
              <Navigation className="w-4 h-4 rotate-45 fill-white" />
            </div>
            <div>
              <div className="font-display font-black text-xs uppercase text-[#171313] leading-none">
                MULTI-STOP
              </div>
              <div className="text-[10px] font-bold text-[#E51919] mt-0.5">
                Sequential Route
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
