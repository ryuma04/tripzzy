"use client";

import React from "react";

interface SectionHeaderProps {
  tag?: string;
  tagColor?: "red" | "cream" | "soft-red" | "dark" | "white" | "green" | "yellow" | "blue" | "pink";
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

const tagStyles: Record<string, string> = {
  red: "bg-[#E51919] text-[#FFFFFF]",
  cream: "bg-[#FAF7F2] text-[#171313]",
  "soft-red": "bg-[#FCA5A5] text-[#171313]",
  dark: "bg-[#171313] text-[#FAF7F2]",
  white: "bg-[#FFFFFF] text-[#171313]",
  green: "bg-[#15803D] text-[#FFFFFF]",
  yellow: "bg-[#E51919] text-[#FFFFFF]",
  blue: "bg-[#FAF7F2] text-[#171313]",
  pink: "bg-[#FCA5A5] text-[#171313]",
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  tag,
  tagColor = "red",
  title,
  subtitle,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 select-none ${className}`}
    >
      <div>
        {tag && (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-md border-2 border-[#171313] font-display font-black text-[11px] uppercase tracking-wider shadow-[2px_2px_0px_#171313] mb-2 ${
              tagStyles[tagColor] || tagStyles.red
            }`}
          >
            {tag}
          </span>
        )}
        <h2 className="font-display font-black text-2xl sm:text-3xl text-[#171313] tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs sm:text-sm text-neutral-600 font-medium mt-1 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
};
