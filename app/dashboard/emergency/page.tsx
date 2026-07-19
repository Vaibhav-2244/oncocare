'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Phone, MapPin, Droplet, AlertTriangle, HeartPulse, Ambulance,
  Shield, X, Navigation, Stethoscope, Hospital, Star, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Activity },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface CareTeamMember {
  id: string;
  user_id: string;
  member_name: string;
  role: string;
  phone: string | null;
  specialty: string | null;
}

interface EmergencyNumber {
  label: string;
  number: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { label: 'Ambulance', number: '108', description: 'Emergency medical services', icon: Ambulance, color: 'from-rose-500 to-red-600' },
  { label: 'Emergency', number: '112', description: 'All-in-one emergency number', icon: Shield, color: 'from-red-500 to-rose-600' },
  { label: "Women's Helpline", number: '190', description: 'Women in distress helpline', icon: HeartPulse, color: 'from-purple-500 to-fuchsia-600' },
  { label: 'Mental Health Helpline', number: '14567', description: 'Mental health support & counseling', icon: Brain, color: 'from-teal-500 to-emerald-600' },
];

interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  emergency_phone: string | null;
  is_24x7: boolean;
  has_emergency: boolean;
  has_icu: boolean;
  has_oncology: boolean;
  rating: number;
}

function ContactSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-slate-50" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

