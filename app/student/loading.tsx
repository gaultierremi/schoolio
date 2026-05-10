export default function StudentLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">

        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-800" />
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-xl bg-zinc-800" />
        </div>

        {/* Assignments skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-900" />
          ))}
        </div>

        {/* Banner skeleton */}
        <div className="h-16 animate-pulse rounded-2xl bg-zinc-900" />

        {/* Schedule skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-900" />
        </div>

        {/* Courses skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-900" />
            ))}
          </div>
        </div>

        {/* Weekly stats skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900" />
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
