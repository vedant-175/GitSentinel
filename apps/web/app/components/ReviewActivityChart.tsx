'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const data = [
  { date: 'Nov 16', reviews: 3 },
  { date: 'Nov 17', reviews: 5 },
  { date: 'Nov 18', reviews: 4 },
  { date: 'Nov 19', reviews: 3 },
  { date: 'Nov 20', reviews: 5 },
  { date: 'Nov 21', reviews: 7 },
  { date: 'Nov 22', reviews: 4 },
];

export function ReviewActivityChart() {
  return (
    <div className="w-full h-48 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
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
            domain={[0, 9]}
            ticks={[0, 3, 6, 9]}
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
