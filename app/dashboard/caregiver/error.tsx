'use client';

export default function CaregiverError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
      <h2 className="text-xl font-semibold text-rose-700">Something went wrong</h2>
      <p className="text-sm text-rose-600">The caregiver dashboard could not be loaded.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
      >
        Retry
      </button>
    </div>
  );
}
