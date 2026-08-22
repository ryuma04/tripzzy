import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ToastProvider } from "@/components/ui/toast";
import { TripzyyLogo } from "@/components/ui/tripzyy-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#FFF5E9] flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
        {/* Decorative Neo-Brutalist floating elements */}
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-[#FCA5A5]/30 rounded-full border-[4px] border-[#171313] pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#E51919]/15 rounded-full border-[4px] border-[#171313] pointer-events-none" />
        <div className="absolute top-1/4 right-12 w-12 h-12 bg-[#E51919] border-[3px] border-[#171313] shadow-[3px_3px_0px_#171313] rotate-12 pointer-events-none hidden md:block" />

        {/* Central Logo */}
        <Link
          href="/"
          className="mb-8 p-3.5 bg-[#FFFFFF] border-[3px] border-[#171313] rounded-2xl shadow-[5px_5px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform z-10 block"
        >
          <TripzyyLogo size="lg" />
        </Link>

        {/* Content Container */}
        <div className="w-full max-w-md z-10">{children}</div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs font-bold text-neutral-600 z-10">
          Tripzyy Neo-Brutalist Travel Architecture • Secure Workspace
        </div>
      </div>
    </ToastProvider>
  );
}
