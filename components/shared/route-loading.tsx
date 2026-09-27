
import { useTranslations } from 'next-intl';export function RouteLoading({
  variant = 'page',
}: {
  variant?: 'page' | 'auth' | 'dashboard';
}) {
  const t = useTranslations('components.shared.routeLoading');
  if (variant === 'dashboard') {
    return (
      <div aria-busy="true" aria-label={t('loadingDashboard')} className="flex min-h-screen animate-pulse bg-background">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-6 lg:block">
          <div className="mb-10 h-9 w-36 rounded bg-muted" />
          <div className="space-y-4">
            {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-9 rounded bg-muted" />)}
          </div>
        </aside>
        <div className="flex-1 lg:pl-0">
          <div className="h-16 border-b border-border bg-card" />
          <main className="space-y-6 p-4 lg:p-8">
            <div className="h-8 w-56 rounded bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 rounded-lg border border-border bg-card" />)}
            </div>
            <div className="h-56 rounded-lg border border-border bg-card" />
          </main>
        </div>
      </div>
    );
  }

  if (variant === 'auth') {
    return (
      <main aria-busy="true" aria-label={t('loading')} className="flex min-h-[70vh] animate-pulse items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-8">
          <div className="mx-auto h-10 w-40 rounded bg-muted" />
          <div className="h-7 w-3/4 rounded bg-muted" />
          <div className="h-11 rounded bg-muted" />
          <div className="h-11 rounded bg-muted" />
          <div className="h-11 rounded bg-muted" />
        </div>
      </main>
    );
  }

  return (
    <main aria-busy="true" aria-label={t('loadingPage')} className="min-h-[60vh] animate-pulse space-y-6 p-6 lg:p-10">
      <div className="h-9 w-64 rounded bg-muted" />
      <div className="h-5 max-w-xl rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 rounded-lg border border-border bg-card" />)}
      </div>
    </main>
  );
}

export function AuthRouteLoading() {
  return <RouteLoading variant="auth" />;
}

export function DashboardRouteLoading() {
  return <RouteLoading variant="dashboard" />;
}

export default function PageRouteLoading() {
  return <RouteLoading />;
}