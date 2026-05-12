// Canonical types for the beta feedback system.
// BetaFeedbackOverlay.tsx (Coco) defines its own local copy — it should
// eventually import BetaFeedbackPayload from here instead.

export type BetaFeedbackInputMethod = "voice" | "text" | "mixed";
export type BetaFeedbackSuggestedType = "bug" | "feature_request" | "general";
export type BetaFeedbackSeverity = "critical" | "high" | "medium" | "low";
export type BetaFeedbackStatus =
  | "new"
  | "triaged"
  | "investigating"
  | "in_progress"
  | "resolved"
  | "wontfix"
  | "duplicate";

/** Payload sent by Coco's BetaFeedbackOverlay → POST /api/beta-feedback */
export type BetaFeedbackPayload = {
  transcript: string;
  input_method: BetaFeedbackInputMethod;
  suggested_type: BetaFeedbackSuggestedType | null;
  page_url: string;
  page_title: string;
  user_agent: string;
  viewport: string;
  duration_sec: number | null;
};

/** Full row from the beta_feedback table */
export type BetaFeedback = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email_snapshot: string;
  transcript: string;
  input_method: BetaFeedbackInputMethod;
  suggested_type: BetaFeedbackSuggestedType | null;
  page_url: string | null;
  page_title: string | null;
  user_agent: string | null;
  viewport: string | null;
  duration_sec: number | null;
  // AI classification — populated by Part 2 Edge Function
  ai_type: string | null;
  ai_severity: BetaFeedbackSeverity | null;
  ai_feature: string | null;
  ai_summary: string | null;
  ai_suggested_action: string | null;
  ai_confidence: number | null;
  ai_classified_at: string | null;
  ai_model: string | null;
  // Admin workflow
  status: BetaFeedbackStatus;
  assignee_id: string | null;
  priority_override: number | null;
  duplicate_of_id: string | null;
  github_issue_url: string | null;
  internal_notes: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
};

/** Row from beta_feedback_comments */
export type BetaFeedbackComment = {
  id: string;
  feedback_id: string;
  author_id: string | null;
  content: string;
  is_internal: boolean;
  created_at: string;
};

/** Row from beta_feedback_status_history */
export type BetaFeedbackStatusHistory = {
  id: string;
  feedback_id: string;
  from_status: BetaFeedbackStatus | null;
  to_status: BetaFeedbackStatus;
  changed_by: string | null;
  reason: string | null;
  changed_at: string;
};
