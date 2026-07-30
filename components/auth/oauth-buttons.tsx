'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function OAuthButtons() {
  const { signInWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setLoadingProvider(provider);
    const { error } = await signInWithOAuth(provider);
    if (error) setLoadingProvider(null);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Google */}
        <button
          onClick={() => handleOAuth('google')}
          disabled={loadingProvider !== null}
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingProvider === 'google' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
        </button>

        {/* Apple */}
        <button
          onClick={() => handleOAuth('apple')}
          disabled={loadingProvider !== null}
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingProvider === 'apple' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.365 1.43c0 1.12-.42 2.02-.995 2.695-.65.82-1.665 1.55-2.73 1.52-.11-1.21.42-2.28 1.075-3.01.72-.79 1.875-1.4 2.65-1.395.03.005.055.01.005.19zm3.30 13.045c-.045-2.12.935-3.73 2.76-4.96-1.015-1.515-2.525-2.445-4.185-2.44-1.76.01-3.225 1.035-4.05 1.035-.84 0-2.13-1.015-3.505-1.005-1.8.005-3.44 1.045-4.355 2.66-1.86 3.195-.47 7.935 1.33 10.545.885 1.39 1.94 2.955 3.32 2.905 1.345-.05 1.85-.86 3.475-.86 1.605 0 2.075.86 3.51.835 1.49-.02 2.415-1.44 3.295-2.84 1.04-1.66 1.46-3.275 1.48-3.365-.035-.015-2.875-1.1-2.92-4.45z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
