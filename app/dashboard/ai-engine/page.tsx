'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Plus, Send, Trash2, Pin, PinOff, Sparkles, Loader2, MessageSquare, Stethoscope, Paperclip, X,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Activity },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface AIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: unknown[] | null;
  created_at: string;
}

const QUICK_ACTIONS = [
  { label: 'Explain my lab report', icon: FileText },
  { label: 'What are side effects of chemotherapy?', icon: AlertCircle },
  { label: 'Suggest diet during treatment', icon: Pill },
  { label: 'Interpret my scan results', icon: Activity },
];

const HEALTH_SUMMARY_ACTION = {
  label: '🩺 Get My Health Summary',
  icon: Stethoscope,
  isSpecial: true,
};

/**
 * Template-based AI response generator.
 * Matches keywords in the user's question and returns a relevant
 * pre-written medical response. Falls back to a generic helpful response.
 */
function generateAIResponse(userMessage: string): string {
  const q = userMessage.toLowerCase();

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has('chemo', 'chemotherapy')) {
    return [
      'Chemotherapy uses powerful drugs to target and destroy rapidly dividing cancer cells.',
      '',
      'Common side effects include:',
      '• Fatigue — rest when needed; short naps can help without disrupting nighttime sleep.',
      '• Nausea — anti-nausea medications (antiemetics) are very effective; take them as prescribed.',
      '• Hair loss — usually temporary; grows back 2–3 months after treatment ends.',
      '• Increased infection risk — avoid crowds and practice good hand hygiene.',
      '',
      '⚠️ Contact your care team immediately if you experience a fever above 38°C (100.4°F), severe vomiting, or unusual bleeding.',
    ].join('\n');
  }

  if (has('radiation', 'radiotherapy')) {
    return [
      'Radiation therapy uses high-energy beams to precisely target cancer cells in a specific area.',
      '',
      'What to expect:',
      '• Skin irritation at the treatment site — use mild, fragrance-free moisturizers.',
      '• Fatigue often builds gradually over the course of treatment.',
      '• Side effects are usually localized to the treated area.',
      '',
      'Skin care tips: gentle cleansing, avoid sun exposure on the area, and wear loose clothing. Most side effects resolve within a few weeks after treatment ends.',
    ].join('\n');
  }

  if (has('diet', 'nutrition', 'food', 'eat', 'eating', 'meal')) {
    return [
      'A balanced diet during treatment helps maintain strength and supports recovery.',
      '',
      'Recommended guidelines:',
      '• Prioritize lean protein (chicken, fish, eggs, beans) to repair tissue.',
      '• Eat small, frequent meals — 5–6 per day — if appetite is reduced.',
      '• Stay hydrated; aim for 8 glasses of water daily.',
      '• Include colorful vegetables and fruits for vitamins and antioxidants.',
      '• Avoid raw or undercooked foods when your immune system is compromised.',
      '',
      'If nausea is an issue, try bland, easy-to-digest foods like crackers, toast, rice, and bananas. Ginger tea can also help settle the stomach.',
    ].join('\n');
  }

  if (has('pain', 'ache', 'sore')) {
    return [
      'Pain management is a critical part of your care. Here are key principles:',
      '',
      '• Take pain medications on a schedule rather than waiting until pain becomes severe.',
      '• Track your pain daily (1–10 scale) in your symptom journal — patterns help your care team adjust treatment.',
      '• Combine medication with comfort measures: heat/cold packs, gentle stretching, relaxation breathing.',
      '',
      '🔴 Report immediately: new or worsening pain, pain that disrupts sleep, or pain not relieved by your current medication regimen. Your care team can adjust the plan — you should not have to "just live with it."',
    ].join('\n');
  }

  if (has('nausea', 'vomit', 'throw up', 'queasy')) {
    return [
      'Nausea is one of the most treatable side effects. Strategies that help:',
      '',
      '• Take prescribed anti-nausea medication 30–60 minutes before meals or treatment.',
      '• Eat small, frequent meals; cold or room-temperature foods often have less odor.',
      '• Avoid spicy, greasy, or very sweet foods.',
      '• Try ginger (tea, candy, or ale) and peppermint.',
      '• Stay upright for 1 hour after eating.',
      '',
      'If nausea prevents you from keeping fluids down for 24 hours, contact your care team — IV hydration may be needed.',
    ].join('\n');
  }

  if (has('fatigue', 'tired', 'exhausted', 'no energy', 'weak')) {
    return [
      'Cancer-related fatigue is different from ordinary tiredness — it is not always relieved by rest.',
      '',
      'Practical strategies:',
      '• Prioritize: do your most important tasks during your best energy hours.',
      '• Pace yourself; alternate activity with short rest periods.',
      '• Light exercise (a 10–15 minute walk) can paradoxically boost energy.',
      '• Maintain a consistent sleep schedule.',
      '• Ask for help with chores — conserving energy matters.',
      '',
      'Track your fatigue daily. If it worsens suddenly or comes with shortness of breath or dizziness, let your care team know — it could indicate anemia or another treatable cause.',
    ].join('\n');
  }

  if (has('scan', 'imaging', 'mri', 'ct', 'ultrasound', 'x-ray', 'pet')) {
    return [
      'Imaging scans (MRI, CT, PET, ultrasound) help your care team monitor tumor response and guide treatment decisions.',
      '',
      'How to interpret results with your team:',
      '• Ask specifically: "Compared to my last scan, has the tumor changed in size or appearance?"',
      '• Request a copy of the radiology report for your records.',
      '• Understand the terms: "stable" = no significant change; "partial response" = tumor shrinkage; "progression" = growth.',
      '',
      'Important: scan results are most meaningful when compared to prior scans. Avoid jumping to conclusions before discussing with your oncologist — they interpret results in the full clinical context.',
    ].join('\n');
  }

  if (has('lab', 'blood test', 'cbc', 'white blood', 'platelet', 'hemoglobin', 'anemia')) {
    return [
      'Lab reports track how your body is responding to treatment. Key values to understand:',
      '',
      '• White blood cell count (WBC) — low counts increase infection risk; your team may delay chemo if too low.',
      '• Hemoglobin — low levels indicate anemia, causing fatigue; may require iron or a transfusion.',
      '• Platelets — low counts increase bleeding/bruising risk.',
      '• Liver/kidney function — ensures organs can process medications safely.',
      '',
      'Bring a copy of your labs to appointments. Ask your team: "Which values should I watch most closely, and what thresholds would prompt a change in my care?"',
    ].join('\n');
  }

  if (has('side effect', 'side-effect', 'adverse', 'reaction')) {
    return [
      'Side effects vary by treatment type, dose, and individual. General management principles:',
      '',
      '• Track every side effect in your symptom journal with severity (1–10), time of day, and any triggers.',
      '• Most side effects are predictable and manageable — report them early, before they escalate.',
      '• Never stop a medication without consulting your care team.',
      '• Ask about supportive medications that can prevent or reduce specific side effects.',
      '',
      'Seek immediate care for: difficulty breathing, chest pain, fever with chills, severe allergic reactions (rash, swelling), or sudden severe symptoms.',
    ].join('\n');
  }

  if (has('anxiety', 'depress', 'mental health', 'stress', 'fear', 'scared', 'worried', 'worry')) {
    return [
      'Emotional well-being is just as important as physical care during treatment.',
      '',
      'Supportive resources:',
      '• Talk to your care team about counseling or a referral to a psycho-oncologist.',
      '• Consider a cancer support group — connecting with others who understand is powerful.',
      '• Practice grounding techniques: 4-7-8 breathing, progressive muscle relaxation.',
      '• Let trusted family and friends help with practical tasks.',
      '',
      'If you have persistent thoughts of hopelessness or self-harm, please reach out immediately — your care team, a crisis line, or the emergency department. You are not alone in this.',
    ].join('\n');
  }

  if (has('sleep', 'insomnia', 'can\'t sleep', 'rest')) {
    return [
      'Sleep difficulties are common during treatment. Sleep hygiene tips:',
      '',
      '• Keep a consistent sleep/wake schedule, even on difficult days.',
      '• Limit screens 1 hour before bed; the blue light disrupts melatonin.',
      '• Avoid caffeine after noon.',
      '• Create a cool, dark, quiet sleep environment.',
      '• If you cannot sleep after 20 minutes, get up briefly and do a calm activity.',
      '',
      'If pain, anxiety, or medication side effects are disrupting sleep, tell your care team — targeted treatment can help.',
    ].join('\n');
  }

  if (has('appoint', 'schedule', 'next visit', 'see doctor')) {
    return [
      'Preparing for appointments helps you get the most from each visit:',
      '',
      '• Write down your top 3 questions beforehand — time is limited.',
      '• Bring your symptom journal, medication list, and recent lab/scan results.',
      '• Consider bringing a family member or friend for a second set of ears.',
      '• Ask for a written summary or next steps before you leave.',
      '',
      'Check your Appointments tab for upcoming visits and preparation instructions.',
    ].join('\n');
  }

  if (has('medic', 'pill', 'dose', 'prescription', 'drug')) {
    return [
      'Medication management during treatment:',
      '',
      '• Keep an updated list of all medications, supplements, and over-the-counter drugs — some interact with cancer therapy.',
      '• Take medications exactly as prescribed; do not skip or double up on missed doses without guidance.',
      '• Use a pill organizer or app reminders to stay on schedule.',
      '• Report any new side effects that appear after starting a new medication.',
      '',
      'Review your Medications tab for your current regimen and dosing schedules.',
    ].join('\n');
  }

  if (has('hello', 'hi ', 'hey', 'help', 'what can you')) {
    return [
      'Hello! I\'m your AI medical assistant. I can help explain test results, discuss treatment side effects, suggest self-care strategies, and help you prepare for appointments.',
      '',
      'Try asking about:',
      '• Chemotherapy or radiation side effects',
      '• Diet and nutrition during treatment',
      '• Understanding your lab or scan results',
      '• Managing symptoms like pain, nausea, or fatigue',
      '',
      '⚠️ I provide general information only. For medical decisions, always consult your care team.',
    ].join('\n');
  }

  // Generic fallback
  return [
    'Thank you for your question. Based on what you\'ve shared, here are some general considerations:',
    '',
    '• Keep tracking your symptoms in your journal — patterns help your care team personalize your treatment.',
    '• Don\'t hesitate to ask your care team clarifying questions; no question is too small.',
    '• Prioritize rest, hydration, and gentle movement.',
    '',
    'For specific medical advice, please consult your oncologist or care team. Would you like me to elaborate on a particular topic — such as chemotherapy, diet, pain, or lab results?',
  ].join('\n');
}

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-50" />
      </div>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex gap-2">
      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-50" />
      </div>
    </div>
  );
}

