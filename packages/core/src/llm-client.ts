import type { LlmClient, LlmCompleteOptions, LlmMessage } from "./types.js"

/**
 * BYOK LLM clients. The deterministic core never imports this module; callers
 * (CLI / MCP / skill / autonomous runner) construct a client and inject it.
 *
 * - {@link MockLlm}: canned/scripted responses — makes every consumer fully
 *   testable with no network, and powers the M1 end-to-end smoke test.
 * - {@link OpenAICompatibleClient}: any OpenAI-compatible `/chat/completions`
 *   endpoint — OpenAI, Ollama (`/v1`), OpenRouter, etc.
 * - {@link AnthropicClient}: the Anthropic Messages API.
 */

type MockResponder = string | string[] | ((messages: LlmMessage[]) => string)

export class MockLlm implements LlmClient {
  private readonly queue: string[]
  private readonly responder?: (messages: LlmMessage[]) => string
  private readonly constant?: string

  constructor(responder: MockResponder) {
    if (typeof responder === "function") {
      this.responder = responder
      this.queue = []
    } else if (Array.isArray(responder)) {
      this.queue = [...responder]
    } else {
      this.constant = responder
      this.queue = []
    }
  }

  async complete(messages: LlmMessage[]): Promise<{ text: string }> {
    if (this.responder) return { text: this.responder(messages) }
    if (this.constant !== undefined) return { text: this.constant }
    return { text: this.queue.shift() ?? "" }
  }
}

export interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

export class OpenAICompatibleClient implements LlmClient {
  constructor(private readonly cfg: OpenAIConfig) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<{ text: string }> {
    const base = (this.cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "")
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: opts?.model ?? this.cfg.model,
        messages,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts?.temperature ? { temperature: opts.temperature } : {}),
      }),
    })
    if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return { text: data.choices?.[0]?.message?.content ?? "" }
  }
}

export interface AnthropicConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

export class AnthropicClient implements LlmClient {
  constructor(private readonly cfg: AnthropicConfig) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<{ text: string }> {
    const base = (this.cfg.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "")
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
    const convo = messages.filter((m) => m.role !== "system")
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts?.model ?? this.cfg.model,
        max_tokens: opts?.maxTokens ?? 1024,
        ...(opts?.temperature ? { temperature: opts.temperature } : {}),
        ...(system ? { system } : {}),
        messages: convo,
      }),
    })
    if (!res.ok) throw new Error(`Anthropic request failed (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const textBlock = data.content?.find((b) => b.type === "text")
    return { text: textBlock?.text ?? "" }
  }
}

export type LlmClientConfig =
  | { provider: "mock"; response?: string; responses?: string[]; responder?: (m: LlmMessage[]) => string }
  | { provider: "openai"; apiKey: string; baseUrl?: string; model: string }
  | { provider: "anthropic"; apiKey: string; baseUrl?: string; model: string }

/** Construct an {@link LlmClient} from a discriminated config. */
export function createLlmClient(cfg: LlmClientConfig): LlmClient {
  switch (cfg.provider) {
    case "mock":
      return new MockLlm(cfg.responder ?? cfg.responses ?? cfg.response ?? "")
    case "openai":
      return new OpenAICompatibleClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model })
    case "anthropic":
      return new AnthropicClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model })
  }
}
