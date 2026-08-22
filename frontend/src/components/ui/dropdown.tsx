"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = "Select an option",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span className="font-display font-bold text-xs uppercase tracking-wider text-[#111111]">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-[#FFFFFF] text-[#111111] font-display font-bold text-xs md:text-sm uppercase tracking-wide border-[3px] border-[#111111] rounded-xl px-4 py-2.5 shadow-[3px_3px_0px_#111111] cursor-pointer hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-100 select-none"
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[180px] bg-[#FFFFFF] border-[3px] border-[#111111] rounded-xl shadow-[5px_5px_0px_#111111] z-30 overflow-hidden py-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-xs md:text-sm font-bold flex items-center gap-2 hover:bg-[#FFD54A] transition-colors cursor-pointer ${
                option.value === value ? "bg-[#FFD54A]/40 font-extrabold" : ""
              }`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
