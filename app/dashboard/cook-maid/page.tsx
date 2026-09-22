'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, MapPin, ShieldCheck, Search, Star, CalendarRange, IndianRupee, Clock3, UserRound, MessageSquareText, CheckCircle2, Bell, ChevronRight, X, Sparkles } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

type HelperType = 'Cook' | 'Maid' | 'Cook + Maid';

type HelperProfile = {
  id: string;
  name: string;
  service: HelperType;
  location: string;
  experience: string;
  rating: number;
  reviews: number;
  price_per_day: number;
  avatar: string;
  verified: boolean;
  skills: string[];
  languages: string[];
  about: string;
};

type BookingStatus = 'confirmed' | 'cancelled';

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
};

const helperCatalog: HelperProfile[] = [
  {
    id: 'helper-sunita',
    name: 'Sunita Devi',
    service: 'Cook',
    location: 'Gurugram',
    experience: '8 years',
    rating: 4.9,
    reviews: 86,
    price_per_day: 850,
    avatar: 'SD',
    verified: true,
    skills: ['Cancer-friendly meals', 'Low sodium', 'Indian meals', 'Hygiene trained'],
    languages: ['Hindi', 'English'],
    about: 'Experienced home cook trained in preparing nutritious meals for patients undergoing cancer treatment.',
  },
  {
    id: 'helper-meena',
    name: 'Meena Sharma',
    service: 'Maid',
    location: 'Delhi',
    experience: '6 years',
    rating: 4.8,
    reviews: 61,
    price_per_day: 700,
    avatar: 'MS',
    verified: true,
    skills: ['Patient hygiene', 'House cleaning', 'Laundry', 'Infection control'],
    languages: ['Hindi', 'English'],
    about: 'Trained care assistant experienced in maintaining hygienic and comfortable home environments.',
  },
  {
    id: 'helper-kavita',
    name: 'Kavita Rao',
    service: 'Cook',
    location: 'Noida',
    experience: '10 years',
    rating: 4.9,
    reviews: 104,
    price_per_day: 950,
    avatar: 'KR',
    verified: true,
    skills: ['Soft diet', 'High protein meals', 'Cancer nutrition', 'Food safety'],
    languages: ['Hindi', 'English'],
    about: 'Specialist cook with experience preparing soft, nutritious and treatment-friendly meals.',
  },
  {
    id: 'helper-renu',
    name: 'Renu Kumari',
    service: 'Maid',
    location: 'Gurugram',
    experience: '7 years',
    rating: 4.7,
    reviews: 52,
    price_per_day: 750,
    avatar: 'RK',
    verified: true,
    skills: ['Senior care', 'Patient hygiene', 'Cleaning', 'Medication reminders'],
    languages: ['Hindi'],
    about: 'Compassionate home-care helper trained in hygiene and patient assistance.',
  },
  {
    id: 'helper-pooja',
    name: 'Pooja Verma',
    service: 'Cook',
    location: 'Delhi',
    experience: '5 years',
    rating: 4.8,
    reviews: 43,
    price_per_day: 800,
    avatar: 'PV',
    verified: true,
    skills: ['Healthy meals', 'Low spice meals', 'Dietary preferences', 'Kitchen hygiene'],
    languages: ['Hindi', 'English'],
    about: 'Home cook focused on healthy, hygienic and patient-friendly food preparation.',
  },
  {
    id: 'helper-asha',
    name: 'Asha Singh',
    service: 'Maid',
    location: 'Noida',
    experience: '9 years',
    rating: 4.9,
    reviews: 78,
    price_per_day: 780,
    avatar: 'AS',
    verified: true,
    skills: ['Infection control', 'Patient support', 'Cleaning', 'Laundry'],
    languages: ['Hindi', 'English'],
    about: 'Experienced home-care professional with strong hygiene and patient-support training.',
  },
];

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

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  const aStart = new Date(`${startA}T00:00:00`).getTime();
  const aEnd = new Date(`${endA}T00:00:00`).getTime();
  const bStart = new Date(`${startB}T00:00:00`).getTime();
  const bEnd = new Date(`${endB}T00:00:00`).getTime();
  return aStart <= bEnd && bStart <= aEnd;
}

