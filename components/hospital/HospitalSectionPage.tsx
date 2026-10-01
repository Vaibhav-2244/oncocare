'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getErrorMessage } from '@/lib/errors';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { supabase } from '@/lib/supabase-client';

type HospitalSection = 'patients' | 'opd' | 'appointments' | 'doctors' | 'investigations' | 'admissions' | 'settings';

interface SectionItem {
  id: string;
  title: string;
  detail?: string;
}

const SECTION_TRANSLATIONS: Record<HospitalSection, { title: string; description: string }> = {
  patients: { title: 'hospitalPatientsTitle', description: 'hospitalPatientsDescription' },
  opd: { title: 'hospitalOpdTitle', description: 'hospitalOpdDescription' },
  appointments: { title: 'hospitalAppointmentsTitle', description: 'hospitalAppointmentsDescription' },
  doctors: { title: 'hospitalDoctorsTitle', description: 'hospitalDoctorsDescription' },
  investigations: { title: 'hospitalInvestigationsTitle', description: 'hospitalInvestigationsDescription' },
  admissions: { title: 'hospitalAdmissionsTitle', description: 'hospitalAdmissionsDescription' },
  settings: { title: 'hospitalSettingsTitle', description: 'hospitalSettingsDescription' },
};

export function HospitalSectionPage({ section }: { section: HospitalSection }) {
  const t = useTranslations('hospital');
  const { org, can, refresh: refreshWorkspace } = useHospital();
  const [items, setItems] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      if (section === 'patients') {
        const { data, error: queryError } = await supabase
          .from('hospital_patients')
          .select('id, patient_identifier, name')
          .eq('hospital_id', org.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (queryError) throw queryError;
        setItems((data ?? []).map((patient) => ({ id: patient.id, title: patient.patient_identifier, detail: patient.name })));
      } else if (section === 'doctors') {
        const [doctorResult, departmentResult] = await Promise.all([
          supabase.from('hospital_doctors').select('id, doctor_name, specialty, department_id').eq('hospital_id', org.id).order('doctor_name'),
          supabase.from('hospital_departments').select('id, name, department_type').eq('hospital_id', org.id).order('name'),
        ]);
        if (doctorResult.error) throw doctorResult.error;
        if (departmentResult.error) throw departmentResult.error;
        const departmentNames = new Map((departmentResult.data ?? []).map((department) => [department.id, department.name]));
        const doctors = (doctorResult.data ?? []).map((doctor) => ({
          id: doctor.id,
          title: doctor.doctor_name,
          detail: [doctor.specialty, doctor.department_id ? departmentNames.get(doctor.department_id) : null].filter(Boolean).join(' · '),
        }));
        const departments = (departmentResult.data ?? []).map((department) => ({
          id: department.id,
          title: department.name,
          detail: department.department_type,
        }));
        setItems([...departments, ...doctors]);
      } else {
        setItems([]);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error(`Hospital ${section} data load failed:`, err);
      setError(t('workspaceDataError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [org, section, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDemoData = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('load_demo_data', { p_hospital_id: org.id });
      if (rpcError) throw rpcError;
      await refreshWorkspace();
      await load();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital demo data load failed:', err);
      setError(t('demoDataError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeDemoData = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      const { error: rpcError } = await supabase.rpc('remove_demo_data', { p_hospital_id: org.id });
      if (rpcError) throw rpcError;
      await refreshWorkspace();
      await load();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital demo data removal failed:', err);
      setError(t('removeDemoDataError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const metadata = SECTION_TRANSLATIONS[section];
  const isPatientOrDoctorList = section === 'patients' || section === 'doctors';

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">{t(metadata.title)}</h1>
        <p className="mt-1 text-sm text-slate-600">{t(metadata.description)}</p>
      </header>

      {section === 'settings' && org && (
        <div className="space-y-5">
          <dl className="grid gap-x-6 gap-y-4 border-y border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-slate-500">{t('hospitalName')}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{org.name}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{t('timezone')}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{org.timezone}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{t('patientIdLabel')}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{org.patient_id_label}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{t('patientIdPrefix')}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{org.patient_id_prefix}</dd></div>
          </dl>
          {can('config.manage') && (
            <section className="border-t border-slate-200 pt-4">
              <h2 className="font-semibold text-slate-950">{t('demoDataSettings')}</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={loadDemoData} disabled={busy} className="rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                  {t('loadDemoData')}
                </button>
                {org.demo_data_loaded && (
                  <button type="button" onClick={removeDemoData} disabled={busy} className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60">
                    {t('removeDemoData')}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
          <p>{error}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-4 w-4" />{t('retry')}</button>
            {technicalDetails && <details><summary className="cursor-pointer font-semibold">{t('showTechnicalDetails')}</summary><pre className="mt-2 whitespace-pre-wrap">{technicalDetails}</pre></details>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-32 items-center justify-center text-sm text-slate-600" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loadingHospitalContext')}</div>
      ) : isPatientOrDoctorList && items.length > 0 ? (
        <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <span className="font-medium text-slate-900">{item.title}</span>
              {item.detail && <span className="text-sm text-slate-600">{item.detail}</span>}
            </li>
          ))}
        </ul>
      ) : isPatientOrDoctorList ? (
        <div className="border-l-2 border-slate-300 bg-slate-50 p-5">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-slate-600" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-slate-900">{section === 'patients' ? t('noPatientsYet') : t('noAssociatedDoctorsFound')}</h2>
              {can('config.manage') && (
                <button type="button" onClick={loadDemoData} disabled={busy} className="mt-3 rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                  {busy ? t('loadingHospitalContext') : t('loadDemoData')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-l-2 border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
          {t('hospitalSectionPreparing')}
        </div>
      )}
    </section>
  );
}