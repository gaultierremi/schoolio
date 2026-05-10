export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  pdfBase64?: string;
  mimeType?: string;
  responseSchema?: unknown;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AIResponse {
  text: string;
  tokensUsed?: number;
  latencyMs: number;
  provider: string;
}

export interface AIProvider {
  readonly id: string;
  readonly supportsVision: boolean;
  readonly euCompliant: boolean;
  generateText(req: AIRequest): Promise<AIResponse>;
}
