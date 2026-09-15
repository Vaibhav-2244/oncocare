export type PredictionData = Record<string, string | number | boolean>;

export type ModelResult = {
  status: string;
  cancer_type?: string;
  prediction?: number;
  probability?: number | null;
  model?: string;
  error?: string;
  missing_features?: string[];
  detail?: string;
};

type ModelMetadata = {
  status: string;
  cancer_type?: string;
  required_features?: string[];
  model?: string;
  error?: string;
};

type PredictionRoute = {
  isPredictionRequest: boolean;
  cancerType?: string;
  missingFeatures: string[];
  message?: string;
  result?: ModelResult;
  data?: PredictionData;
};

const MODEL_SERVICE_URL = process.env.CANCER_MODEL_SERVICE_URL || 'http://127.0.0.1:8001';
const SUPPORTED_CANCERS = ['lung', 'cervical', 'colorectal', 'oral'] as const;

function inferCancerType(message: string, requested?: string): string | undefined {
  const value = (requested || message).toLowerCase();
  if (value.includes('lung')) return 'lung';
  if (value.includes('cervical') || value.includes('cervix')) return 'cervical';
  if (value.includes('colorectal') || value.includes('colon') || value.includes('rectal')) return 'colorectal';
  if (value.includes('oral') || value.includes('mouth') || value.includes('tongue')) return 'oral';
  return undefined;
}

function isPredictionRequest(message: string): boolean {
  return /\b(predict|prediction|risk|screen|screening|classif|probability|likelihood|detect|diagnos)\b/i.test(message)
    || /\b(cancer)\b.{0,30}\b(check|test|model|assessment)\b/i.test(message);
}

function parseMessageData(message: string, features: string[]): PredictionData {
  const data: PredictionData = {};
  for (const feature of features) {
    const key = feature.replace(/[()]/g, '').replace(/^_+|_+$/g, '').split(/_+/).filter(Boolean);
    const escapedKey = key.map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('[ _]+');
    const pattern = new RegExp(`(?:^|[;,\\n])\\s*${escapedKey}\\s*(?:is|=|:)\\s*([^,;\\n]+)`, 'i');
    const labelled = message.match(pattern);
    const shorthand = feature === 'Age' ? message.match(/\bage\s+(\d{1,3})\b/i) : null;
    const value = labelled?.[1]?.trim() || shorthand?.[1];
    if (value) data[feature] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return data;
}

function displayFeature(feature: string): string {
  return feature.replace(/^_+|_+$/g, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getMetadata(cancerType: string): Promise<ModelMetadata> {
  const response = await fetch(`${MODEL_SERVICE_URL}/metadata/${encodeURIComponent(cancerType)}`, { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as ModelMetadata;
  if (!response.ok) throw new Error(payload.error || 'Prediction service unavailable.');
  return payload;
}

export async function routePrediction(options: {
  message: string;
  requestedCancerType?: string;
  patientData?: PredictionData;
  imageData?: string;
  imageMimeType?: string;
}): Promise<PredictionRoute> {
  if (!isPredictionRequest(options.message) && !options.requestedCancerType && !options.imageData) {
    return { isPredictionRequest: false, missingFeatures: [] };
  }

  const cancerType = inferCancerType(options.message, options.requestedCancerType) || (options.imageData ? 'oral' : undefined);
  if (!cancerType) {
    return {
      isPredictionRequest: true,
      missingFeatures: [],
      message: `I can run the trained prediction models for lung, cervical, colorectal, or oral cancer. Which cancer type would you like to assess? This is a risk model, not a diagnosis.`,
    };
  }

  if (!SUPPORTED_CANCERS.includes(cancerType as (typeof SUPPORTED_CANCERS)[number])) {
    return { isPredictionRequest: true, cancerType, missingFeatures: [], message: 'That cancer type is not supported by the available trained models. Choose lung, cervical, colorectal, or oral.' };
  }

  let metadata: ModelMetadata;
  try {
    metadata = await getMetadata(cancerType);
  } catch (error) {
    return { isPredictionRequest: true, cancerType, missingFeatures: [], message: `The ${cancerType} prediction service is not running. Start it with \`npm run model-service\`, then retry.` };
  }

  if (metadata.status !== 'success') {
    return { isPredictionRequest: true, cancerType, missingFeatures: [], message: `The ${cancerType} model cannot be used because its trained artifact is missing or unavailable. I will not substitute a different model.` };
  }

  const patientData: PredictionData = { ...parseMessageData(options.message, metadata.required_features || []), ...(options.patientData || {}) };
  if (cancerType === 'oral' && options.imageData) patientData.image_base64 = options.imageData;
  const missingFeatures = (metadata.required_features || []).filter((feature) => {
    if (feature === 'image_base64') return !patientData.image_base64;
    return patientData[feature] === undefined || patientData[feature] === null || patientData[feature] === '';
  });

  if (missingFeatures.length > 0) {
    return {
      isPredictionRequest: true,
      cancerType,
      missingFeatures,
      data: patientData,
      message: `To run the trained ${cancerType} model, please provide all of these fields: ${missingFeatures.map(displayFeature).join(', ')}. Reply with labelled values such as "Age: 52; ${displayFeature(missingFeatures[0])}: ...". These results support discussion with your clinician and are not a diagnosis.`,
    };
  }

  try {
    const response = await fetch(`${MODEL_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancerType, patientData: { ...patientData, ...(options.imageMimeType ? { image_mime_type: options.imageMimeType } : {}) } }),
      cache: 'no-store',
    });
    const result = (await response.json().catch(() => ({}))) as ModelResult;
    if (!response.ok || result.status !== 'success') {
      return { isPredictionRequest: true, cancerType, missingFeatures: result.missing_features || [], data: patientData, message: `The ${cancerType} model could not complete this assessment: ${result.error || result.detail || 'prediction failed'}. The trained artifact may need to be rebuilt with matching preprocessing files.`, result };
    }
    return { isPredictionRequest: true, cancerType, missingFeatures: [], data: patientData, result };
  } catch (error) {
    return { isPredictionRequest: true, cancerType, missingFeatures: [], message: `The ${cancerType} prediction service is unreachable. Start the Python model service on port 8001 and try again.` };
  }
}