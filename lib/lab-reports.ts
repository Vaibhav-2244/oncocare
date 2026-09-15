export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export type LabExtractionStatus = 'pending' | 'completed' | 'failed';
export type LabReviewStatus = 'pending' | 'confirmed' | 'edited' | 'rejected';

export interface LabReportRow {
  id: string;
  user_id: string;
  report_date: string | null;
  laboratory_name: string | null;
  report_title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  sha256: string;
  storage_path: string;
  extraction_status: LabExtractionStatus;
  review_status: LabReviewStatus;
  created_at: string;
  updated_at: string;
  notes?: string | null;
}

export interface LabValueRow {
  id: string;
  report_id: string;
  test_date: string | null;
  test_name: string;
  canonical_name: string;
  original_value: string | null;
  numeric_value: number | null;
  normalized_value: number | null;
  unit: string | null;
  original_unit: string | null;
  normalized_unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  source: string | null;
  extraction_confidence: number | null;
  notes: string | null;
  reviewed_state: string | null;
  corrected_state: boolean | null;
  rejected_state: boolean | null;
  reviewer: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabTrendPoint {
  date: string;
  value: number;
  unit: string | null;
  label: string;
}

export interface TrendSummary {
  biomarker: string;
  count: number;
  firstValue: number | null;
  latestValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: 'increasing' | 'decreasing' | 'stable' | 'insufficient-data';
  unit: string | null;
  compatible: boolean;
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'report';
}

export function validateLabFile(file: File): { ok: true; extension: string; mimeType: string; fileName: string; size: number } | { ok: false; error: string } {
  if (!file || file.size === 0) {
    return { ok: false, error: 'The uploaded file is empty.' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'The uploaded file exceeds the 20 MB limit.' };
  }

  const inputName = file.name || 'report';
  const extension = (inputName.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { ok: false, error: 'Unsupported file type. Please upload a PDF, JPG, JPEG, or PNG report.' };
  }

  const mimeType = file.type?.toLowerCase() || '';
  if (extension === 'pdf' && mimeType && mimeType !== 'application/pdf') {
    return { ok: false, error: 'PDF file content does not match the expected format.' };
  }
  if ((extension === 'jpg' || extension === 'jpeg') && mimeType && !['image/jpeg', 'image/jpg'].includes(mimeType)) {
    return { ok: false, error: 'JPEG file content does not match the expected format.' };
  }
  if (extension === 'png' && mimeType && mimeType !== 'image/png') {
    return { ok: false, error: 'PNG file content does not match the expected format.' };
  }

  return {
    ok: true,
    extension,
    mimeType: mimeType || inferMimeFromExtension(extension),
    fileName: sanitizeFileName(inputName),
    size: file.size,
  };
}

export function inferMimeFromExtension(extension: string): string {
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  return 'image/jpeg';
}

export async function sha256Hash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function fileSignatureMatches(file: File): Promise<boolean> {
  return file.slice(0, 16).arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    if (file.name.toLowerCase().endsWith('.pdf')) return bytes.slice(0, 5).every((byte, index) => byte === '%PDF,'.charCodeAt(index) || (index === 4 && byte === '%'.charCodeAt(0)) || (index === 3 && byte === 'F'.charCodeAt(0)) || (index === 2 && byte === 'D'.charCodeAt(0)) || (index === 1 && byte === 'P'.charCodeAt(0)) || (index === 0 && byte === '%'.charCodeAt(0)));
    if (file.name.toLowerCase().endsWith('.png')) return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return false;
  });
}

export function validateFileContentSignature(file: File): Promise<{ ok: boolean; error?: string }> {
  return fileSignatureMatches(file).then((matches) => {
    if (!matches) {
      return { ok: false, error: 'The file signature does not match a valid PDF, JPG, JPEG, or PNG upload.' };
    }
    return { ok: true };
  });
}

export async function extractTextFromUploadedFile(file: File): Promise<{ text: string; source: 'pdf' | 'ocr'; status: 'completed' | 'failed' }> {
  const extension = (file.name || '').split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf') {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      const chunks: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        if (text.trim()) chunks.push(text.trim());
      }

      const text = chunks.join('\n');
      return { text, source: 'pdf', status: text.trim() ? 'completed' : 'failed' };
    } catch {
      return { text: '', source: 'pdf', status: 'failed' };
    }
  }

  try {
    const Tesseract = (await import('tesseract.js')).default;
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: () => undefined,
    });
    return {
      text: data.text || '',
      source: 'ocr',
      status: data.text?.trim() ? 'completed' : 'failed',
    };
  } catch {
    return { text: '', source: 'ocr', status: 'failed' };
  }
}

export function normalizeBiomarkerName(name: string): string {
  const cleaned = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*[:=]\s*$/, '')
    .replace(/\b(?:result|value|report)\b/gi, '')
    .trim();

  const lookup: Record<string, string> = {
    hb: 'hemoglobin',
    haemoglobin: 'hemoglobin',
    hemoglobin: 'hemoglobin',
    'rbc': 'red blood cells',
    'wbc': 'white blood cells',
    'platelets': 'platelets',
    'plt': 'platelets',
    'creatinine': 'creatinine',
    'cr': 'creatinine',
    'bilirubin total': 'bilirubin',
    'total bilirubin': 'bilirubin',
    'alt': 'alanine aminotransferase',
    'sgpt': 'alanine aminotransferase',
    'ast': 'aspartate aminotransferase',
    'sgot': 'aspartate aminotransferase',
    'albumin': 'albumin',
    'sodium': 'sodium',
    'na': 'sodium',
    'potassium': 'potassium',
    'k': 'potassium',
    'glucose': 'glucose',
    'fasting glucose': 'glucose',
    'hba1c': 'haemoglobin a1c',
    'hemoglobin a1c': 'haemoglobin a1c',
    'ldl': 'low-density lipoprotein',
    'hdl': 'high-density lipoprotein',
    'triglycerides': 'triglycerides',
    'tsh': 'thyroid stimulating hormone',
    'thyroid stimulating hormone': 'thyroid stimulating hormone',
    'uric acid': 'uric acid',
    'calcium': 'calcium',
    'magnesium': 'magnesium',
    'phosphorus': 'phosphorus',
  };

  const lower = cleaned.toLowerCase();
  return lookup[lower] || cleaned;
}

