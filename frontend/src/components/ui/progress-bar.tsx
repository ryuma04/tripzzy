"use client";

import React from "react";

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  color?: "yellow" | "green" | "blue" | "pink" | "orange" | "red";
  showPercentage?: boolean;
  className?: string;
}

const colorClasses = {
  yellow: "bg-[#FFD54A]",
  green: "bg-[#6EE7B7]",
  blue: "bg-[#4F7DF9]",
  pink: "bg-[#FF9ECF]",
  orange: "bg-[#FFB347]",
  red: "bg-[#FF6B6B]",
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  label,
  sublabel,
  color = "yellow",
  showPercentage = true,
  className = "",
}) => {
  const percentage = Math.min(Math.round((value / (max || 1)) * 100), 100);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs font-display font-bold uppercase tracking-wider text-[#111111]">
          <span>{label}</span>
          <span>{sublabel || `${percentage}%`}</span>
        </div>
      )}
      <div className="w-full h-4 bg-[#FFFFFF] border-[2px] border-[#111111] rounded-lg overflow-hidden shadow-[2px_2px_0px_#111111] p-0.5">
        <div
          className={`h-full rounded-md border-r-2 border-[#111111] transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
