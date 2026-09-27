'use client';

import { ExternalLink, ShieldCheck, X } from 'lucide-react';
import type { SurvivorStory } from '@/lib/survivor-stories-data';
import { useTranslations } from 'next-intl';

interface StoryModalProps {
  story: SurvivorStory;
  onClose: () => void;
}

export function StoryModal({ story, onClose }: StoryModalProps) {
  const t = useTranslations('components.survivorStories.storymodal');
  const isVideo = Boolean(story.videoId);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-h-[90vh] overflow-y-auto max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg z-10"
          type="button"
          aria-label={t('closeStory')}
          onClick={onClose}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded">
              {story.cancerType}
            </span>
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded flex items-center gap-1">
              <ShieldCheck size={12} />
              {t('verifiedSource')}{' '}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {story.title}
          </h2>
          <p className="text-slate-600">
            {t('storyFrom')}{' '}<strong>{story.name}</strong>
          </p>
        </div>

        {/* Video (if applicable) */}
        {isVideo && (
          <div className="px-6 pt-6 pb-4">
            <div className="relative w-full bg-slate-900 rounded-lg overflow-hidden aspect-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${story.videoId}?rel=0&modestbranding=1`}
                title={story.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Content Sections */}
        <div className="px-6 py-4 space-y-6">
          {/* About this story */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
              {t('aboutThisStory')}{' '}</h3>
            <p className="text-slate-700">
              {story.summary}
            </p>
          </section>

          {/* Why this may feel relevant */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
              {t('whyThisMayFeelRelevant')}{' '}</h3>
            <p className="text-slate-700">
              {story.supportFocus}
            </p>
          </section>

          {/* Quote (if available) */}
          {story.quote && (
            <blockquote className="border-l-4 border-teal-500 pl-4 py-2 italic text-slate-700 bg-teal-50">
              {t('quot')}{story.quote}{t('quot')}{' '}</blockquote>
          )}

          {/* Story Details */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold">
                {t('location')}{' '}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {story.location || t('notSpecified')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold">
                {t('treatmentInstitution')}{' '}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {story.treatmentInstitution || t('notSpecified')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold">
                {t('storyType')}{' '}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {story.format}
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {(story.tags || []).map((tag) => (
              <span key={tag} className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>

          {/* Source Info */}
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold mb-2">
              {t('originalSource')}{' '}</p>
            <p className="text-sm font-semibold text-slate-900 mb-3">
              {story.sourceLabel || story.sourceName}
            </p>
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 font-semibold text-sm"
            >
              {isVideo ? t('watchOriginalVideo') : t('readOriginalStory')}
              <ExternalLink size={14} />
            </a>
          </div>

          {/* YouTube Fallback (for videos) */}
          {isVideo && (
            <a
              className="block text-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
              href={story.videoWatchUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t('videoNotLoadingOpenDirectlyOnYoutube')}{' '}<ExternalLink size={13} className="inline ml-2" />
            </a>
          )}
        </div>

        {/* Disclaimer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3 text-sm text-slate-700">
          <ShieldCheck size={18} className="flex-shrink-0 text-teal-600 mt-0.5" />
          <p>
            {t('thisIsAPersonalExperienceSharedForEmotionalSupportAndEducationItDoesNotReplaceMe')}{' '}</p>
        </div>
      </div>
    </div>
  );
}
