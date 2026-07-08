#!/usr/bin/env tsx
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { createWiki, createLlmClient, type LlmClient } from "@llmwiki/core"
import { TOOL_LIST, handleToolCall } from "./tools.js"

/**
 * `llmwiki-mcp` — MCP stdio server. Exposes the engine over MCP so any client
 * (Claude Code, Codex, …) can drive a wiki. Config:
 *   --root <kb>                KB root (default: cwd)
 *   --provider mock|openai|anthropic   server-side BYOK for ingest/ask/maintain
 *   --model <id> --api-key <k> --base-url <u>
 * Without a provider the deterministic tools work; LLM tools return an error.
 */

function parseArgs(): { root: string; llm?: LlmClient } {
  const args = process.argv.slice(2)
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const root = get("root") ?? process.cwd()
  const provider = get("provider")
  const apiKey = get("api-key") ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY
  const model = get("model")
  const baseUrl = get("base-url")
  let llm: LlmClient | undefined
  if (provider === "mock") {
    llm = createLlmClient({ provider: "mock", response: "ok" })
  } else if (provider && apiKey && model && (provider === "openai" || provider === "anthropic")) {
    llm = createLlmClient({ provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}) })
  }
  return { root, llm }
}

async function main(): Promise<void> {
  const { root, llm } = parseArgs()
  const wiki = createWiki(root, { llm })

  const server = new Server({ name: "llmwiki", version: "0.1.0" }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_LIST.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const result = await handleToolCall(wiki, name, (args as Record<string, unknown>) ?? {})
    return result as unknown as CallToolResult
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: Error) => {
  console.error(`llmwiki-mcp: ${err.message}`)
  process.exit(1)
})
