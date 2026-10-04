interface LoadingStateProps {
  lines?: number;
}

export function LoadingState({
  lines = 4,
}: LoadingStateProps) {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-label="Loading"
      role="status"
    >
      {Array.from({ length: lines }).map(
        (_, index) => (
          <div
            key={index}
            className={
              index === 0
                ? "h-8 w-1/3 rounded-lg bg-gray-200"
                : "h-16 w-full rounded-2xl bg-gray-100"
            }
          />
        ),
      )}

      <span className="sr-only">
        Loading content...
      </span>
    </div>
  );
}