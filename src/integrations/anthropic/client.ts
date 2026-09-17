import "server-only";

// ---------------------------------------------------------------------------
// Minimal Claude Messages API client - a plain fetch wrapper, same pattern
// as xeroGet/buildxact's client rather than pulling in the full SDK for one
// endpoint. Used by the What If chat (src/app/api/what-if-chat/route.ts) to
// turn a free-text scenario into a structured adjustment via tool use, then
// narrate the computed result - the model never does the arithmetic itself,
// it only extracts intent and writes prose around numbers this app computed.
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock;

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string;
}

export async function callClaude(params: {
  system: string;
  messages: ClaudeMessage[];
  tools?: ClaudeTool[];
  maxTokens?: number;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set - see .env.example.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages: params.messages,
      ...(params.tools ? { tools: params.tools } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Claude API request failed: ${response.status} ${response.statusText} ${body}`);
  }

  return (await response.json()) as ClaudeResponse;
}
