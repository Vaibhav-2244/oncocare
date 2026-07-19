'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Sparkles, TrendingUp, Clock, Pill, Building2, Tag } from 'lucide-react';
import { searchMedicines } from '@/lib/medicine-api';
import { popularSearches } from '@/lib/medicine-types';
import type { Medicine } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

interface SearchSuggestion {
  type: 'medicine' | 'generic' | 'manufacturer' | 'category';
  label: string;
  sublabel?: string;
  medicine?: Medicine;
}

export function MedicineSearchBar({
  onSearch,
  onSelectMedicine,
  className,
}: {
  onSearch: (query: string) => void;
  onSelectMedicine: (medicine: Medicine) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const buildSuggestions = useCallback((medicines: Medicine[], q: string): SearchSuggestion[] => {
    if (!q.trim()) return [];
    const seen = new Set<string>();
    const results: SearchSuggestion[] = [];

    for (const med of medicines) {
      const key = `medicine-${med.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type: 'medicine',
          label: med.name,
          sublabel: `${med.generic_name || ''} · ${med.strength || ''} · ${med.manufacturer || ''}`,
          medicine: med,
        });
      }
      if (med.generic_name && med.generic_name.toLowerCase().includes(q.toLowerCase())) {
        const gKey = `generic-${med.generic_name}`;
        if (!seen.has(gKey)) {
          seen.add(gKey);
          results.push({
            type: 'generic',
            label: med.generic_name,
            sublabel: `Generic · ${med.name}`,
            medicine: med,
          });
        }
      }
      if (med.manufacturer && med.manufacturer.toLowerCase().includes(q.toLowerCase())) {
        const mKey = `manufacturer-${med.manufacturer}`;
        if (!seen.has(mKey)) {
          seen.add(mKey);
          results.push({
            type: 'manufacturer',
            label: med.manufacturer,
            sublabel: 'Manufacturer',
          });
        }
      }
      if (med.category && med.category.toLowerCase().includes(q.toLowerCase())) {
        const cKey = `category-${med.category}`;
        if (!seen.has(cKey)) {
          seen.add(cKey);
          results.push({
            type: 'category',
            label: med.category,
            sublabel: 'Category',
          });
        }
      }
    }
    return results.slice(0, 8);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchMedicines(query);
        setSuggestions(buildSuggestions(results, query));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (suggestion: SearchSuggestion) => {
    if (suggestion.medicine) {
      setQuery(suggestion.medicine.name);
      setShowSuggestions(false);
      onSelectMedicine(suggestion.medicine);
    } else {
      setQuery(suggestion.label);
      setShowSuggestions(false);
      onSearch(suggestion.label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        onSearch(query);
        setShowSuggestions(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelect(suggestions[activeIndex]);
      } else {
        onSearch(query);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const suggestionIcons = {
    medicine: Pill,
    generic: Tag,
    manufacturer: Building2,
    category: Sparkles,
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Search input */}
      <div className="group relative">
        <div className="absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-r from-teal-400/20 via-emerald-400/20 to-blue-400/20 opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100" />
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-lg shadow-slate-900/5 transition-all focus-within:border-teal-300 focus-within:shadow-xl focus-within:shadow-teal-500/10">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search by Medicine Name..."
            className="flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && (
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-200 border-t-teal-500" />
          )}
          {query && !loading && (
            <button
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setActiveIndex(-1);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (query.trim()) {
                onSearch(query);
                setShowSuggestions(false);
              }
            }}
            className="shrink-0 rounded-xl bg-gradient-to-r from-emerald-deep to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-teal-500/20 transition-all hover:shadow-lg hover:shadow-teal-500/30"
          >
            Search
          </button>
        </div>
      </div>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10"
          >
            {/* Popular searches when empty */}
            {!query.trim() && (
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Popular Medicines
                </div>
                <div className="flex flex-wrap gap-2">
                  {popularSearches.map((med) => (
                    <button
                      key={med}
                      onClick={() => {
                        setQuery(med);
                        onSearch(med);
                        setShowSuggestions(false);
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-emerald-deep"
                    >
                      {med}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Autocomplete suggestions */}
            {query.trim() && suggestions.length > 0 && (
              <div className="max-h-80 overflow-y-auto py-2">
                {suggestions.map((suggestion, i) => {
                  const Icon = suggestionIcons[suggestion.type];
                  return (
                    <button
                      key={`${suggestion.type}-${suggestion.label}-${i}`}
                      onClick={() => handleSelect(suggestion)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        activeIndex === i ? 'bg-teal-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        activeIndex === i ? 'bg-teal-100 text-emerald-deep' : 'bg-slate-100 text-slate-500'
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {suggestion.label}
                        </div>
                        {suggestion.sublabel && (
                          <div className="truncate text-xs text-slate-400">
                            {suggestion.sublabel}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {suggestion.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* No results */}
            {query.trim() && !loading && suggestions.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">No medicines found</p>
                <p className="text-xs text-slate-400">Try searching by generic name or manufacturer</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
