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
  { height: number; fullWidth: number; iconWidth: number; heightClass: string }
> = {
  sm: {
    height: 28,
    fullWidth: 124,
    iconWidth: 39,
    heightClass: "h-7",
  },
  md: {
    height: 34,
    fullWidth: 150,
    iconWidth: 47,
    heightClass: "h-[34px]",
  },
  sidebar: {
    height: 32,
    fullWidth: 141,
    iconWidth: 45,
    heightClass: "h-8",
  },
  lg: {
    height: 42,
    fullWidth: 186,
    iconWidth: 59,
    heightClass: "h-10 sm:h-[42px]",
  },
  xl: {
    height: 52,
    fullWidth: 230,
    iconWidth: 73,
    heightClass: "h-12 sm:h-[52px]",
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
  const isIconOnly = variant === "icon" || !showText;

  const logoSrc = isIconOnly
    ? inverted
      ? "/tripzyy-icon-white.png"
      : "/tripzyy-icon.png"
    : inverted
    ? "/tripzyy-logo-white.png"
    : "/tripzyy-logo.png";

  const width = isIconOnly ? config.iconWidth : config.fullWidth;

  return (
    <div
      className={`inline-flex items-center select-none group transition-transform hover:scale-[1.02] ${className}`}
    >
      <div className={`relative ${config.heightClass} shrink-0`}>
        <Image
          src={logoSrc}
          alt="Tripzyy"
          width={width}
          height={config.height}
          className="h-full w-auto object-contain drop-shadow-xs"
          priority
          unoptimized
        />
      </div>
    </div>
  );
};
