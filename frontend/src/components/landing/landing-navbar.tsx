"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowRight } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";

export const LandingNavbar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[#FFF5E9]/95 backdrop-blur-md border-b-[3px] border-[#171313] px-6 sm:px-10 lg:px-16 py-4 select-none">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          {/* LEFT: Official Tripzyy Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform"
          >
            <TripzyyLogo size="md" />
          </Link>

          {/* CENTER: Minimal & Clean Navigation Matching Reference */}
          <nav className="hidden md:flex items-center gap-10 font-display font-black text-xs sm:text-sm uppercase tracking-wider text-[#171313]">
            <Link
              href="/explore"
              className="hover:text-[#D94B3D] transition-colors"
            >
              EXPLORE ROUTES
            </Link>
            <Link
              href="/community"
              className="hover:text-[#D94B3D] transition-colors"
            >
              COMMUNITY FEED
            </Link>
            <Link
              href="/calendar"
              className="hover:text-[#D94B3D] transition-colors"
            >
              SCHEDULE
            </Link>
          </nav>

          {/* RIGHT: Neo-Brutalist Auth CTAs Matching Reference */}
          <div className="hidden sm:flex items-center gap-4">
            <Link href="/login">
              <NeoButton
                variant="white"
                size="sm"
                className="py-2.5 px-6 font-black uppercase text-xs tracking-wider shadow-[3px_3px_0px_#171313]"
              >
                SIGN IN
              </NeoButton>
            </Link>
            <Link href="/register">
              <NeoButton
                variant="primary"
                size="sm"
                rightIcon={<ArrowRight className="w-4 h-4 stroke-[3]" />}
                className="py-2.5 px-6 font-black uppercase text-xs tracking-wider bg-[#D94B3D] hover:bg-[#A8322A] text-white shadow-[3px_3px_0px_#171313]"
              >
                SIGN UP
              </NeoButton>
            </Link>
          </div>

          {/* MOBILE TOGGLE */}
          <div className="flex sm:hidden items-center gap-2">
            <Link href="/login">
              <NeoButton variant="white" size="sm" className="px-3 py-1.5 text-xs font-black">
                SIGN IN
              </NeoButton>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl border-[2.5px] border-[#171313] bg-[#D94B3D] text-white shadow-[2px_2px_0px_#171313] cursor-pointer"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE SLIDE-OUT MENU */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 sm:hidden flex flex-col">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-[#171313]/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-[#FFF5E9] border-b-[4px] border-[#171313] p-6 shadow-[6px_6px_0px_#171313] z-10 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between pb-3 border-b-2 border-[#171313]">
                <TripzyyLogo size="sm" />
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg border border-[#171313] bg-[#FFFFFF]"
                >
                  <X className="w-5 h-5 text-[#171313]" />
                </button>
              </div>

              <div className="flex flex-col gap-3 font-display font-black text-sm uppercase">
                <Link
                  href="/explore"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-3 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-[#FAECDC]"
                >
                  EXPLORE ROUTES
                </Link>
                <Link
                  href="/community"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-3 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-[#FAECDC]"
                >
                  COMMUNITY FEED
                </Link>
                <Link
                  href="/calendar"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-3 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-[#FAECDC]"
                >
                  SCHEDULE
                </Link>
              </div>

              <div className="flex flex-col gap-2.5 pt-3 border-t-2 border-[#171313]">
                <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                  <NeoButton variant="primary" size="md" className="w-full bg-[#D94B3D] text-white">
                    SIGN UP →
                  </NeoButton>
                </Link>
                <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  <NeoButton variant="white" size="md" className="w-full">
                    SIGN IN
                  </NeoButton>
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
