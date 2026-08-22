"use client";

import React from "react";
import { NeoCard } from "./neo-card";
import { NeoButton } from "./neo-button";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}) => {
  return (
    <NeoCard className={`flex flex-col items-center text-center py-10 px-6 max-w-lg mx-auto border-[#FF6B6B] ${className}`}>
      <div className="w-14 h-14 rounded-2xl border-[3px] border-[#111111] bg-[#FF6B6B] flex items-center justify-center text-white shadow-[3px_3px_0px_#111111] mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h3 className="font-display font-extrabold text-xl text-[#111111] mb-1">
        {title}
      </h3>
      <p className="text-sm font-medium text-neutral-600 mb-6 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <NeoButton variant="primary" size="md" onClick={onRetry}>
          Try Again
        </NeoButton>
      )}
    </NeoCard>
  );
};
