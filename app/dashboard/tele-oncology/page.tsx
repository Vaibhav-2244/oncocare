'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import { SearchFilters } from '@/components/tele-oncology/search-filters';
import { DoctorCard } from '@/components/tele-oncology/doctor-card';
import { DoctorProfile } from '@/components/tele-oncology/doctor-profile';
import { BookingModal } from '@/components/tele-oncology/booking-modal';
import { doctors, type Doctor } from '@/lib/data/tele-oncology';
import { Plus } from 'lucide-react';

function TeleOncologyContent() {
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [location, setLocation] = useState("All");

  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [bookingDoctor, setBookingDoctor] = useState<Doctor | null>(null);

  const filteredDoctors = doctors.filter((doctor) => {
    const searchText = search.toLowerCase().trim();
    const matchesSearch =
      doctor.name.toLowerCase().includes(searchText) ||
      doctor.specialty.toLowerCase().includes(searchText) ||
      doctor.hospital.toLowerCase().includes(searchText) ||
      doctor.location.toLowerCase().includes(searchText) ||
      doctor.expertise.some((item) => item.toLowerCase().includes(searchText));

    const matchesSpecialty = specialty === "All" || doctor.specialty === specialty;
    const matchesLocation = location === "All" || doctor.location === location;

    return matchesSearch && matchesSpecialty && matchesLocation;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tele-Oncology Consultations</h1>
          <p className="mt-1 text-sm text-slate-500">Consult verified oncologists from the comfort of your home.</p>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-700 p-8 text-white shadow-lg sm:p-12">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold backdrop-blur-md">
            +
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Expert cancer care, without the travel</h2>
          <p className="mt-4 text-lg text-teal-50">
            Connect with verified Delhi-NCR oncologists through secure video consultations.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm font-semibold text-teal-100">
            <span className="flex items-center gap-2">✓ Verified oncologists</span>
            <span className="flex items-center gap-2">✓ ₹399–₹499</span>
            <span className="flex items-center gap-2">✓ Video consultation</span>
          </div>
          <button
            onClick={() => document.getElementById("doctor-directory")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-teal-700 shadow-sm transition-all hover:bg-teal-50 hover:shadow-md"
          >
            Find an Oncologist →
          </button>
        </div>
      </section>

      <section id="doctor-directory" className="space-y-6 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Find your oncologist</h2>
            <p className="text-sm text-slate-500">Choose a specialist based on your cancer care needs.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {filteredDoctors.length} Specialists
          </span>
        </div>

        <SearchFilters
          search={search}
          setSearch={setSearch}
          specialty={specialty}
          setSpecialty={setSpecialty}
          location={location}
          setLocation={setLocation}
        />

        {filteredDoctors.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDoctors.map((doctor) => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                onView={setSelectedDoctor}
                onBook={setBookingDoctor}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white py-16 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">No oncologists found</h3>
            <p className="mt-2 text-sm text-slate-500">Try changing your search or filters.</p>
          </div>
        )}
      </section>

      <DoctorProfile
        doctor={selectedDoctor}
        onClose={() => setSelectedDoctor(null)}
        onBook={(doctor) => {
          setSelectedDoctor(null);
          setBookingDoctor(doctor);
        }}
      />

      <BookingModal
        doctor={bookingDoctor}
        onClose={() => setBookingDoctor(null)}
      />
    </div>
  );
}

export default function TeleOncologyPage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <TeleOncologyContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
