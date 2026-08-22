"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowRight, Compass, Sparkles } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-button";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";

export const LandingNavbar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[#FFF5E9]/95 backdrop-blur-md border-b-[3px] border-[#171313] px-4 sm:px-8 lg:px-12 py-3.5 select-none transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* LEFT: Official Tripzyy Logo */}
          <Link
            href="/"
            className="flex items-center p-1.5 px-3 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[3px_3px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform"
          >
            <TripzyyLogo size="md" />
          </Link>

          {/* CENTER: Minimal & Clean Navigation */}
          <nav className="hidden md:flex items-center gap-8 font-display font-black text-xs uppercase tracking-wider text-[#171313]">
            <Link
              href="/explore"
              className="hover:text-[#E51919] transition-colors flex items-center gap-1.5"
            >
              <span>Explore Routes</span>
            </Link>
            <Link
              href="/community"
              className="hover:text-[#E51919] transition-colors flex items-center gap-1.5"
            >
              <span>Community Feed</span>
            </Link>
            <Link
              href="/calendar"
              className="hover:text-[#E51919] transition-colors flex items-center gap-1.5"
            >
              <span>Schedule</span>
            </Link>
          </nav>

          {/* RIGHT: Neo-Brutalist Auth CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/login">
              <NeoButton variant="white" size="sm">
                Sign In
              </NeoButton>
            </Link>
            <Link href="/register">
              <NeoButton
                variant="primary"
                size="sm"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Sign Up
              </NeoButton>
            </Link>
          </div>

          {/* MOBILE TOGGLE */}
          <div className="flex sm:hidden items-center gap-2">
            <Link href="/login">
              <NeoButton variant="white" size="sm" className="px-2.5 py-1 text-[11px]">
                Sign In
              </NeoButton>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl border-[2.5px] border-[#171313] bg-[#E51919] text-white shadow-[2px_2px_0px_#171313] cursor-pointer"
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
                  Explore Regional Circuits
                </Link>
                <Link
                  href="/community"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-3 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-[#FAECDC]"
                >
                  Community Expeditions
                </Link>
                <Link
                  href="/calendar"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-3 bg-[#FFFFFF] border-2 border-[#171313] rounded-xl shadow-[2px_2px_0px_#171313] hover:bg-[#FAECDC]"
                >
                  Travel Calendar Timeline
                </Link>
              </div>

              <div className="flex flex-col gap-2.5 pt-3 border-t-2 border-[#171313]">
                <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                  <NeoButton variant="primary" size="md" className="w-full">
                    Sign Up Free
                  </NeoButton>
                </Link>
                <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  <NeoButton variant="white" size="md" className="w-full">
                    Sign In
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
