'use client';

import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  color?: 'purple' | 'emerald' | 'blue' | 'amber' | 'rose';
}

const colorMap = {
  purple:  { bg: 'bg-purple-50', icon: 'text-purple-600' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  blue:    { bg: 'bg-blue-50', icon: 'text-blue-600' },
  amber:   { bg: 'bg-amber-50', icon: 'text-amber-600' },
  rose:    { bg: 'bg-rose-50', icon: 'text-rose-600' },
};

export function StatCard({ title, value, icon: Icon, trend, color = 'purple' }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="mt-2 text-2xl font-serif text-gray-900">{value}</p>
          {trend && (
            <p className={`mt-1 text-xs font-semibold ${trend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend.positive ? '+' : ''}{trend.value}
            </p>
          )}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}
