import { env } from "../env";
import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./provider";

export type { LLMProvider, ToolDef, ChatTurn } from "./provider";

let cached: LLMProvider | null = null;

export function getLLM(): LLMProvider {
  if (cached) return cached;
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      cached = new AnthropicProvider();
      break;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
  }
  return cached;
}