function EmergencyContent() {
  const { user } = useAuth();
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSosDialog, setShowSosDialog] = useState(false);
  const [sosActivated, setSosActivated] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationShared, setLocationShared] = useState(false);
  const [medicationsCount, setMedicationsCount] = useState(0);
  const [treatmentsCount, setTreatmentsCount] = useState(0);

  const profile = user?.profile;

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [careTeamRes, medsRes, treatmentsRes, hospitalsRes] = await Promise.all([
        supabase.from('care_team').select('*').eq('user_id', user.id).order('member_name', { ascending: true }),
        supabase.from('medications').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('treatments').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('hospitals').select('*').order('rating', { ascending: false }).limit(6),
      ]);
      if (careTeamRes.error) throw careTeamRes.error;
      setCareTeam((careTeamRes.data || []) as CareTeamMember[]);
      setMedicationsCount(medsRes.count || 0);
      setTreatmentsCount(treatmentsRes.count || 0);
      setHospitals((hospitalsRes.data || []) as Hospital[]);
      setLoadingHospitals(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emergency data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleSosActivate = () => {
    setSosActivated(true);
    setShowSosDialog(false);
    setTimeout(() => setSosActivated(false), 5000);
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        if (navigator.share) {
          navigator.share({
            title: 'My Emergency Location',
            text: `I need help. My current location is: ${mapsUrl}`,
            url: mapsUrl,
          }).catch(() => {
            window.open(mapsUrl, '_blank');
          });
        } else {
          window.open(mapsUrl, '_blank');
        }
        setLocationShared(true);
        setSharingLocation(false);
        setTimeout(() => setLocationShared(false), 3000);
      },
      () => {
        setError('Failed to get your location. Please check your browser permissions.');
        setSharingLocation(false);
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Emergency SOS</h1>
        <p className="mt-1 text-sm text-slate-500">Quick access to emergency services and your medical information</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* SOS Button */}
      <div className="flex flex-col items-center rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50 to-red-50 p-8 text-center shadow-sm">
        <motion.button
          onClick={() => setShowSosDialog(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-xl shadow-rose-500/30 transition-all hover:shadow-2xl hover:shadow-rose-500/40"
        >
          <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full bg-rose-500"
          />
          <div className="relative z-10 flex flex-col items-center">
            <Siren className="h-10 w-10" />
            <span className="mt-1 text-lg font-bold tracking-wider">SOS</span>
          </div>
        </motion.button>
        <p className="mt-4 text-sm font-semibold text-rose-700">Press to trigger emergency alert</p>
        <p className="mt-1 text-xs text-rose-500">This will display your medical info for first responders</p>

        {/* SOS activated feedback */}
        <AnimatePresence>
          {sosActivated && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
            >
              <Shield className="h-4 w-4" />
              Emergency alert activated. Help is on the way.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SOS Confirmation Dialog */}
      <AnimatePresence>
        {showSosDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/50"
              onClick={() => setShowSosDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Activate Emergency SOS?</h2>
                    <p className="mt-0.5 text-sm text-slate-500">This will display your critical medical information.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSosDialog(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setShowSosDialog(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSosActivate}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md"
                >
                  <Siren className="h-4 w-4" />
                  Activate SOS
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Share Location */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm sm:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Share My Location</p>
            <p className="text-xs text-slate-500">Send your current location to emergency contacts</p>
          </div>
        </div>
        <button
          onClick={handleShareLocation}
          disabled={sharingLocation}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-60',
            locationShared
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:shadow-md',
          )}
        >
          {sharingLocation ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Locating...
            </>
          ) : locationShared ? (
            <>
              <MapPin className="h-4 w-4" />
              Location Shared
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" />
              Share Location
            </>
          )}
        </button>
      </div>

      {/* Medical Info Card */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <HeartPulse className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Medical Information</h2>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Droplet className="h-3.5 w-3.5" />
              Blood Group
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {(profile as Record<string, unknown> | null)?.blood_group as string || 'Not set'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <AlertCircle className="h-3.5 w-3.5" />
              Allergies
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {(profile as Record<string, unknown> | null)?.allergies as string || 'None recorded'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Pill className="h-3.5 w-3.5" />
              Current Medications
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">{medicationsCount}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Active Treatments
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">{treatmentsCount}</p>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Nearest Hospital */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Nearest Hospital</h3>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {profile?.address || profile?.city || 'Address not set'}
          </p>
          {profile?.city && (
            <p className="mt-1 text-xs text-slate-400">
              {profile.city}{profile?.state ? `, ${profile.state}` : ''}
            </p>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Emergency Contact</h3>
          </div>
          {profile?.emergency_contact_name ? (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-900">{profile.emergency_contact_name}</p>
              {profile.emergency_contact_phone && (
                <a
                  href={`tel:${profile.emergency_contact_phone}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {profile.emergency_contact_phone}
                </a>
              )}
              {profile.emergency_contact_relation && (
                <p className="mt-1 text-xs text-slate-400">{profile.emergency_contact_relation}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No emergency contact set. Update your profile to add one.</p>
          )}
        </div>
      </div>

      {/* Emergency Numbers */}
      <div>
        <h2 className="mb-3 text-base font-bold text-slate-900">Emergency Numbers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EMERGENCY_NUMBERS.map((num, i) => (
            <motion.div
              key={num.number}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                  num.color,
                )}
              >
                <num.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">{num.label}</p>
              <p className="text-xs text-slate-500">{num.description}</p>
              <a
                href={`tel:${num.number}`}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md"
              >
                <Phone className="h-4 w-4" />
                Call {num.number}
              </a>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Care Team Contacts */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">Care Team Contacts</h2>
          </div>
          <span className="text-xs text-slate-400">{careTeam.length} contacts</span>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            [0, 1, 2].map((i) => <ContactSkeleton key={i} />)
          ) : careTeam.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Users className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No care team contacts added yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Add care team members from the Care Team page to see their emergency contacts here.
              </p>
            </div>
          ) : (
            careTeam.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 transition-colors hover:border-slate-200"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
                  {member.member_name?.[0]?.toUpperCase() || 'D'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{member.member_name}</p>
                  <p className="text-xs text-slate-500">
                    {member.role}{member.specialty ? ` · ${member.specialty}` : ''}
                  </p>
                  {member.phone && (
                    <p className="mt-0.5 text-xs text-slate-400">{member.phone}</p>
                  )}
                </div>
                {member.phone && (
                  <a
                    href={`tel:${member.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Nearby Hospitals */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hospital className="h-4 w-4 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">Nearby Oncology Hospitals</h2>
          </div>
          <span className="text-xs text-slate-400">{hospitals.length} hospitals</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {loadingHospitals ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-100 p-4">
                <div className="mb-2 h-4 w-2/3 rounded bg-slate-100" />
                <div className="mb-1 h-3 w-full rounded bg-slate-50" />
                <div className="h-3 w-1/2 rounded bg-slate-50" />
              </div>
            ))
          ) : hospitals.length === 0 ? (
            <div className="col-span-full flex flex-col items-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Hospital className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No hospitals found</p>
              <p className="mt-1 text-xs text-slate-400">Hospital directory is being updated.</p>
            </div>
          ) : (
            hospitals.map((hospital) => (
              <div
                key={hospital.id}
                className="group rounded-xl border border-slate-100 p-4 transition-all hover:border-teal-200 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-900">{hospital.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{hospital.address}</p>
                    <p className="text-xs text-slate-400">{hospital.city}{hospital.state ? `, ${hospital.state}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-amber-50 px-2 py-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-bold text-amber-700">{hospital.rating}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {hospital.has_oncology && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Oncology</span>
                  )}
                  {hospital.has_emergency && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Emergency</span>
                  )}
                  {hospital.has_icu && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">ICU</span>
                  )}
                  {hospital.is_24x7 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      <Clock className="h-2.5 w-2.5" /> 24x7
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {hospital.emergency_phone && (
                    <a
                      href={`tel:${hospital.emergency_phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      ER: {hospital.emergency_phone}
                    </a>
                  )}
                  {hospital.phone && (
                    <a
                      href={`tel:${hospital.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Call
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmergencyPage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <EmergencyContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
