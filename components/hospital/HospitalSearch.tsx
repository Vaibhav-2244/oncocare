'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';

type SearchPatient = { id: string; identifier: string; name: string; token: number | null };
type SearchResults = { patients: SearchPatient[]; doctors: Array<{ id: string; name: string; department: string | null }>; departments: Array<{ id: string; name: string }>; appointments_today: Array<{ id: string; patient_id: string; identifier: string; patient: string; doctor: string; scheduled_at: string; status: string }> };
const EMPTY_RESULTS: SearchResults = { patients: [], doctors: [], departments: [], appointments_today: [] };

export function HospitalSearch() {
  const t = useTranslations('hospitalOps');
  const router = useRouter();
  const { org } = useHospital();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName ?? '')) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!org || !query.trim()) {
      setResults(EMPTY_RESULTS);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await callRpc<SearchResults>('search_hospital_patients', { p_hospital_id: org.id, p_query: query, p_limit: 8 });
        if (!active) return;
        setResults(result ?? EMPTY_RESULTS);
        const normalize = (value: string) => value.toUpperCase().replace(/[\s_-]/g, '');
        const exact = result?.patients?.find((patient) => normalize(patient.identifier) === normalize(query));
        if (exact) {
          router.push(`/dashboard/hospital/patients/${encodeURIComponent(exact.identifier)}`);
          setOpen(false);
        }
      } catch (caught) {
        if (!active) return;
        setResults(EMPTY_RESULTS);
        setError(caught instanceof Error ? caught.message : t('searchNoResults'));
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [org, query, router, t]);

  const openPatient = (identifier: string) => {
    router.push(`/dashboard/hospital/patients/${encodeURIComponent(identifier)}`);
    setOpen(false);
  };

  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" aria-label={t('searchLabel')} className="inline-flex h-10 w-full max-w-xl items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-600 shadow-sm hover:border-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><Search className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{t('searchPlaceholder')}</span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]">/</kbd></button></PopoverTrigger><PopoverContent align="start" className="w-[min(92vw,36rem)] p-0"><Command shouldFilter={false}><CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder={t('searchPlaceholder')} /><CommandList><CommandEmpty>{loading ? '…' : error ?? t('searchNoResults')}</CommandEmpty>{results.patients.length > 0 && <CommandGroup heading={t('patients')}>{results.patients.map((patient) => <CommandItem key={patient.id} value={`patient-${patient.id}`} onSelect={() => openPatient(patient.identifier)}><span className="min-w-0 flex-1 truncate">{patient.name} <span className="text-slate-500">· {patient.identifier}</span></span>{patient.token && <span className="text-xs text-slate-500">#{patient.token}</span>}</CommandItem>)}</CommandGroup>}{results.appointments_today.length > 0 && <CommandGroup heading={t('appointments')}>{results.appointments_today.map((appointment) => <CommandItem key={appointment.id} value={`appointment-${appointment.id}`} onSelect={() => openPatient(appointment.identifier)}>{appointment.patient} · {appointment.doctor}</CommandItem>)}</CommandGroup>}{results.doctors.length > 0 && <CommandGroup heading={t('doctors')}>{results.doctors.map((doctor) => <CommandItem key={doctor.id} value={`doctor-${doctor.id}`} onSelect={() => { router.push('/dashboard/hospital/doctors'); setOpen(false); }}>{doctor.name}<span className="ml-2 text-slate-500">{doctor.department}</span></CommandItem>)}</CommandGroup>}{results.departments.length > 0 && <CommandGroup heading={t('departments')}>{results.departments.map((department) => <CommandItem key={department.id} value={`department-${department.id}`} onSelect={() => { router.push('/dashboard/hospital/doctors'); setOpen(false); }}>{department.name}</CommandItem>)}</CommandGroup>}</CommandList></Command></PopoverContent></Popover>;
}
