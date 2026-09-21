'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { DashboardLayout } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  Heart,
  Wallet,
  Activity,
  Users,
  Bell,
  Search,
  Plus,
  ChevronRight,
} from 'lucide-react';

import {
  fetchBplPatients,
  fetchDonations,
  fetchBplStatistics,
  searchBplPatients,
  createDonation,
  createBplPatient,
  BPL_PATIENT_PLACEHOLDER,
  type BplPatient,
  type BplDonation,
} from '@/lib/bpl-api';
import { generateDonationReceipt } from '@/lib/bpl-receipt-generator';

import { PatientMiniCard } from '@/components/bpl-donations/patient-mini-card';
import { PatientListCard } from '@/components/bpl-donations/patient-list-card';
import { PatientProfileModal } from '@/components/bpl-donations/patient-profile-modal';
import { CheckoutModal } from '@/components/bpl-donations/checkout-modal';
import { SuccessModal } from '@/components/bpl-donations/success-modal';
import { RegisterPatientModal } from '@/components/bpl-donations/register-patient-modal';

type ViewMode = 'dashboard' | 'patients' | 'donations' | 'campaigns' | 'notifications';

export default function BplDonationsPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

  const [patients, setPatients] = useState<BplPatient[]>([]);
  const [donations, setDonations] = useState<BplDonation[]>([]);
  const [stats, setStats] = useState({
    totalRaised: 0,
    totalDonations: 0,
    uniqueDonors: 0,
    activeCampaigns: 0,
    totalPatients: 0,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<BplPatient[]>([]);

  const [selectedPatient, setSelectedPatient] = useState<BplPatient | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [currentDonation, setCurrentDonation] = useState<(BplDonation & { patientName?: string }) | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [patientsData, donationsData, statsData] = await Promise.all([
          fetchBplPatients(),
          user ? fetchDonations(user.id) : fetchDonations(),
          fetchBplStatistics(user?.id),
        ]);

        setPatients(patientsData);
        setDonations(donationsData);
        setStats(statsData);
        setFilteredPatients(patientsData);
      } catch (error) {
        console.error('Failed to load data:', error);
        setError('Unable to load the BPL donation platform. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Search
  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.trim()) {
      try {
        const results = await searchBplPatients(term);
        setFilteredPatients(results);
      } catch (error) {
        console.error('Search failed:', error);
        setFilteredPatients(patients);
      }
    } else {
      setFilteredPatients(patients);
    }
  };

  // Donation flow
  const handleDonateClick = (patient: BplPatient) => {
    setError(null);
    setSelectedPatient(patient);
    setSelectedAmount(null);
    setShowCheckout(false);
    setShowSuccess(false);
  };

  const handleDonate = (patient: BplPatient, amount: number) => {
    setError(null);
    setSelectedPatient(patient);
    setSelectedAmount(amount);
    setShowCheckout(true);
  };

  const handleCheckoutComplete = async (data: {
    donorName: string;
    donorEmail: string;
    paymentMethod: string;
  }): Promise<void> => {
    if (!selectedPatient || !selectedAmount || selectedPatient.id === undefined) return;
    setError(null);

    try {
      const donationData = {
        patient_id: selectedPatient.id as number,
        donor_id: user?.id || null,
        donor_name: data.donorName,
        donor_email: data.donorEmail,
        amount: selectedAmount,
        payment_method: data.paymentMethod as 'upi' | 'card' | 'netbanking',
        status: 'successful' as const,
      };

      const newDonation = await createDonation(donationData);
      
      setCurrentDonation({
        ...newDonation,
        patientName: selectedPatient.name,
      });

      setShowCheckout(false);
      setShowSuccess(true);

      // Refresh data
      const [updatedDonations, updatedStats] = await Promise.all([
        fetchDonations(user?.id),
        fetchBplStatistics(user?.id),
      ]);
      setDonations(updatedDonations);
      setStats(updatedStats);
    } catch (error) {
      console.error('Donation failed:', error);
      setError(error instanceof Error ? error.message : 'Donation could not be completed. Please try again.');
    }
  };

  const handleRegisterPatient = async (formData: Record<string, string>, imageFile: File | null): Promise<void> => {
    if (!user) {
      setError('Please sign in before registering a patient.');
      return;
    }
    setError(null);
    try {
      let imageUrl = BPL_PATIENT_PLACEHOLDER;

      if (imageFile) {
        const filePath = `${user.id}/${Date.now()}-${imageFile.name.replace(/\s/g, '-')}`;
        const { error: uploadError } = await supabase.storage
          .from('bpl-patients')
          .upload(filePath, imageFile);

        if (uploadError) {
          throw new Error(`Patient photo upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('bpl-patients')
          .getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const patientData = {
        name: formData.name,
        age: Number(formData.age),
        gender: formData.gender,
        cancer_type: formData.cancer_type,
        stage: formData.stage,
        location: formData.location,
        treatment: formData.treatment,
        goal_amount: Number(formData.goal_amount),
        raised_amount: Number(formData.raised_amount) || 0,
        summary: formData.summary,
        verified: false,
        urgent: false,
        image_url: imageUrl,
        donors_count: 0,
        created_by: user!.id,
      };

      await createBplPatient(patientData);
      setShowRegister(false);

      // Refresh patients
      const updatedPatients = await fetchBplPatients();
      setPatients(updatedPatients);
      setFilteredPatients(updatedPatients);
    } catch (error) {
      console.error('Patient registration failed:', error);
      setError(error instanceof Error ? error.message : 'Patient registration failed. Please try again.');
    }
  };

  const handleDownloadReceipt = (donation: BplDonation & { patientName?: string }) => {
    generateDonationReceipt(donation);
  };

  const closeDonation = () => {
    setSelectedPatient(null);
    setSelectedAmount(null);
    setShowCheckout(false);
    setShowSuccess(false);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mx-auto" />
            <p className="mt-2 text-slate-600">Loading...</p>
          </div>
        </div>
      );
    }

    switch (viewMode) {
      case 'dashboard':
        return (
          <DashboardView
            stats={stats}
            patients={filteredPatients.slice(0, 3)}
            donations={donations.slice(0, 3)}
            onDonate={handleDonateClick}
            onRegister={() => setShowRegister(true)}
            onSearch={handleSearch}
            searchTerm={searchTerm}
          />
        );
      case 'patients':
        return (
          <PatientsView
            patients={filteredPatients}
            onDonate={handleDonateClick}
            onRegister={() => setShowRegister(true)}
            onSearch={handleSearch}
            searchTerm={searchTerm}
          />
        );
      case 'donations':
        return (
          <DonationsView
            donations={donations}
            onDownloadReceipt={handleDownloadReceipt}
          />
        );
      case 'campaigns':
        return (
          <CampaignsView
            patients={filteredPatients}
            onDonate={handleDonateClick}
            onSearch={handleSearch}
            searchTerm={searchTerm}
          />
        );
      case 'notifications':
        return (
          <NotificationsView donations={donations.length} />
        );
      default:
        return null;
    }
  };

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor', 'admin', 'super_admin']}>
      <DashboardLayout dashboardTitle="BPL Donations">
        {error && (
          <div className="mx-6 mt-6 flex items-center justify-between rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="font-semibold">Dismiss</button>
          </div>
        )}
        {renderContent()}

      {selectedPatient && !showCheckout && !showSuccess && (
        <PatientProfileModal
          patient={selectedPatient}
          onClose={closeDonation}
          onDonate={handleDonate}
        />
      )}

      {showCheckout && selectedPatient && selectedAmount && (
        <CheckoutModal
          patient={selectedPatient}
          amount={selectedAmount}
          onComplete={handleCheckoutComplete}
          onClose={() => setShowCheckout(false)}
          error={error}
        />
      )}

      {showSuccess && currentDonation && (
        <SuccessModal
          donation={currentDonation}
          onClose={closeDonation}
          onDownloadReceipt={handleDownloadReceipt}
          onViewHistory={() => {
            closeDonation();
            setViewMode('donations');
          }}
        />
      )}

      {showRegister && (
        <RegisterPatientModal
          onSubmit={handleRegisterPatient}
          onClose={() => setShowRegister(false)}
          error={error}
        />
      )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// ========================================================================
// DASHBOARD VIEW
// ========================================================================

function DashboardView({
  stats,
  patients,
  donations,
  onDonate,
  onRegister,
  onSearch,
  searchTerm,
}: {
  stats: any;
  patients: BplPatient[];
  donations: BplDonation[];
  onDonate: (patient: BplPatient) => void;
  onRegister: () => void;
  onSearch: (term: string) => void;
  searchTerm: string;
}) {
  return (
    <main className="space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">BPL Donation Platform</h1>
          <p className="mt-1 text-slate-600">
            Direct donations to verified cancer patients with transparent treatment goals.
          </p>
        </div>
        <button
          onClick={onRegister}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700"
        >
          <Plus size={18} />
          Register Patient
        </button>
      </div>

      {/* Hero */}
      <div className="rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 p-8 text-white">
        <div className="flex items-start gap-4">
          <Heart size={32} fill="currentColor" />
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Help a cancer patient today</h2>
            <p className="mt-2 text-teal-100">
              Support verified BPL patients with treatment, medicines, and essential care.
            </p>
            <button
              onClick={() => patients.length > 0 && onDonate(patients[0])}
              className="mt-4 flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-teal-600 hover:bg-teal-50"
            >
              Donate Now
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100">
              <Wallet className="text-teal-600" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Total Donations</p>
              <p className="text-2xl font-bold text-slate-900">
                ₹{stats.totalRaised.toLocaleString('en-IN')}
              </p>
              <small className="text-xs text-slate-500">Raised for BPL patients</small>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100">
              <Heart className="text-teal-600" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Patients Supported</p>
              <p className="text-2xl font-bold text-slate-900">{stats.uniqueDonors}</p>
              <small className="text-xs text-slate-500">Patients received assistance</small>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100">
              <Activity className="text-teal-600" size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Active Campaigns</p>
              <p className="text-2xl font-bold text-slate-900">{stats.activeCampaigns}</p>
              <small className="text-xs text-slate-500">Currently accepting donations</small>
            </div>
          </div>
        </div>
      </div>

      {/* Patients Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Patients Needing Support</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientMiniCard
              key={patient.id}
              patient={patient}
              onDonate={onDonate}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

// ========================================================================
// PATIENTS VIEW
// ========================================================================

function PatientsView({
  patients,
  onDonate,
  onRegister,
  onSearch,
  searchTerm,
}: {
  patients: BplPatient[];
  onDonate: (patient: BplPatient) => void;
  onRegister: () => void;
  onSearch: (term: string) => void;
  searchTerm: string;
}) {
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Patients</h1>
          <p className="mt-1 text-slate-600">
            View verified patient profiles and treatment campaigns.
          </p>
        </div>
        <button
          onClick={onRegister}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700"
        >
          <Plus size={18} />
          Register Patient
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search patients, cancers, locations..."
          value={searchTerm}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 border-0 outline-none"
        />
      </div>

      {/* Patient List */}
      <div className="space-y-3">
        {patients.length > 0 ? (
          patients.map((patient) => (
            <PatientListCard
              key={patient.id}
              patient={patient}
              onDonate={onDonate}
            />
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
            <Users size={48} className="mx-auto text-slate-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No patients found</h3>
            <p className="mt-1 text-slate-600">Try adjusting your search terms</p>
          </div>
        )}
      </div>
    </main>
  );
}

// ========================================================================
// DONATIONS VIEW
// ========================================================================

function DonationsView({
  donations,
  onDownloadReceipt,
}: {
  donations: BplDonation[];
  onDownloadReceipt: (donation: BplDonation & { patientName?: string }) => void;
}) {
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Donation History</h1>
        <p className="mt-1 text-slate-600">
          View all donations made through the BPL platform.
        </p>
      </div>

      {donations.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Wallet size={48} className="mx-auto text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No donations yet</h3>
          <p className="mt-1 text-slate-600">
            Completed donations will appear here with their receipts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  Receipt ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {donations.map((donation) => (
                <tr
                  key={donation.id}
                  className="border-b border-slate-200 hover:bg-slate-50"
                >
                  <td className="px-6 py-4 font-mono text-sm text-slate-900">
                    {String(donation.id).slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    ₹{Number(donation.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(donation.created_at as string).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      ✓ Successful
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onDownloadReceipt(donation)}
                      className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// ========================================================================
// CAMPAIGNS VIEW
// ========================================================================

function CampaignsView({
  patients,
  onDonate,
  onSearch,
  searchTerm,
}: {
  patients: BplPatient[];
  onDonate: (patient: BplPatient) => void;
  onSearch: (term: string) => void;
  searchTerm: string;
}) {
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Campaigns</h1>
        <p className="mt-1 text-slate-600">
          Active treatment funding campaigns.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search campaigns..."
          value={searchTerm}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 border-0 outline-none"
        />
      </div>

      {/* Campaign Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {patients.map((patient) => {
          const remaining = Number(patient.goal_amount) - Number(patient.raised_amount);
          return (
            <div
              key={patient.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="relative overflow-hidden bg-slate-100">
                <img
                  src={patient.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80'}
                  alt={patient.name}
                  className="h-48 w-full object-cover"
                />
                {patient.urgent && (
                  <span className="absolute top-4 right-4 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                    URGENT
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{patient.name}</h3>
                  {patient.verified && (
                    <Heart size={14} className="text-teal-600" fill="currentColor" />
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {patient.cancer_type} • {patient.location}
                </p>
                <div className="mt-4 space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-teal-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(patient.raised_amount) / Number(patient.goal_amount)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <strong className="text-slate-900">
                      ₹{remaining.toLocaleString('en-IN')}
                    </strong>
                    <span className="text-slate-500">still needed</span>
                  </div>
                </div>
                <button
                  onClick={() => onDonate(patient)}
                  className="mt-4 w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  Donate
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

// ========================================================================
// NOTIFICATIONS VIEW
// ========================================================================

function NotificationsView({ donations }: { donations: number }) {
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-slate-600">
          Recent platform and campaign notifications.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 flex-shrink-0">
            <Heart size={20} className="text-teal-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Verified campaign</p>
            <p className="text-sm text-slate-600">
              New patient campaign verification completed.
            </p>
          </div>
        </div>

        {donations > 0 && (
          <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 flex-shrink-0">
              <Wallet size={20} className="text-teal-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Donation recorded</p>
              <p className="text-sm text-slate-600">
                {donations} donation{donations !== 1 ? 's' : ''} recorded on the platform.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
