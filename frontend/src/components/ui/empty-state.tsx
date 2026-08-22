"use client";

import React from "react";
import { NeoCard } from "./neo-card";
import { Compass } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Compass className="w-10 h-10 text-[#111111]" />,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <NeoCard className={`flex flex-col items-center text-center py-12 px-6 max-w-lg mx-auto ${className}`}>
      <div className="w-16 h-16 rounded-2xl border-[3px] border-[#111111] bg-[#FFD54A] flex items-center justify-center shadow-[3px_3px_0px_#111111] mb-4">
        {icon}
      </div>
      <h3 className="font-display font-extrabold text-xl text-[#111111] mb-1">
        {title}
      </h3>
      <p className="text-sm font-medium text-neutral-600 mb-6 max-w-sm">
        {description}
      </p>
      {action && <div>{action}</div>}
    </NeoCard>
  );
};
