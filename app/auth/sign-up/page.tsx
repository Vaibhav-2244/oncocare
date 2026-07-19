'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, AlertCircle, Heart, Users, Stethoscope, Building2, Pill, FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { signupRoles, roleConfig, type RoleName } from '@/lib/auth-types';
import { cn } from '@/lib/utils';

const roleIcons: Record<string, typeof Heart> = {
  patient: Heart,
  family_caregiver: Users,
  doctor: Stethoscope,
  hospital: Building2,
  pharmacy: Pill,
  research_partner: FlaskConical,
};

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<'role' | 'details'>('role');
  const [selectedRole, setSelectedRole] = useState<RoleName | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRoleSelect = (role: RoleName) => {
    setSelectedRole(role);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    if (!agreeToTerms) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signUpError } = await signUp(email, password, fullName, selectedRole);

    if (signUpError) {
      setError(signUpError);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="We've sent you a verification link">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <Mail className="h-8 w-8 text-teal-600" />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-slate-600">
            We sent a verification link to <span className="font-semibold text-slate-900">{email}</span>.
            Click the link to verify your email and complete your registration.
          </p>
          <div className="mt-6 space-y-3">
            <Link
              href="/auth/sign-in"
              className="block w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-xl"
            >
              Continue to Sign In
            </Link>
            <button
              onClick={() => router.push('/')}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
            >
              Back to Home
            </button>
          </div>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Join OncoCare+ and start your care journey">
      {/* Step 1: Role selection */}
      <AnimatePresence mode="wait">
        {step === 'role' && (
          <motion.div
            key="role"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <p className="mb-4 text-sm font-semibold text-slate-700">I am a...</p>
            <div className="grid gap-3">
              {signupRoles.map((role) => {
                const config = roleConfig[role];
                const Icon = roleIcons[role] || Heart;
                return (
                  <button
                    key={role}
                    onClick={() => handleRoleSelect(role)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                      selectedRole === role
                        ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-500/10'
                        : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                      selectedRole === role ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{config.displayName}</div>
                      <div className="text-xs text-slate-500">{config.description}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-teal-500" />
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/auth/sign-in" className="font-semibold text-teal-600 hover:underline">
                Sign in
              </Link>
            </p>
          </motion.div>
        )}

        {/* Step 2: Details form */}
        {step === 'details' && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Selected role badge */}
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2.5">
              <Check className="h-4 w-4 text-teal-600" />
              <span className="text-sm font-medium text-teal-700">
                Registering as: {selectedRole && roleConfig[selectedRole].displayName}
              </span>
              <button
                onClick={() => setStep('role')}
                className="ml-auto text-xs font-semibold text-teal-600 hover:underline"
              >
                Change
              </button>
            </div>

            {/* OAuth */}
            <OAuthButtons />

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">or sign up with email</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">Full Name</label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="John Doe"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Email Address</label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Password</label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 8 && (
                  <p className="mt-1.5 text-xs text-amber-600">Password must be at least 8 characters</p>
                )}
              </div>

              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs leading-relaxed text-slate-500">
                  I agree to the{' '}
                  <Link href="/terms" className="font-semibold text-teal-600 hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="font-semibold text-teal-600 hover:underline">Privacy Policy</Link>
                </span>
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-xl disabled:opacity-50"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/auth/sign-in" className="font-semibold text-teal-600 hover:underline">
                Sign in
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
