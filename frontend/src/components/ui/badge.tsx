"use client";

import React from "react";
import type { TripStatus } from "@/types";

interface BadgeProps {
  children?: React.ReactNode;
  variant?: "red" | "cream" | "soft-red" | "dark" | "white" | "green" | "yellow" | "blue" | "pink" | "orange" | "status";
  status?: TripStatus;
  size?: "sm" | "md";
  className?: string;
}

const statusColors: Record<TripStatus, string> = {
  draft: "bg-[#FAF7F2] text-[#171313] border-[#171313]",
  upcoming: "bg-[#E51919] text-[#FFFFFF] border-[#171313]",
  ongoing: "bg-[#E51919] text-[#FFFFFF] border-[#171313]",
  completed: "bg-[#15803D] text-[#FFFFFF] border-[#171313]",
};

const badgeColors: Record<string, string> = {
  red: "bg-[#E51919] text-[#FFFFFF]",
  cream: "bg-[#FAF7F2] text-[#171313]",
  "soft-red": "bg-[#FCA5A5] text-[#171313]",
  dark: "bg-[#171313] text-[#FAF7F2]",
  white: "bg-[#FFFFFF] text-[#171313]",
  green: "bg-[#15803D] text-[#FFFFFF]",
  yellow: "bg-[#E51919] text-[#FFFFFF]",
  blue: "bg-[#FAF7F2] text-[#171313]",
  pink: "bg-[#FCA5A5] text-[#171313]",
  orange: "bg-[#FAF7F2] text-[#171313]",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "red",
  status,
  size = "md",
  className = "",
}) => {
  const colorClass = status
    ? statusColors[status]
    : badgeColors[variant] || badgeColors.red;

  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs";

  const statusLabels: Record<TripStatus, string> = {
    draft: "Draft",
    upcoming: "Upcoming",
    ongoing: "In Progress",
    completed: "Completed",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-display font-black uppercase rounded-lg border-2 border-[#171313] shadow-[2px_2px_0px_#171313] select-none ${sizeClass} ${colorClass} ${className}`}
    >
      {status ? statusLabels[status] : children}
    </span>
  );
};