function BookingPageContent() {
  const { user } = useAuth();
  const [helpers, setHelpers] = useState<HelperProfile[]>(helperCatalog);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [service, setService] = useState<'All' | HelperType>('All');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [duration, setDuration] = useState('7');
  const [startDate, setStartDate] = useState(todayString());
  const [selectedHelper, setSelectedHelper] = useState<HelperProfile | null>(null);
  const [showDetails, setShowDetails] = useState<HelperProfile | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [successBooking, setSuccessBooking] = useState<Booking | null>(null);
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
        const { data: helperRows, error: helperError } = await supabase.from('cook_maid_helpers').select('*').order('name');
        if (!helperError && helperRows && helperRows.length > 0) {
          setHelpers(helperRows.map((row: any) => ({
            id: row.id,
            name: row.name,
            service: row.service,
            location: row.location,
            experience: row.experience,
            rating: Number(row.rating || 4.8),
            reviews: Number(row.reviews || 0),
            price_per_day: Number(row.price_per_day || 700),
            avatar: row.avatar || row.name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
            verified: Boolean(row.verified),
            skills: Array.isArray(row.skills) ? row.skills : [],
            languages: Array.isArray(row.languages) ? row.languages : [],
            about: row.about || 'Experienced home support professional.',
          })));
        } else if (helperError && helperError.message.includes('does not exist')) {
          setHelpers(helperCatalog);
        } else if ((!helperError && helperRows && helperRows.length === 0)) {
          const seedRows = helperCatalog.map((helper) => ({
            id: helper.id,
            name: helper.name,
            service: helper.service,
            location: helper.location,
            experience: helper.experience,
            rating: helper.rating,
            reviews: helper.reviews,
            price_per_day: helper.price_per_day,
            avatar: helper.avatar,
            verified: helper.verified,
            skills: helper.skills,
            languages: helper.languages,
            about: helper.about,
          }));
          const { error: insertError } = await supabase.from('cook_maid_helpers').insert(seedRows);
          if (!insertError) {
            setHelpers(helperCatalog);
          }
        }
      } catch {
        setHelpers(helperCatalog);
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

  const totalForSelected = selectedHelper ? selectedHelper.price_per_day * Number(duration || 1) : 0;

  const openBooking = (helper: HelperProfile) => {
    setSelectedHelper(helper);
    setBookingError(null);
    setShowBookingModal(true);
  };

  const createBooking = async () => {
    if (!user || !selectedHelper) return;

    if (!patientName.trim()) {
      setBookingError('Please enter the patient name.');
      return;
    }

    if (!startDate) {
      setBookingError('Please select a valid start date.');
      return;
    }

    const durationDays = Number(duration || 1);
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      setBookingError('Please choose a valid date.');
      return;
    }
    if (start < new Date(new Date().setHours(0, 0, 0, 0))) {
      setBookingError('Start date cannot be in the past.');
      return;
    }

    if (durationDays < 1 || durationDays > 90) {
      setBookingError('Duration must be between 1 and 90 days.');
      return;
    }

    const endDate = addDays(startDate, durationDays);
    const conflict = bookings.some((booking) => {
      if (booking.helper_id !== selectedHelper.id || booking.status !== 'confirmed') return false;
      return overlaps(startDate, endDate, booking.start_date, booking.end_date);
    });

    if (conflict) {
      setBookingError('This helper already has a confirmed booking that overlaps the chosen dates.');
      return;
    }

    const bookingId = `OC-${Math.floor(100000 + Math.random() * 900000)}`;
    const payload: Booking = {
      id: bookingId,
      helper_id: selectedHelper.id,
      helper_name: selectedHelper.name,
      service: selectedHelper.service,
      location: selectedHelper.location,
      patient_name: patientName.trim(),
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
      price_per_day: selectedHelper.price_per_day,
      total_amount: selectedHelper.price_per_day * durationDays,
      notes: careNotes.trim(),
      status: 'confirmed',
      created_at: new Date().toISOString(),
      user_id: user.id,
    };

    const { error: insertBookingError } = await supabase.from('cook_maid_bookings').insert(payload);

    if (insertBookingError) {
      setBookingError(insertBookingError.message || 'Could not create the booking.');
      return;
    }

    const { error: notifyError } = await supabase.from('notifications').insert({
      user_id: user.id,
      title: 'Booking confirmed',
      message: `${selectedHelper.name} has been booked for ${durationDays} day(s). Booking ID: ${bookingId}`,
      type: 'general',
      is_read: false,
    });

    if (!notifyError) {
      const { data: notifications } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
      if (notifications) {
        // no-op to ensure the table updates cleanly for the current user
      }
    }

    const updatedBookings = [payload, ...bookings];
    setBookings(updatedBookings);
    setSuccessBooking(payload);
    setBookingError(null);
    setCareNotes('');
    setShowBookingModal(false);
    setSelectedHelper(null);
  };

  const cancelBooking = async (bookingId: string) => {
    if (!user) return;
    const target = bookings.find((booking) => booking.id === bookingId);
    if (!target) return;

    const confirmed = window.confirm(`Cancel booking ${bookingId}?`);
    if (!confirmed) return;

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
            <ChefHat className="h-4 w-4" /> Care Support
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Cook & Maid</h1>
          <p className="mt-1 text-sm text-slate-600">Verified household support for home-based care, dietary assistance, and daily routines.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">
          <ShieldCheck className="h-4 w-4" /> Verified profiles only
        </div>
      </div>

      {successBooking && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">Booking confirmed successfully.</p>
              <p className="text-sm">Booking ID: {successBooking.id} · {successBooking.helper_name} · {successBooking.duration_days} days</p>
            </div>
          </div>
          <button onClick={() => setSuccessBooking(null)} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100">
            <X className="h-4 w-4" />
          </button>
        </div>
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
              {option === 'All' ? 'All Helpers' : option}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Location</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <select value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white">
                <option value="">Select a location</option>
                <option value="Delhi">Delhi</option>
                <option value="Noida">Noida</option>
                <option value="Gurugram">Gurugram</option>
              </select>
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Start date</span>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input type="date" min={todayString()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Duration</span>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white">
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Available helpers</h2>
            <p className="text-sm text-slate-600">{filteredHelpers.length} verified helpers available</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified profiles
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">Loading helper profiles…</div>
        ) : filteredHelpers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">No helpers found</h3>
            <p className="mt-2 text-sm text-slate-600">Try another service, location, or search keyword.</p>
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
                        {helper.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"><ShieldCheck className="h-3 w-3" /> Verified</span>}
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
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Starting from</p>
                    <div className="mt-1 flex items-baseline gap-1 text-2xl font-bold text-slate-900">
                      <IndianRupee className="h-5 w-5" />
                      {helper.price_per_day.toLocaleString('en-IN')}
                      <span className="text-sm font-medium text-slate-500">/day</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">₹{(helper.price_per_day * Number(duration || 1)).toLocaleString('en-IN')} for {duration} days</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{helper.reviews} reviews</p>
                    <p>{helper.experience}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={() => setShowDetails(helper)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">View profile</button>
                  <button onClick={() => openBooking(helper)} className="flex-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20 transition hover:opacity-95">Book now</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">My bookings</h2>
            <p className="text-sm text-slate-600">Your current and previous home-care bookings</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            <Bell className="h-3.5 w-3.5" /> {unreadNotifications} active
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <ChefHat className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">No bookings yet</h3>
            <p className="mt-2 text-sm text-slate-600">Choose a verified helper above and book your support.</p>
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
                    <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                    <p className="font-semibold text-slate-900">{booking.duration_days} days</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                    <p className="font-semibold text-slate-900">₹{booking.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}</span>
                  </div>
                </div>

                {booking.status === 'confirmed' && (
                  <button onClick={() => cancelBooking(booking.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Cancel</button>
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Expand coverage</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">We are expanding across more cities.</h3>
            <p className="mt-2 text-sm text-slate-600">OncoCare+ currently supports Cook & Maid services in Delhi, Noida and Gurugram, with coverage growing as more verified helpers join the network.</p>
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
                    {showDetails.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"><ShieldCheck className="h-3 w-3" /> Verified</span>}
                  </div>
                  <p className="text-sm text-slate-600">{showDetails.service} · {showDetails.location}</p>
                  <div className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-600">
                    <Star className="h-4 w-4 fill-current" /> {showDetails.rating} ({showDetails.reviews} reviews)
                  </div>
                </div>
              </div>
              <button onClick={() => setShowDetails(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Experience</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{showDetails.experience}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Languages</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{showDetails.languages.join(', ')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Daily rate</p>
                <p className="mt-2 flex items-baseline gap-1 text-lg font-semibold text-slate-900"><IndianRupee className="h-4 w-4" /> {showDetails.price_per_day.toLocaleString('en-IN')}/day</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">About</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{showDetails.about}</p>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Skills</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {showDetails.skills.map((skill) => (
                  <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{skill}</span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowDetails(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Close</button>
              <button onClick={() => { setShowDetails(null); if (showDetails) openBooking(showDetails); }} className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20">Book this helper</button>
            </div>
          </div>
        </div>
      )}

      {showBookingModal && selectedHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowBookingModal(false)}>
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">Book helper</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedHelper.name}</h2>
              </div>
              <button onClick={() => setShowBookingModal(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Patient name</span>
                  <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Service</span>
                  <input value={selectedHelper.service} readOnly className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 outline-none" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Location</span>
                  <input value={selectedHelper.location} readOnly className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 outline-none" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Start date</span>
                  <input type="date" min={todayString()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Duration</span>
                  <select value={duration} onChange={(e) => setDuration(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white">
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Total</span>
                  <div className="flex h-11 items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-700">
                    <span className="flex items-center gap-1"><IndianRupee className="h-4 w-4" /> {selectedHelper.price_per_day * Number(duration || 1)} </span>
                    <span>{Number(duration || 1)} days</span>
                  </div>
                </div>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Care and dietary instructions</span>
                <textarea value={careNotes} onChange={(e) => setCareNotes(e.target.value)} rows={4} placeholder="Optional notes for dietary restrictions, cleanliness needs, or daily care instructions..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white" />
              </label>

              {bookingError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{bookingError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowBookingModal(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                <button onClick={createBooking} className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20">Confirm booking</button>
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
