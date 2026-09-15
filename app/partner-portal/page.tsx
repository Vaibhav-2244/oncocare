'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, ShieldCheck, FileText, Package, BarChart3, Mail,
  CheckCircle2, Upload, ArrowLeft, Store, TrendingUp, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const portalFeatures = [
  { icon: ShieldCheck, title: 'Business Verification', description: 'Complete GST and business registration verification online.' },
  { icon: FileText, title: 'License Upload', description: 'Upload your pharmacy license and regulatory documents securely.' },
  { icon: Package, title: 'Inventory Management', description: 'Manage your medicine catalog, stock levels, and pricing in real-time.' },
  { icon: BarChart3, title: 'Analytics Dashboard', description: 'View search analytics, customer enquiries, and performance metrics.' },
  { icon: Mail, title: 'Order Enquiry Management', description: 'Respond to patient enquiries and manage order requests efficiently.' },
  { icon: TrendingUp, title: 'Offers & Discounts', description: 'Create and manage special offers for cancer patients.' },
];

const registrationSteps = [
  { step: '01', title: 'Business Verification', description: 'Enter your pharmacy name, GST number, and business details.' },
  { step: '02', title: 'License Upload', description: 'Upload your pharmacy license and regulatory certificates.' },
  { step: '03', title: 'Catalog Setup', description: 'Add your medicine inventory with pricing and stock information.' },
  { step: '04', title: 'Go Live', description: 'Get verified and start receiving patient enquiries.' },
];

export default function PartnerPortalPage() {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    pharmacyName: '',
    gstNumber: '',
    licenseNumber: '',
    city: '',
    state: '',
    contactNumber: '',
    email: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white pt-20">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <a href="/medicine-finder" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-deep">
          <ArrowLeft className="h-4 w-4" />
          Back to Medicine Finder
        </a>

        {/* Hero */}
        <div className="mt-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/60 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-emerald-deep">
            <Store className="h-3.5 w-3.5" />
            Pharmacy Partner Portal
          </span>
          <h1 className="mt-6 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Become a <span className="gradient-text">Verified Pharmacy Partner</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-slate-600 sm:text-lg">
            Join OncoCare+&apos;s network of trusted pharmacies. Reach cancer patients across India, manage your inventory online, and grow your business.
          </p>
          {!showForm && !submitted && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-deep to-teal-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl hover:shadow-teal-500/40 hover:-translate-y-0.5"
            >
              Register Your Pharmacy
              <Building2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* Registration form */}
          {showForm && !submitted && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto mt-12 max-w-2xl"
            >
              <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-slate-200/60 bg-white p-8 shadow-lg">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Pharmacy Registration</h2>
                  <p className="text-sm text-slate-500">Fill in your details to get started</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Pharmacy Name" value={formData.pharmacyName} onChange={(v) => setFormData({ ...formData, pharmacyName: v })} required />
                  <FormField label="GST Number" value={formData.gstNumber} onChange={(v) => setFormData({ ...formData, gstNumber: v })} required placeholder="GST29XXXXX..." />
                  <FormField label="License Number" value={formData.licenseNumber} onChange={(v) => setFormData({ ...formData, licenseNumber: v })} required />
                  <FormField label="Contact Number" value={formData.contactNumber} onChange={(v) => setFormData({ ...formData, contactNumber: v })} required placeholder="+91..." />
                  <FormField label="City" value={formData.city} onChange={(v) => setFormData({ ...formData, city: v })} required />
                  <FormField label="State" value={formData.state} onChange={(v) => setFormData({ ...formData, state: v })} required />
                  <FormField label="Email" type="email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} required />
                </div>

                {/* License upload */}
                <div>
                  <label className="text-sm font-semibold text-slate-700">Upload Pharmacy License</label>
                  <div className="mt-2 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 transition-colors hover:border-teal-300">
                    <div className="text-center">
                      <Upload className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-2 text-xs text-slate-500">Click to upload or drag and drop</p>
                      <p className="text-[10px] text-slate-400">PDF, PNG, JPG up to 5MB</p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-deep to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl"
                >
                  Submit Registration
                </button>
              </form>
            </motion.div>
          )}

          {/* Success state */}
          {submitted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mx-auto mt-12 max-w-lg rounded-3xl border border-teal-200/40 bg-gradient-to-br from-teal-50 to-emerald-50 p-12 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep to-teal-400 shadow-lg shadow-teal-500/20">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-slate-900">Registration Submitted!</h2>
              <p className="mt-2 text-sm text-slate-600">
                Thank you for your interest. Our team will verify your details and contact you within 48 hours.
              </p>
              <button
                onClick={() => { setSubmitted(false); setShowForm(false); }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-teal-300 hover:text-emerald-deep"
              >
                Back to Portal
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Features grid (always visible) */}
        {!showForm && (
          <>
            <div className="mt-16">
              <h2 className="text-center text-2xl font-bold text-slate-900">
                Everything you need to <span className="gradient-text">manage your pharmacy</span>
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {portalFeatures.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:shadow-slate-900/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-emerald-deep ring-1 ring-teal-200/40">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-900">{feature.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Registration steps */}
            <div className="mt-16">
              <h2 className="text-center text-2xl font-bold text-slate-900">
                How to <span className="gradient-text">get started</span>
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {registrationSteps.map((step, i) => (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="relative rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
                  >
                    <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep to-teal-400 text-xs font-bold text-white shadow-md">
                      {step.step}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{step.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Admin link */}
            <div className="mt-12 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50 to-teal-50/30 p-6 text-center">
              <p className="text-sm text-slate-600">
                Already a partner?{' '}
                <a href="/admin" className="font-semibold text-emerald-deep hover:underline">
                  Access Admin Dashboard →
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FormField({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-teal-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
      />
    </div>
  );
}
