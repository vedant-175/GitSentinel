'use client';

import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { WeeklyIssueTrend } from '@/lib/analytics';
import { TrendingUp } from 'lucide-react';

interface Props {
  data: WeeklyIssueTrend[];
}

export function WeeklyTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-slate-900/30">
        <TrendingUp className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium text-slate-300">No Weekly PR Trend Data</p>
        <p className="text-xs text-slate-500 mt-1">
          Historical trend data will populate as PR reviews are processed week by week.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            dataKey="week"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#818cf8"
            fontSize={11}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderColor: '#334155',
              borderRadius: '0.75rem',
              fontSize: '12px',
              color: '#f8fafc',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '10px' }}
          />
          <Bar
            yAxisId="left"
            dataKey="issuesCount"
            name="Issues Flagged"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            yAxisId="left"
            dataKey="prCount"
            name="PRs Processed"
            fill="#0ea5e9"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="issuesPerPr"
            name="Issues / PR"
            stroke="#f43f5e"
            strokeWidth={2}
            dot={{ r: 4, fill: '#f43f5e' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
