'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, Search, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="relative mx-auto h-32 w-32">
          <div className="absolute inset-0 rounded-full bg-teal-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-bold gradient-text">404</span>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-xl"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <Link
            href="/medicine-finder"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
          >
            <Search className="h-4 w-4" />
            Medicine Finder
          </Link>
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-teal-600"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to previous page
        </Link>
      </motion.div>
    </div>
  );
}
