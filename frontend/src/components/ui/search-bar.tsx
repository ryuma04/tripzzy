"use client";

import React from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: () => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = "Search destinations, cities, or activities...",
  onSearch,
  className = "",
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch();
    }
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <div className="absolute left-4 text-[#111111] pointer-events-none flex items-center">
        <Search className="w-5 h-5" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-[#FFFFFF] text-[#111111] font-medium border-[3px] border-[#111111] rounded-2xl pl-12 pr-12 py-3 outline-none shadow-[4px_4px_0px_#111111] transition-all duration-150 placeholder:text-neutral-400 focus:shadow-[6px_6px_0px_#111111] focus:-translate-x-0.5 focus:-translate-y-0.5"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 p-1 rounded-md hover:bg-neutral-100 text-[#111111] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
