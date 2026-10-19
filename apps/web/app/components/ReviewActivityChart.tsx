'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export interface ReviewActivityPoint {
  date: string;
  reviews: number;
}

interface ReviewActivityChartProps {
  data?: ReviewActivityPoint[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Builds the last 7 calendar days dynamically ending on the current date and time.
 */
export function generateCurrent7Days(): ReviewActivityPoint[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return {
      date: label,
      reviews: 0,
    };
  });
}

export function ReviewActivityChart({ data }: ReviewActivityChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = useMemo(() => {
    if (data && data.length > 0) {
      return data;
    }
    return generateCurrent7Days();
  }, [data]);

  const maxVal = Math.max(6, ...chartData.map((d) => d.reviews));
  const tickStep = Math.ceil(maxVal / 3);
  const domainMax = tickStep * 3;
  const ticks = [0, tickStep, tickStep * 2, domainMax];

  if (!mounted) {
    return (
      <div className="w-full h-48 mt-3 flex items-center justify-center bg-slate-50/50 dark:bg-zinc-900/30 rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="w-full h-48 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="reviewAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0 0" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#f1f5f9' }}
            dy={8}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[0, domainMax]}
            ticks={ticks}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              fontSize: '12px',
              color: '#0f172a',
            }}
            formatter={(value: any) => [`${value} PRs reviewed`, 'Reviews']}
            labelStyle={{ fontWeight: 600, color: '#0f172a' }}
          />
          <Area
            type="monotone"
            dataKey="reviews"
            stroke="#2563eb"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#reviewAreaGradient)"
            dot={{
              fill: '#ffffff',
              stroke: '#2563eb',
              strokeWidth: 2,
              r: 3.5,
            }}
            activeDot={{
              fill: '#2563eb',
              stroke: '#ffffff',
              strokeWidth: 2,
              r: 5,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
