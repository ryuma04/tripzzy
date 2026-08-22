"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ChartDataItem {
  name: string;
  value: number;
  color?: string;
}

interface NeoPieChartProps {
  data: ChartDataItem[];
  height?: number;
  className?: string;
  innerRadius?: number;
  outerRadius?: number;
}

const RED_CREAM_CHART_COLORS = [
  "#D94B3D", // Primary Red
  "#A8322A", // Deep Red
  "#F3B5A8", // Soft Red
  "#E8D8C8", // Muted Beige
  "#171313", // Dark Charcoal
  "#5F8F6B", // Success Green
];

export const NeoPieChart: React.FC<NeoPieChartProps> = ({
  data,
  height = 240,
  innerRadius = 55,
  outerRadius = 85,
  className = "",
}) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      return (
        <div className="bg-[#FFFFFF] border-[3px] border-[#171313] p-3 rounded-xl shadow-[4px_4px_0px_#171313] font-display">
          <div className="text-xs font-bold text-neutral-500 uppercase">
            {item.name}
          </div>
          <div className="text-base font-extrabold text-[#D94B3D]">
            ₹{Number(item.value).toLocaleString("en-IN")}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full flex flex-col items-center justify-center ${className}`}>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={3}
              dataKey="value"
              stroke="#171313"
              strokeWidth={2.5}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || RED_CREAM_CHART_COLORS[index % RED_CREAM_CHART_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend list */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
        {data.map((entry, index) => {
          const color =
            entry.color || RED_CREAM_CHART_COLORS[index % RED_CREAM_CHART_COLORS.length];
          return (
            <div key={entry.name} className="flex items-center gap-1.5 text-xs font-bold text-[#171313]">
              <span
                className="w-3.5 h-3.5 rounded-md border-2 border-[#171313] shadow-[1px_1px_0px_#171313]"
                style={{ backgroundColor: color }}
              />
              <span>{entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
