"use client";

import { useId, useState } from "react";

type JoinClassFormSubmitData =
  | {
      mode: "full";
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }
  | { mode: "light"; pseudo: string; firstName: string; lastName?: string };

type JoinClassFormProps = {
  authMode: "full" | "light";
  className: string;
  teacherName?: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (data: JoinClassFormSubmitData) => void;
};

type FieldErrors = Partial<
  Record<"pseudo" | "firstName" | "lastName" | "email" | "password", string>
>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const namePattern = /^[\p{L} -]+$/u;
const pseudoPattern = /^[\p{L}\p{N} _-]+$/u;

export default function JoinClassForm({
  authMode,
  className,
  teacherName,
  loading = false,
  errorMessage,
  onSubmit,
}: JoinClassFormProps) {
  const formId = useId();
  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateLight() {
    const nextErrors: FieldErrors = {};
    const value = pseudo.trim();

    if (value.length < 2 || value.length > 20) {
      nextErrors.pseudo = "Le pseudo doit contenir entre 2 et 20 caractères.";
    } else if (!pseudoPattern.test(value)) {
      nextErrors.pseudo =
        "Utilise seulement des lettres, chiffres, espaces, tirets ou underscores.";
    }

    const trimmedFirst = firstName.trim();
    if (trimmedFirst.length < 2) {
      nextErrors.firstName = "Le prénom doit contenir au moins 2 caractères.";
    } else if (!namePattern.test(trimmedFirst)) {
      nextErrors.firstName = "Utilise seulement des lettres, espaces ou tirets.";
    }

    const trimmedLast = lastName.trim();
    if (trimmedLast.length > 0) {
      if (trimmedLast.length < 2) {
        nextErrors.lastName = "Le nom doit contenir au moins 2 caractères.";
      } else if (!namePattern.test(trimmedLast)) {
        nextErrors.lastName = "Utilise seulement des lettres, espaces ou tirets.";
      }
    }

    return nextErrors;
  }

  function validateFull() {
    const nextErrors: FieldErrors = {};
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();

    if (trimmedFirstName.length < 2) {
      nextErrors.firstName = "Le prénom doit contenir au moins 2 caractères.";
    } else if (!namePattern.test(trimmedFirstName)) {
      nextErrors.firstName = "Utilise seulement des lettres, espaces ou tirets.";
    }

    if (trimmedLastName.length < 2) {
      nextErrors.lastName = "Le nom doit contenir au moins 2 caractères.";
    } else if (!namePattern.test(trimmedLastName)) {
      nextErrors.lastName = "Utilise seulement des lettres, espaces ou tirets.";
    }

    if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = "Entre une adresse email valide.";
    }

    if (password.length < 8) {
      nextErrors.password = "Le mot de passe doit contenir au moins 8 caractères.";
    }

    return nextErrors;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = authMode === "light" ? validateLight() : validateFull();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    if (authMode === "light") {
      const trimmedLast = lastName.trim();
      onSubmit({
        mode: "light",
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: trimmedLast || undefined,
      });
      return;
    }

    onSubmit({
      mode: "full",
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
  }

  const submitLabel =
    authMode === "light" ? "Rejoindre la classe" : "Créer mon compte et rejoindre";

  return (
    <section className="mx-auto w-full max-w-[480px] rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-xl shadow-black/20 sm:p-8">
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-black text-white sm:text-3xl">{className}</h1>
        {teacherName ? (
          <p className="mt-2 text-sm font-medium text-gray-400">
            Invité par {teacherName}
          </p>
        ) : null}
      </header>

      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {authMode === "light" ? (
          <>
            <Field
              id={`${formId}-pseudo`}
              label="Choisis ton pseudo"
              value={pseudo}
              error={errors.pseudo}
              helperText="Ton prof verra ce pseudo dans la classe"
              autoComplete="nickname"
              disabled={loading}
              onChange={(value) => {
                setPseudo(value);
                clearError("pseudo");
              }}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id={`${formId}-first-name`}
                label="Prénom"
                value={firstName}
                error={errors.firstName}
                helperText="Pour que ton prof te reconnaisse"
                autoComplete="given-name"
                disabled={loading}
                onChange={(value) => {
                  setFirstName(value);
                  clearError("firstName");
                }}
              />
              <Field
                id={`${formId}-last-name`}
                label="Nom (optionnel)"
                value={lastName}
                error={errors.lastName}
                autoComplete="family-name"
                disabled={loading}
                onChange={(value) => {
                  setLastName(value);
                  clearError("lastName");
                }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id={`${formId}-first-name`}
                label="Prénom"
                value={firstName}
                error={errors.firstName}
                autoComplete="given-name"
                disabled={loading}
                onChange={(value) => {
                  setFirstName(value);
                  clearError("firstName");
                }}
              />
              <Field
                id={`${formId}-last-name`}
                label="Nom"
                value={lastName}
                error={errors.lastName}
                autoComplete="family-name"
                disabled={loading}
                onChange={(value) => {
                  setLastName(value);
                  clearError("lastName");
                }}
              />
            </div>

            <Field
              id={`${formId}-email`}
              label="Email"
              type="email"
              value={email}
              error={errors.email}
              autoComplete="email"
              disabled={loading}
              onChange={(value) => {
                setEmail(value);
                clearError("email");
              }}
            />

            <Field
              id={`${formId}-password`}
              label="Mot de passe"
              type="password"
              value={password}
              error={errors.password}
              helperText="Au moins 8 caractères"
              autoComplete="new-password"
              disabled={loading}
              onChange={(value) => {
                setPassword(value);
                clearError("password");
              }}
            />
          </>
        )}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 px-5 py-3.5 font-black text-gray-950 transition-colors hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
              Connexion...
            </>
          ) : (
            submitLabel
          )}
        </button>
      </form>
    </section>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  helperText?: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function Field({
  id,
  label,
  value,
  error,
  helperText,
  type = "text",
  autoComplete,
  disabled = false,
  onChange,
}: FieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-gray-200">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full rounded-xl border bg-gray-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? "border-red-500/70" : "border-gray-700"
        }`}
      />
      {helperText ? (
        <p id={helperId} className="mt-2 text-xs font-medium text-gray-500">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-2 text-xs font-bold text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type { JoinClassFormProps, JoinClassFormSubmitData };
