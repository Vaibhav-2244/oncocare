'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Globe, Bell, Link2,
  Check, Loader2,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

type SettingsTab = 'language' | 'notifications' | 'connected';

const tabs: { id: SettingsTab; label: string; icon: typeof Globe }[] = [
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'connected', label: 'Connected Accounts', icon: Link2 },
];

function SettingsContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('language');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Language
  const [language, setLanguage] = useState('en');

  // Notification prefs from DB
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [medicineReminders, setMedicineReminders] = useState(true);
  const [appointmentReminders, setAppointmentReminders] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [newsletter, setNewsletter] = useState(false);

  const loadNotifPrefs = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    loadNotifPrefs();
  }, [loadNotifPrefs]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customize your experience and preferences</p>
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
                : 'border border-border bg-card text-muted-foreground hover:border-teal-300 hover:text-foreground'
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
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        {saved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-700">
            <Check className="h-4 w-4" />
            <span>Settings saved!</span>
          </div>
        )}

        {/* Language */}
        {activeTab === 'language' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-foreground">Language</h3>
            <p className="text-sm text-muted-foreground">Select your preferred language</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                    language === lang.code
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-border bg-card hover:border-teal-300'
                  )}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="text-sm font-medium text-foreground">{lang.name}</span>
                  {language === lang.code && <Check className="ml-auto h-4 w-4 text-teal-600" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-foreground">Notification Settings</h3>
            <p className="text-sm text-muted-foreground">Control what notifications you receive</p>
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
            <h3 className="text-base font-bold text-foreground">Connected Accounts</h3>
            <p className="text-sm text-muted-foreground">Manage your linked social accounts</p>
            <div className="space-y-3">
              {[
                { name: 'Google', icon: 'G', color: 'bg-red-50 text-red-600', connected: user?.email?.includes('@gmail') },
                { name: 'Apple ID', icon: '', color: 'bg-muted text-foreground', connected: false },
              ].map((account) => (
                <div key={account.name} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold', account.color)}>
                      {account.icon || account.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.connected ? 'Connected' : 'Not connected'}
                      </div>
                    </div>
                  </div>
                  <button
                    className={cn(
                      'rounded-xl px-4 py-2 text-xs font-semibold transition-all',
                      account.connected
                        ? 'border border-border text-muted-foreground hover:bg-muted'
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
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-teal-500' : 'bg-muted-foreground/30'
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
