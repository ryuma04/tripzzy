"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface BarChartDataItem {
  name: string;
  amount?: number;
  value?: number;
  budget?: number;
}

interface NeoBarChartProps {
  data: BarChartDataItem[];
  height?: number;
  className?: string;
  dataKey?: string;
  compareKey?: string;
  fillColor?: string;
}

export const NeoBarChart: React.FC<NeoBarChartProps> = ({
  data,
  height = 260,
  className = "",
  dataKey,
  compareKey,
  fillColor = "#D94B3D",
}) => {
  // Normalize items so amount and value are both present
  const normalizedData = data.map((d) => ({
    ...d,
    amount: d.amount !== undefined ? d.amount : d.value || 0,
    value: d.value !== undefined ? d.value : d.amount || 0,
  }));

  const activeDataKey = dataKey || (data[0]?.amount !== undefined ? "amount" : "value");

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#FFFFFF] border-[3px] border-[#171313] p-3 rounded-xl shadow-[4px_4px_0px_#171313] font-display">
          <div className="text-xs font-bold text-neutral-500 uppercase">{label}</div>
          {payload.map((p: any, idx: number) => (
            <div
              key={idx}
              className={`text-sm font-extrabold ${
                p.dataKey === "budget" ? "text-neutral-700" : "text-[#D94B3D]"
              }`}
            >
              {p.name}: ₹{Number(p.value).toLocaleString("en-IN")}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full ${className}`}>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={normalizedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#171313"
              fontSize={11}
              fontWeight={700}
              tickLine={false}
              axisLine={{ stroke: "#171313", strokeWidth: 2 }}
            />
            <YAxis
              stroke="#171313"
              fontSize={10}
              fontWeight={700}
              tickLine={false}
              axisLine={{ stroke: "#171313", strokeWidth: 2 }}
              tickFormatter={(v) => `₹${v / 1000}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey={activeDataKey}
              name="Spent"
              fill={fillColor}
              stroke="#171313"
              strokeWidth={2}
              radius={[6, 6, 0, 0]}
            />
            {compareKey && (
              <Bar
                dataKey={compareKey}
                name="Budget Limit"
                fill="#E8D8C8"
                stroke="#171313"
                strokeWidth={2}
                radius={[6, 6, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
