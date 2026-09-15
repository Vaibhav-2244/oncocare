import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { generateChatReply } from '@/lib/gemini';
import { routePrediction, type PredictionData } from '@/lib/ml-router';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function getSupabaseClient(request: NextRequest): any {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function loadPatientContext(client: any, userId: string) {
  const [profileRes, symptomsRes, treatmentsRes] = await Promise.all([
    client.from('profiles').select('id, full_name, email, gender, date_of_birth, bio').eq('id', userId).maybeSingle(),
    client.from('symptoms').select('name, severity, notes, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(10),
    client.from('treatments').select('type, name, status, start_date, end_date, notes').eq('user_id', userId).order('start_date', { ascending: false }).limit(10),
  ]);

  const profile = (profileRes as any).data as { full_name?: string; email?: string } | null;
  const recentSymptoms = ((symptomsRes as any).data ?? []) as Array<{ name: string; severity: number }>;
  const treatments = ((treatmentsRes as any).data ?? []) as Array<{ name?: string; type?: string; status?: string }>;

  const patientSummary = [
    profile ? `Patient name: ${profile.full_name || profile.email || 'Patient'}` : 'Patient profile unavailable',
    recentSymptoms.length > 0
      ? `Recent symptoms: ${recentSymptoms.map((item) => `${item.name} (${item.severity}/10)`).join(', ')}`
      : 'Recent symptoms: none recorded',
    treatments.length > 0
      ? `Active or recent treatments: ${treatments.map((item) => `${item.name || item.type} (${item.status})`).join(', ')}`
      : 'Treatments: not available',
  ].join('\n');

  return {
    userName: profile?.full_name?.split(' ')[0] || profile?.email || 'there',
    patientSummary,
  };
}

async function ensureConversation(client: any, userId: string, requestedConversationId?: string, fallbackTitle?: string) {
  if (requestedConversationId) {
    const { data, error } = await client
      .from('ai_conversations')
      .select('id, title, updated_at')
      .eq('id', requestedConversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const title = (fallbackTitle || 'New conversation').trim() || 'New conversation';
  const { data, error } = await client
    .from('ai_conversations')
    .insert({ user_id: userId, title, is_pinned: false })
    .select('id, title, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error.' }, { status: 500 });
    }

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

    const body = (await request.json()) as {
      message?: string;
      conversationId?: string;
      history?: Array<{ role: 'user' | 'model'; text: string }>;
      userName?: string;
      cancerType?: string;
      treatmentType?: string;
      journeyPhase?: string;
      selectedSymptom?: string;
      severity?: number | null;
      trend?: string;
      duration?: string;
      predictionCancerType?: string;
      predictionData?: PredictionData;
      imageData?: string;
      imageMimeType?: string;
    };

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ success: false, error: 'Message is required.' }, { status: 400 });
    }

    const context = await loadPatientContext(client, user.id);
    const patientContext = {
      userName: body.userName?.trim() || context.userName,
      cancerType: body.cancerType,
      treatmentType: body.treatmentType,
      journeyPhase: body.journeyPhase,
      selectedSymptom: body.selectedSymptom,
      severity: body.severity,
      trend: body.trend,
      duration: body.duration,
      patientSummary: context.patientSummary,
    };

    const prediction = await routePrediction({
      message,
      requestedCancerType: body.predictionCancerType,
      patientData: body.predictionData,
      imageData: body.imageData,
      imageMimeType: body.imageMimeType,
    });

    const conversation: any = await ensureConversation(client as any, user.id, body.conversationId, message.slice(0, 50));

    const history = Array.isArray(body.history)
      ? body.history.filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0).slice(-20)
      : [];

    const { data: existingMessages } = await client
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(40);

    const previousHistory: Array<{ role: 'user' | 'model'; text: string }> = (existingMessages || []).map((item: any) => ({
      role: item.role === 'user' ? 'user' : 'model',
      text: String(item.content ?? ''),
    }));

    const fullHistory: Array<{ role: 'user' | 'model'; text: string }> = [...previousHistory, ...history].slice(-20);

    const reply = prediction.message || await generateChatReply({
      message,
      history: fullHistory,
      userName: patientContext.userName,
      patientContext,
      modelContext: prediction.result ? JSON.stringify(prediction.result) : undefined,
    });

    const userInsert = await (client as any)
      .from('ai_messages')
      .insert({
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'user',
        content: message,
        attachments: [],
      })
      .select('id, conversation_id, user_id, role, content, created_at')
      .single();

    if (userInsert.error) {
      throw userInsert.error;
    }

    const assistantInsert = await (client as any)
      .from('ai_messages')
      .insert({
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'assistant',
        content: reply,
        attachments: [],
      })
      .select('id, conversation_id, user_id, role, content, created_at')
      .single();

    if (assistantInsert.error) {
      throw assistantInsert.error;
    }

    await (client as any)
      .from('ai_conversations')
      .update({ title: conversation.title.startsWith('New conversation') ? message.slice(0, 50) : conversation.title, updated_at: new Date().toISOString() })
      .eq('id', conversation.id)
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      reply,
      conversationId: conversation.id,
      userMessage: userInsert.data,
      assistantMessage: assistantInsert.data,
      prediction: prediction.result
        ? { cancerType: prediction.cancerType, data: prediction.data, result: prediction.result }
        : prediction.isPredictionRequest
          ? { cancerType: prediction.cancerType, data: prediction.data, missingFeatures: prediction.missingFeatures }
          : null,
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to process the message right now.',
      },
      { status: 500 },
    );
  }
}
