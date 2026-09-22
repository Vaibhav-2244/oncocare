'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Send, Trash2, Loader2, Mail, MailOpen, Stethoscope, Search,
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

interface CareTeamMember {
  id: string;
  user_id: string | null;
  member_name: string;
  role: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
}

interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

function roleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes('doctor') || r.includes('physician') || r.includes('oncolog')) return Stethoscope;
  if (r.includes('nurse')) return Activity;
  if (r.includes('therap')) return TrendingUp;
  return Users;
}

function ContactSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
      <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-50" />
      </div>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex gap-2">
      <div className="h-7 w-7 animate-pulse rounded-full bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-50" />
      </div>
    </div>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<CareTeamMember[]>([]);
  const [selectedContact, setSelectedContact] = useState<CareTeamMember | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    setLoadingContacts(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('care_team')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (queryError) throw queryError;
      setContacts((data || []) as CareTeamMember[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load care team contacts');
    } finally {
      setLoadingContacts(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadContacts();
  }, [user, loadContacts]);

  const loadMessages = useCallback(async (contactId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    setError(null);
    try {
      // Messages between current user and the selected care team member.
      // We treat the care_team.id as the recipient_id / sender_id identifier.
      const { data, error: queryError } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${contactId}),and(recipient_id.eq.${user.id},sender_id.eq.${contactId})`,
        )
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setMessages((data || []) as MessageRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
    } else {
      setMessages([]);
    }
  }, [selectedContact, loadMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, sending]);

  const handleSelectContact = async (contact: CareTeamMember) => {
    setSelectedContact(contact);
    // Mark messages from this contact as read
    if (!user) return;
    try {
      const { error: updateError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', contact.id)
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      if (updateError) throw updateError;
    } catch {
      // Non-fatal; thread still loads
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !user || !selectedContact || sending) return;

    const content = trimmed;
    setInput('');
    setSending(true);
    setError(null);

    // Optimistic insert
    const optimistic: MessageRow = {
      id: `temp-${Date.now()}`,
      sender_id: user.id,
      recipient_id: selectedContact.id,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          recipient_id: selectedContact.id,
          content,
          is_read: false,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? (data as MessageRow) : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.member_name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      (c.specialty && c.specialty.toLowerCase().includes(q))
    );
  });

  // Group messages by date for display
  const formatDateGroup = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  // Build grouped message list
  const groupedMessages: { date: string; items: MessageRow[] }[] = [];
  messages.forEach((msg) => {
    const group = formatDateGroup(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === group) {
      lastGroup.items.push(msg);
    } else {
      groupedMessages.push({ date: group, items: [msg] });
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
            <MessageCircle className="h-5 w-5" />
          </span>
          Secure Messages
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Communicate securely with your care team
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left panel: contact list */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm lg:max-h-[calc(100vh-220px)]">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            Care Team
          </h2>
          <div className="space-y-2 overflow-y-auto lg:max-h-[calc(100vh-320px)]">
            {loadingContacts ? (
              [0, 1, 2, 3].map((i) => <ContactSkeleton key={i} />)
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                  <Users className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {search ? 'No contacts found' : 'No care team members'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {search
                    ? 'Try a different search term.'
                    : 'Add care team members to start messaging.'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredContacts.map((contact, i) => {
                  const Icon = roleIcon(contact.role);
                  const isActive = selectedContact?.id === contact.id;
                  return (
                    <motion.div
                      key={contact.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => handleSelectContact(contact)}
                      className={cn(
                        'group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
                        isActive
                          ? 'border-teal-300 bg-teal-50/60'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                          isActive
                            ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {contact.member_name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {contact.role}
                          {contact.specialty ? ` · ${contact.specialty}` : ''}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right panel: message thread */}
        <div className="flex min-h-[500px] flex-col rounded-2xl border border-slate-200/60 bg-white shadow-sm lg:max-h-[calc(100vh-220px)]">
          {!selectedContact ? (
            // Empty state
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-400">
                <Mail className="h-8 w-8" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-700">
                No conversation selected
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-400">
                {contacts.length === 0
                  ? 'Add care team members to start secure messaging.'
                  : 'Select a contact from the list to view or start a conversation.'}
              </p>
              {contacts.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  💡 Choose a care team member on the left to begin messaging.
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
                  {(() => {
                    const Icon = roleIcon(selectedContact.role);
                    return <Icon className="h-5 w-5" />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    {selectedContact.member_name}
                  </h3>
                  <p className="truncate text-xs text-slate-400">
                    {selectedContact.role}
                    {selectedContact.specialty ? ` · ${selectedContact.specialty}` : ''}
                  </p>
                </div>
                {selectedContact.phone && (
                  <span className="hidden text-xs text-slate-400 sm:inline">
                    {selectedContact.phone}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {loadingMessages ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => <MessageSkeleton key={i} />)}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      No messages yet
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">
                      Send your first message to {selectedContact.member_name} below.
                    </p>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.date} className="space-y-2">
                      <div className="sticky top-0 z-10 mx-auto w-fit rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {group.date}
                      </div>
                      <AnimatePresence initial={false}>
                        {group.items.map((msg) => {
                          const isMe = msg.sender_id === user?.id;
                          return (
                            <motion.div
                              key={msg.id}
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: isMe ? 20 : -20 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                'group flex items-end gap-2',
                                isMe ? 'flex-row-reverse' : 'flex-row',
                              )}
                            >
                              <div
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm',
                                  isMe
                                    ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                                    : 'bg-slate-200 text-slate-500',
                                )}
                              >
                                {isMe ? (
                                  <User className="h-3.5 w-3.5" />
                                ) : (
                                  (() => {
                                    const Icon = roleIcon(selectedContact.role);
                                    return <Icon className="h-3.5 w-3.5" />;
                                  })()
                                )}
                              </div>
                              <div
                                className={cn(
                                  'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                                  isMe
                                    ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-700',
                                )}
                              >
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <div
                                  className={cn(
                                    'mt-1 flex items-center gap-1 text-[10px]',
                                    isMe ? 'text-teal-100' : 'text-slate-400',
                                  )}
                                >
                                  {new Date(msg.created_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  {isMe &&
                                    (msg.is_read ? (
                                      <MailOpen className="h-3 w-3" />
                                    ) : (
                                      <Mail className="h-3 w-3" />
                                    ))}
                                </div>
                              </div>
                              {isMe && (
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  disabled={deletingId === msg.id}
                                  className="mb-1 rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-50"
                                  aria-label="Delete message"
                                >
                                  {deletingId === msg.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="border-t border-slate-100 p-3">
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
                    placeholder={`Message ${selectedContact.member_name}...`}
                    className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30 disabled:opacity-60"
                  />
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
                  🔒 Messages are secure and visible only to you and your care team.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <MessagesContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
