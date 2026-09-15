import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MODEL_SERVICE_URL = process.env.CANCER_MODEL_SERVICE_URL || 'http://127.0.0.1:8001';

function getSupabaseClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient(request);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      cancerType?: string;
      patientData?: Record<string, unknown>;
    };

    const cancerType = (body.cancerType ?? '').toString().trim();
    const patientData = body.patientData && typeof body.patientData === 'object' ? body.patientData : {};

    if (!cancerType) {
      return NextResponse.json({ success: false, error: 'cancerType is required.' }, { status: 400 });
    }

    const response = await fetch(`${MODEL_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancerType,
        patientData,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: (result && typeof result.detail === 'string' ? result.detail : 'Prediction service unavailable.'),
        },
        { status: response.status || 502 },
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Cancer prediction route error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to call the model service.' },
      { status: 502 },
    );
  }
}
