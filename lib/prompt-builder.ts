import { PatientSummaryData, calculateAge } from './patient-summary';

/**
 * Builds a professional medical prompt for Gemini LLM
 * Includes system context and patient data
 */

const SYSTEM_PROMPT = `You are an experienced oncology medical assistant and healthcare professional. Your role is to provide clear, accurate, and compassionate medical summaries based on patient data.

INSTRUCTIONS:
1. Use ONLY the provided patient information. Do not invent data.
2. If specific information is unavailable, clearly state "Not Available" or "Not Recorded".
3. Format the response using professional markdown with clear headings and sections.
4. Use tables for structured data whenever appropriate.
5. Be medically accurate but write in language understandable to patients.
6. Highlight critical findings, concerns, or important patterns.
7. Organize information logically for a healthcare professional or informed patient.
8. Keep the response comprehensive but concise - prioritize the most important information.
9. Never include personal opinions or recommendations beyond what the data suggests.
10. Focus on factual summaries of the patient's medical status.

RESPONSE FORMAT:
Structure your response with clear sections using markdown. Include:
- Patient demographics
- Current medical status and diagnoses
- Active treatments and their status
- Current medications
- Recent symptoms and health concerns
- Relevant medical history from the timeline
- Recent lab/scan results (if available in documents)
- Upcoming appointments
- Care team information
- Important medical alerts or concerns
- Summary assessment

Use professional medical terminology appropriately and ensure the summary is suitable for inclusion in medical records.`;

/**
 * Builds the complete prompt for Gemini including system context and patient data
 */
