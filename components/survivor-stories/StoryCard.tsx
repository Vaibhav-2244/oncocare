'use client';

import { ChevronRight, Play, ShieldCheck } from 'lucide-react';
import type { SurvivorStory } from '@/lib/survivor-stories-data';

interface StoryCardProps {
  story: SurvivorStory;
  onOpen: () => void;
}

export function StoryCard({ story, onOpen }: StoryCardProps) {
  const isVideo = Boolean(story.videoId);
  
  const avatarColors: Record<string, string> = {
    'avatar-teal': 'bg-teal-500',
    'avatar-blue': 'bg-blue-500',
    'avatar-purple': 'bg-purple-500',
    'avatar-orange': 'bg-orange-500',
    'avatar-coral': 'bg-red-400',
    'avatar-green': 'bg-green-500',
    'avatar-pink': 'bg-pink-500',
    'avatar-indigo': 'bg-indigo-500',
  };

  return (
    <article className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow p-5">
      {/* Avatar */}
      <div className={`w-12 h-12 rounded-lg ${avatarColors[story.avatarClass] || 'bg-teal-500'} text-white flex items-center justify-center mb-4 text-sm font-bold`}>
        {isVideo ? (
          <Play size={20} fill="currentColor" />
        ) : (
          story.initials
        )}
      </div>

      {/* Content */}
      <div className="space-y-3">
        {/* Top row with labels */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded">
            {story.cancerType}
          </span>
          {isVideo ? (
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded flex items-center gap-1">
              <Play size={10} fill="currentColor" />
              Video
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">
              Written
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-slate-900 text-sm line-clamp-2">
          {story.title}
        </h3>

        {/* Person and source */}
        <p className="text-xs text-slate-600">
          {story.name} · {story.sourceLabel || story.sourceName}
        </p>

        {/* Summary */}
        <p className="text-xs text-slate-600 line-clamp-3">
          {story.summary}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {(story.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck size={12} />
            Verified source
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            Explore
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
