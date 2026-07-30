'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Moon, Sun, Monitor, Globe, Accessibility, Bell, Link2,
  Check, Loader2, Shield, Eye, Type, Volume2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

type SettingsTab = 'appearance' | 'language' | 'accessibility' | 'notifications' | 'connected';

const tabs: { id: SettingsTab; label: string; icon: typeof Moon }[] = [
  { id: 'appearance', label: 'Appearance', icon: Sun },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'connected', label: 'Connected Accounts', icon: Link2 },
];

function SettingsContent() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Language
  const [language, setLanguage] = useState('en');

  // Accessibility
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  // Notification prefs from DB
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [medicineReminders, setMedicineReminders] = useState(true);
  const [appointmentReminders, setAppointmentReminders] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [newsletter, setNewsletter] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadNotifPrefs();
  }, []);

  const loadNotifPrefs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setEmailNotif(data.email_notifications);
      setPushNotif(data.push_notifications);
      setSmsNotif(data.sms_notifications);
      setMedicineReminders(data.medicine_reminders);
      setAppointmentReminders(data.appointment_reminders);
      setPriceAlerts(data.price_alerts);
      setNewsletter(data.newsletter);
    }
  };

  const handleSaveNotifs = async () => {
    if (!user) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('notification_preferences').update({
        email_notifications: emailNotif,
        push_notifications: pushNotif,
        sms_notifications: smsNotif,
        medicine_reminders: medicineReminders,
        appointment_reminders: appointmentReminders,
        price_alerts: priceAlerts,
        newsletter,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    } else {
      await supabase.from('notification_preferences').insert({
        user_id: user.id,
        email_notifications: emailNotif,
        push_notifications: pushNotif,
        sms_notifications: smsNotif,
        medicine_reminders: medicineReminders,
        appointment_reminders: appointmentReminders,
        price_alerts: priceAlerts,
        newsletter,
      });
    }
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'हिन्दी (Hindi)', flag: '🇮🇳' },
    { code: 'ta', name: 'தமிழ் (Tamil)', flag: '🇮🇳' },
    { code: 'te', name: 'తెలుగు (Telugu)', flag: '🇮🇳' },
    { code: 'bn', name: 'বাংলা (Bengali)', flag: '🇮🇳' },
    { code: 'mr', name: 'मराठी (Marathi)', flag: '🇮🇳' },
    { code: 'kn', name: 'ಕನ್ನಡ (Kannada)', flag: '🇮🇳' },
    { code: 'ml', name: 'മലയാളം (Malayalam)', flag: '🇮🇳' },
  ];

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Customize your experience and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/20'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-600'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
      >
        {saved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-700">
            <Check className="h-4 w-4" />
            <span>Settings saved!</span>
          </div>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Theme</h3>
            <p className="text-sm text-slate-500">Choose how OncoCare+ looks to you</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                    mounted && theme === option.value
                      ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-500/10'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  )}
                >
                  <option.icon className={cn('h-6 w-6', mounted && theme === option.value ? 'text-teal-600' : 'text-slate-400')} />
                  <span className="text-sm font-semibold text-slate-800">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Language */}
        {activeTab === 'language' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Language</h3>
            <p className="text-sm text-slate-500">Select your preferred language</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                    language === lang.code
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  )}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="text-sm font-medium text-slate-800">{lang.name}</span>
                  {language === lang.code && <Check className="ml-auto h-4 w-4 text-teal-600" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Accessibility */}
        {activeTab === 'accessibility' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Accessibility</h3>
            <p className="text-sm text-slate-500">Adjust the platform for your needs</p>
            <div className="space-y-3">
              <ToggleRow icon={Eye} label="High Contrast" desc="Increase visual contrast for better readability" checked={highContrast} onChange={setHighContrast} />
              <ToggleRow icon={Type} label="Large Text" desc="Increase font size throughout the platform" checked={largeText} onChange={setLargeText} />
              <ToggleRow icon={Volume2} label="Reduce Motion" desc="Minimize animations and transitions" checked={reduceMotion} onChange={setReduceMotion} />
              <ToggleRow icon={Accessibility} label="Screen Reader Optimizations" desc="Enhance compatibility with screen readers" checked={screenReader} onChange={setScreenReader} />
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Notification Settings</h3>
            <p className="text-sm text-slate-500">Control what notifications you receive</p>
            <div className="space-y-3">
              <ToggleRow icon={Bell} label="Email Notifications" desc="General email notifications" checked={emailNotif} onChange={setEmailNotif} />
              <ToggleRow icon={Bell} label="Push Notifications" desc="Browser push notifications" checked={pushNotif} onChange={setPushNotif} />
              <ToggleRow icon={Bell} label="SMS Notifications" desc="Text message notifications" checked={smsNotif} onChange={setSmsNotif} />
              <ToggleRow icon={Bell} label="Medicine Reminders" desc="Reminders to take your medication" checked={medicineReminders} onChange={setMedicineReminders} />
              <ToggleRow icon={Bell} label="Appointment Reminders" desc="Reminders for upcoming appointments" checked={appointmentReminders} onChange={setAppointmentReminders} />
              <ToggleRow icon={Bell} label="Price Alerts" desc="Alerts when watched medicine prices drop" checked={priceAlerts} onChange={setPriceAlerts} />
              <ToggleRow icon={Bell} label="Newsletter" desc="Monthly newsletter with updates and tips" checked={newsletter} onChange={setNewsletter} />
            </div>
            <button
              onClick={handleSaveNotifs}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Notification Settings
            </button>
          </div>
        )}

        {/* Connected Accounts */}
        {activeTab === 'connected' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Connected Accounts</h3>
            <p className="text-sm text-slate-500">Manage your linked social accounts</p>
            <div className="space-y-3">
              {[
                { name: 'Google', icon: 'G', color: 'bg-red-50 text-red-600', connected: user?.email?.includes('@gmail') },
                { name: 'Apple ID', icon: '', color: 'bg-slate-100 text-slate-900', connected: false },
              ].map((account) => (
                <div key={account.name} className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold', account.color)}>
                      {account.icon || account.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{account.name}</div>
                      <div className="text-xs text-slate-500">
                        {account.connected ? 'Connected' : 'Not connected'}
                      </div>
                    </div>
                  </div>
                  <button
                    className={cn(
                      'rounded-xl px-4 py-2 text-xs font-semibold transition-all',
                      account.connected
                        ? 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/20'
                    )}
                  >
                    {account.connected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ToggleRow({
  icon: Icon, label, desc, checked, onChange,
}: {
  icon: typeof Bell; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{label}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-teal-500' : 'bg-slate-300'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Settings">
        <SettingsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
