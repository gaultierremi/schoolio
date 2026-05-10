"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JoinClassForm from "@/components/classes/JoinClassForm";
import type { JoinClassFormSubmitData } from "@/components/classes/JoinClassForm";

type Props = {
  classId: string;
  className: string;
  authMode: "full" | "light";
  teacherName?: string;
};

type Phase =
  | { name: "form" }
  | { name: "show-pin"; pin: string; redirectUrl: string }
  | { name: "verify-pin"; pseudo: string }
  | { name: "pending-confirmation"; email: string };

export default function JoinTokenClient({
  classId,
  className,
  authMode,
  teacherName,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "form" });

  async function handleSubmit(data: JoinClassFormSubmitData) {
    setLoading(true);
    setError(null);

    const endpoint =
      data.mode === "full"
        ? `/api/classes/${classId}/join-full`
        : `/api/classes/${classId}/join-light`;

    const body =
      data.mode === "full"
        ? {
            email: data.email,
            password: data.password,
            firstName: data.firstName,
            lastName: data.lastName,
          }
        : { pseudo: data.pseudo, firstName: data.firstName, lastName: data.lastName };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as {
      redirectUrl?: string;
      reconnectPin?: string;
      requirePin?: boolean;
      legacyReconnect?: boolean;
      pendingEmailConfirmation?: boolean;
      email?: string;
      error?: string;
    };

    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Erreur lors de l'inscription");
      return;
    }

    if (json.requirePin && data.mode === "light") {
      setPhase({ name: "verify-pin", pseudo: data.pseudo });
      return;
    }

    if (json.pendingEmailConfirmation && json.email) {
      setPhase({ name: "pending-confirmation", email: json.email });
      return;
    }

    if (json.reconnectPin && json.redirectUrl) {
      setPhase({ name: "show-pin", pin: json.reconnectPin, redirectUrl: json.redirectUrl });
      return;
    }

    router.push(json.redirectUrl ?? "/student");
  }

  if (phase.name === "show-pin") {
    return (
      <PinDisplay
        pin={phase.pin}
        onContinue={() => router.push(phase.redirectUrl)}
      />
    );
  }

  if (phase.name === "verify-pin") {
    return (
      <PinPrompt
        classId={classId}
        pseudo={phase.pseudo}
        onSuccess={(redirectUrl) => router.push(redirectUrl)}
        onBack={() => {
          setPhase({ name: "form" });
          setError(null);
        }}
      />
    );
  }

  if (phase.name === "pending-confirmation") {
    return <PendingConfirmation email={phase.email} />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-[480px]">
        <JoinClassForm
          authMode={authMode}
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

function PinDisplay({ pin, onContinue }: { pin: string; onContinue: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <section className="mx-auto w-full max-w-[480px] rounded-3xl border border-purple-500/40 bg-gray-900 p-8 shadow-xl shadow-black/30">
        <p className="text-5xl">🔐</p>
        <h1 className="mt-4 text-2xl font-black text-white">Note bien ce code</h1>
        <p className="mt-2 text-sm text-gray-400">
          Tu en auras besoin chaque fois que tu reviendras sur Schoolio depuis un autre appareil.
          <strong className="text-amber-300"> Il ne sera plus jamais affiché.</strong>
        </p>
        <div className="mt-6 rounded-2xl border border-purple-500/50 bg-purple-500/10 p-6 text-center">
          <p className="font-mono text-4xl font-black tracking-[0.35em] text-purple-200">{pin}</p>
        </div>
        <label className="mt-6 flex items-start gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
          />
          <span>Je l&apos;ai noté quelque part en sécurité</span>
        </label>
        <button
          type="button"
          onClick={onContinue}
          disabled={!acknowledged}
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-purple-500 px-5 py-3.5 font-black text-gray-950 transition-colors hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continuer →
        </button>
      </section>
    </main>
  );
}

function PinPrompt({
  classId,
  pseudo,
  onSuccess,
  onBack,
}: {
  classId: string;
  pseudo: string;
  onSuccess: (redirectUrl: string) => void;
  onBack: () => void;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      setError("Entre les 6 chiffres de ton code");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/classes/${classId}/join-light/verify-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, pin }),
    });
    const json = (await res.json()) as { redirectUrl?: string; error?: string };
    setLoading(false);

    if (!res.ok || !json.redirectUrl) {
      setError(json.error ?? "Code incorrect");
      return;
    }
    onSuccess(json.redirectUrl);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <section className="mx-auto w-full max-w-[480px] rounded-3xl border border-gray-800 bg-gray-900 p-8 shadow-xl shadow-black/20">
        <p className="text-5xl">🔑</p>
        <h1 className="mt-4 text-2xl font-black text-white">Bienvenue, {pseudo}</h1>
        <p className="mt-2 text-sm text-gray-400">
          Entre ton code à 6 chiffres pour te reconnecter.
        </p>
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={pin}
            autoFocus
            disabled={loading}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            placeholder="••••••"
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.35em] text-white outline-none transition-colors placeholder:text-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 px-5 py-3.5 font-black text-gray-950 transition-colors hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Vérification..." : "Se reconnecter"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="block w-full text-center text-xs text-gray-500 hover:text-gray-400"
          >
            ← Retour
          </button>
        </form>
      </section>
    </main>
  );
}

function PendingConfirmation({ email }: { email: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <section className="mx-auto w-full max-w-[480px] rounded-3xl border border-gray-800 bg-gray-900 p-8 text-center shadow-xl shadow-black/20">
        <p className="text-5xl">📬</p>
        <h1 className="mt-4 text-2xl font-black text-white">Vérifie ton email</h1>
        <p className="mt-3 text-sm text-gray-300">
          On vient d&apos;envoyer un lien de confirmation à
        </p>
        <p className="mt-1 break-all text-sm font-bold text-purple-300">{email}</p>
        <p className="mt-4 text-xs text-gray-500">
          Clique sur le lien dans le mail pour activer ton compte. Pense à vérifier ton dossier spam.
        </p>
      </section>
    </main>
  );
}
