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
import { BarChart3 } from 'lucide-react';
import { useTheme } from '../ThemeProvider';

interface Props {
  data: WeeklyIssueTrend[];
}

export function WeeklyTrendChart({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisStroke = isDark ? '#71717a' : '#94a3b8';
  const gridStroke = isDark ? '#27272a' : '#f1f5f9';
  const tooltipBg = isDark ? '#18181b' : '#ffffff';
  const tooltipBorder = isDark ? '#27272a' : '#e2e8f0';
  const tooltipColor = isDark ? '#f4f4f5' : '#0f172a';

  const defaultEmptyWeeks: WeeklyIssueTrend[] = [
    { week: 'Jan 13', issuesCount: 0, prCount: 0, issuesPerPr: 0 },
    { week: 'Jan 20', issuesCount: 0, prCount: 0, issuesPerPr: 0 },
    { week: 'Jan 27', issuesCount: 0, prCount: 0, issuesPerPr: 0 },
    { week: 'Feb 03', issuesCount: 0, prCount: 0, issuesPerPr: 0 },
    { week: 'Feb 10', issuesCount: 0, prCount: 0, issuesPerPr: 0 },
  ];

  const isEmpty = !data || data.length === 0 || data.every((d) => d.issuesCount === 0 && d.prCount === 0);
  const chartData = isEmpty ? defaultEmptyWeeks : data;

  return (
    <div className="relative w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.8} />
          <XAxis
            dataKey="week"
            stroke={axisStroke}
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            stroke={axisStroke}
            fontSize={11}
            tickLine={false}
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.max(4, dataMax)]}
          />
          {!isEmpty && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#818cf8"
              fontSize={11}
              tickLine={false}
            />
          )}
          {!isEmpty && (
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: '0.75rem',
                fontSize: '12px',
                color: tooltipColor,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            />
          )}
          {!isEmpty && (
            <Legend
              wrapperStyle={{ fontSize: '11px', color: axisStroke, paddingTop: '10px' }}
            />
          )}
          {!isEmpty && (
            <>
              <Bar
                yAxisId="left"
                dataKey="issuesCount"
                name="Issues Flagged"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                yAxisId="left"
                dataKey="prCount"
                name="PRs Processed"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
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
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-4">
          <BarChart3 className="w-7 h-7 text-slate-400 dark:text-zinc-500 mb-1.5" />
          <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">No Weekly PR Trend Data</p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 max-w-xs leading-relaxed">
            Historical trend data will populate as PR reviews are processed week by week.
          </p>
        </div>
      )}
    </div>
  );
}
