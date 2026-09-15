import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

function getClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '').trim();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function GET(request: NextRequest) {
  const client = getClient(request);
  if (!client) return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ success: false, error: 'Invalid or expired session.' }, { status: 401 });
  }

  const pageId = request.nextUrl.searchParams.get('sessionId');
  const userId = userData.user.id;

  if (pageId) {
    const { data: session, error: sessionError } = await client
      .from('symptom_chat_sessions')
      .select('*')
      .eq('id', pageId)
      .eq('user_id', userId)
      .single();

    if (sessionError) {
      return NextResponse.json({ success: false, error: sessionError.message }, { status: 404 });
    }

    const { data: messages } = await client
      .from('symptom_chat_messages')
      .select('*')
      .eq('session_id', pageId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    return NextResponse.json({ success: true, session, messages: messages ?? [] });
  }

  const { data: sessions } = await client
    .from('symptom_chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  return NextResponse.json({ success: true, sessions: sessions ?? [] });
}

export async function POST(request: NextRequest) {
  const client = getClient(request);
  if (!client) return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ success: false, error: 'Invalid or expired session.' }, { status: 401 });
  }

  const body = (await request.json()) as
    | { action: 'create_session'; title?: string; symptomName?: string }
    | { action: 'add_message'; sessionId: string; role: 'user' | 'assistant' | 'system'; content: string }
    | { action: 'update_session'; sessionId: string; symptomName?: string; severity?: number | null; trend?: string | null; duration?: string | null; summary?: string | null; emergencyDetected?: boolean; completed?: boolean };

  const userId = userData.user.id;

  if (body.action === 'create_session') {
    const { data, error } = await client
      .from('symptom_chat_sessions')
      .insert({
        user_id: userId,
        title: body.title?.trim() || 'Symptom Check',
        symptom_name: body.symptomName?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, session: data }, { status: 201 });
  }

  if (body.action === 'add_message') {
    const { data: session } = await client.from('symptom_chat_sessions').select('id').eq('id', body.sessionId).eq('user_id', userId).single();
    if (!session) return NextResponse.json({ success: false, error: 'Session not found.' }, { status: 404 });

    const { data, error } = await client
      .from('symptom_chat_messages')
      .insert({ session_id: body.sessionId, user_id: userId, role: body.role, content: body.content.trim() })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    await client.from('symptom_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', body.sessionId).eq('user_id', userId);
    return NextResponse.json({ success: true, message: data }, { status: 201 });
  }

  if (body.action === 'update_session') {
    const updateData: Record<string, string | number | boolean | null> = { updated_at: new Date().toISOString() };
    if (body.symptomName !== undefined) updateData.symptom_name = body.symptomName?.trim() || null;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.trend !== undefined) updateData.trend = body.trend?.trim() || null;
    if (body.duration !== undefined) updateData.duration = body.duration?.trim() || null;
    if (body.summary !== undefined) updateData.summary = body.summary?.trim() || null;
    if (body.emergencyDetected !== undefined) updateData.emergency_detected = body.emergencyDetected;
    if (body.completed === true) updateData.completed_at = new Date().toISOString();
    if (body.completed === false) updateData.completed_at = null;

    const { data, error } = await client
      .from('symptom_chat_sessions')
      .update(updateData)
      .eq('id', body.sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, session: data });
  }

  return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
}
