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

export const TripzyyLogo: React.FC<TripzyyLogoProps> = ({
  className = "",
  size = "md",
}) => {
  const sizeStyles: Record<string, string> = {
    sm: "h-6 w-auto",
    md: "h-8 w-auto",
    sidebar: "h-9 w-auto max-w-[190px]",
    lg: "h-11 w-auto",
    xl: "h-14 w-auto",
  };

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <Image
        src="/tripzyy-logo.png"
        alt="Tripzyy Logo"
        width={300}
        height={66}
        className={`${sizeStyles[size] || sizeStyles.md} object-contain`}
        priority
        unoptimized
      />
    </div>
  );
};
