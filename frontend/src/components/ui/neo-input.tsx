"use client";

import React, { forwardRef } from "react";

export interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const NeoInput = forwardRef<HTMLInputElement, NeoInputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = "", ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="font-display font-bold text-xs uppercase tracking-wider text-[#111111] flex items-center justify-between">
            <span>{label}</span>
            {props.required && <span className="text-[#FF6B6B] text-sm">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 text-[#111111] pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-[#FFFFFF] text-[#111111] font-medium border-[3px] border-[#111111] rounded-xl px-4 py-2.5 outline-none shadow-[3px_3px_0px_#111111] transition-all duration-150 placeholder:text-neutral-400 focus:shadow-[5px_5px_0px_#111111] focus:-translate-x-0.5 focus:-translate-y-0.5 focus:border-[#111111] focus:bg-[#FFFFFF] disabled:bg-neutral-100 disabled:cursor-not-allowed ${
              leftIcon ? "pl-11" : ""
            } ${rightIcon ? "pr-11" : ""} ${
              error ? "border-[#FF6B6B] bg-red-50/50" : ""
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 text-[#111111] flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <span className="text-xs font-bold text-[#FF6B6B] tracking-wide mt-0.5">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span className="text-xs text-neutral-500 font-medium">{helperText}</span>
        )}
      </div>
    );
  }
);

NeoInput.displayName = "NeoInput";
