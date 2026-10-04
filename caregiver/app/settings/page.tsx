"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  MapPin,
  Power,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

import {
  getMyCaregiverProfile,
  type CaregiverProfile,
} from "@/features/caregiver/caregiver-profile.service";

import { updateMyCaregiverAvailability } from "@/features/caregiver/caregiver-availability.service";

function formatVerificationStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<CaregiverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);

        const data = await getMyCaregiverProfile();
        setProfile(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load caregiver profile.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  async function handleAvailabilityChange(isAvailable: boolean) {
    try {
      setUpdatingAvailability(true);
      setError(null);

      const updatedProfile =
        await updateMyCaregiverAvailability(isAvailable);

      setProfile(updatedProfile);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update availability.",
      );
    } finally {
      setUpdatingAvailability(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  if (error && !profile) {
    return (
      <AppShell>
        <ErrorState title="Unable to load caregiver settings" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
        <div>
          <p className="text-sm font-medium text-[#0F766E]">
            Account
          </p>

          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            Settings
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Caregiver profile, availability, and account information.
          </p>
        </div>

        {error && profile && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {profile ? (
          <>
            <Card className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E6F7F5] text-[#0F766E]">
                    <UserRound className="h-7 w-7" />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Caregiver profile
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      {profile.professional_title ||
                        "Caregiver profile"}
                    </p>
                  </div>
                </div>

                <Badge
                  variant={
                    profile.verification_status === "verified"
                      ? "success"
                      : "warning"
                  }
                >
                  {formatVerificationStatus(
                    profile.verification_status,
                  )}
                </Badge>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-[#F5F7FA] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <BriefcaseBusiness className="h-4 w-4 text-[#0F766E]" />
                    Experience
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    {profile.years_of_experience !== null
                      ? `${profile.years_of_experience} years`
                      : "Not specified"}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F5F7FA] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <MapPin className="h-4 w-4 text-[#0F766E]" />
                    Service area
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    {profile.service_area || "Not specified"}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F5F7FA] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Star className="h-4 w-4 text-[#0F766E]" />
                    Rating
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    {profile.rating !== null
                      ? `${profile.rating.toFixed(1)} (${profile.review_count} reviews)`
                      : "No ratings yet"}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F5F7FA] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Clock3 className="h-4 w-4 text-[#0F766E]" />
                    Availability
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    {profile.is_available
                      ? "Currently available"
                      : "Currently unavailable"}
                  </p>
                </div>
              </div>

              {profile.about && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <h3 className="text-sm font-semibold text-gray-900">
                    About
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {profile.about}
                  </p>
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F7F5] text-[#0F766E]">
                    <Power className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-gray-900">
                      Availability
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      Control whether your caregiver profile is
                      currently available.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.is_available}
                  disabled={updatingAvailability}
                  onClick={() =>
                    void handleAvailabilityChange(
                      !profile.is_available,
                    )
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
                    profile.is_available
                      ? "bg-[#2EC4B6]"
                      : "bg-gray-300"
                  } ${
                    updatingAvailability
                      ? "cursor-not-allowed opacity-50"
                      : ""
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                      profile.is_available
                        ? "left-6"
                        : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div
                className={`mt-5 flex items-center gap-3 rounded-xl p-4 ${
                  profile.is_available
                    ? "bg-[#E6F7F5]"
                    : "bg-gray-50"
                }`}
              >
                <CheckCircle2
                  className={`h-5 w-5 shrink-0 ${
                    profile.is_available
                      ? "text-[#0F766E]"
                      : "text-gray-400"
                  }`}
                />

                <div>
                  <p
                    className={`text-sm font-semibold ${
                      profile.is_available
                        ? "text-[#0F766E]"
                        : "text-gray-600"
                    }`}
                  >
                    {profile.is_available
                      ? "Available"
                      : "Unavailable"}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {profile.is_available
                      ? "Your caregiver profile is currently marked as available."
                      : "Your caregiver profile is currently marked as unavailable."}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Caregiver access
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Patient access is controlled by authorized
                    caregiver relationships.
                  </p>
                </div>

                <ShieldCheck className="h-6 w-6 shrink-0 text-[#0F766E]" />
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#E6F7F5] p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#0F766E]" />

                <div>
                  <p className="text-sm font-semibold text-[#0F766E]">
                    Protected access
                  </p>

                  <p className="mt-1 text-xs text-gray-600">
                    Only patients with an active caregiver
                    relationship are accessible.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-semibold text-gray-900">
                Notifications
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Notification delivery is managed through the
                existing OncoCare+ caregiver notification system.
              </p>
            </Card>
          </>
        ) : (
          <Card className="p-6">
            <h2 className="font-semibold text-gray-900">
              Caregiver profile not available
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              No active caregiver profile is associated with the
              authenticated account.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}