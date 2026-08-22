"use client";

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-display font-bold text-xs md:text-sm uppercase tracking-wide border-[3px] border-[#171313] select-none transition-all duration-100 cursor-pointer whitespace-nowrap ${
              isActive
                ? "bg-[#D94B3D] text-[#FFFFFF] shadow-[3px_3px_0px_#171313] -translate-x-0.5 -translate-y-0.5"
                : "bg-[#FFFFFF] text-[#171313] hover:bg-[#FFF4E6] hover:-translate-y-0.5"
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold border border-[#171313] ${
                  isActive ? "bg-[#171313] text-[#FFF4E6]" : "bg-[#FFF4E6] text-[#171313]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
