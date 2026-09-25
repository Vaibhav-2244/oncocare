import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({
  iconBoxSize = 'h-9 w-9',
  iconSize = 'h-5 w-5',
  textSize = 'text-lg',
  textClassName = 'text-slate-900',
  className,
}: {
  iconBoxSize?: string;
  iconSize?: string;
  textSize?: string;
  textClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn('relative flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-deep to-teal-400 shadow-md shadow-teal-500/30', iconBoxSize)}>
        <Activity className={cn(iconSize, 'text-white')} strokeWidth={2.5} />
        <div className="absolute inset-0 -z-10 rounded-xl bg-teal-400/30 blur-md" />
      </div>
      <span className={cn(textSize, 'font-bold tracking-tight', textClassName)}>
        OncoCare<span className="text-emerald-deep">+</span>
      </span>
    </div>
  );
}