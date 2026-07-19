'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';

export function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  label,
  sublabel,
  isTarget = false,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel?: string;
  isTarget?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.4 });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 2000, bounce: 0 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplay(Math.floor(latest).toLocaleString('en-IN'));
    });
  }, [spring]);

  return (
    <div ref={ref} className="flex flex-col items-center text-center">
      <div className="flex items-baseline gap-1">
        <span className="bg-gradient-to-br from-teal-400 via-emerald-400 to-blue-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl md:text-6xl">
          {prefix}
          {display}
          {suffix}
        </span>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-200">{label}</div>
      {sublabel && <div className="mt-1 text-xs text-slate-400">{sublabel}</div>}
      {isTarget && (
        <span className="mt-2 rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300 ring-1 ring-teal-400/20">
          Target
        </span>
      )}
    </div>
  );
}
