"use client";

import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  trendPositive?: boolean;
  color?: "red" | "cream" | "soft-red" | "dark" | "white" | "yellow" | "blue" | "green" | "pink";
  className?: string;
}

const colorStyles: Record<string, { bg: string; text: string; iconBg: string }> = {
  red: {
    bg: "bg-[#E51919]",
    text: "text-[#FFFFFF]",
    iconBg: "bg-[#171313] text-[#FAF7F2]",
  },
  cream: {
    bg: "bg-[#FAF7F2]",
    text: "text-[#171313]",
    iconBg: "bg-[#FFFFFF] text-[#E51919]",
  },
  "soft-red": {
    bg: "bg-[#FCA5A5]/35",
    text: "text-[#171313]",
    iconBg: "bg-[#FFFFFF] text-[#171313]",
  },
  dark: {
    bg: "bg-[#171313]",
    text: "text-[#FAF7F2]",
    iconBg: "bg-[#2A2424] text-[#FAF7F2]",
  },
  white: {
    bg: "bg-[#FFFFFF]",
    text: "text-[#171313]",
    iconBg: "bg-[#FAF7F2] text-[#E51919]",
  },
  yellow: {
    bg: "bg-[#E51919]",
    text: "text-[#FFFFFF]",
    iconBg: "bg-[#171313] text-[#FAF7F2]",
  },
  blue: {
    bg: "bg-[#FAF7F2]",
    text: "text-[#171313]",
    iconBg: "bg-[#FFFFFF] text-[#E51919]",
  },
  green: {
    bg: "bg-[#15803D]/15",
    text: "text-[#171313]",
    iconBg: "bg-[#FFFFFF] text-[#15803D]",
  },
  pink: {
    bg: "bg-[#FCA5A5]/35",
    text: "text-[#171313]",
    iconBg: "bg-[#FFFFFF] text-[#171313]",
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  trendPositive = true,
  color = "white",
  className = "",
}) => {
  const styles = colorStyles[color] || colorStyles.white;
  const isRed = color === "red" || color === "yellow";

  return (
    <div
      className={`border-[3px] border-[#171313] rounded-2xl p-5 shadow-[4px_4px_0px_#171313] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#171313] ${styles.bg} ${styles.text} ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          className={`font-display font-black text-[11px] uppercase tracking-wider ${
            isRed ? "text-white/90" : "text-neutral-600"
          }`}
        >
          {label}
        </span>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl border-2 border-[#171313] flex items-center justify-center shadow-[2px_2px_0px_#171313] flex-shrink-0 ${styles.iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display font-black text-2xl sm:text-3xl tracking-tight">
          {value}
        </span>
        {trend && (
          <span
            className={`text-[11px] font-extrabold px-2 py-0.5 rounded border border-[#171313] shadow-[1px_1px_0px_#171313] ${
              isRed
                ? "bg-[#171313] text-[#FAF7F2]"
                : trendPositive
                ? "bg-[#15803D]/20 text-[#15803D]"
                : "bg-[#E51919]/20 text-[#E51919]"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};
