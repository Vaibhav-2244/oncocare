import { createClient } from '@supabase/supabase-js';
import type pdfParse from 'pdf-parse';
import { NextRequest, NextResponse } from 'next/server';
import { generateMedicalSummary, generateMedicalVisionAnalysis } from '@/lib/gemini';

const pdfParseDirect = require('pdf-parse/lib/pdf-parse.js') as typeof pdfParse;

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const medicalKeywords = [
  'patient', 'medical', 'clinical', 'diagnosis', 'diagnostic', 'pathology',
  'pathologist', 'biopsy', 'histopathology', 'cytology', 'carcinoma', 'tumor',
  'tumour', 'malignant', 'benign', 'oncology', 'oncologist', 'cancer',
  'metastasis', 'metastatic', 'ct scan', 'computed tomography', 'mri',
  'magnetic resonance', 'x-ray', 'xray', 'radiology', 'radiologist',
  'ultrasound', 'scan', 'specimen', 'microscopic', 'impression', 'findings',
  'laboratory', 'lab report', 'blood', 'hemoglobin', 'platelet',
  'white blood cell', 'wbc', 'rbc', 'reference range', 'treatment',
  'chemotherapy', 'radiotherapy', 'clinical history', 'doctor', 'physician',
];

const analysisInstructions = `
You are the AI analysis assistant for OncoCare+, a medical second-opinion support application.

Analyze the medical report carefully.

IMPORTANT SAFETY RULES:
- Do not claim to replace a doctor or oncologist.
- Do not present your interpretation as a confirmed diagnosis.
- Do not invent findings, test results, treatments, or patient information.
- Clearly distinguish information explicitly visible or stated in the report from your interpretation.
- If information is missing or unreadable, say that it is not provided or cannot be determined.
- Do not assume that a finding means cancer unless the report explicitly supports that conclusion.
- Highlight anything that should be discussed promptly with a qualified healthcare professional.
- Use clear, understandable language.
- Do not provide a definitive treatment recommendation.
- If the report contains uncertainty, explain the uncertainty.

Create a structured report using exactly these sections:
1. Report Summary
2. Key Findings
3. Clinical Interpretation
4. Cancer-Related Findings
5. Important Tests / Biomarkers Mentioned
6. Treatment Information Mentioned
7. Questions to Discuss With the Oncologist
8. Important Limitations

For each section, use concise but useful explanations. This is AI-generated medical information intended to help the user understand their report, not a confirmed diagnosis or a substitute for professional medical advice.
`;

function looksLikeMedicalReport(text: string): boolean {
  const normalized = text.toLowerCase();
  return medicalKeywords.filter((keyword) => normalized.includes(keyword)).length >= 3;
}

function hasValidSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase environment variables');

  const token = authHeader.slice(7).trim();
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });

    const formData = await request.formData();
    const entry = formData.get('report');
    if (!(entry instanceof File)) {
      return NextResponse.json({ success: false, message: 'Please upload a medical report.' }, { status: 400 });
    }

    const mimeType = entry.type.toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json({ success: false, message: 'Only PDF, JPG, JPEG, and PNG medical reports are accepted.' }, { status: 400 });
    }
    if (entry.size === 0) {
      return NextResponse.json({ success: false, message: 'The uploaded file is empty.' }, { status: 400 });
    }
    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: 'The file is too large. Maximum allowed size is 10 MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    if (!hasValidSignature(buffer, mimeType)) {
      return NextResponse.json({ success: false, message: 'The uploaded file is malformed or does not match its file type.' }, { status: 400 });
    }

    let analysis = '';
    if (mimeType === 'application/pdf') {
      let extractedText = '';
      try {
        extractedText = (await pdfParseDirect(buffer)).text?.trim() || '';
      } catch {
        return NextResponse.json({ success: false, medicalReport: false, analysisAvailable: false, message: 'This PDF could not be read. Please upload a valid, readable medical report.' }, { status: 422 });
      }
      if (extractedText.length < 20) {
        return NextResponse.json({ success: false, medicalReport: false, analysisAvailable: false, message: 'This PDF does not contain enough readable text for analysis. Scanned PDFs should be uploaded as JPG or PNG.' }, { status: 422 });
      }
      if (!looksLikeMedicalReport(extractedText)) {
        return NextResponse.json({ success: false, medicalReport: false, analysisAvailable: false, message: "This document doesn't appear to be a medical report. Please upload a pathology, biopsy, CT, MRI, X-ray, laboratory, or other clinical document." }, { status: 422 });
      }
      analysis = await generateMedicalSummary(`${analysisInstructions}\n\nHere is the text extracted from the medical report:\n\n---------------- REPORT START ----------------\n${extractedText}\n---------------- REPORT END ----------------`);
    } else {
      analysis = await generateMedicalVisionAnalysis(`${analysisInstructions}\n\nThe uploaded medical report is provided as an image. First determine whether it appears to be a pathology, biopsy, CT, MRI, X-ray, radiology, laboratory, clinical, oncology, or other relevant medical report. If it is not a medical report, say so clearly and do not create a medical interpretation. Analyze only visible, readable information and identify anything blurry, cut off, or unreadable. Do not guess missing information.`, buffer, mimeType);
      const normalized = analysis.trim().toLowerCase();
      if (normalized.length < 20) throw new Error('The AI could not read enough information from this image.');
      if (normalized.includes('not a medical report') || normalized.includes('does not appear to be a medical report')) {
        return NextResponse.json({ success: false, medicalReport: false, analysisAvailable: false, message: 'This image does not appear to contain a medical report. Please upload a pathology, biopsy, CT, MRI, X-ray, radiology, laboratory, or other relevant clinical document.' }, { status: 422 });
      }
    }

    if (!analysis.trim()) throw new Error('The AI returned an empty analysis.');
    console.info(`Second-opinion analysis completed for authenticated user ${user.id}`);
    return NextResponse.json({ success: true, medicalReport: true, analysisAvailable: true, message: 'Medical report analyzed successfully.', file: { name: entry.name, size: entry.size, type: mimeType }, analysis });
  } catch (error) {
    console.error('Second-opinion API error:', error);
    return NextResponse.json({ success: false, analysisAvailable: false, message: 'Unable to analyze the medical report right now. Please try again.' }, { status: 500 });
  }
}