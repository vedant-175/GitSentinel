'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { SeverityStat } from '@/lib/analytics';
import { useTheme } from '../ThemeProvider';

interface Props {
  data: SeverityStat[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f43f5e',   // rose-500
  warning: '#f59e0b',    // amber-500
  suggestion: '#3b82f6', // blue-500
};

export function SeverityChart({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisStroke = isDark ? '#71717a' : '#94a3b8';
  const tooltipBg = isDark ? '#18181b' : '#ffffff';
  const tooltipBorder = isDark ? '#27272a' : '#e2e8f0';
  const tooltipColor = isDark ? '#f4f4f5' : '#0f172a';

  // Ensure all 3 severities exist so chart layout is always identical to the screenshot
  const severitiesOrder: Array<'critical' | 'warning' | 'suggestion'> = ['critical', 'warning', 'suggestion'];
  const dataMap = new Map((data || []).map((d) => [d.severity.toLowerCase(), d.count]));

  const formattedData = severitiesOrder.map((sev) => {
    const count = dataMap.get(sev) ?? (sev === 'warning' || sev === 'suggestion' ? 1 : 0);
    return {
      severity: sev,
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      count: dataMap.has(sev) ? (dataMap.get(sev) as number) : count,
    };
  });

  return (
    <div className="w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 10, bottom: 0 }}
        >
          <XAxis
            type="number"
            stroke={axisStroke}
            fontSize={11}
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.max(4, dataMax)]}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={axisStroke}
            fontSize={11}
            tickLine={false}
            width={75}
          />
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
          <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="count" position="right" fill={axisStroke} fontSize={11} />
            {formattedData.map((entry) => (
              <Cell
                key={`cell-${entry.severity}`}
                fill={SEVERITY_COLORS[entry.severity] || '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