export function buildPatientSummaryPrompt(patientData: PatientSummaryData): string {
  const age = patientData.profile?.date_of_birth ? calculateAge(patientData.profile.date_of_birth) : null;
  
  const patientInfoSection = formatPatientInfo(patientData, age);
  const treatmentsSection = formatTreatments(patientData);
  const medicationsSection = formatMedications(patientData);
  const symptomsSection = formatSymptoms(patientData);
  const timelineSection = formatTimeline(patientData);
  const careTeamSection = formatCareTeam(patientData);
  const appointmentsSection = formatAppointments(patientData);
  const documentsSection = formatDocuments(patientData);

  const userPrompt = `Please generate a comprehensive medical summary for the following patient based on their records:

${patientInfoSection}

${treatmentsSection}

${medicationsSection}

${symptomsSection}

${timelineSection}

${careTeamSection}

${appointmentsSection}

${documentsSection}

Based on all the above information, create a professional medical summary that consolidates this patient's current health status, ongoing treatments, and key medical information. The summary should be suitable for healthcare providers or informed patients.`;

  return `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;
}

export function buildJourneyRoadmapPrompt(patientData: PatientSummaryData): string {
  return `You are summarizing an oncology patient's existing records for a journey roadmap. Use ONLY the JSON data below. Never infer or invent diagnoses, treatment stages, milestones, dates, or recommendations. If a field is unavailable, return an empty string or empty array.

Return valid JSON only, with exactly these fields:
{"journeySummary":"one concise sentence grounded in the records","currentFocus":"one concise sentence grounded in the records","nextAction":"one concise action grounded in an existing record","reminders":["up to 3 short reminders grounded in existing records"]}

Patient records:
${JSON.stringify(patientData)}`;
}

/**
 * Formats patient demographic information
 */
function formatPatientInfo(patientData: PatientSummaryData, age: number | null): string {
  const profile = patientData.profile;
  if (!profile) {
    return '## Patient Information\nNo patient profile data available.';
  }

  const lines = ['## Patient Information\n'];
  
  const tableData: Array<[string, string]> = [];
  tableData.push(['Full Name', profile.full_name || 'Not Available']);
  tableData.push(['Email', profile.email || 'Not Available']);
  tableData.push(['Phone', profile.phone || 'Not Available']);
  tableData.push(['Date of Birth', profile.date_of_birth || 'Not Available']);
  if (age) {
    tableData.push(['Age', `${age} years`]);
  }
  tableData.push(['Gender', profile.gender || 'Not Available']);
  tableData.push(['Emergency Contact', profile.emergency_contact_name || 'Not Available']);
  tableData.push(['Emergency Contact Phone', profile.emergency_contact_phone || 'Not Available']);

  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  tableData.forEach(([field, value]) => {
    lines.push(`| ${field} | ${value} |`);
  });

  if (profile.bio) {
    lines.push('');
    lines.push(`**Medical Notes:** ${profile.bio}`);
  }

  return lines.join('\n');
}

/**
 * Formats treatment information
 */
function formatTreatments(patientData: PatientSummaryData): string {
  const treatments = patientData.treatments || [];
  
  if (treatments.length === 0) {
    return '## Treatments\nNo treatment records available.';
  }

  const lines = ['## Treatments\n'];
  
  const activeTreatments = treatments.filter((t) => t.status === 'active' || t.status === 'planned');
  const completedTreatments = treatments.filter((t) => t.status === 'completed');
  
  if (activeTreatments.length > 0) {
    lines.push('### Active/Planned Treatments\n');
    lines.push('| Type | Name | Status | Start Date | End Date | Progress |');
    lines.push('|------|------|--------|-----------|----------|----------|');
    activeTreatments.forEach((t) => {
      lines.push(
        `| ${t.type} | ${t.name} | ${t.status} | ${t.start_date || 'N/A'} | ${t.end_date || 'N/A'} | ${t.progress}% |`
      );
    });
    lines.push('');
  }
  
  if (completedTreatments.length > 0) {
    lines.push('### Completed Treatments\n');
    lines.push('| Type | Name | Completion Date |');
    lines.push('|------|------|-----------------|');
    completedTreatments.forEach((t) => {
      lines.push(`| ${t.type} | ${t.name} | ${t.end_date || 'N/A'} |`);
    });
    lines.push('');
  }

  // Add treatment notes if any
  const treatmentsWithNotes = treatments.filter((t) => t.notes);
  if (treatmentsWithNotes.length > 0) {
    lines.push('### Treatment Notes\n');
    treatmentsWithNotes.forEach((t) => {
      lines.push(`- **${t.name}**: ${t.notes}`);
    });
  }

  return lines.join('\n');
}

/**
 * Formats medication information
 */
function formatMedications(patientData: PatientSummaryData): string {
  const medications = patientData.medications || [];
  
  if (medications.length === 0) {
    return '## Medications\nNo medication records available.';
  }

  const lines = ['## Current Medications\n'];
  
  const activeMeds = medications.filter((m) => m.is_active);
  const inactiveMeds = medications.filter((m) => !m.is_active);
  
  if (activeMeds.length > 0) {
    lines.push('### Active Medications\n');
    lines.push('| Medication | Dosage | Frequency | Start Date | Notes |');
    lines.push('|------------|--------|-----------|-----------|-------|');
    activeMeds.forEach((m) => {
      lines.push(
        `| ${m.name} | ${m.dosage} | ${m.frequency} | ${m.start_date || 'N/A'} | ${m.notes || 'N/A'} |`
      );
    });
    lines.push('');
  }
  
  if (inactiveMeds.length > 0) {
    lines.push('### Discontinued Medications\n');
    lines.push('| Medication | Dosage | Frequency | End Date |');
    lines.push('|------------|--------|-----------|----------|');
    inactiveMeds.forEach((m) => {
      lines.push(`| ${m.name} | ${m.dosage} | ${m.frequency} | ${m.end_date || 'N/A'} |`);
    });
  }

  return lines.join('\n');
}

/**
 * Formats symptom information
 */
function formatSymptoms(patientData: PatientSummaryData): string {
  const symptoms = patientData.symptoms || [];
  
  if (symptoms.length === 0) {
    return '## Symptoms\nNo symptom records available.';
  }

  const lines = ['## Reported Symptoms\n'];
  lines.push('| Symptom | Severity (1-10) | Recorded Date | Notes |');
  lines.push('|---------|-----------------|---------------|-------|');
  
  symptoms.slice(0, 20).forEach((s) => {
    lines.push(
      `| ${s.name} | ${s.severity} | ${s.recorded_at ? new Date(s.recorded_at).toLocaleDateString() : 'N/A'} | ${s.notes || 'N/A'} |`
    );
  });

  if (symptoms.length > 20) {
    lines.push(`\n*Showing 20 of ${symptoms.length} recorded symptoms*`);
  }

  return lines.join('\n');
}

/**
 * Formats health timeline information
 */
function formatTimeline(patientData: PatientSummaryData): string {
  const timeline = patientData.health_timeline || [];
  
  if (timeline.length === 0) {
    return '## Health Timeline\nNo timeline events recorded.';
  }

  const lines = ['## Health Timeline\n'];
  lines.push('| Date | Event Type | Title | Description |');
  lines.push('|------|-----------|-------|-------------|');
  
  timeline.slice(0, 20).forEach((event) => {
    const desc = event.description ? event.description.substring(0, 50) + '...' : 'N/A';
    lines.push(
      `| ${event.event_date} | ${event.event_type} | ${event.title} | ${desc} |`
    );
  });

  if (timeline.length > 20) {
    lines.push(`\n*Showing 20 of ${timeline.length} timeline events*`);
  }

  return lines.join('\n');
}

/**
 * Formats care team information
 */
function formatCareTeam(patientData: PatientSummaryData): string {
  const team = patientData.care_team || [];
  
  if (team.length === 0) {
    return '## Care Team\nNo care team members recorded.';
  }

  const lines = ['## Care Team\n'];
  lines.push('| Member Name | Role | Specialty | Phone | Email |');
  lines.push('|-------------|------|-----------|-------|-------|');
  
  team.forEach((member) => {
    lines.push(
      `| ${member.member_name} | ${member.role} | ${member.specialty || 'N/A'} | ${member.phone || 'N/A'} | ${member.email || 'N/A'} |`
    );
  });

  return lines.join('\n');
}

/**
 * Formats appointment information
 */
function formatAppointments(patientData: PatientSummaryData): string {
  const appointments = patientData.appointments || [];
  
  if (appointments.length === 0) {
    return '## Appointments\nNo appointment records available.';
  }

  const lines = ['## Upcoming and Recent Appointments\n'];
  lines.push('| Date | Type | Status | Reason | Notes |');
  lines.push('|------|------|--------|--------|-------|');
  
  appointments.slice(0, 15).forEach((apt) => {
    lines.push(
      `| ${apt.appointment_date ? new Date(apt.appointment_date).toLocaleDateString() : 'N/A'} | ${apt.type} | ${apt.status} | ${apt.reason || 'N/A'} | ${apt.notes || 'N/A'} |`
    );
  });

  if (appointments.length > 15) {
    lines.push(`\n*Showing 15 of ${appointments.length} appointments*`);
  }

  return lines.join('\n');
}

/**
 * Formats documents and medical records
 */
function formatDocuments(patientData: PatientSummaryData): string {
  const documents = patientData.documents || [];
  
  if (documents.length === 0) {
    return '## Documents & Medical Records\nNo documents uploaded.';
  }

  const lines = ['## Documents & Medical Records\n'];
  lines.push('| Document Title | Category | Type | Date |');
  lines.push('|----------------|----------|------|------|');
  
  documents.slice(0, 20).forEach((doc) => {
    lines.push(
      `| ${doc.title} | ${doc.category} | ${doc.file_type || 'N/A'} | ${doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'N/A'} |`
    );
  });

  if (documents.length > 20) {
    lines.push(`\n*Showing 20 of ${documents.length} documents*`);
  }

  return lines.join('\n');
}
