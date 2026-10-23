// A single pulsing grey block. Give it a size with className, for example "h-4 w-32".
export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

// A card-shaped placeholder with a title line and a few text lines
export function CardSkeleton({ lines = 3 }) {
  return (
    <div role="status" className="space-y-3 rounded-lg bg-white p-4 shadow">
      <span className="sr-only">Loading...</span>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// A whole page of placeholders
export function PageSkeleton() {
  return (
    <div className="max-w-3xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <CardSkeleton />
      <CardSkeleton lines={2} />
    </div>
  );
}