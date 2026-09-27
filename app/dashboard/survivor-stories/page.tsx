'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Heart,
  Menu,
  Play,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { survivorStories } from '@/lib/survivor-stories-data';
import { StoryCard } from '@/components/survivor-stories/StoryCard';
import { StoryModal } from '@/components/survivor-stories/StoryModal';
import { HelpModal } from '@/components/survivor-stories/HelpModal';
import { useTranslations } from 'next-intl';

const cancerFilters = [
  "All",
  "Breast Cancer",
  "Lung Cancer",
  "Colorectal Cancer",
  "Cervical Cancer",
  "Blood Cancer",
  "Childhood Cancer",
  "Other",
];

const supportFilters = [
  "All Topics",
  "Emotional Support",
  "Life After Treatment",
  "Family",
  "Self Advocacy",
  "Young Adult",
  "Community",
  "Recovery",
];

export default function SurvivorStoriesPage() {
  const t = useTranslations('survivorStories');
  const [selectedCancer, setSelectedCancer] = useState("All");
  const [selectedTopic, setSelectedTopic] = useState("All Topics");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStory, setSelectedStory] = useState<typeof survivorStories[0] | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const featuredStory = useMemo(
    () => survivorStories.find((story) => story.featured) || survivorStories[0],
    []
  );

  const filteredStories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return survivorStories.filter((story) => {
      const cancerMatches =
        selectedCancer === "All" ||
        story.cancerType === selectedCancer ||
        story.category === selectedCancer ||
        story.tags?.includes(selectedCancer);

      const topicMatches =
        selectedTopic === "All Topics" ||
        story.tags?.includes(selectedTopic);

      const searchableText = [
        story.name,
        story.title,
        story.cancerType,
        story.category,
        story.sourceName,
        story.sourceLabel,
        story.summary,
        story.supportFocus,
        story.location,
        story.treatmentInstitution,
        story.region,
        ...(story.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        cancerMatches &&
        topicMatches &&
        searchableText.includes(query)
      );
    });
  }, [selectedCancer, selectedTopic, searchTerm]);

  const resetFilters = () => {
    setSelectedCancer("All");
    setSelectedTopic("All Topics");
    setSearchTerm("");
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedStory(null);
        setShowHelp(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const modalOpen = Boolean(selectedStory || showHelp);
    document.body.style.overflow = modalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedStory, showHelp]);

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
      <DashboardLayout dashboardTitle="Patient Dashboard">
        <div className="min-h-screen bg-slate-50">
      {/* PAGE HEADER */}
      <section className="bg-white border-b border-slate-200 px-6 py-8">
        <div className="max-w-5xl">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <span>{t('oncocare')}</span>
            <ChevronRight size={14} />
            <span>{t('survivorStories')}</span>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            {t('cancerSurvivorStories')}{' '}</h1>

          <p className="text-slate-600 text-lg max-w-2xl">
            {t('realExperiencesFromPeopleLivingThroughAndBeyondCancerCuratedToHelpYouFeelLessAlo')}{' '}</p>
        </div>
      </section>

      {/* FEATURED STORY */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
            {/* Video/Placeholder */}
            <div className="relative bg-gradient-to-br from-teal-100 to-teal-50 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
              {featuredStory.videoId ? (
                <>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${featuredStory.videoId}?rel=0&modestbranding=1`}
                    title={featuredStory.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                  />
                  <div className="absolute top-3 left-3 bg-teal-600 text-white text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                    <Play size={12} fill="currentColor" />
                    {t('survivorVideo')}{' '}</div>
                </>
              ) : (
                <button
                  className="flex flex-col items-center gap-4 hover:scale-105 transition-transform"
                  type="button"
                  onClick={() => setSelectedStory(featuredStory)}
                >
                  <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center">
                    <Play size={32} fill="currentColor" />
                  </div>
                  <span className="text-slate-700 font-semibold">
                    {t('readSurvivorStory')}{' '}</span>
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex flex-col justify-center space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded">
                  {featuredStory.format}
                </span>
                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded flex items-center gap-1">
                  <ShieldCheck size={12} />
                  {t('verifiedSource')}{' '}</span>
              </div>

              <p className="text-sm font-semibold text-teal-600 uppercase tracking-wide">
                {featuredStory.cancerType}
              </p>

              <h2 className="text-2xl font-bold text-slate-900">
                {featuredStory.title}
              </h2>

              <p className="text-slate-700">
                {t('aStoryFrom')}{' '}<strong>{featuredStory.name}</strong>
              </p>

              <p className="text-slate-600 line-clamp-3">
                {featuredStory.summary}
              </p>

              <div className="flex flex-wrap gap-2">
                {(featuredStory.tags || []).slice(0, 3).map((tag) => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                  type="button"
                  onClick={() => setSelectedStory(featuredStory)}
                >
                  {t('exploreStory')}{' '}<ChevronRight size={17} />
                </button>

                <a
                  className="text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
                  href={featuredStory.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('originalSource')}{' '}<ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FILTERS */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        {/* Cancer Type Filter */}
        <div className="mb-12">
          <div className="mb-6">
            <p className="text-sm font-semibold text-teal-600 uppercase tracking-wide mb-2">
              {t('exploreByCancerType')}{' '}</p>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">
                {t('findAStoryThatFeelsRelevantToYou')}{' '}</h2>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <ShieldCheck size={17} />
                <span>{t('storiesFromVerifiedOrganizations')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {cancerFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  selectedCancer === filter
                    ? "bg-teal-600 text-white"
                    : "bg-white text-slate-700 border border-slate-300 hover:border-teal-600"
                }`}
                onClick={() => setSelectedCancer(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Topic Filter */}
        <div className="mb-12">
          <p className="text-slate-900 font-semibold mb-4">
            {t('lookingForSupportAround')}{' '}</p>

          <div className="flex flex-wrap gap-3">
            {supportFilters.map((topic) => (
              <button
                key={topic}
                type="button"
                className={`px-4 py-2 rounded-full font-semibold transition-colors ${
                  selectedTopic === topic
                    ? "bg-teal-600 text-white"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
                onClick={() => setSelectedTopic(topic)}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* SEARCH */}
      <section className="px-6 max-w-5xl mx-auto mb-12">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={19} />
          <input
            type="search"
            placeholder={t('searchSurvivorStories')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t('searchSurvivorStories2')}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </section>

      {/* STORIES GRID */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm font-semibold text-teal-600 uppercase tracking-wide mb-2">
              {t('survivorStories2')}{' '}</p>
            <h2 className="text-2xl font-bold text-slate-900">
              {t('realExperiencesDifferentJourneys')}{' '}</h2>
          </div>
          <div className="text-slate-600 font-semibold">
            {filteredStories.length} {filteredStories.length === 1 ? t('story') : t('stories')}
          </div>
        </div>

        {filteredStories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onOpen={() => setSelectedStory(story)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Search size={24} className="text-slate-400" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t('noStoriesFound')}</h3>
            <p className="text-slate-600 mb-4">
              {t('tryAnotherCancerTypeSupportTopicOrSearchTerm')}{' '}</p>
            <button
              type="button"
              onClick={resetFilters}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {t('clearFilters')}{' '}</button>
          </div>
        )}
      </section>

      {/* SUPPORT BANNER */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-lg p-8 flex gap-4">
          <Heart size={24} className="text-rose-500 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {t('youDonAposTHaveToGoThroughThisAlone')}{' '}</h3>
            <p className="text-slate-700 mb-4">
              {t('survivorStoriesCanProvideConnectionAndPerspectiveButYourOwnCareTeamCanHelpWithPe')}{' '}</p>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {t('talkToCareTeam')}{' '}</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 px-6 py-8 mt-12">
        <div className="max-w-5xl mx-auto text-center text-slate-600">
          <p className="font-semibold text-slate-900 mb-2">
            {t('oncocareSurvivorStories')}{' '}</p>
          <p>
            {t('personalExperiencesAreSharedForEmotionalSupportAndEducationTheyAreNotMedicalAdvi')}{' '}</p>
        </div>
      </footer>

      {/* Floating Help Button */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full flex items-center justify-center shadow-lg transition-colors z-40"
        type="button"
        aria-label={t('openSupportAssistant')}
        onClick={() => setShowHelp(true)}
      >
        <CircleHelp size={26} />
      </button>

      {/* MODALS */}
      {selectedStory && (
        <StoryModal
          story={selectedStory}
          onClose={() => setSelectedStory(null)}
        />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
