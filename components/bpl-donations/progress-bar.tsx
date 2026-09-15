'use client';

interface ProgressBarProps {
  raised: number;
  goal: number;
}

export function ProgressBar({ raised, goal }: ProgressBarProps) {
  const percentage = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <strong className="text-slate-700">
          ₹{raised.toLocaleString('en-IN')}
        </strong>
        <span className="text-slate-500">{percentage}% of goal</span>
      </div>
    </div>
  );
}
