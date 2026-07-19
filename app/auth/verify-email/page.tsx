'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function VerifyEmailPage() {
  const { resendVerification, user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resendError } = await resendVerification(email);

    if (resendError) {
      setError(resendError);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Verify your email" subtitle="Confirm your email address to activate your account">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
          <Mail className="h-8 w-8 text-teal-600" />
        </div>

        {sent ? (
          <>
            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-teal-50 p-3">
              <CheckCircle2 className="h-5 w-5 text-teal-600" />
              <span className="text-sm font-medium text-teal-700">Verification email sent!</span>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Check your inbox for the verification link. Click it to activate your account.
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm leading-relaxed text-slate-600">
            We sent a verification link when you signed up. Click the link in the email to verify
            your account. If you didn't receive it, enter your email below to resend.
          </p>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!sent && (
          <form onSubmit={handleResend} className="mt-6 space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-xl disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Resend Verification Email
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        <Link
          href="/auth/sign-in"
          className="mt-6 block text-sm font-semibold text-teal-600 hover:underline"
        >
          Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
