export interface ExtractedMedication {
  name: string;
  dosage: string;
  frequency: string;
  notes: string;
}

function parseMedicationText(text: string): ExtractedMedication | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dosageMatch = text.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|μg|ug|g|ml|mL|%)\b/i);
  const frequencyMatch = text.match(/\b(?:once|twice|three times|four times|one|two|three)\s+(?:a|per)\s+day\b|\b(?:daily|weekly|nightly|morning|evening|as needed)\b/i);
  const dosage = dosageMatch?.[0] || '';
  const frequency = frequencyMatch?.[0] || 'once daily';
  const candidate = lines.find((line) => {
    const normalized = line.toLowerCase();
    return dosage && line.toLowerCase().includes(dosage.toLowerCase()) &&
      !/^(rx|prescription|patient|doctor|date|dose|dosage)/i.test(normalized);
  }) || lines.find((line) => /^[a-z][a-z0-9 +().-]{2,50}$/i.test(line) && !/^(rx|prescription|patient|doctor|date)$/i.test(line));

  if (!candidate) return null;
  const name = candidate.replace(dosage, '').replace(/\b(?:once|twice|three times|daily|weekly|nightly|morning|evening|as needed)\b/gi, '').trim();
  if (!name) return null;
  return { name, dosage, frequency, notes: 'Extracted from prescription. Please verify before saving.' };
}

async function fileToImage(file: File): Promise<Blob | File> {
  if (file.type !== 'application/pdf') return file;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the prescription PDF for analysis.');
  await page.render({ canvasContext: context, viewport }).promise;
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to read the prescription PDF.')), 'image/png'));
}

export async function analyzePrescription(file: File, onProgress?: (progress: number) => void): Promise<ExtractedMedication | null> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: (message) => onProgress?.(Math.round(message.progress * 100)) });
  try {
    const result = await worker.recognize(await fileToImage(file));
    return parseMedicationText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
