'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="relative mx-auto h-32 w-32">
          <div className="absolute inset-0 rounded-full bg-rose-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-bold text-rose-500">500</span>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          An unexpected error occurred. Our team has been notified. Please try again or return home.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-400">
            Error ID: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-xl"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
