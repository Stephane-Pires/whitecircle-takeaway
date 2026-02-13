import { anthropic } from "@ai-sdk/anthropic";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
} from "ai";
import { MESSAGE, type Message } from "@/lib/schema/message";

const SONNET_SYSTEM_PROMPT = `When the user's message contains Personally Identifiable Information (PII), you MUST replace each distinct PII value with a numbered placeholder $1, $2, $3, etc.
PII includes: full names, dates of birth, Social Security numbers, passport numbers, driver's license numbers, phone numbers, email addresses, home addresses, financial identifiers, medical record identifiers, and biometric data.
Assign placeholders in the order the PII appears. Use the SAME placeholder if the SAME PII value repeats.
Do NOT redact, mask, or censor PII in any other way (no █ blocks, no [REDACTED], no asterisks).
Example:
  User: "My name is John Doe and my birthday is 02/02/1994."
  Assistant: "Hello $1! Your birthday is $2."
If no PII is present, respond normally without any placeholders.`;

const PII_SYSTEM_PROMPT = `You are a PII detection assistant.

Personally Identifiable Information (PII) is any data that can identify a specific individual.
It includes information that directly identifies someone, such as a full name or ID number.
It also includes indirect data that can identify a person when combined with other details.
Examples of PII include, but are not limited to:
- Full names (e.g. "John Doe", "Stéphane PIRES")
- Dates of birth (e.g. "02/02/1994", "January 1st 1990")
- Social Security numbers, passport numbers, and driver's license numbers
- Phone numbers, email addresses, and home addresses
- Financial and medical record identifiers
- Biometric data such as fingerprints or facial recognition data

PII can exist in digital, paper, or verbal formats.
If exposed, PII can lead to identity theft, fraud, or privacy violations.
Protecting PII is essential for maintaining individual privacy and security.

Analyse the text below and identify every piece of PII present.
For EACH piece of PII, wrap it with the delimiter <s> and </s> (e.g. <s>John Doe</s>, <s>02/02/1994</s>).
Do NOT include any explanation — output ONLY the original text with PII wrapped in delimiters.
If no PII is found, respond with exactly: No PII detected.`;

export async function PIIValidation(message: string): Promise<string[]> {
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: PII_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
  });

  const matches = [...text.matchAll(/<s>(.+?)<\/s>/gs)];
  return matches.map((m) => m[1]);
}

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = MESSAGE.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Start Sonnet stream — system prompt instructs $N placeholders for PII
  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: SONNET_SYSTEM_PROMPT,
    messages: [{ role: "user", content: parsed.data.message }],
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // 2. Write start metadata
      writer.write({
        type: "start",
        messageMetadata: {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          type: "answer",
        } satisfies Pick<Message, "id" | "date" | "type">,
      });

      // 3. Merge Sonnet stream live to client
      writer.merge(result.toUIMessageStream());

      // 4. Wait for Sonnet to finish, then run Haiku on the original user message
      await result.text;
      const piiValues = await PIIValidation(parsed.data.message);

      // 5. Send PII metadata patch so client can blur detected values
      writer.write({
        type: "message-metadata",
        messageMetadata: { pii: piiValues },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
