"use client";

import React from "react";
import Image from "next/image";

interface TripzyyLogoProps {
  className?: string;
  variant?: "full" | "icon" | "badge";
  size?: "sm" | "md" | "lg" | "xl" | "sidebar";
  showText?: boolean;
  inverted?: boolean;
}

const SIZE_CONFIG: Record<
  string,
  { iconSize: number; iconClass: string; textClass: string; gapClass: string }
> = {
  sm: {
    iconSize: 28,
    iconClass: "w-7 h-7",
    textClass: "text-lg tracking-tight",
    gapClass: "gap-2",
  },
  md: {
    iconSize: 36,
    iconClass: "w-9 h-9",
    textClass: "text-2xl tracking-tight",
    gapClass: "gap-2.5",
  },
  sidebar: {
    iconSize: 36,
    iconClass: "w-9 h-9",
    textClass: "text-2xl tracking-tight",
    gapClass: "gap-2.5",
  },
  lg: {
    iconSize: 44,
    iconClass: "w-11 h-11",
    textClass: "text-3xl tracking-tight",
    gapClass: "gap-3",
  },
  xl: {
    iconSize: 56,
    iconClass: "w-14 h-14",
    textClass: "text-4xl sm:text-5xl tracking-tight",
    gapClass: "gap-3.5",
  },
};

export const TripzyyLogo: React.FC<TripzyyLogoProps> = ({
  className = "",
  variant = "full",
  size = "md",
  showText = true,
  inverted = false,
}) => {
  const config = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const shouldShowText = variant !== "icon" && showText;

  return (
    <div
      className={`inline-flex items-center ${config.gapClass} select-none group ${className}`}
    >
      {/* Official Travel Compass Emblem */}
      <div className={`relative ${config.iconClass} shrink-0 transition-transform group-hover:scale-105`}>
        <Image
          src="/tripzyy-icon.svg"
          alt="Tripzyy Emblem"
          width={config.iconSize}
          height={config.iconSize}
          className="w-full h-full object-contain drop-shadow-xs"
          priority
          unoptimized
        />
      </div>

      {/* Brand Name Typography */}
      {shouldShowText && (
        <span
          className={`font-display font-black leading-none uppercase ${
            inverted ? "text-white" : "text-[#171313]"
          } ${config.textClass}`}
        >
          Tripzyy
        </span>
      )}
    </div>
  );
};
