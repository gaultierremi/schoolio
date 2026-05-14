import type { Metadata } from "next";
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Connexion · Maïa",
  description: "Connecte-toi à Maïa avec ton compte Google ou Microsoft.",
};

// LoginClient uses useSearchParams (read `next` for post-auth redirect),
// which requires a Suspense boundary to allow static prerendering.
export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12">
      <Suspense fallback={<LoginSkeleton />}>
        <LoginClient />
      </Suspense>
    </main>
  );
}

function LoginSkeleton() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-sm">
      <div className="h-12 w-12 mx-auto animate-pulse rounded-xl bg-[rgb(var(--surface-3))]" />
      <div className="mt-4 mx-auto h-6 w-48 animate-pulse rounded bg-[rgb(var(--surface-3))]" />
      <div className="mt-8 space-y-3">
        <div className="h-12 w-full animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
        <div className="h-12 w-full animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
      </div>
    </div>
  );
}
