import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type { CareNote, CareNoteType } from "@/types";

interface CreateCareNoteInput {
  noteText: string;
  noteType: CareNoteType;
}

export async function getPatientCareNotes(
  patientId: string,
): Promise<CareNote[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_care_notes_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as CareNote[];
}

export async function createPatientCareNote(
  patientId: string,
  input: CreateCareNoteInput,
): Promise<CareNote> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const noteText = input.noteText.trim();

  if (!noteText) {
    throw new Error("CARE_NOTE_EMPTY");
  }

  if (noteText.length > 5000) {
    throw new Error("CARE_NOTE_TOO_LONG");
  }

  const { data, error } = await supabase.rpc(
    "create_patient_care_note_for_caregiver",
    {
      target_patient_id: patientId,
      note_text_input: noteText,
      note_type_input: input.noteType,
    },
  );

  if (error) {
    throw error;
  }

  const note = (data?.[0] ?? null) as CareNote | null;

  if (!note) {
    throw new Error("CARE_NOTE_CREATE_FAILED");
  }

  return note;
}