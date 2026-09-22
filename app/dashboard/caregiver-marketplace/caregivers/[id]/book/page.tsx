'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

type Service = {
  id: string;
  service_name: string;
  description: string | null;
  price: number | null;
  pricing_unit: string;
};

type Caregiver = {
  id: string;
  professional_title: string;
  years_of_experience: number;
  service_area: string | null;
  hourly_rate: number | null;
  services: Service[];
};

export default function CaregiverBookingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const caregiverId = params.id as string;

  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadCaregiver() {
      setLoading(true);
      setError('');

      const { data, error: loadError } = await supabase
        .from('caregiver_profiles')
        .select(`
          id,
          professional_title,
          years_of_experience,
          service_area,
          hourly_rate,
          caregiver_services (
            id,
            service_name,
            description,
            price,
            pricing_unit
          )
        `)
        .eq('id', caregiverId)
        .eq('is_active', true)
        .eq('verification_status', 'verified')
        .single();

      if (loadError) {
        setError('Unable to load caregiver information.');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Caregiver not found.');
        setLoading(false);
        return;
      }

      setCaregiver({
        id: data.id,
        professional_title: data.professional_title,
        years_of_experience: data.years_of_experience,
        service_area: data.service_area,
        hourly_rate: data.hourly_rate,
        services: data.caregiver_services ?? [],
      });
      setLoading(false);
    }

    if (caregiverId) {
      loadCaregiver();
    }
  }, [caregiverId]);

  const selectedService = useMemo(
    () => caregiver?.services.find((service) => service.id === serviceId) ?? null,
    [caregiver, serviceId],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      router.push('/auth/sign-in');
      return;
    }

    if (!serviceId) {
      setError('Please select a service.');
      return;
    }
    if (!bookingDate) {
      setError('Please select a booking date.');
      return;
    }
    if (!startTime || !endTime) {
      setError('Please select both start and end times.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be later than start time.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: insertError } = await supabase.from('booking_requests').insert({
        patient_id: user.id,
        caregiver_id: caregiverId,
        service_id: serviceId,
        requested_date: bookingDate,
        requested_start_time: startTime,
        requested_end_time: endTime,
        location: location.trim() || null,
        patient_requirements: requirements.trim() || null,
        additional_notes: notes.trim() || null,
        status: 'requested',
      });

      if (insertError) throw new Error(insertError.message);
      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit booking request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
        <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
          <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
              <p className="mt-4 text-sm font-medium text-slate-500">Loading caregiver...</p>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (success) {
    return (
      <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
        <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
          <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">Booking Request Sent</h1>
              <p className="mt-3 leading-7 text-slate-600">Your booking request has been successfully submitted to the caregiver.</p>
              <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left">
                <h2 className="font-semibold text-slate-900">Request Details</h2>
                {caregiver && <p className="mt-3 text-sm text-slate-600">Caregiver: <span className="font-semibold text-slate-900">{caregiver.professional_title}</span></p>}
                {selectedService && <p className="mt-2 text-sm text-slate-600">Service: <span className="font-semibold text-slate-900">{selectedService.service_name}</span></p>}
                <p className="mt-2 text-sm text-slate-600">Date: <span className="font-semibold text-slate-900">{bookingDate}</span></p>
              </div>
              <button type="button" onClick={() => router.push('/dashboard/caregiver-marketplace')} className="mt-6 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700">
                Return to Marketplace
              </button>
            </div>
          </main>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <main className="mx-auto max-w-4xl pb-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold tracking-wide text-teal-600">ONCOCARE+</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Book Caregiver</h1>
            </div>
            <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Go back
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {caregiver && (
              <div className="mb-6 flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-xl font-bold text-teal-700">
                  {(caregiver.professional_title || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{caregiver.professional_title}</h2>
                  <p className="text-sm text-slate-500">{caregiver.years_of_experience} years of experience</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="service" className="mb-2 block text-sm font-semibold text-slate-700">Service</label>
                <select id="service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                  <option value="">Select a service</option>
                  {(caregiver?.services ?? []).map((service) => (
                    <option key={service.id} value={service.id}>{service.service_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="bookingDate" className="mb-2 block text-sm font-semibold text-slate-700">Preferred date</label>
                  <input id="bookingDate" type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
                <div>
                  <label htmlFor="location" className="mb-2 block text-sm font-semibold text-slate-700">Location</label>
                  <input id="location" type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Home / clinic / city" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="startTime" className="mb-2 block text-sm font-semibold text-slate-700">Start time</label>
                  <input id="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
                <div>
                  <label htmlFor="endTime" className="mb-2 block text-sm font-semibold text-slate-700">End time</label>
                  <input id="endTime" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
              </div>

              <div>
                <label htmlFor="requirements" className="mb-2 block text-sm font-semibold text-slate-700">Care requirements</label>
                <textarea id="requirements" rows={4} value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Describe the patient’s needs, mobility support, medication reminders, or any specific care needs." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </div>

              <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-slate-700">Additional notes</label>
                <textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else the caregiver should know?" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </div>

              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? 'Submitting...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </main>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
