import { anthropic } from "@ai-sdk/anthropic";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { PROMPT_MESSAGE } from "@/lib/schema/prompt-message";

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = PROMPT_MESSAGE.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    messages: [{ role: "user", content: parsed.data.message }],
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
