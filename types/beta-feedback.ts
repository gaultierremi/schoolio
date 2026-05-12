export type BetaFeedbackInputMethod = "voice" | "text" | "mixed";

export type BetaFeedbackSuggestedType = "bug" | "feature_request" | "general" | null;

export type BetaFeedbackPayload = {
  transcript: string;
  input_method: BetaFeedbackInputMethod;
  page_url: string;
  page_title: string;
  user_agent: string;
  viewport: string;
  duration_sec: number | null;
  suggested_type: BetaFeedbackSuggestedType;
};
