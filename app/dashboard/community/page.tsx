'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Plus, X, Heart, ThumbsUp, HandHeart, Send, Trash2, MessageSquare,
  Hash, CheckCircle2, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  category: string;
  member_count?: number;
}

interface CommunityPost {
  id: string;
  group_id: string;
  user_id: string;
  title: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  author_name?: string | null;
  like_count?: number;
  encourage_count?: number;
  pray_count?: number;
  user_reactions?: string[];
}

interface CommunityReply {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  author_name?: string | null;
}

interface CommunityMember {
  id: string;
  group_id: string;
  user_id: string;
}

type ReactionType = 'like' | 'encourage' | 'pray';

const REACTION_CONFIG: Record<ReactionType, { icon: LucideIcon; label: string; color: string; bg: string }> = {
  like: { icon: ThumbsUp, label: 'Like', color: 'text-blue-600', bg: 'bg-blue-50' },
  encourage: { icon: Heart, label: 'Encourage', color: 'text-rose-600', bg: 'bg-rose-50' },
  pray: { icon: HandHeart, label: 'Pray', color: 'text-amber-600', bg: 'bg-amber-50' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function GroupSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-50" />
      <div className="mt-3 h-6 w-20 animate-pulse rounded-full bg-slate-100" />
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 p-5">
      <div className="space-y-2">
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-50" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

function CommunityContent() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [repliesByPost, setRepliesByPost] = useState<Record<string, CommunityReply[]>>({});
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showView, setShowView] = useState<'all' | 'joined'>('all');
  const [showPostForm, setShowPostForm] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [reactingPostId, setReactingPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  // post form state
  const [postTitle, setPostTitle] = useState<string>('');
  const [postContent, setPostContent] = useState<string>('');
  const [postAnonymous, setPostAnonymous] = useState<boolean>(false);

  // Load all groups + joined groups
  const loadGroups = useCallback(async () => {
    if (!user) return;
    setLoadingGroups(true);
    setError(null);
    try {
      const [groupsRes, membersRes] = await Promise.all([
        supabase.from('community_groups').select('*').order('name', { ascending: true }),
        supabase.from('community_members').select('id, group_id, user_id').eq('user_id', user.id),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      if (membersRes.error) throw membersRes.error;

      const groupsData = (groupsRes.data || []) as CommunityGroup[];

      // Get member counts
      const memberCountPromises = groupsData.map((g) =>
        supabase.from('community_members').select('id', { count: 'exact', head: true }).eq('group_id', g.id),
      );
      const countResults = await Promise.all(memberCountPromises);
      const groupsWithCounts = groupsData.map((g, i) => ({
        ...g,
        member_count: countResults[i]?.count || 0,
      }));

      setGroups(groupsWithCounts);
      const joined = new Set((membersRes.data || []).map((m: CommunityMember) => m.group_id));
      setJoinedGroupIds(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoadingGroups(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadGroups();
  }, [user, loadGroups]);

  // Load posts for selected group
  const loadPosts = useCallback(async (groupId: string) => {
    if (!user) return;
    setLoadingPosts(true);
    setError(null);
    try {
      const { data: postsData, error: postsError } = await supabase
        .from('community_posts')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
      if (postsError) throw postsError;

      const posts = (postsData || []) as CommunityPost[];

      // Fetch author names for non-anonymous posts
      const authorIds = Array.from(new Set(posts.filter((p) => !p.is_anonymous).map((p) => p.user_id)));
      const authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', authorIds);
        (profilesData || []).forEach((p: { id: string; full_name: string | null }) => {
          authorMap[p.id] = p.full_name || 'Member';
        });
      }

      // Fetch reactions
      const postsWithExtras = await Promise.all(
        posts.map(async (p) => {
          const [reactionsRes, userReactionsRes] = await Promise.all([
            supabase.from('community_reactions').select('reaction_type').eq('post_id', p.id),
            supabase.from('community_reactions').select('reaction_type').eq('post_id', p.id).eq('user_id', user.id),
          ]);
          const counts: Record<string, number> = {};
          (reactionsRes.data || []).forEach((r: { reaction_type: string }) => {
            counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
          });
          return {
            ...p,
            author_name: p.is_anonymous ? null : authorMap[p.user_id] || 'Member',
            like_count: counts['like'] || 0,
            encourage_count: counts['encourage'] || 0,
            pray_count: counts['pray'] || 0,
            user_reactions: (userReactionsRes.data || []).map((r: { reaction_type: string }) => r.reaction_type),
          };
        }),
      );

      setPosts(postsWithExtras);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoadingPosts(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) loadPosts(selectedGroupId);
  }, [selectedGroupId, loadPosts]);

  // Load replies for a post
  const loadReplies = useCallback(async (postId: string) => {
    if (!user) return;
    try {
      const { data, error: repliesError } = await supabase
        .from('community_replies')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (repliesError) throw repliesError;

      const replies = (data || []) as CommunityReply[];
      const authorIds = Array.from(new Set(replies.filter((r) => !r.is_anonymous).map((r) => r.user_id)));
      const authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', authorIds);
        (profilesData || []).forEach((p: { id: string; full_name: string | null }) => {
          authorMap[p.id] = p.full_name || 'Member';
        });
      }
      const repliesWithNames = replies.map((r) => ({
        ...r,
        author_name: r.is_anonymous ? null : authorMap[r.user_id] || 'Member',
      }));
      setRepliesByPost((prev) => ({ ...prev, [postId]: repliesWithNames }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load replies');
    }
  }, [user]);

  const handleJoinGroup = async (groupId: string) => {
    if (!user) return;
    setJoiningId(groupId);
    try {
      const { error: insertError } = await supabase
        .from('community_members')
        .insert({ group_id: groupId, user_id: user.id });
      if (insertError) throw insertError;
      setJoinedGroupIds((prev) => new Set(Array.from(prev).concat(groupId)));
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group');
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedGroupId || !postTitle.trim() || !postContent.trim()) return;
    setSubmittingPost(true);
    setError(null);
    try {
      const payload = {
        group_id: selectedGroupId,
        user_id: user.id,
        title: postTitle.trim(),
        content: postContent.trim(),
        is_anonymous: postAnonymous,
      };
      const { data, error: insertError } = await supabase
        .from('community_posts')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      const newPost: CommunityPost = {
        ...(data as CommunityPost),
        author_name: postAnonymous ? null : user.profile?.full_name || 'Member',
        like_count: 0,
        encourage_count: 0,
        pray_count: 0,
        user_reactions: [],
      };
      setPosts((prev) => [newPost, ...prev]);
      setPostTitle('');
      setPostContent('');
      setPostAnonymous(false);
      setShowPostForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleReact = async (postId: string, reaction: ReactionType) => {
    if (!user) return;
    setReactingPostId(postId);
    try {
      const existing = posts.find((p) => p.id === postId);
      const hasReacted = existing?.user_reactions?.includes(reaction);

      if (hasReacted) {
        const { error: deleteError } = await supabase
          .from('community_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('reaction_type', reaction);
        if (deleteError) throw deleteError;
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const key = `${reaction}_count` as keyof Pick<CommunityPost, 'like_count' | 'encourage_count' | 'pray_count'>;
            return {
              ...p,
              [key]: Math.max(0, (p[key] as number) - 1),
              user_reactions: (p.user_reactions || []).filter((r) => r !== reaction),
            };
          }),
        );
      } else {
        const { error: insertError } = await supabase
          .from('community_reactions')
          .insert({ post_id: postId, user_id: user.id, reaction_type: reaction });
        if (insertError) throw insertError;
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const key = `${reaction}_count` as keyof Pick<CommunityPost, 'like_count' | 'encourage_count' | 'pray_count'>;
            return {
              ...p,
              [key]: (p[key] as number) + 1,
              user_reactions: [...(p.user_reactions || []), reaction],
            };
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to react to post');
    } finally {
      setReactingPostId(null);
    }
  };

  const handleReply = async (postId: string) => {
    if (!user) return;
    const content = (replyContent[postId] || '').trim();
    if (!content) return;
    setSubmittingReply(true);
    try {
      const payload = {
        post_id: postId,
        user_id: user.id,
        content,
        is_anonymous: false,
      };
      const { data, error: insertError } = await supabase
        .from('community_replies')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      const newReply: CommunityReply = {
        ...(data as CommunityReply),
        author_name: user.profile?.full_name || 'Member',
      };
      setRepliesByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newReply],
      }));
      setReplyContent((prev) => ({ ...prev, [postId]: '' }));
      setReplyingTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const visibleGroups =
    showView === 'joined'
      ? groups.filter((g) => joinedGroupIds.has(g.id))
      : groups;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Community Support</h1>
        <p className="mt-1 text-sm text-slate-500">Connect with others, share experiences, and find support</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left: Group list */}
        <div className="space-y-4">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => setShowView('all')}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                showView === 'all'
                  ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                  : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              All Groups
            </button>
            <button
              onClick={() => setShowView('joined')}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                showView === 'joined'
                  ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                  : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              My Groups ({joinedGroupIds.size})
            </button>
          </div>

          {/* Groups */}
          <div className="space-y-3">
            {loadingGroups ? (
              [0, 1, 2, 3].map((i) => <GroupSkeleton key={i} />)
            ) : visibleGroups.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-10 text-center shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                  <Users className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {showView === 'joined' ? 'You haven\'t joined any groups yet' : 'No groups available'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {showView === 'joined' && 'Browse all groups to find one to join.'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {visibleGroups.map((group, i) => {
                  const isJoined = joinedGroupIds.has(group.id);
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <motion.div
                      key={group.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      className={cn(
                        'cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all',
                        isSelected
                          ? 'border-teal-300 ring-1 ring-teal-200/40'
                          : 'border-slate-200/60 hover:border-slate-300',
                      )}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                          {group.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{group.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          <Hash className="h-2.5 w-2.5" />
                          {group.category}
                        </span>
                        <span className="text-xs text-slate-400">
                          {group.member_count || 0} members
                        </span>
                      </div>
                      {!isJoined && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinGroup(group.id);
                          }}
                          disabled={joiningId === group.id}
                          className="mt-3 w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                        >
                          {joiningId === group.id ? 'Joining...' : 'Join Group'}
                        </button>
                      )}
                      {isJoined && (
                        <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Joined
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right: Posts for selected group */}
        <div className="space-y-4">
          {!selectedGroupId ? (
            <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-16 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <MessageSquare className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">Select a group to view posts</p>
              <p className="mt-1 text-xs text-slate-400">
                Join a group and start sharing your experiences with the community.
              </p>
            </div>
          ) : (
            <>
              {/* Group header + create post */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedGroup?.name || 'Group'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedGroup?.member_count || 0} members · {posts.length} posts
                  </p>
                </div>
                {joinedGroupIds.has(selectedGroupId) && (
                  <button
                    onClick={() => setShowPostForm((v) => !v)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
                  >
                    {showPostForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {showPostForm ? 'Cancel' : 'Create Post'}
                  </button>
                )}
              </div>

              {/* Create post form */}
              <AnimatePresence>
                {showPostForm && joinedGroupIds.has(selectedGroupId) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <form
                      onSubmit={handleCreatePost}
                      className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
                    >
                      <h3 className="text-base font-bold text-slate-900">Create a New Post</h3>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Title</label>
                          <input
                            type="text"
                            value={postTitle}
                            onChange={(e) => setPostTitle(e.target.value)}
                            placeholder="Post title..."
                            required
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Content</label>
                          <textarea
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            rows={4}
                            placeholder="Share your thoughts, experiences, or questions..."
                            required
                            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={postAnonymous}
                            onChange={(e) => setPostAnonymous(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200"
                          />
                          Post anonymously
                        </label>
                      </div>
                      <div className="mt-5 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setShowPostForm(false)}
                          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingPost}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                        >
                          {submittingPost ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Post
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Posts */}
              {loadingPosts ? (
                [0, 1, 2].map((i) => <PostSkeleton key={i} />)
              ) : posts.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-12 text-center shadow-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                    <MessageSquare className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-700">No posts in this group yet</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {joinedGroupIds.has(selectedGroupId)
                      ? 'Be the first to share your story.'
                      : 'Join the group to start posting.'}
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {posts.map((post, i) => {
                    const isExpanded = expandedPostId === post.id;
                    return (
                      <motion.div
                        key={post.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm"
                      >
                        {/* Post header */}
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">
                            {(post.author_name || 'A')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {post.is_anonymous ? 'Anonymous' : post.author_name || 'Member'}
                            </p>
                            <p className="text-xs text-slate-400">{timeAgo(post.created_at)}</p>
                          </div>
                        </div>

                        {/* Post body */}
                        <h3 className="mt-3 text-sm font-bold text-slate-900">{post.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{post.content}</p>

                        {/* Reactions */}
                        <div className="mt-4 flex items-center gap-2">
                          {(['like', 'encourage', 'pray'] as ReactionType[]).map((reaction) => {
                            const config = REACTION_CONFIG[reaction];
                            const count = (post[`${reaction}_count` as keyof CommunityPost] as number) || 0;
                            const hasReacted = post.user_reactions?.includes(reaction);
                            const Icon = config.icon;
                            return (
                              <button
                                key={reaction}
                                onClick={() => handleReact(post.id, reaction)}
                                disabled={reactingPostId === post.id}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60',
                                  hasReacted
                                    ? cn(config.bg, config.color, 'border-transparent')
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" />
                                {count > 0 && count}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedPostId(null);
                              } else {
                                setExpandedPostId(post.id);
                                loadReplies(post.id);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {repliesByPost[post.id]?.length || 0}
                          </button>
                        </div>

                        {/* Replies */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                {(repliesByPost[post.id] || []).map((reply) => (
                                  <div key={reply.id} className="flex items-start gap-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-xs font-bold text-white">
                                      {(reply.author_name || 'A')[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-900">
                                          {reply.is_anonymous ? 'Anonymous' : reply.author_name || 'Member'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{timeAgo(reply.created_at)}</span>
                                      </div>
                                      <p className="mt-0.5 text-sm text-slate-600">{reply.content}</p>
                                    </div>
                                  </div>
                                ))}
                                {(repliesByPost[post.id] || []).length === 0 && (
                                  <p className="text-xs text-slate-400">No replies yet. Be the first to respond.</p>
                                )}

                                {/* Reply input */}
                                <div className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={replyContent[post.id] || ''}
                                    onChange={(e) =>
                                      setReplyContent((prev) => ({ ...prev, [post.id]: e.target.value }))
                                    }
                                    placeholder="Write a reply..."
                                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                                  />
                                  <button
                                    onClick={() => {
                                      setReplyingTo(post.id);
                                      handleReply(post.id);
                                    }}
                                    disabled={submittingReply && replyingTo === post.id}
                                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                                  >
                                    {submittingReply && replyingTo === post.id ? (
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <CommunityContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
