import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, passthrough } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import ChatPage from "./page";

// ---------------------------------------------------------------------------
// MSW server — intercepts POST /api/chat, passthrough for Ollama
// ---------------------------------------------------------------------------

function makeStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:"${text}"\n`));
      controller.close();
    },
  });
}

const server = setupServer(
  http.post("http://localhost:11434/*", () => passthrough()),
  http.post(
    "/api/chat",
    () =>
      new HttpResponse(makeStream("Hello from mock!"), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe("ChatPage", () => {
  it("renders the chat header", () => {
    render(<ChatPage />);
    expect(screen.getByRole("heading", { name: /chat/i })).toBeDefined();
  });

  it("shows the empty state message", () => {
    render(<ChatPage />);
    expect(screen.getByText(/start a conversation/i)).toBeDefined();
  });

  it("renders the input and send button", () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeDefined();
    expect(screen.getByRole("button")).toBeDefined();
  });

  it("disables the send button when input is empty", () => {
    render(<ChatPage />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables the send button when input has text", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button"));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("displays the user message in the conversation", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Hello")).toBeDefined());
  });
});

// ---------------------------------------------------------------------------
// Integration test — calls local Ollama directly (requires `ollama serve`)
// ---------------------------------------------------------------------------

describe("Ollama integration", () => {
  it("responds to a prompt via local Ollama API", async () => {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        messages: [
          { role: "user", content: 'Reply with only the word "pong"' },
        ],
        stream: false,
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.message?.content).toBeDefined();
  }, 30000);
});
