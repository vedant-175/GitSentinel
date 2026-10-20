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
import { CategoryStat } from '@/lib/analytics';
import { useTheme } from '../ThemeProvider';

interface Props {
  data: CategoryStat[];
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  security: { label: 'Security', color: '#3b82f6' },
  bug: { label: 'Bugs', color: '#ec4899' },
  performance: { label: 'Performance', color: '#06b6d4' },
  maintainability: { label: 'Maintainability', color: '#10b981' },
  style: { label: 'Style', color: '#8b5cf6' },
};

const STANDARD_CATEGORIES = ['security', 'bug', 'performance', 'maintainability', 'style'];

export function CategoryChart({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisStroke = isDark ? '#71717a' : '#94a3b8';
  const tooltipBg = isDark ? '#18181b' : '#ffffff';
  const tooltipBorder = isDark ? '#27272a' : '#e2e8f0';
  const tooltipColor = isDark ? '#f4f4f5' : '#0f172a';

  const dataMap = new Map((data || []).map((d) => [d.category.toLowerCase(), d.count]));

  const formattedData = STANDARD_CATEGORIES.map((cat) => {
    const defaultCount = cat === 'security' || cat === 'bug' ? 1 : 0;
    const count = dataMap.has(cat) ? (dataMap.get(cat) as number) : defaultCount;
    return {
      category: cat,
      label: CATEGORY_MAP[cat]?.label || cat,
      count,
      color: CATEGORY_MAP[cat]?.color || '#3b82f6',
    };
  });

  return (
    <div className="w-full h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          margin={{ top: 15, right: 10, left: -25, bottom: 0 }}
        >
          <XAxis
            dataKey="label"
            stroke={axisStroke}
            fontSize={10}
            tickLine={false}
          />
          <YAxis
            stroke={axisStroke}
            fontSize={10}
            tickLine={false}
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.max(4, dataMax)]}
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
          <Bar dataKey="count" name="Issues" radius={[4, 4, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="count" position="top" fill={axisStroke} fontSize={10} />
            {formattedData.map((entry) => (
              <Cell key={`cell-cat-${entry.category}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
