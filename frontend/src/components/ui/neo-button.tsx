"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "red"
  | "cream"
  | "soft-red"
  | "dark"
  | "white"
  | "green"
  | "yellow"; // for backward compatibility

export type ButtonSize = "sm" | "md" | "lg";

interface NeoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[#E51919] text-[#FFFFFF] hover:bg-[#B91C1C]",
  red: "bg-[#E51919] text-[#FFFFFF] hover:bg-[#B91C1C]",
  cream: "bg-[#FAF7F2] text-[#171313] hover:bg-[#F3ECE2]",
  "soft-red": "bg-[#FCA5A5] text-[#171313] hover:bg-[#f87171]",
  dark: "bg-[#171313] text-[#FAF7F2] hover:bg-[#2a2424]",
  white: "bg-[#FFFFFF] text-[#171313] hover:bg-[#FAF7F2]",
  green: "bg-[#15803D] text-[#FFFFFF] hover:bg-[#166534]",
  yellow: "bg-[#E51919] text-[#FFFFFF] hover:bg-[#B91C1C]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-bold gap-1.5 rounded-lg border-[2px]",
  md: "px-5 py-2.5 text-sm font-bold gap-2 rounded-xl border-[3px]",
  lg: "px-7 py-3.5 text-base font-extrabold gap-2.5 rounded-xl border-[3px]",
};

export const NeoButton: React.FC<NeoButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  children,
  ...props
}) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-display tracking-wide uppercase border-[#171313] select-none transition-all duration-100 ease-out cursor-pointer shadow-[3px_3px_0px_#171313] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#171313] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#171313] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-[2px_2px_0px_#171313] ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
