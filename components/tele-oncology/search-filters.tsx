import { Search } from "lucide-react";
import { useTranslations } from 'next-intl';

interface SearchFiltersProps {
  search: string;
  setSearch: (val: string) => void;
  specialty: string;
  setSpecialty: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
}

export function SearchFilters({
  search,
  setSearch,
  specialty,
  setSpecialty,
  location,
  setLocation,
}: SearchFiltersProps) {
  const t = useTranslations('components.teleOncology.searchFilters');
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('searchDoctorHospitalOrSpecialty')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
        />
      </div>

      <select
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30 sm:w-48"
      >
        <option value="All">{t('allSpecialties')}</option>
        <option value="Medical Oncology">{t('medicalOncology')}</option>
        <option value="Surgical Oncology">{t('surgicalOncology')}</option>
        <option value="Hemato-Oncology">{t('hematoOncology')}</option>
      </select>

      <select
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30 sm:w-48"
      >
        <option value="All">{t('allLocations')}</option>
        <option value="Delhi">{t('delhi')}</option>
        <option value="New Delhi">{t('newDelhi')}</option>
        <option value="Gurugram">{t('gurugram')}</option>
        <option value="Delhi NCR">{t('delhiNcr')}</option>
      </select>
    </div>
  );
}
