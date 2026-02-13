import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { mapAiMessages } from "./use-history";

// ---------------------------------------------------------------------------
// mapAiMessages
// ---------------------------------------------------------------------------

function makeUIMessage(
  overrides: Partial<UIMessage> & { role: UIMessage["role"] },
): UIMessage {
  const { role, parts, metadata, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    role,
    parts: parts ?? [
      { type: "text", text: role === "user" ? "Hello" : "Hi there" },
    ],
    metadata,
    ...rest,
  } as UIMessage;
}

describe("mapAiMessages", () => {
  it("maps a user message with no pii field", () => {
    const msgs = [
      makeUIMessage({
        role: "user",
        parts: [{ type: "text", text: "What is my name?" }],
      }),
    ];
    const result = mapAiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("question");
    expect(result[0].message).toBe("What is my name?");
    expect(result[0].pii).toBeUndefined();
  });

  it("maps an assistant message with no metadata.pii — text unchanged", () => {
    const msgs = [
      makeUIMessage({
        role: "assistant",
        parts: [{ type: "text", text: "Hello world" }],
      }),
    ];
    const result = mapAiMessages(msgs);
    expect(result[0].type).toBe("answer");
    expect(result[0].message).toBe("Hello world");
    expect(result[0].pii).toBeUndefined();
  });

  it("stores pii array and preserves $N placeholders in assistant message text", () => {
    const msgs = [
      makeUIMessage({
        role: "assistant",
        parts: [{ type: "text", text: "Hello $1 born $2" }],
        metadata: { pii: ["John Doe", "02/02/1994"] },
      }),
    ];
    const result = mapAiMessages(msgs);
    expect(result[0].message).toBe("Hello $1 born $2");
    expect(result[0].pii).toEqual(["John Doe", "02/02/1994"]);
  });

  it("does not store pii field when metadata.pii is empty array", () => {
    const msgs = [
      makeUIMessage({
        role: "assistant",
        parts: [{ type: "text", text: "Hello world" }],
        metadata: { pii: [] },
      }),
    ];
    const result = mapAiMessages(msgs);
    expect(result[0].pii).toBeUndefined();
  });

  it("filters out system messages", () => {
    const msgs = [
      makeUIMessage({ role: "system", parts: [{ type: "text", text: "sys" }] }),
      makeUIMessage({ role: "user", parts: [{ type: "text", text: "hi" }] }),
    ];
    const result = mapAiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("question");
  });
});
