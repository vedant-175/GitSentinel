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
import { SeverityStat } from '@/lib/analytics';
import { ShieldAlert } from 'lucide-react';

interface Props {
  data: SeverityStat[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f43f5e',   // rose-500
  warning: '#f59e0b',    // amber-500
  suggestion: '#3b82f6', // blue-500
};

export function SeverityChart({ data }: Props) {
  if (!data || data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-slate-900/30">
        <ShieldAlert className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium text-slate-300">No Issues Recorded</p>
        <p className="text-xs text-slate-500 mt-1">
          Zero issues flagged by automated LLM inspection or static analysis.
        </p>
      </div>
    );
  }

  const formattedData = data.map((d) => ({
    ...d,
    label: d.severity.charAt(0).toUpperCase() + d.severity.slice(1),
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            width={85}
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
          <Bar dataKey="count" name="Count" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {formattedData.map((entry) => (
              <Cell
                key={`cell-${entry.severity}`}
                fill={SEVERITY_COLORS[entry.severity] || '#6366f1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