export function normalizeUnit(rawUnit?: string | null): string | null {
  const value = String(rawUnit || '').trim();
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, ' ');
  const map: Record<string, string> = {
    'mg/dl': 'mg/dL',
    'mg/dl.': 'mg/dL',
    'mg/dl ': 'mg/dL',
    'g/dl': 'g/dL',
    'g/dl.': 'g/dL',
    'mmol/l': 'mmol/L',
    'mmol/l.': 'mmol/L',
    'μmol/l': 'µmol/L',
    'umol/l': 'µmol/L',
    'mcg/dl': 'µg/dL',
    'µg/dl': 'µg/dL',
    'ug/dl': 'µg/dL',
    'x10^3/uL': 'x10^3/uL',
    'x10^6/uL': 'x10^6/uL',
    '%': '%',
    'percent': '%',
    'g/l': 'g/L',
    'gm/dl': 'g/dL',
  };

  return map[normalized] || value;
}

export function parseNumericValue(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const cleaned = rawValue
    .replace(/,/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseReferenceRange(text: string): { low: number | null; high: number | null; referenceText: string | null } {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { low: null, high: null, referenceText: null };

  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*([A-Za-z/µμ%]+)?/i);
  if (!match) return { low: null, high: null, referenceText: trimmed };

  const low = Number(match[1]);
  const high = Number(match[2]);
  const unit = match[3] ? normalizeUnit(match[3]) : null;
  return {
    low: Number.isFinite(low) ? low : null,
    high: Number.isFinite(high) ? high : null,
    referenceText: unit ? `${low}-${high} ${unit}` : `${low}-${high}`,
  };
}

export function parseLabValuesFromText(rawText: string, reportDate?: string | null): Array<{
  test_name: string;
  canonical_name: string;
  original_value: string;
  numeric_value: number | null;
  unit: string | null;
  original_unit: string | null;
  normalized_unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  source: string;
  extraction_confidence: number;
  notes: string;
  test_date: string | null;
}> {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const records: Array<{ test_name: string; canonical_name: string; original_value: string; numeric_value: number | null; unit: string | null; original_unit: string | null; normalized_unit: string | null; reference_low: number | null; reference_high: number | null; reference_text: string | null; source: string; extraction_confidence: number; notes: string; test_date: string | null; }> = [];

  for (const line of lines) {
    const normalizedLine = line.replace(/\s+/g, ' ');

    const match = normalizedLine.match(/([A-Za-z][A-Za-z0-9/()\-\s.]{2,40})\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*([A-Za-zµμ/×^%0-9\- ]{0,12})/i);
    if (!match) continue;

    const testName = match[1].trim();
    const valueText = match[2];
    const unitText = match[3]?.trim() || null;
    const canonicalName = normalizeBiomarkerName(testName);
    const numericValue = parseNumericValue(valueText);

    if (!canonicalName || numericValue === null) continue;

    const referenceMatch = normalizedLine.match(/ref(?:erence)?\s*(?:range)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*([A-Za-z/µμ%0-9\- ]{0,12})?/i);
    const reference = referenceMatch
      ? parseReferenceRange(`${referenceMatch[1]}-${referenceMatch[2]} ${referenceMatch[3] || ''}`)
      : { low: null, high: null, referenceText: null };

    records.push({
      test_name: testName,
      canonical_name: canonicalName,
      original_value: valueText,
      numeric_value: numericValue,
      unit: normalizeUnit(unitText),
      original_unit: unitText || null,
      normalized_unit: normalizeUnit(unitText),
      reference_low: reference.low,
      reference_high: reference.high,
      reference_text: reference.referenceText,
      source: 'auto-extraction',
      extraction_confidence: 0.82,
      notes: 'Auto-extracted from uploaded report.',
      test_date: reportDate || null,
    });
  }

  return records.slice(0, 50);
}

export function calculateTrendSummary(points: LabTrendPoint[]): TrendSummary {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length === 0) {
    return {
      biomarker: 'Unknown',
      count: 0,
      firstValue: null,
      latestValue: null,
      absoluteChange: null,
      percentChange: null,
      direction: 'insufficient-data',
      unit: null,
      compatible: true,
    };
  }

  const values = sorted.map((point) => point.value);
  const first = values[0];
  const latest = values[values.length - 1];
  const absoluteChange = latest - first;
  const percentChange = first === 0 ? null : ((absoluteChange / Math.abs(first)) * 100);

  let direction: TrendSummary['direction'] = 'stable';
  if (Math.abs(absoluteChange) > 0.0001) {
    direction = absoluteChange > 0 ? 'increasing' : 'decreasing';
  }

  return {
    biomarker: sorted[0]?.label || 'Unknown',
    count: sorted.length,
    firstValue: first,
    latestValue: latest,
    absoluteChange,
    percentChange,
    direction,
    unit: sorted[0]?.unit || null,
    compatible: true,
  };
}
