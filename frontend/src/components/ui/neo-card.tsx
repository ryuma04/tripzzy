"use client";

import React from "react";

interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "white" | "cream" | "cream-card" | "cream-light" | "red" | "soft-red" | "dark" | "yellow" | "blue" | "green" | "pink" | "orange";
  interactive?: boolean;
  redShadow?: boolean;
  className?: string;
}

const variantStyles: Record<string, string> = {
  white: "bg-[#FFFFFF] text-[#171313]",
  cream: "bg-[#FAF7F2] text-[#171313]",
  "cream-card": "bg-[#F3ECE2] text-[#171313]",
  "cream-light": "bg-[#FFFDFB] text-[#171313]",
  red: "bg-[#E51919] text-[#FFFFFF]",
  "soft-red": "bg-[#FCA5A5]/35 text-[#171313]",
  dark: "bg-[#171313] text-[#FAF7F2] border-[#171313]",
  yellow: "bg-[#F3ECE2] text-[#171313]",
  blue: "bg-[#FAF7F2] text-[#171313]",
  green: "bg-[#15803D]/15 text-[#171313]",
  pink: "bg-[#FCA5A5]/30 text-[#171313]",
  orange: "bg-[#F3ECE2] text-[#171313]",
};

export const NeoCard: React.FC<NeoCardProps> = ({
  children,
  variant = "white",
  interactive = false,
  redShadow = false,
  className = "",
  ...props
}) => {
  const baseShadow = redShadow
    ? "shadow-[4px_4px_0px_#E51919]"
    : "shadow-[4px_4px_0px_#171313]";

  const hoverShadow = redShadow
    ? "hover:shadow-[7px_7px_0px_#E51919]"
    : "hover:shadow-[7px_7px_0px_#171313]";

  const activeShadow = redShadow
    ? "active:shadow-[2px_2px_0px_#E51919]"
    : "active:shadow-[2px_2px_0px_#171313]";

  return (
    <div
      className={`border-[3px] border-[#171313] rounded-2xl p-6 transition-all duration-150 ${
        variantStyles[variant] || variantStyles.white
      } ${baseShadow} ${
        interactive
          ? `cursor-pointer hover:-translate-x-1 hover:-translate-y-1 ${hoverShadow} active:translate-x-0.5 active:translate-y-0.5 ${activeShadow}`
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
