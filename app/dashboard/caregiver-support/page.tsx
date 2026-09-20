'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, BookOpen, Check, ChevronRight, ExternalLink, Heart, Loader2, Search, Users } from 'lucide-react';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

const navItems: NavItem[] = [
  { label: 'Caregiver Support', href: '/dashboard/caregiver-support', icon: Heart },
  { label: 'Ayurveda Support', href: '/dashboard/ayurveda-support', icon: Activity },
  { label: 'Patient Medications', href: '/dashboard/caregiver-medications', icon: Activity },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: Users },
  { label: 'Settings', href: '/dashboard/settings', icon: Users },
];

type CheckIn = { id: string; mood: string; severity: number; message: string | null; created_at: string };
type Resource = { id: string; title: string; category: string; description: string; content: string; reading_time: number };
type Group = { id: string; name: string; description: string; meeting_type: string; meeting_day: string | null; meeting_time: string | null; member_count: number; form_url: string | null };
type Tip = { id: string; title: string; content: string };
type QuickSupport = { title: string; content: string };

const moods = [
  ['supported', 'Supported'], ['okay', 'Okay'], ['tired', 'Tired'], ['overwhelmed', 'Overwhelmed'], ['low', 'Low'],
];

const moodSupport: Record<string, { level: string; message: string }> = {
  supported: { level: 'low', message: 'You are doing okay today. Remember that caring for yourself is part of caring for someone else.' },
  okay: { level: 'low', message: 'You are doing okay today. Remember that caring for yourself is part of caring for someone else.' },
  tired: { level: 'moderate', message: 'It sounds like you could use a little space to recharge. Even a short break can help.' },
  overwhelmed: { level: 'high', message: 'You are carrying a lot right now. Consider asking someone you trust to take one task off your plate.' },
  low: { level: 'urgent', message: 'You deserve support too. Please take a moment to rest and consider reaching out to someone who can share the caregiving load.' },
};

