"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JoinClassForm from "@/components/classes/JoinClassForm";
import type { JoinClassFormSubmitData } from "@/components/classes/JoinClassForm";

type Props = {
  classId: string;
  className: string;
  teacherName?: string;
};

export default function JoinTokenClient({
  classId,
  className,
  teacherName,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: JoinClassFormSubmitData) {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/classes/${classId}/join-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      }),
    });

    const json = (await res.json()) as {
      redirectUrl?: string;
      error?: string;
    };

    if (!res.ok) {
      setError(json.error ?? "Erreur lors de l'inscription");
      setLoading(false);
      return;
    }

    router.push(json.redirectUrl ?? "/student");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-[480px]">
        <JoinClassForm
          className={className}
          teacherName={teacherName}
          loading={loading}
          errorMessage={error}
          onSubmit={handleSubmit}
        />
        <p className="mt-4 text-center text-xs text-gray-600">
          <a href="/join" className="hover:text-gray-500">
            ← Entrer un code à la place
          </a>
        </p>
      </div>
    </main>
  );
}
