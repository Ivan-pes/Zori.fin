import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { ClassifyResult, CompleteParams, LLMProvider, ReadDocumentParams } from "./provider";

export class AnthropicProvider implements LLMProvider {
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  private model = env.LLM_MODEL;

  async complete({
    system,
    messages,
    tools,
    executeTool,
    maxIterations = 6,
  }: CompleteParams): Promise<string> {
    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const convo: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let i = 0; i < maxIterations; i++) {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system,
        tools: anthropicTools,
        messages: convo,
      });

      if (res.stop_reason === "tool_use") {
        convo.push({ role: "assistant", content: res.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          let output: string;
          try {
            output = await executeTool(block.name, block.input);
          } catch (err) {
            output = `Error: ${(err as Error).message}`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: output,
          });
        }
        convo.push({ role: "user", content: toolResults });
        continue;
      }

      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    throw new Error(`LLM exceeded maxIterations (${maxIterations}) of tool use`);
  }

  async classify(input: string, categories: string[]): Promise<ClassifyResult> {
    const res = await this.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 50,
      system:
        "Ты классифицируешь операцию из банковской выписки в ОДНУ категорию из списка. " +
        "Ответь ТОЛЬКО точным названием категории из списка, без кавычек и пояснений.\n" +
        "Категории: " + categories.join("; ") + "\n\n" +
        "Особенности банковских описаний (бывают на русском, украинском, испанском, английском):\n" +
        "- Переводы между СВОИМИ счетами, инвестиции, покупка/продажа валюты и крипты, " +
        "пополнения, снятие наличных (напр. «До інвестиційного рахунку», «Traspaso», " +
        "«Exchanged to EUR», «Top-up», «Зняття готівки») — это НЕ траты: выбирай категорию " +
        "переводов/накоплений, если она есть в списке.\n" +
        "- НО обычная исходящая отправка/платёж («Надіслано з Revolut», «Отправлено из Revolut», " +
        "«Sent from …») БЕЗ явного признака своего счёта/инвестиций/крипты/налички — это ТРАТА " +
        "(перевод человеку или оплата). Категорию переводов/накоплений выбирай ТОЛЬКО при явном " +
        "таком признаке; при сомнении для исходящей отправки — «Прочее», а не переводы.\n" +
        "- Название мерчанта важнее города/страны в конце описания.\n" +
        "- Тарифы мобильной связи и eSIM — коммунальные услуги/связь.\n" +
        "- Онлайн-сервисы с помесячной оплатой (AI-сервисы, облака, домены) — подписки.\n" +
        "- Если совсем непонятно — «Прочее».",
      messages: [{ role: "user", content: input }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Уверенность выводим из качества совпадения ответа модели со списком:
    // точное совпадение — высокая, частичное — средняя, фолбэк — низкая.
    const exact = categories.find((c) => c.toLowerCase() === text.toLowerCase());
    if (exact) return { category: exact, confidence: 0.9 };

    const partial = categories.find((c) => text.toLowerCase().includes(c.toLowerCase()));
    if (partial) return { category: partial, confidence: 0.6 };

    return { category: categories.find((c) => c === "Прочее") ?? "Прочее", confidence: 0.3 };
  }

  async readDocument({ base64, mediaType, system, prompt }: ReadDocumentParams): Promise<string> {
    const isImage = mediaType.startsWith("image/");
    const fileBlock: Anthropic.ContentBlockParam = isImage
      ? {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        }
      : {
          type: "document",
          source: {
            type: "base64",
            media_type: mediaType as "application/pdf",
            data: base64,
          },
        };
    const res = await this.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16000,
      system,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: prompt }],
        },
      ],
    });

    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
