'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, Phone, MapPin, Heart, Shield, Bell, Lock, Trash2,
  Camera, Save, Check, AlertCircle, Loader2, Calendar, Eye, EyeOff,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type Tab = 'personal' | 'emergency' | 'notifications' | 'privacy' | 'security' | 'delete';

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Personal Details', icon: User },
  { id: 'emergency', label: 'Emergency Contacts', icon: Heart },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'delete', label: 'Account Deletion', icon: Trash2 },
];

function ProfileContent() {
  const t = useTranslations('profile');
  const { user, refreshUser, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Personal details
  const [fullName, setFullName] = useState(user?.profile?.full_name || '');
  const [phone, setPhone] = useState(user?.profile?.phone || '');
  const [address, setAddress] = useState(user?.profile?.address || '');
  const [city, setCity] = useState(user?.profile?.city || '');
  const [state, setState] = useState(user?.profile?.state || '');
  const [pincode, setPincode] = useState(user?.profile?.pincode || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.profile?.date_of_birth || '');
  const [gender, setGender] = useState(user?.profile?.gender || 'prefer_not_to_say');
  const [bio, setBio] = useState(user?.profile?.bio || '');

  // Emergency contacts
  const [emName, setEmName] = useState(user?.profile?.emergency_contact_name || '');
  const [emPhone, setEmPhone] = useState(user?.profile?.emergency_contact_phone || '');
  const [emRelation, setEmRelation] = useState(user?.profile?.emergency_contact_relation || '');

  // Notification prefs
  const [notifEmail, setNotifEmail] = useState(user?.profile?.notification_email ?? true);
  const [notifPush, setNotifPush] = useState(user?.profile?.notification_push ?? true);
  const [notifSms, setNotifSms] = useState(user?.profile?.notification_sms ?? false);

  // Privacy
  const [profileVisible, setProfileVisible] = useState(user?.profile?.privacy_profile_visible ?? true);
  const [showActivity, setShowActivity] = useState(user?.profile?.privacy_show_activity ?? false);

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleSavePersonal = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({
      full_name: fullName,
      phone,
      address,
      city,
      state,
      pincode,
      date_of_birth: dateOfBirth || null,
      gender,
      bio,
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleSaveEmergency = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({
      emergency_contact_name: emName,
      emergency_contact_phone: emPhone,
      emergency_contact_relation: emRelation,
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({
      notification_email: notifEmail,
      notification_push: notifPush,
      notification_sms: notifSms,
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleSavePrivacy = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({
      privacy_profile_visible: profileVisible,
      privacy_show_activity: showActivity,
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user!.email,
      password: currentPassword,
    });
    if (signInError) {
      setError('Current password is incorrect.');
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      setError('Type "DELETE" to confirm account deletion.');
      return;
    }
    setDeleteLoading(true);
    setError(null);

    const { error: updateError } = await supabase.from('profiles').update({
      full_name: 'Deleted User',
      bio: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      pincode: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      emergency_contact_relation: null,
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
      setDeleteLoading(false);
      return;
    }

    await signOut();
    window.location.href = '/';
  };

  const initials = fullName
    ? fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('profileSettings')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('manageYourPersonalInformationAndPreferences')}</p>
      </div>

      {/* Profile header card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="relative h-24 bg-gradient-to-r from-teal-500 to-emerald-500">
          <div className="absolute inset-0 bg-grid-dark opacity-20" />
        </div>
        <div className="relative z-10 px-6 pb-6">
          <div className="-mt-10 flex items-end gap-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-2xl font-bold text-white shadow-lg ring-4 ring-white">
                {initials}
              </div>
            </div>
            <div className="pb-1">
              <h2 className="text-lg font-bold text-slate-900">{fullName || t('user')}</h2>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setError(null); setSaved(false); }}
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

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-700">
            <Check className="h-4 w-4" />
            <span>{t('savedSuccessfully')}</span>
          </div>
        )}

        {/* Personal Details */}
        {activeTab === 'personal' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">{t('personalInformation')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('fullName')} icon={User} value={fullName} onChange={setFullName} />
              <Field label={t('email')} icon={Mail} value={user?.email || ''} onChange={() => {}} disabled />
              <Field label={t('phone')} icon={Phone} value={phone} onChange={setPhone} placeholder="+91..." />
              <Field label={t('dateOfBirth')} icon={Calendar} value={dateOfBirth} onChange={setDateOfBirth} type="date" />
              <Field label={t('address')} icon={MapPin} value={address} onChange={setAddress} placeholder={t('streetAddress')} />
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('city')} value={city} onChange={setCity} />
                <Field label={t('state')} value={state} onChange={setState} />
              </div>
              <Field label={t('pincode')} value={pincode} onChange={setPincode} />
              <div>
                <label className="text-sm font-semibold text-slate-700">{t('gender')}</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                >
                  <option value="prefer_not_to_say">{t('preferNotToSay')}</option>
                  <option value="male">{t('male')}</option>
                  <option value="female">{t('female')}</option>
                  <option value="other">{t('other')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">{t('bio')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder={t('tellUsAboutYourself')}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
              />
            </div>
            <SaveButton onClick={handleSavePersonal} saving={saving} />
          </div>
        )}

        {/* Emergency Contacts */}
        {activeTab === 'emergency' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">{t('emergencyContact')}</h3>
            <p className="text-sm text-slate-500">{t('thisContactWillBeNotifiedInCaseOfAnEmergency')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('contactName')} icon={User} value={emName} onChange={setEmName} placeholder={t('emergencyContactName')} />
              <Field label={t('contactPhone')} icon={Phone} value={emPhone} onChange={setEmPhone} placeholder="+91..." />
              <Field label={t('relationship')} value={emRelation} onChange={setEmRelation} placeholder={t('eGSpouseParentSibling')} />
            </div>
            <SaveButton onClick={handleSaveEmergency} saving={saving} />
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">{t('notificationPreferences')}</h3>
            <div className="space-y-3">
              <ToggleRow label={t('emailNotifications')} desc="Receive notifications via email" checked={notifEmail} onChange={setNotifEmail} />
              <ToggleRow label={t('pushNotifications')} desc="Receive push notifications in your browser" checked={notifPush} onChange={setNotifPush} />
              <ToggleRow label={t('smsNotifications')} desc="Receive notifications via SMS" checked={notifSms} onChange={setNotifSms} />
            </div>
            <SaveButton onClick={handleSaveNotifications} saving={saving} />
          </div>
        )}

        {/* Privacy */}
        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">{t('privacySettings')}</h3>
            <div className="space-y-3">
              <ToggleRow label={t('profileVisible')} desc="Allow other users to view your profile" checked={profileVisible} onChange={setProfileVisible} />
              <ToggleRow label={t('showActivityStatus')} desc="Show when you are active on the platform" checked={showActivity} onChange={setShowActivity} />
            </div>
            <SaveButton onClick={handleSavePrivacy} saving={saving} />
          </div>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">{t('changePassword')}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">{t('currentPassword')}</label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder={t('enterCurrentPassword')}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">{t('newPassword')}</label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder={t('atLeast8Characters')}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">{t('confirmNewPassword')}</label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    placeholder={t('reEnterNewPassword')}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                  <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('updatePassword')}{' '}</button>
          </form>
        )}

        {/* Account Deletion */}
        {activeTab === 'delete' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-bold text-rose-900">{t('deleteAccount')}</h3>
              </div>
              <p className="mt-2 text-sm text-rose-700">
                {t('thisActionIsIrreversibleAllYourPersonalDataWillBePermanentlyRemovedYourAppointme')}{' '}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">
                {t('type')}{' '}<span className="font-mono font-bold text-rose-600">{t('delete')}</span> {t('toConfirm')}{' '}</label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={t('delete')}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200/30"
              />
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteLoading || deleteConfirm !== 'DELETE'}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('deleteMyAccount')}{' '}</button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({
  label, icon: Icon, value, onChange, type = 'text', placeholder, disabled,
}: {
  label: string;
  icon?: typeof User;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <div className="relative mt-1.5">
        {Icon && <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30',
            Icon ? 'pl-10 pr-4' : 'px-4',
            disabled && 'cursor-not-allowed bg-slate-50 text-slate-400'
          )}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{desc}</div>
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

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  const t = useTranslations('profile');
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {t('saveChanges')}{' '}</button>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Profile">
        <ProfileContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
