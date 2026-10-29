'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, MapPin, ShieldCheck, Search, Star, CalendarRange, Bell, ChevronRight, X, Sparkles } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type HelperType = 'Cook' | 'Maid' | 'Cook + Maid';

type HelperProfile = {
  id: string;
  name: string;
  service: HelperType;
  location: string;
  experience: string;
  rating: number;
  reviews: number;
  avatar: string;
  verified: boolean;
  skills: string[];
  languages: string[];
  about: string;
};

type BookingStatus = 'payment_pending' | 'confirmed' | 'cancelled';

type BookingOffer = {
  offer_type: 'daily' | 'monthly';
  amount_in_paise: number;
  duration_days: number | null;
  included_usage: number | null;
};

type Booking = {
  id: string;
  helper_id: string;
  helper_name: string;
  service: HelperType;
  location: string;
  patient_name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  price_per_day: number;
  total_amount: number;
  notes: string;
  status: BookingStatus;
  created_at: string;
  user_id: string;
  payment_order_id?: string | null;
};

function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function formatDate(dateString: string) {
  if (!dateString) return '—';
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function BookingPageContent() {
  const t = useTranslations('cookMaid');
  const { user } = useAuth();
  const [helpers, setHelpers] = useState<HelperProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [service, setService] = useState<'All' | HelperType>('All');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(todayString());
  const [selectedHelper, setSelectedHelper] = useState<HelperProfile | null>(null);
  const [bookingOffers, setBookingOffers] = useState<BookingOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [showDetails, setShowDetails] = useState<HelperProfile | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingConfirmation, setBookingConfirmation] = useState('');
  const [patientName, setPatientName] = useState(user?.profile?.full_name || '');
  const [careNotes, setCareNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPatientName(user?.profile?.full_name || '');
  }, [user]);

  useEffect(() => {
    async function bootstrap() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: helperRows, error: helperError } = await supabase
          .from('cook_maid_helpers')
          .select('*')
          .eq('verified', true)
          .order('name');
        if (helperError) throw helperError;
        if (helperRows) {
          setHelpers(helperRows.map((row: any) => ({
            id: row.id,
            name: row.name,
            service: row.service,
            location: row.location,
            experience: row.experience,
            rating: Number(row.rating || 4.8),
            reviews: Number(row.reviews || 0),
            avatar: row.avatar || row.name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
            verified: Boolean(row.verified),
            skills: Array.isArray(row.skills) ? row.skills : [],
            languages: Array.isArray(row.languages) ? row.languages : [],
            about: row.about || 'Experienced home support professional.',
          })));
        }
      } catch {
        setHelpers([]);
      }

      try {
        const { data, error } = await supabase
          .from('cook_maid_bookings')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setBookings(data as Booking[]);
        }
      } catch {
        setBookings([]);
      }

      setLoading(false);
    }

    bootstrap();
  }, [user]);

  const filteredHelpers = useMemo(() => {
    return helpers.filter((helper) => {
      const serviceMatch = service === 'All' || helper.service === service;
      const locationMatch = !location || helper.location.toLowerCase().includes(location.toLowerCase());
      const searchTarget = `${helper.name} ${helper.location} ${helper.service} ${helper.skills.join(' ')}`.toLowerCase();
      const searchMatch = searchTarget.includes(search.trim().toLowerCase());
      return serviceMatch && locationMatch && searchMatch;
    });
  }, [helpers, location, search, service]);

  const unreadNotifications = useMemo(() => {
    return bookings.filter((booking) => booking.status === 'confirmed').length;
  }, [bookings]);

  const openBooking = async (helper: HelperProfile) => {
    setSelectedHelper(helper);
    setBookingError(null);
    setBookingOffers([]);
    setOffersLoading(true);
    setShowBookingModal(true);
    try {
      const response = await fetch(`/api/payments/offers?kind=booking&entityId=${encodeURIComponent(helper.id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load approved booking prices.');
      setBookingOffers(result.offers ?? []);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Unable to load approved booking prices.');
    } finally {
      setOffersLoading(false);
    }
  };

  const completeBooking = async () => {
    setBookingConfirmation('Payment confirmed. Your booking is now confirmed.');
    setShowBookingModal(false);
    if (!user) return;
    const { data, error } = await supabase.from('cook_maid_bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      setBookingConfirmation('Payment succeeded, but the booking list could not be refreshed. Reload this page to see the confirmed booking.');
      return;
    }
    if (data) setBookings(data as Booking[]);
  };

  const cancelBooking = async (bookingId: string) => {
    if (!user) return;
    const target = bookings.find((booking) => booking.id === bookingId);
    if (!target) return;

    const confirmed = window.confirm(`Cancel booking ${bookingId}?`);
    if (!confirmed) return;

    if (target.payment_order_id) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setBookingConfirmation('Sign in again before requesting cancellation.');
        return;
      }
      const response = await fetch('/api/payments/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: target.payment_order_id,
          reason: 'Home-care booking cancellation requested',
          idempotencyKey: target.payment_order_id,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setBookingConfirmation(result.error || 'Unable to submit the cancellation and refund request.');
        return;
      }
      setBookingConfirmation('Cancellation and refund request submitted for review. The booking remains active until the request is approved and processed.');
      return;
    }

    const { error } = await supabase
      .from('cook_maid_bookings')
      .update({ status: 'cancelled', created_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('user_id', user.id);

    if (error) return;

    setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, status: 'cancelled' } : booking));
    await supabase.from('notifications').insert({
      user_id: user.id,
      title: 'Booking cancelled',
      message: `Booking ${bookingId} has been cancelled.`,
      type: 'general',
      is_read: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-teal-700">
            <ChefHat className="h-4 w-4" /> {t('careSupport')}{' '}</div>
          <h1 className="text-3xl font-bold text-slate-900">{t('cookMaid')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('verifiedHouseholdSupportForHomeBasedCareDietaryAssistanceAndDailyRoutines')}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">
          <ShieldCheck className="h-4 w-4" /> {t('verifiedProfilesOnly')}{' '}</div>
      </div>

      {bookingConfirmation && (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {bookingConfirmation}
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { title: 'Choose service', text: 'Cook, maid or both' },
          { title: 'Select helper', text: 'Verified & trained' },
          { title: 'Confirm booking', text: 'Secure your care' },
        ].map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-sm font-bold text-white">{index + 1}</div>
            <p className="font-semibold text-slate-900">{step.title}</p>
            <p className="mt-1 text-sm text-slate-600">{step.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(['All', 'Cook', 'Maid'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setService(option)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                service === option ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              )}
            >
              {option === 'All' ? t('allHelpers') : option}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">{t('location')}</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <select value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white">
                <option value="">{t('selectALocation')}</option>
                <option value="Delhi">{t('delhi')}</option>
                <option value="Noida">{t('noida')}</option>
                <option value="Gurugram">{t('gurugram')}</option>
              </select>
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">{t('startDate')}</span>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input type="date" min={todayString()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
            </div>
          </label>

        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t('availableHelpers')}</h2>
            <p className="text-sm text-slate-600">{filteredHelpers.length} {t('verifiedHelpersAvailable')}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('verifiedProfiles')}{' '}</div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">{t('loadingHelperProfiles')}</div>
        ) : filteredHelpers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">{t('noHelpersFound')}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('tryAnotherServiceLocationOrSearchKeyword')}</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredHelpers.map((helper) => (
              <article key={helper.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 text-sm font-bold text-white">{helper.avatar}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{helper.name}</h3>
                        {helper.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"><ShieldCheck className="h-3 w-3" /> {t('verified')}</span>}
                      </div>
                      <p className="text-sm text-slate-600">{helper.service} · {helper.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    <Star className="h-3 w-3 fill-current" /> {helper.rating}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {helper.skills.slice(0, 4).map((skill) => (
                    <span key={skill} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">{skill}</span>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm text-slate-600">View configured daily or monthly prices when booking.</p>
                  <div className="text-right text-xs text-slate-500">
                    <p>{helper.reviews} {t('reviews')}</p>
                    <p>{helper.experience}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={() => setShowDetails(helper)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">{t('viewProfile')}</button>
                  <button onClick={() => openBooking(helper)} className="flex-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20 transition hover:opacity-95">{t('bookNow')}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t('myBookings')}</h2>
            <p className="text-sm text-slate-600">{t('yourCurrentAndPreviousHomeCareBookings')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            <Bell className="h-3.5 w-3.5" /> {unreadNotifications} {t('active')}{' '}</div>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <ChefHat className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">{t('noBookingsYet')}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('chooseAVerifiedHelperAboveAndBookYourSupport')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-sm font-bold text-white">{booking.helper_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{booking.helper_name}</p>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{booking.service}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{booking.id} · {booking.location} · {formatDate(booking.start_date)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('duration')}</p>
                    <p className="font-semibold text-slate-900">{booking.duration_days} {t('days')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('total')}</p>
                    <p className="font-semibold text-slate-900">₹{booking.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('status')}</p>
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : booking.status === 'payment_pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>{booking.status === 'confirmed' ? t('confirmed') : booking.status === 'payment_pending' ? 'Payment pending' : t('cancelled')}</span>
                  </div>
                </div>

                {booking.status === 'confirmed' && (
                  <button onClick={() => cancelBooking(booking.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">{t('cancel')}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">{t('expandCoverage')}</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">{t('weAreExpandingAcrossMoreCities')}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('oncocareCurrentlySupportsCookMaidServicesInDelhiNoidaAndGurugramWithCoverageGrow')}</p>
          </div>
        </div>
      </section>

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowDetails(null)}>
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 text-xl font-bold text-white">{showDetails.avatar}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-slate-900">{showDetails.name}</h2>
                    {showDetails.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"><ShieldCheck className="h-3 w-3" /> {t('verified')}</span>}
                  </div>
                  <p className="text-sm text-slate-600">{showDetails.service} · {showDetails.location}</p>
                  <div className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-600">
                    <Star className="h-4 w-4 fill-current" /> {showDetails.rating} ({showDetails.reviews} {t('reviews2')}{' '}</div>
                </div>
              </div>
              <button onClick={() => setShowDetails(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('experience')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{showDetails.experience}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('languages')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{showDetails.languages.join(', ')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('dailyRate')}</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('about')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{showDetails.about}</p>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('skills')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {showDetails.skills.map((skill) => (
                  <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{skill}</span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowDetails(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">{t('close')}</button>
              <button onClick={() => { setShowDetails(null); if (showDetails) openBooking(showDetails); }} className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20">{t('bookThisHelper')}</button>
            </div>
          </div>
        </div>
      )}

      {showBookingModal && selectedHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowBookingModal(false)}>
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">{t('bookHelper')}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedHelper.name}</h2>
              </div>
              <button onClick={() => setShowBookingModal(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('patientName')}</span>
                  <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('service')}</span>
                  <input value={selectedHelper.service} readOnly className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 outline-none" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('location')}</span>
                  <input value={selectedHelper.location} readOnly className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 outline-none" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('startDate')}</span>
                  <input type="date" min={todayString()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">{t('careAndDietaryInstructions')}</span>
                <textarea value={careNotes} onChange={(e) => setCareNotes(e.target.value)} rows={4} placeholder={t('optionalNotesForDietaryRestrictionsCleanlinessNeedsOrDailyCareInstructions')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
              </label>

              {bookingError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{bookingError}</div>}

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-800">Approved payment options</p>
                {offersLoading ? <p className="text-sm text-slate-500">Loading configured prices…</p> : null}
                {!offersLoading && bookingOffers.length === 0 && (
                  <p className="text-sm text-slate-600">This provider has no approved daily or monthly payment offer configured.</p>
                )}
                {bookingOffers.map((offer) => {
                  const days = offer.offer_type === 'daily' ? 1 : offer.duration_days;
                  if (!days) return null;
                  return (
                    <div key={offer.offer_type} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <p className="font-semibold capitalize">{offer.offer_type} service · one-time payment</p>
                        <p className="text-xs text-slate-500">{days} days · not recurring · ₹{(Number(offer.amount_in_paise) / 100).toLocaleString('en-IN')}</p>
                      </div>
                      <PaymentCheckoutButton
                        payload={{
                          kind: 'booking',
                          helperId: selectedHelper.id,
                          offerType: offer.offer_type,
                          startDate,
                          patientName: patientName.trim(),
                          location: selectedHelper.location,
                          reason: careNotes.trim(),
                        }}
                        description={`${selectedHelper.service} home-care booking`}
                        disabled={!patientName.trim() || !startDate || offersLoading}
                        onPaymentComplete={() => void completeBooking()}
                      />
                    </div>
                  );
                })}
                <div className="flex justify-end pt-2">
                  <button onClick={() => setShowBookingModal(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">{t('cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CookMaidPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <BookingPageContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
