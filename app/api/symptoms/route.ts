import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = (await request.json()) as {
      name?: string;
      severity?: number;
      notes?: string;
      recordedAt?: string;
    };

    const name = body.name?.trim();
    const severity = Number(body.severity);

    if (!name) {
      return NextResponse.json({ success: false, error: 'Symptom name is required.' }, { status: 400 });
    }

    if (!Number.isInteger(severity) || severity < 1 || severity > 10) {
      return NextResponse.json({ success: false, error: 'Severity must be between 1 and 10.' }, { status: 400 });
    }

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session.' }, { status: 401 });
    }

    const { data, error } = await client
      .from('symptoms')
      .insert({
        user_id: userData.user.id,
        name,
        severity,
        notes: body.notes?.trim() || null,
        recorded_at: body.recordedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, record: data }, { status: 201 });
  } catch (error) {
    console.error('Symptom save API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to save symptom.' },
      { status: 500 }
    );
  }
}