const quickSupport: QuickSupport[] = [
  { title: 'Take a 2-minute reset', content: 'Put both feet on the floor. Relax your shoulders. Breathe in slowly for 4 seconds, pause for 2 seconds, then breathe out for 6 seconds. Repeat for about 2 minutes. You do not need to solve anything during this pause.' },
  { title: 'Ask for help', content: 'Choose one specific task and ask one person to take it over. For example: “Could you handle dinner tonight?” or “Could you come with us to the appointment?” Specific requests are often easier for people to answer.' },
  { title: 'Talk to someone', content: 'You deserve a safe place to talk about what caregiving feels like. Consider a trusted friend or family member, your healthcare team, a social worker, counselor, or caregiver support group.' },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CaregiverSupportContent() {
  const { user } = useAuth();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [savedResourceIds, setSavedResourceIds] = useState<Set<string>>(new Set());
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [mood, setMood] = useState('okay');
  const [severity, setSeverity] = useState(5);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<'overview' | 'resources' | 'groups'>('overview');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedSupport, setSelectedSupport] = useState<QuickSupport | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [checkInResult, resourceResult, groupResult, savedResult, membershipResult, tipsResult] = await Promise.all([
        supabase.from('caregiver_check_ins').select('id, mood, severity, message, created_at').order('created_at', { ascending: false }).limit(30),
        supabase.from('caregiver_resources').select('id, title, category, description, content, reading_time').order('created_at', { ascending: false }),
        supabase.from('caregiver_support_groups').select('id, name, description, meeting_type, meeting_day, meeting_time, member_count, form_url').order('created_at', { ascending: true }),
        supabase.from('caregiver_saved_resources').select('resource_id'),
        supabase.from('caregiver_group_memberships').select('group_id'),
        supabase.from('caregiver_tips').select('id, title, content').order('created_at', { ascending: true }),
      ]);
      if (checkInResult.error) throw checkInResult.error;
      if (resourceResult.error) throw resourceResult.error;
      if (groupResult.error) throw groupResult.error;
      if (savedResult.error) throw savedResult.error;
      if (membershipResult.error) throw membershipResult.error;
      if (tipsResult.error) throw tipsResult.error;
      setCheckIns((checkInResult.data || []) as CheckIn[]);
      setResources((resourceResult.data || []) as Resource[]);
      setGroups((groupResult.data || []) as Group[]);
      setSavedResourceIds(new Set((savedResult.data || []).map((row) => row.resource_id)));
      setJoinedGroupIds(new Set((membershipResult.data || []).map((row) => row.group_id)));
      setTips((tipsResult.data || []) as Tip[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load caregiver support.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((resource) => !query || [resource.title, resource.category, resource.description, resource.content].join(' ').toLowerCase().includes(query));
  }, [resources, search]);
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups.filter((group) => !query || [group.name, group.description, group.meeting_day, group.meeting_type].join(' ').toLowerCase().includes(query));
  }, [groups, search]);

  const submitCheckIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !mood) return;
    setSaving(true); setError(null);
    try {
      const { data, error: insertError } = await supabase.from('caregiver_check_ins').insert({ mood, severity, message: message.trim() || null }).select('id, mood, severity, message, created_at').single();
      if (insertError) throw insertError;
      const support = moodSupport[mood] || moodSupport.okay;
      setSupportMessage(support.message);
      const { error: notificationError } = await supabase.from('notifications').insert({ title: 'Check-in saved', message: support.message, type: 'checkin' });
      if (notificationError) throw notificationError;
      setCheckIns((current) => [data as CheckIn, ...current]); setMessage('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save your check-in.');
    } finally { setSaving(false); }
  };

  const toggleResource = async (resource: Resource) => {
    if (!user) return;
    setActionId(resource.id); setError(null);
    try {
      if (savedResourceIds.has(resource.id)) {
        const { error: deleteError } = await supabase.from('caregiver_saved_resources').delete().eq('resource_id', resource.id);
        if (deleteError) throw deleteError;
        setSavedResourceIds((current) => { const next = new Set(current); next.delete(resource.id); return next; });
      } else {
        const { error: insertError } = await supabase.from('caregiver_saved_resources').insert({ resource_id: resource.id });
        if (insertError) throw insertError;
        setSavedResourceIds((current) => new Set(current).add(resource.id));
      }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Unable to update saved resources.'); }
    finally { setActionId(null); }
  };

  const toggleGroup = async (group: Group) => {
    if (!user) return;
    setActionId(group.id); setError(null);
    try {
      if (joinedGroupIds.has(group.id)) {
        const { error: deleteError } = await supabase.from('caregiver_group_memberships').delete().eq('group_id', group.id);
        if (deleteError) throw deleteError;
        setJoinedGroupIds((current) => { const next = new Set(current); next.delete(group.id); return next; });
      } else {
        const { error: insertError } = await supabase.from('caregiver_group_memberships').insert({ group_id: group.id });
        if (insertError) throw insertError;
        setJoinedGroupIds((current) => new Set(current).add(group.id));
      }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Unable to update group membership.'); }
    finally { setActionId(null); }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-semibold text-teal-700">Caregiver wellbeing</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Caregiver Support</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">A private place to check in, find practical support and connect with peer groups.</p></div>
        <div className="relative w-full lg:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search support" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-400" /></div>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Caregiving can be demanding. This space offers supportive information and tracking, not diagnosis or a substitute for your healthcare team. Contact your care team promptly when you are worried about yourself or the person you support.</div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Check-ins" value={checkIns.length} icon={Activity} />
        <Stat label="Saved resources" value={savedResourceIds.size} icon={BookOpen} />
        <Stat label="Peer groups" value={joinedGroupIds.size} icon={Users} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {([['overview', 'Overview'], ['resources', 'Resources'], ['groups', 'Peer Groups']] as const).map(([key, label]) => <button key={key} onClick={() => setSection(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${section === key ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}
      </div>

      {section === 'overview' && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
        <form onSubmit={submitCheckIn} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Heart className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">How are you doing today?</h2></div><p className="mt-1 text-sm text-slate-500">Your check-ins are private to your account.</p><div className="mt-5 grid gap-2 sm:grid-cols-5">{moods.map(([value, label]) => <button type="button" key={value} onClick={() => setMood(value)} className={`rounded-xl border px-2 py-3 text-sm font-medium ${mood === value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>{label}</button>)}</div><label className="mt-5 block text-sm text-slate-700">Severity: {severity}/10<input type="range" min="0" max="10" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} className="mt-2 w-full accent-teal-600" /></label><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={1000} placeholder="What would you like to note?" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" /><button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save check-in</button>{supportMessage && <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-800" role="status">{supportMessage}<button type="button" onClick={() => setSupportMessage(null)} className="ml-2 font-semibold text-teal-700">Dismiss</button></div>}</form>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Recent check-ins</h2><div className="mt-4 space-y-3">{checkIns.slice(0, 6).map((item) => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold capitalize text-slate-800">{item.mood}</span><span className="text-xs text-slate-500">{item.severity}/10</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>{item.message && <p className="mt-2 text-sm text-slate-600">{item.message}</p>}</div>)}{checkIns.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No check-ins yet. Your first one can be brief.</p>}</div></section>
      </div>}

      {section === 'overview' && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Caregiver tip</p><h2 className="mt-1 font-bold text-slate-900">{tips[tipIndex]?.title || 'Support is available when you need it.'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{tips[tipIndex]?.content || 'Take one small step today and reach out to someone you trust.'}</p></div><span className="text-sm font-bold text-teal-700">{tips.length ? `${tipIndex + 1}/${tips.length}` : ''}</span></div><button type="button" disabled={!tips.length} onClick={() => setTipIndex((index) => (index + 1) % tips.length)} className="mt-4 rounded-xl border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 disabled:opacity-50">Show another tip</button></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Quick support</h2><p className="mt-1 text-sm text-slate-500">Small things that can help right now.</p><div className="mt-4 space-y-2">{quickSupport.map((support) => <button type="button" key={support.title} onClick={() => setSelectedSupport(support)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-teal-300"><span className="text-sm font-semibold text-slate-800">{support.title}</span><ChevronRight className="h-4 w-4 text-teal-700" /></button>)}</div></section></div>}

      {section === 'resources' && <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Support resources</h2><p className="text-sm text-slate-500">Practical information for sustainable caregiving.</p></div><span className="text-xs text-slate-500">{filteredResources.length} resources</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredResources.map((resource) => <article key={resource.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">{resource.category}</span><button onClick={() => void toggleResource(resource)} disabled={actionId === resource.id} aria-label={savedResourceIds.has(resource.id) ? 'Unsave resource' : 'Save resource'} className="text-teal-700">{actionId === resource.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${savedResourceIds.has(resource.id) ? 'fill-current' : ''}`} />}</button></div><h3 className="mt-4 font-bold text-slate-900">{resource.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{resource.description}</p><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{resource.reading_time} min read</span><button onClick={() => setSelectedResource(resource)} className="inline-flex items-center gap-1 font-semibold text-teal-700">Read details <ChevronRight className="h-3.5 w-3.5" /></button></div></article>)}{filteredResources.length === 0 && <Empty text="No resources match your search." />}</div></section>}

      {section === 'groups' && <section><div className="mb-4"><h2 className="text-lg font-bold text-slate-900">Peer support groups</h2><p className="text-sm text-slate-500">Join or leave groups using your authenticated OncoCare+ account.</p></div><div className="grid gap-4 lg:grid-cols-2">{filteredGroups.map((group) => { const joined = joinedGroupIds.has(group.id); return <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">{group.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{group.description}</p></div><Users className="h-5 w-5 shrink-0 text-teal-600" /></div><p className="mt-4 text-xs text-slate-500">{group.meeting_type} · {group.meeting_day || 'Schedule varies'} {group.meeting_time || ''} · {group.member_count} members</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setSelectedGroup(group)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">View details</button>{group.form_url && <a href={group.form_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700">Open group form <ExternalLink className="h-3.5 w-3.5" /></a>}<button onClick={() => void toggleGroup(group)} disabled={actionId === group.id} className={`rounded-xl px-3 py-2 text-sm font-semibold ${joined ? 'border border-rose-200 text-rose-700' : 'bg-teal-700 text-white'} disabled:opacity-60`}>{actionId === group.id ? 'Saving...' : joined ? 'Leave group' : 'Join group'}</button></div></article> })}{filteredGroups.length === 0 && <Empty text="No peer groups match your search." />}</div></section>}

      {selectedResource && <Modal title={selectedResource.title} onClose={() => setSelectedResource(null)}><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{selectedResource.category} · {selectedResource.reading_time} min read</p><p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{selectedResource.content}</p></Modal>}
      {selectedGroup && <Modal title={selectedGroup.name} onClose={() => setSelectedGroup(null)}><p className="text-sm leading-7 text-slate-600">{selectedGroup.description}</p><p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{selectedGroup.meeting_type} · {selectedGroup.meeting_day || 'Schedule varies'} {selectedGroup.meeting_time || ''}</p><div className="mt-5 flex flex-wrap gap-2">{selectedGroup.form_url && <a href={selectedGroup.form_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-teal-200 px-4 py-2.5 text-sm font-semibold text-teal-700">Open group form <ExternalLink className="h-3.5 w-3.5" /></a>}<button onClick={() => { void toggleGroup(selectedGroup); setSelectedGroup(null); }} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">{joinedGroupIds.has(selectedGroup.id) ? 'Leave group' : 'Join group'}</button></div></Modal>}
      {selectedSupport && <Modal title={selectedSupport.title} onClose={() => setSelectedSupport(null)}><p className="text-sm leading-7 text-slate-600">{selectedSupport.content}</p></Modal>}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Activity }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-teal-600" /><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true"><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button onClick={onClose} aria-label="Close details" className="text-slate-400 hover:text-slate-700">×</button></div>{children}</div></div>; }

export default function CaregiverSupportPage() {
  return <ProtectedRoute allowedRoles={['patient', 'family_caregiver']}><DashboardLayout navItems={navItems} dashboardTitle="Caregiver Dashboard"><CaregiverSupportContent /></DashboardLayout></ProtectedRoute>;
}