import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — all external deps isolated
// ---------------------------------------------------------------------------

const mockToUIMessageStream = vi.fn();
const mockStreamText = vi.fn();
const mockGenerateText = vi.fn();
const mockWriter = { write: vi.fn(), merge: vi.fn() };
const mockCreateUIMessageStream = vi.fn();
const mockCreateUIMessageStreamResponse = vi.fn();

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((model: string) => `mocked-model-${model}`),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  generateText: mockGenerateText,
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
}));

// Import AFTER mocks are declared
const { POST, PIIValidation } = await import("./route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    message: "Hello",
    type: "question",
    ...overrides,
  };
}

let executePromise: Promise<void> = Promise.resolve();

function setupStreamMocks() {
  mockCreateUIMessageStream.mockImplementation(({ execute }) => {
    // Store the execute promise — createUIMessageStreamResponse will await it
    executePromise = execute({ writer: mockWriter });
    return "mock-stream";
  });
  mockCreateUIMessageStreamResponse.mockImplementation(async () => {
    // Await execute so all writer calls complete before POST returns
    await executePromise;
    return new Response("ok", { status: 200 });
  });
}

function setupDefaultStreamText(sonnetText = "Hello world") {
  const uiStream = new ReadableStream();
  mockToUIMessageStream.mockReturnValue(uiStream);
  mockStreamText.mockReturnValue({
    toUIMessageStream: mockToUIMessageStream,
    text: Promise.resolve(sonnetText),
  });
  return uiStream;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultStreamText();
    mockGenerateText.mockResolvedValue({ text: "No PII detected." });
    setupStreamMocks();
  });

  // --- Validation errors ---

  it("returns 400 when body is empty", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(
      makeRequest({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        type: "question",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is empty string", async () => {
    const res = await POST(makeRequest(validBody({ message: "" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is missing", async () => {
    const res = await POST(
      makeRequest({
        id: crypto.randomUUID(),
        message: "Hello",
        type: "question",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is not a valid ISO datetime", async () => {
    const res = await POST(makeRequest(validBody({ date: "not-a-date" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when id is not a valid uuid", async () => {
    const res = await POST(makeRequest(validBody({ id: "not-a-uuid" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(makeRequest(validBody({ type: "unknown" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 error body as JSON with error details", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  // --- Happy path ---

  it("calls streamText with the user message, Sonnet model, and PII system prompt", async () => {
    await POST(makeRequest(validBody({ message: "Hello AI" })));
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mocked-model-claude-sonnet-4-5-20250929",
        system: expect.stringContaining("$1, $2, $3"),
        messages: [{ role: "user", content: "Hello AI" }],
      }),
    );
  });

  it("merges the Sonnet UI stream into the writer", async () => {
    const uiStream = setupDefaultStreamText();
    await POST(makeRequest(validBody()));
    expect(mockWriter.merge).toHaveBeenCalledWith(uiStream);
  });

  it("calls PIIValidation (Haiku) with the original user message", async () => {
    await POST(makeRequest(validBody({ message: "My name is John Doe" })));
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mocked-model-claude-haiku-4-5-20251001",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("My name is John Doe"),
          }),
        ]),
      }),
    );
  });

  it("writes start event before merging the stream", async () => {
    await POST(makeRequest(validBody()));
    const writeOrder = mockWriter.write.mock.invocationCallOrder[0];
    const mergeOrder = mockWriter.merge.mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(mergeOrder);
    expect(mockWriter.write.mock.calls[0][0]).toMatchObject({ type: "start" });
  });

  it("writes message-metadata after merging the stream", async () => {
    await POST(makeRequest(validBody()));
    const mergeOrder = mockWriter.merge.mock.invocationCallOrder[0];
    const metadataCallIndex = mockWriter.write.mock.calls.findIndex(
      (c: unknown[]) => (c[0] as { type: string }).type === "message-metadata",
    );
    expect(metadataCallIndex).toBeGreaterThanOrEqual(0);
    const metadataOrder =
      mockWriter.write.mock.invocationCallOrder[metadataCallIndex];
    expect(metadataOrder).toBeGreaterThan(mergeOrder);
  });

  it("writes message-metadata with empty pii array when no PII detected", async () => {
    await POST(makeRequest(validBody()));
    const metadataCall = mockWriter.write.mock.calls
      .map((c) => c[0])
      .find((c) => c.type === "message-metadata");
    expect(metadataCall?.messageMetadata).toMatchObject({ pii: [] });
  });

  it("writes message-metadata with pii array when PII detected", async () => {
    setupDefaultStreamText("My name is John Doe");
    mockGenerateText.mockResolvedValue({ text: "<s>John Doe</s>" });
    await POST(makeRequest(validBody({ message: "What is my name?" })));
    const metadataCall = mockWriter.write.mock.calls
      .map((c) => c[0])
      .find((c) => c.type === "message-metadata");
    expect(metadataCall?.messageMetadata).toMatchObject({ pii: ["John Doe"] });
  });

  it("returns 200 on valid input", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledOnce();
  });

  // --- Network / provider errors ---

  it("propagates error when streamText throws (provider down)", async () => {
    vi.resetAllMocks();
    mockStreamText.mockImplementation(() => {
      throw new Error("Provider unreachable");
    });
    await expect(POST(makeRequest(validBody()))).rejects.toThrow(
      "Provider unreachable",
    );
  });

  it("still returns a response when createUIMessageStream rejects (stream failure)", async () => {
    mockCreateUIMessageStream.mockRejectedValue(new Error("Stream failed"));
    const res = await POST(makeRequest(validBody()));
    expect(res).toBeInstanceOf(Response);
  });
});

// ---------------------------------------------------------------------------
// PIIValidation
// ---------------------------------------------------------------------------

describe("PIIValidation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGenerateText.mockResolvedValue({ text: "No PII detected." });
  });

  it("calls generateText with the haiku model", async () => {
    await PIIValidation("Hello, my name is John.");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mocked-model-claude-haiku-4-5-20251001",
      }),
    );
  });

  it("includes the user message in the prompt", async () => {
    await PIIValidation("Call me at 555-1234");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Call me at 555-1234"),
          }),
        ]),
      }),
    );
  });

  it("includes PII context in the system prompt", async () => {
    await PIIValidation("test");
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.system).toMatch(/Personally Identifiable Information/i);
  });

  it("instructs the model to use <s>...</s> delimiters in the system prompt", async () => {
    await PIIValidation("test");
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.system).toMatch(/<s>/);
  });

  it("returns empty array when no PII delimiters are found", async () => {
    const result = await PIIValidation("Hello world");
    expect(result).toEqual([]);
  });

  it("returns array with single PII value when one marker is found", async () => {
    mockGenerateText.mockResolvedValue({ text: "<s>john@example.com</s>" });
    const result = await PIIValidation("My email is john@example.com");
    expect(result).toEqual(["john@example.com"]);
  });

  it("returns array with all PII values when multiple markers are found", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Found: <s>John Doe</s> and <s>555-1234</s>",
    });
    const result = await PIIValidation("My name is John Doe, call 555-1234");
    expect(result).toEqual(["John Doe", "555-1234"]);
  });

  it("propagates error when generateText throws (provider down)", async () => {
    mockGenerateText.mockRejectedValue(new Error("Haiku unreachable"));
    await expect(PIIValidation("test")).rejects.toThrow("Haiku unreachable");
  });
});
