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
} from 'recharts';
import { CategoryStat } from '@/lib/analytics';
import { Tag } from 'lucide-react';

interface Props {
  data: CategoryStat[];
}

const CATEGORY_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f97316', // orange
];

export function CategoryChart({ data }: Props) {
  if (!data || data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-slate-900/30">
        <Tag className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium text-slate-300">No Category Data</p>
        <p className="text-xs text-slate-500 mt-1">
          Issue categories will appear here once code reviews flag findings.
        </p>
      </div>
    );
  }

  const formattedData = data.map((d) => ({
    ...d,
    label: d.category.charAt(0).toUpperCase() + d.category.slice(1),
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderColor: '#334155',
              borderRadius: '0.75rem',
              fontSize: '12px',
              color: '#f8fafc',
            }}
          />
          <Bar dataKey="count" name="Issues" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {formattedData.map((_, index) => (
              <Cell
                key={`cell-cat-${index}`}
                fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
