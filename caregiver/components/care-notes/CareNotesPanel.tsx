"use client";

import {
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import {
  createPatientCareNote,
  getPatientCareNotes,
} from "@/features/care-notes/care-note.service";

import type {
  CareNote,
  CareNoteType,
} from "@/types";

interface CareNotesPanelProps {
  patientId: string;
}

const NOTE_TYPES: {
  value: CareNoteType;
  label: string;
  description: string;
}[] = [
  {
    value: "observation",
    label: "General observation",
    description: "Something you noticed about the patient",
  },
  {
    value: "symptom",
    label: "Symptom",
    description: "A symptom or discomfort reported or observed",
  },
  {
    value: "medication",
    label: "Medication",
    description: "A medication-related observation",
  },
  {
    value: "routine",
    label: "Routine",
    description: "Daily care or routine activity",
  },
  {
    value: "care",
    label: "Care",
    description: "A care activity or support observation",
  },
  {
    value: "other",
    label: "Other",
    description: "Another relevant observation",
  },
];

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getTypeLabel(type: CareNoteType) {
  return (
    NOTE_TYPES.find((item) => item.value === type)?.label ??
    "General observation"
  );
}

export function CareNotesPanel({
  patientId,
}: CareNotesPanelProps) {
  const [notes, setNotes] = useState<CareNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] =
    useState<CareNoteType>("observation");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadNotes(isRefresh = false) {
    try {
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const data =
        await getPatientCareNotes(patientId);

      setNotes(data);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
          ? "You are not authorized to access this patient's care notes."
          : "We couldn't load the care notes. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadNotes();
  }, [patientId]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmed = noteText.trim();

    if (!trimmed) {
      setError("Please enter a care note before saving.");
      return;
    }

    if (trimmed.length > 5000) {
      setError(
        "Care notes can contain up to 5,000 characters.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const created =
        await createPatientCareNote(patientId, {
          noteText: trimmed,
          noteType,
        });

      setNotes((current) => [
        created,
        ...current,
      ]);

      setNoteText("");
      setNoteType("observation");

      setSuccess("Care note added successfully.");

      window.setTimeout(() => {
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
          ? "You are no longer authorized to add a note for this patient."
          : "The care note could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState lines={5} />;
  }

  return (
    <div className="space-y-6">
      {/* Add note */}
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
              <MessageSquarePlus size={19} />
            </div>

            <div>
              <h2 className="font-semibold text-gray-900">
                Add care note
              </h2>

              <p className="mt-1 text-sm leading-5 text-gray-500">
                Record an observation about the patient's
                day-to-day care.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 p-5 sm:p-6"
        >
          <div>
            <label
              htmlFor="care-note-type"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Category
            </label>

            <select
              id="care-note-type"
              value={noteType}
              onChange={(event) =>
                setNoteType(
                  event.target.value as CareNoteType,
                )
              }
              disabled={saving}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
            >
              {NOTE_TYPES.map((type) => (
                <option
                  key={type.value}
                  value={type.value}
                >
                  {type.label}
                </option>
              ))}
            </select>

            <p className="mt-1.5 text-xs text-gray-500">
              {
                NOTE_TYPES.find(
                  (type) => type.value === noteType,
                )?.description
              }
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="care-note"
                className="block text-sm font-medium text-gray-700"
              >
                Note
              </label>

              <span className="text-xs text-gray-400">
                {noteText.length}/5000
              </span>
            </div>

            <textarea
              id="care-note"
              value={noteText}
              onChange={(event) =>
                setNoteText(event.target.value)
              }
              disabled={saving}
              maxLength={5000}
              rows={5}
              placeholder="Example: Patient had reduced appetite during lunch and rested afterward."
              className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 size={17} />
              {success}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-gray-400">
              Care notes record observations and do not change
              the patient's diagnosis, prescription, or treatment.
            </p>

            <button
              type="submit"
              disabled={saving || !noteText.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B625C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <MessageSquarePlus size={16} />
                  Add care note
                </>
              )}
            </button>
          </div>
        </form>
      </Card>

      {/* History */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-gray-900">
              Recent care notes
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Observations recorded for this patient
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadNotes(true)}
            disabled={refreshing}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            title="Refresh care notes"
          >
            <RefreshCw
              size={17}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
          </button>
        </div>

        {notes.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No care notes yet"
              description="Add the first observation for this patient."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notes.map((note) => (
              <article
                key={note.id}
                className="p-5 transition hover:bg-gray-50/70 sm:p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="relative mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F8F6] text-[#0F766E]">
                    <UserRound size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#E8F8F6] px-2.5 py-1 text-xs font-medium text-[#0F766E]">
                          {getTypeLabel(note.note_type)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock3 size={13} />
                        {formatDateTime(note.created_at)}
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {note.note_text}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                      <FileText size={13} />
                      Caregiver observation
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}