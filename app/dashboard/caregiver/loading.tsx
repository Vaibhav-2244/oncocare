export default function CaregiverLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}
