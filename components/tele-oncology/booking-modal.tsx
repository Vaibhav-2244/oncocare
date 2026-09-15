'use client';

import { useState, useEffect } from "react";
import { X, CheckCircle } from "lucide-react";
import type { Doctor } from "@/lib/data/tele-oncology";
import { doctorAvailability } from "@/lib/data/tele-oncology";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";

interface BookingModalProps {
  doctor: Doctor | null;
  onClose: () => void;
}

export function BookingModal({ doctor, onClose }: BookingModalProps) {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [reports, setReports] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    setDate("");
    setTime("");
    setPatientName("");
    setPhone("");
    setReports(null);
    setError("");
    setBooked(false);
  }, [doctor]);

  if (!doctor) return null;

  const today = new Date().toISOString().split("T")[0];
  const availableSlots = doctorAvailability[doctor.id]?.[date] || [
    "10:00 AM",
    "11:30 AM",
    "2:00 PM",
    "4:00 PM",
    "6:00 PM",
  ]; // fallback if no specific slots defined

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("You must be logged in to book an appointment.");
      return;
    }
    if (!patientName.trim()) {
      setError("Please enter the patient's name.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError("Please enter a valid mobile number.");
      return;
    }
    if (!date || !time) {
      setError("Please select both a date and a time.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Parse "10:00 AM" to combine with date
      const d = new Date(`${date} ${time}`);
      const payload = {
        user_id: user.id,
        type: "teleconsultation",
        appointment_date: d.toISOString(),
        reason: `Video Consultation with ${doctor.name} (${doctor.specialty})`,
        notes: `Patient: ${patientName.trim()}, Mobile: ${phone.trim()}${reports ? `, Reports Attached: ${reports.name}` : ''}`,
        doctor_id: null, // Setting to null to avoid UUID foreign key conflicts
        status: "scheduled",
      };

      const { error: insertError } = await supabase.from("appointments").insert(payload);
      if (insertError) throw insertError;

      setBooked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) {
    const formattedDate = new Date(`${date} ${time}`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-500">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Consultation Booked</h2>
          <p className="mt-2 text-slate-600">
            Your video consultation with <strong>{doctor.name}</strong> has been scheduled.
          </p>
          <p className="mt-4 font-semibold text-slate-900">
            {formattedDate} at {time}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Your consultation link will be available in your OncoCare appointments.
          </p>
          <Button onClick={onClose} className="mt-8 w-full bg-teal-600 hover:bg-teal-700 text-white">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Book Video Consultation</h2>
            <p className="text-sm text-slate-500">{doctor.name}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-6 rounded-xl bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Consultation Fee</p>
          <p className="mt-1 text-2xl font-bold text-teal-600">₹{doctor.consultationFee}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleBooking} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Patient Name</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Enter full name"
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Mobile Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              required
              maxLength={10}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Select Date</label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Available Time Slots</label>
            {!date ? (
              <p className="text-sm text-slate-500">Select a date to see available consultation slots.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      time === slot
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-slate-50"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Upload Report Document (Optional)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setReports(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 file:mr-4 file:rounded-full file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-teal-700 hover:file:bg-teal-100 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !date || !time || !patientName.trim() || !phone.trim()}
            className="mt-6 w-full bg-teal-600 py-6 text-base font-semibold hover:bg-teal-700 text-white disabled:opacity-50"
          >
            {submitting ? "Booking..." : "Confirm Booking"}
          </Button>
        </form>
      </div>
    </div>
  );
}