function AIEngineContent() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [actionId, setActionId] = useState<string | null>(null); // for pin/delete spinners
  const [generatingHealthSummary, setGeneratingHealthSummary] = useState(false);
  const [predictionCancerType, setPredictionCancerType] = useState<string | undefined>();
  const [predictionData, setPredictionData] = useState<Record<string, string | number | boolean>>({});
  const [imageAttachment, setImageAttachment] = useState<{ name: string; mimeType: string; data: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConversations(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (queryError) throw queryError;
      setConversations((data || []) as Conversation[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadConversations();
  }, [user, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setMessages((data || []) as AIMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, sending]);

  const handleNewConversation = async () => {
    if (!user) {
      setError('Please sign in to start a conversation.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const title = `Conversation · ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
      const { data, error: insertError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title,
          is_pinned: false,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      const newConv = data as Conversation;
      setConversations((prev) => [newConv, ...prev]);
      setSelectedId(newConv.id);
      setInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create conversation';
      setError(msg.includes('row-level security') ? 'Please sign in again to start a conversation.' : msg);
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
  };

  const handleDeleteConversation = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      // Delete messages first (if no cascade), then conversation
      const { error: msgError } = await supabase
        .from('ai_messages')
        .delete()
        .eq('conversation_id', id);
      if (msgError) throw msgError;
      const { error: convError } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', id);
      if (convError) throw convError;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    } finally {
      setActionId(null);
    }
  };

  const handleTogglePin = async (conv: Conversation) => {
    setActionId(conv.id);
    setError(null);
    try {
      const newValue = !conv.is_pinned;
      const { error: updateError } = await supabase
        .from('ai_conversations')
        .update({ is_pinned: newValue, updated_at: new Date().toISOString() })
        .eq('id', conv.id);
      if (updateError) throw updateError;
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conv.id ? { ...c, is_pinned: newValue } : c,
        );
        // Re-sort: pinned first, then by updated_at desc
        return updated.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update conversation');
    } finally {
      setActionId(null);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !user || !selectedId || sending) return;

    const userMessage = trimmed;
    setInput('');
    setSending(true);
    setError(null);

    const optimisticUser: AIMessage = {
      id: `temp-user-${Date.now()}`,
      conversation_id: selectedId,
      user_id: user.id,
      role: 'user',
      content: userMessage,
      attachments: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No active session. Please sign in again.');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: selectedId,
          history: messages
            .filter((msg) => msg.content?.trim())
            .slice(-10)
            .map((msg) => ({ role: msg.role === 'user' ? 'user' : 'model', text: msg.content })),
          userName: user?.email?.split('@')[0] || 'there',
          predictionCancerType,
          predictionData,
          imageData: imageAttachment?.data,
          imageMimeType: imageAttachment?.mimeType,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        reply?: string;
        conversationId?: string;
        userMessage?: AIMessage;
        assistantMessage?: AIMessage;
        error?: string;
        prediction?: { cancerType?: string; data?: Record<string, string | number | boolean>; missingFeatures?: string[]; result?: unknown } | null;
      };

      if (!response.ok || !payload.success || !payload.reply) {
        throw new Error(payload.error || 'The assistant could not respond.');
      }

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== optimisticUser.id)
          .concat([
            payload.userMessage ?? optimisticUser,
            payload.assistantMessage ?? { id: `assistant-${Date.now()}`, conversation_id: selectedId, user_id: user.id, role: 'assistant', content: payload.reply!, attachments: null, created_at: new Date().toISOString() },
          ]),
      );

      if (payload.prediction?.missingFeatures?.length) {
        setPredictionCancerType(payload.prediction.cancerType);
        setPredictionData((current) => ({ ...current, ...(payload.prediction?.data || {}) }));
      } else if (payload.prediction?.result) {
        setPredictionCancerType(undefined);
        setPredictionData({});
        setImageAttachment(null);
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, title: c.title.startsWith('Conversation ·') || !c.title.trim() ? userMessage.slice(0, 50) : c.title, updated_at: new Date().toISOString() }
            : c,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg.includes('row-level security') ? 'Please sign in again to send messages.' : msg);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = (label: string) => {
    setInput(label);
  };

  const handleImageAttachment = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Please attach a JPG or PNG image for the oral cancer model.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      setImageAttachment({ name: file.name, mimeType: file.type, data: value.replace(/^data:[^;]+;base64,/, '') });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleHealthSummary = async () => {
    if (!user || !selectedId) {
      setError('Please start a conversation first.');
      return;
    }

    setGeneratingHealthSummary(true);
    setError(null);

    // Optimistically add a user message indicating the action
    const userMessage = '🩺 Generate My Health Summary';
    const optimisticUser: AIMessage = {
      id: `temp-user-${Date.now()}`,
      conversation_id: selectedId,
      user_id: user.id,
      role: 'user',
      content: userMessage,
      attachments: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      // Insert user message
      const { data: insertedUser, error: userInsertError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: selectedId,
          user_id: user.id,
          role: 'user',
          content: userMessage,
          attachments: [],
        })
        .select()
        .single();

      if (userInsertError) throw userInsertError;

      // Replace optimistic with real record
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticUser.id ? (insertedUser as AIMessage) : m)),
      );

      // Get session for API call
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated - please sign in again.');
      }

      // Call the AI summary API
      const response = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      const summary = data.summary;

      if (!summary) {
        throw new Error('No summary received from server');
      }

      // Insert AI response
      const { data: insertedAI, error: aiInsertError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: selectedId,
          user_id: user.id,
          role: 'assistant',
          content: summary,
          attachments: [],
        })
        .select()
        .single();

      if (aiInsertError) throw aiInsertError;

      setMessages((prev) => [...prev, insertedAI as AIMessage]);

      // Update conversation title and timestamp
      const { error: convUpdateError } = await supabase
        .from('ai_conversations')
        .update({
          title: 'Medical Summary',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedId);

      if (convUpdateError) throw convUpdateError;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, title: 'Medical Summary', updated_at: new Date().toISOString() }
            : c,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate health summary';
      setError(msg);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setGeneratingHealthSummary(false);
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
              <Brain className="h-5 w-5" />
            </span>
            AI Medical Assistant
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ask questions about your treatment, symptoms, and care
          </p>
        </div>
        <button
          onClick={handleNewConversation}
          disabled={sending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700 disabled:opacity-60"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Conversation
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left sidebar: conversation list */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm lg:max-h-[calc(100vh-220px)]">
          <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            Conversations
          </h2>
          <div className="space-y-2 overflow-y-auto lg:max-h-[calc(100vh-280px)]">
            {loadingConversations ? (
              [0, 1, 2, 3].map((i) => <ConversationSkeleton key={i} />)
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">No conversations yet</p>
                <p className="mt-1 text-xs text-slate-400">
                  Start a new conversation to ask the AI assistant.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {conversations.map((conv, i) => (
                  <motion.div
                    key={conv.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border p-3 transition-all cursor-pointer',
                      selectedId === conv.id
                        ? 'border-teal-300 bg-teal-50/60'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50',
                    )}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        selectedId === conv.id
                          ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                          : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {conv.is_pinned && (
                          <Pin className="h-3 w-3 shrink-0 text-amber-500" fill="currentColor" />
                        )}
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {conv.title || 'Untitled'}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(conv.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(conv);
                        }}
                        disabled={actionId === conv.id}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 disabled:opacity-50"
                        aria-label={conv.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
                        title={conv.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        {actionId === conv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : conv.is_pinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        disabled={actionId === conv.id}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                        aria-label="Delete conversation"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right panel: chat interface */}
        <div className="flex min-h-[500px] flex-col rounded-2xl border border-slate-200/60 bg-white shadow-sm lg:max-h-[calc(100vh-220px)]">
          {!selectedId || !selectedConversation ? (
            // Empty state
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-400">
                <Sparkles className="h-8 w-8" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-700">
                {conversations.length === 0
                  ? 'Start your first conversation'
                  : 'Select a conversation'}
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-400">
                {conversations.length === 0
                  ? 'Ask the AI assistant about your treatment, symptoms, lab results, or self-care strategies.'
                  : 'Choose a conversation from the list, or start a new one to ask a question.'}
              </p>
              {conversations.length === 0 && (
                <button
                  onClick={handleNewConversation}
                  disabled={sending}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" /> New Conversation
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    {selectedConversation.title || 'Untitled'}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    AI Assistant · General guidance only
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTogglePin(selectedConversation)}
                    disabled={actionId === selectedConversation.id}
                    className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-500 disabled:opacity-50"
                    aria-label={selectedConversation.is_pinned ? 'Unpin' : 'Pin'}
                    title={selectedConversation.is_pinned ? 'Unpin' : 'Pin'}
                  >
                    {actionId === selectedConversation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedConversation.is_pinned ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteConversation(selectedConversation.id)}
                    disabled={actionId === selectedConversation.id}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                    aria-label="Delete conversation"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                <button
                  onClick={handleHealthSummary}
                  disabled={generatingHealthSummary}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
                  title="Generate a comprehensive medical summary using AI"
                >
                  {generatingHealthSummary ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HEALTH_SUMMARY_ACTION.icon className="h-3.5 w-3.5" />
                  )}
                  {HEALTH_SUMMARY_ACTION.label}
                </button>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.label)}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50"
                  >
                    <action.icon className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 space-y-4 overflow-y-auto p-4"
              >
                {loadingMessages ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => <MessageSkeleton key={i} />)}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                      <Brain className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      Ask your first question
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">
                      Type below or use a quick action above to get started.
                    </p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          'flex gap-2.5',
                          msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm',
                            msg.role === 'user'
                              ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {msg.role === 'user' ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Brain className="h-4 w-4" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                            msg.role === 'user'
                              ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700',
                          )}
                        >
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}

                {/* Typing indicator */}
                {sending && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="border-t border-slate-100 p-3"
              >
                {imageAttachment && (
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                    <span className="truncate">Image attached: {imageAttachment.name}</span>
                    <button type="button" onClick={() => setImageAttachment(null)} className="p-1" aria-label="Remove image attachment">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    disabled={sending}
                    placeholder="Ask about your treatment, symptoms, or care..."
                    className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30 disabled:opacity-60"
                  />
                  <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-700" title="Attach an oral report or lesion image">
                    <Paperclip className="h-4 w-4" />
                    <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => { handleImageAttachment(event.target.files?.[0]); event.target.value = ''; }} />
                  </label>
                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                    aria-label="Send message"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-2 px-1 text-[11px] text-slate-400">
                  ⚠️ AI provides general information only. Always consult your care team for medical decisions.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIEnginePage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <AIEngineContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
