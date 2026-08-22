"use client";

import React from "react";
import Image from "next/image";

interface AvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs border-[2px]",
  md: "w-10 h-10 text-sm border-[3px]",
  lg: "w-14 h-14 text-lg border-[3px]",
  xl: "w-20 h-20 text-2xl border-[4px]",
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = "md",
  className = "",
}) => {
  const getInitials = (n: string) => {
    const parts = n.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-xl overflow-hidden border-[#171313] bg-[#D94B3D] text-[#FFFFFF] font-display font-extrabold shadow-[2px_2px_0px_#171313] select-none flex-shrink-0 ${sizeClasses[size]} ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="80px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
};
