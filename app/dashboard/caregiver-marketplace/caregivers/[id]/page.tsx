import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { getMarketplaceCaregiverById } from '@/lib/caregiver-marketplace';

export const dynamic = 'force-dynamic';

export default async function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getMarketplaceCaregiverById(id);

  if (!result.success || !result.caregiver) {
    notFound();
  }

  const caregiver = result.caregiver;

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <main className="mx-auto max-w-5xl pb-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold tracking-wide text-teal-600">ONCOCARE+</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Caregiver Profile</h1>
            </div>
            <Link href="/dashboard/caregiver-marketplace" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Back to Marketplace
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-teal-50 text-3xl font-bold text-teal-700">
                  {(caregiver.professional_title || 'C').charAt(0).toUpperCase()}
                </div>

                <div className="flex-1">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900">{caregiver.professional_title}</h2>
                      <p className="mt-2 text-slate-500">{caregiver.years_of_experience} years of experience</p>
                    </div>
                    <div className="inline-flex h-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                      <span>✓</span>
                      Verified Caregiver
                    </div>
                  </div>

                  {caregiver.service_area && <p className="mt-4 text-sm text-slate-600">📍 {caregiver.service_area}</p>}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4 border-y border-slate-100 py-6">
                <div>
                  <p className="text-sm text-slate-400">Rating</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">★ {caregiver.rating.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Reviews</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{caregiver.review_count}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Experience</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{caregiver.years_of_experience} years</p>
                </div>
              </div>

              {caregiver.about && (
                <section className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900">About</h3>
                  <p className="mt-3 leading-7 text-slate-600">{caregiver.about}</p>
                </section>
              )}

              {caregiver.languages.length > 0 && (
                <section className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900">Languages</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {caregiver.languages.map((language) => (
                      <span key={language} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">{language}</span>
                    ))}
                  </div>
                </section>
              )}

              {caregiver.specializations.length > 0 && (
                <section className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900">Specializations</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {caregiver.specializations.map((specialization) => (
                      <span key={specialization} className="rounded-full bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700">{specialization}</span>
                    ))}
                  </div>
                </section>
              )}

              {caregiver.services.length > 0 && (
                <section className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900">Services</h3>
                  <div className="mt-4 space-y-3">
                    {caregiver.services.map((service) => (
                      <div key={service.id} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-semibold text-slate-900">{service.service_name}</p>
                          {service.description && <p className="mt-1 text-sm leading-6 text-slate-500">{service.description}</p>}
                        </div>
                        {service.price !== null && (
                          <p className="shrink-0 font-bold text-slate-900">₹{service.price}/{service.pricing_unit}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {caregiver.availability.length > 0 && (
                <section className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900">Availability</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {caregiver.availability.map((slot) => (
                      <span key={slot.id} className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][slot.day_of_week]} {slot.start_time}–{slot.end_time}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={`/dashboard/caregiver-marketplace/caregivers/${caregiver.id}/book`} className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700">
                  Book this caregiver
                </Link>
                <Link href="/dashboard/caregiver-marketplace" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Explore more caregivers
                </Link>
              </div>
            </div>
          </div>
        </main>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
