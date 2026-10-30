'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { supabase } from '@/lib/supabase-client';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';
import { useTranslations } from 'next-intl';

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
  is_available: boolean;
  services: Service[];
};

type CaregiverBookingStatus = {
  id: string;
  caregiver_id: string;
  requested_date: string;
  requested_start_time: string;
  requested_end_time: string;
  status: string;
  payment_status: string;
  service_name: string;
};

export default function CaregiverBookingPage() {
  const t = useTranslations('caregiverMarketplace.caregivers.id.book');
  const params = useParams();
  const router = useRouter();
  const caregiverId = params.id as string;

  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceId, setServiceId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [bookings, setBookings] = useState<CaregiverBookingStatus[]>([]);

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
          is_available,
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
        .eq('caregiver_services.is_active', true)
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
        is_available: data.is_available,
        services: data.caregiver_services ?? [],
      });
      setLoading(false);
    }

    if (caregiverId) {
      loadCaregiver();
    }
  }, [caregiverId]);

  const loadBookings = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch('/api/payments/caregiver-bookings', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load caregiver booking status.');
      setBookings((result.bookings ?? []).filter((booking: CaregiverBookingStatus) => booking.caregiver_id === caregiverId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load caregiver booking status.');
    }
  }, [caregiverId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const selectedService = useMemo(
    () => caregiver?.services.find((service) => service.id === serviceId) ?? null,
    [caregiver, serviceId],
  );

  const handlePaymentComplete = () => {
    setSuccess(true);
    void loadBookings();
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
        <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
          <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
              <p className="mt-4 text-sm font-medium text-slate-500">{t('loadingCaregiver')}</p>
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
              <h1 className="mt-5 text-2xl font-bold text-slate-900">{t('bookingRequestSent')}</h1>
              <p className="mt-3 leading-7 text-slate-600">{t('paymentConfirmedAwaitingCaregiverConfirmation')}</p>
              <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left">
                <h2 className="font-semibold text-slate-900">{t('requestDetails')}</h2>
                {caregiver && <p className="mt-3 text-sm text-slate-600">{t('caregiver')}{' '}<span className="font-semibold text-slate-900">{caregiver.professional_title}</span></p>}
                {selectedService && <p className="mt-2 text-sm text-slate-600">{t('service')}{' '}<span className="font-semibold text-slate-900">{selectedService.service_name}</span></p>}
                <p className="mt-2 text-sm text-slate-600">{t('date')}{' '}<span className="font-semibold text-slate-900">{bookingDate}</span></p>
              </div>
              <button type="button" onClick={() => router.push('/dashboard/caregiver-marketplace')} className="mt-6 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700">
                {t('returnToMarketplace')}{' '}</button>
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
              <p className="text-sm font-bold tracking-wide text-teal-600">{t('oncocare')}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('bookCaregiver')}</h1>
            </div>
            <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              {t('goBack')}{' '}</button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {caregiver && (
              <div className="mb-6 flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-xl font-bold text-teal-700">
                  {(caregiver.professional_title || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{caregiver.professional_title}</h2>
                  <p className="text-sm text-slate-500">{caregiver.years_of_experience} {t('yearsOfExperience')}</p>
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="service" className="mb-2 block text-sm font-semibold text-slate-700">{t('service2')}</label>
                <select id="service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                  <option value="">{t('selectAService')}</option>
                  {(caregiver?.services ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.service_name} — {service.price === null || service.price <= 0 ? t('priceUnavailable') : `₹${service.price}/${service.pricing_unit}`}
                    </option>
                  ))}
                </select>
              </div>
              {caregiver && !caregiver.is_available && (
                <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('caregiverNotAcceptingBookings')}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="bookingDate" className="mb-2 block text-sm font-semibold text-slate-700">{t('preferredDate')}</label>
                  <input id="bookingDate" type="date" min={new Date().toISOString().slice(0, 10)} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
                <div>
                  <label htmlFor="location" className="mb-2 block text-sm font-semibold text-slate-700">{t('location')}</label>
                  <input id="location" required maxLength={240} type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t('homeClinicCity')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="startTime" className="mb-2 block text-sm font-semibold text-slate-700">{t('startTime')}</label>
                  <input id="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
                <div>
                  <label htmlFor="endTime" className="mb-2 block text-sm font-semibold text-slate-700">{t('endTime')}</label>
                  <input id="endTime" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                </div>
              </div>

              <div>
                <label htmlFor="requirements" className="mb-2 block text-sm font-semibold text-slate-700">{t('careRequirements')}</label>
                <textarea id="requirements" rows={4} value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={t('describeThePatientSNeedsMobilitySupportMedicationRemindersOrAnySpecificCareNeeds')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </div>

              <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-slate-700">{t('additionalNotes')}</label>
                <textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('anythingElseTheCaregiverShouldKnow')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </div>

              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  {t('cancel')}{' '}</button>
                <PaymentCheckoutButton
                  payload={{
                    kind: 'caregiver',
                    caregiverId,
                    serviceId,
                    bookingDate,
                    startTime,
                    endTime,
                    location: location.trim(),
                    reason: [requirements.trim(), notes.trim()].filter(Boolean).join('\n'),
                  }}
                  description={`${caregiver?.professional_title ?? 'Caregiver'} - ${selectedService?.service_name ?? 'care service'}`}
                  disabled={!caregiver?.is_available || !selectedService || selectedService.price === null || selectedService.price <= 0 || !bookingDate || !startTime || !endTime || !location.trim()}
                  onPaymentComplete={handlePaymentComplete}
                />
              </div>
            </div>
          </div>
          {bookings.length > 0 && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t('yourCaregiverBookings')}</h2>
              <div className="mt-3 space-y-3">
                {bookings.map((booking) => (
                  <article key={booking.id} className="rounded-xl border border-slate-100 p-4 text-sm">
                    <p className="font-semibold text-slate-900">{booking.service_name}</p>
                    <p className="mt-1 text-slate-600">{booking.requested_date} · {booking.requested_start_time}–{booking.requested_end_time}</p>
                    <p className="mt-1 text-slate-600">{t('paymentStatus')} {booking.payment_status.replaceAll('_', ' ')} · {t('bookingStatus')} {booking.status.replaceAll('_', ' ')}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
