"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

/**
 * // Demande beta en attente :
 * // <AdminApprovalCard
 * //   email="alex@example.com"
 * //   fullName="Alex Bourdouxhe"
 * //   requestedAt={new Date(Date.now() - 2 * 60 * 60 * 1000)}
 * //   message="Je voudrais tester Schoolio pendant une demo avec mon equipe."
 * //   onApprove={async () => approveRequest("req-123")}
 * //   onReject={async () => rejectRequest("req-123")}
 * //   isProcessing={false}
 * // />
 */
export type AdminApprovalCardProps = {
  email: string;
  fullName?: string;
  requestedAt: Date;
  message?: string;
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  isProcessing?: boolean;
};

type ProcessingAction = "approve" | "reject" | null;

const relativeTimeFormatter = new Intl.RelativeTimeFormat("fr", {
  numeric: "auto",
});

function getRelativeTime(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const absDiffMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (absDiffMs < minuteMs) {
    return relativeTimeFormatter.format(0, "minute");
  }

  if (absDiffMs < hourMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / minuteMs), "minute");
  }

  if (absDiffMs < dayMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / hourMs), "hour");
  }

  return relativeTimeFormatter.format(Math.round(diffMs / dayMs), "day");
}

function truncateMessage(message: string) {
  const normalizedMessage = message.trim();

  if (normalizedMessage.length <= 200) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, 200).trimEnd()}...`;
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

export function AdminApprovalCard({
  email,
  fullName,
  requestedAt,
  message,
  onApprove,
  onReject,
  isProcessing = false,
}: AdminApprovalCardProps) {
  const [processingAction, setProcessingAction] = useState<ProcessingAction>(null);
  const hasMessage = Boolean(message?.trim());

  function handleApprove() {
    if (isProcessing) {
      return;
    }

    setProcessingAction("approve");
    void onApprove();
  }

  function handleReject() {
    if (isProcessing) {
      return;
    }

    if (!window.confirm("Rejeter cette demande ?")) {
      return;
    }

    setProcessingAction("reject");
    void onReject();
  }

  return (
    <article className="rounded-xl border border-purple-800/30 bg-gray-900 p-4 transition-colors duration-150 hover:border-purple-700/50 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-semibold text-white">{email}</p>
          {fullName && <p className="mt-0.5 text-sm text-gray-400">{fullName}</p>}
          <p className="mt-1 text-xs text-gray-500">{getRelativeTime(requestedAt)}</p>

          {hasMessage && (
            <div className="mt-3 border-t border-gray-800 pt-3">
              <blockquote className="text-sm italic text-gray-300">&laquo; {truncateMessage(message ?? "")} &raquo;</blockquote>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing && processingAction === "approve" ? (
              <Spinner />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Approuver
          </button>

          <button
            type="button"
            onClick={handleReject}
            disabled={isProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-transparent px-4 py-2 text-sm text-gray-300 transition-colors duration-150 hover:border-red-700 hover:bg-red-900/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing && processingAction === "reject" ? (
              <Spinner />
            ) : (
              <X className="h-4 w-4" aria-hidden="true" />
            )}
            Rejeter
          </button>
        </div>
      </div>
    </article>
  );
}

export default AdminApprovalCard;
