import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, passthrough } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import ChatPage from "./page";

// ---------------------------------------------------------------------------
// Mock useHistory — isolate page from DB
// ---------------------------------------------------------------------------

const mockSaveConversation = vi.fn().mockResolvedValue(undefined);
const mockLoadConversation = vi.fn().mockResolvedValue(null);
const mockNewConversation = vi.fn();

// Mutable so individual tests can override conversations / activeId.
let mockConversations: import("@/lib/schema/history").History[] = [];
let mockActiveId: string | null = null;

vi.mock("@/lib/hooks/use-history", () => ({
  useHistory: () => ({
    get conversations() {
      return mockConversations;
    },
    get activeId() {
      return mockActiveId;
    },
    saveConversation: mockSaveConversation,
    loadConversation: mockLoadConversation,
    newConversation: mockNewConversation,
  }),
}));

// ---------------------------------------------------------------------------
// MSW server — intercepts POST /api/chat, passthrough for Ollama
// ---------------------------------------------------------------------------

// Builds a UI message stream (SSE) that the @ai-sdk/react useChat hook understands.
// Format: data: <JSON chunk>\n\n per event.
function makeUIMessageStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  const textId = crypto.randomUUID();
  const chunks = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: textId },
    { type: "text-delta", delta: text, id: textId },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish" },
  ];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

const server = setupServer(
  http.post("http://localhost:11434/*", () => passthrough()),
  http.post(
    "/api/chat",
    () =>
      new HttpResponse(makeUIMessageStream("Hello from mock!"), {
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
      }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.clearAllMocks();
  mockConversations = [];
  mockActiveId = null;
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Dependency graph: what ChatPage imports and renders
// ---------------------------------------------------------------------------

describe("ChatPage — dependency graph", () => {
  it("renders the page shell (header, input, send button)", () => {
    render(<ChatPage />);
    expect(screen.getByRole("heading", { name: /chat/i })).toBeDefined();
    expect(screen.getByPlaceholderText(/type a message/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDefined();
  });

  it("renders the history toggle button", () => {
    render(<ChatPage />);
    expect(
      screen.getByRole("button", { name: /open conversation history/i }),
    ).toBeDefined();
  });

  it("renders the drawer toggle with aria-expanded false by default", () => {
    render(<ChatPage />);
    const toggle = screen.getByRole("button", {
      name: /open conversation history/i,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// ChatPage behavior
// ---------------------------------------------------------------------------

describe("ChatPage — behavior", () => {
  it("shows the empty state message", () => {
    render(<ChatPage />);
    expect(screen.getByText(/start a conversation/i)).toBeDefined();
  });

  it("disables the send button when input is empty", () => {
    render(<ChatPage />);
    const button = screen.getByRole("button", {
      name: /send message/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables the send button when input has text", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    const button = screen.getByRole("button", {
      name: /send message/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("displays the user message in the conversation", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByText("Hello")).toBeDefined());
  });
});

// ---------------------------------------------------------------------------
// Drawer interaction
// ---------------------------------------------------------------------------

describe("ChatPage — drawer", () => {
  it("opens the drawer when the history toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.click(
      screen.getByRole("button", { name: /open conversation history/i }),
    );
    // After opening, vaul sets aria-hidden on main content; query including hidden nodes.
    // The drawer title "History" becomes visible in the accessible tree.
    await waitFor(() => expect(screen.getByText(/^history$/i)).toBeDefined());
  });

  it("shows 'No conversations yet' when history is empty", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.click(
      screen.getByRole("button", { name: /open conversation history/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/no conversations yet/i)).toBeDefined(),
    );
  });
});

// ---------------------------------------------------------------------------
// New conversation
// ---------------------------------------------------------------------------

describe("ChatPage — new conversation", () => {
  it("calls newConversation when the new button is clicked inside the drawer", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.click(
      screen.getByRole("button", { name: /open conversation history/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /new conversation/i }),
      ).toBeDefined(),
    );
    await user.click(screen.getByRole("button", { name: /new conversation/i }));
    expect(mockNewConversation).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("ChatPage — persistence", () => {
  it("calls saveConversation after a message exchange completes", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(mockSaveConversation).toHaveBeenCalled(), {
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// Conversation switching
// ---------------------------------------------------------------------------

describe("ChatPage — conversation switching", () => {
  it("displays messages from the selected conversation", async () => {
    const convId = crypto.randomUUID();
    const savedMessages: import("@/lib/schema/message").Message[] = [
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        message: "What is the capital of France?",
        type: "question",
      },
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        message: "The capital of France is Paris.",
        type: "answer",
      },
    ];

    // Set up the drawer with one conversation item.
    mockConversations = [
      {
        id: convId,
        date: new Date().toISOString(),
        messages: savedMessages,
        messageIds: savedMessages.map((m) => m.id),
      },
    ];

    // loadConversation returns the saved messages for this conversation.
    mockLoadConversation.mockResolvedValue(savedMessages);

    const user = userEvent.setup();
    render(<ChatPage />);

    // Open the history drawer.
    await user.click(
      screen.getByRole("button", { name: /open conversation history/i }),
    );

    // Click the conversation item inside the open drawer.
    // vaul sets pointer-events:none on body while open, so fireEvent bypasses that.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /conversation from/i }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: /conversation from/i }));

    // Wait for loadConversation to have been called — confirms selection was processed.
    await waitFor(() =>
      expect(mockLoadConversation).toHaveBeenCalledWith(convId),
    );

    // After selection the drawer closes and ChatContent remounts with saved messages.
    // getAllByText handles duplicates (ConversationItem preview + chat bubble).
    await waitFor(
      () => {
        expect(
          screen.getAllByText("What is the capital of France?").length,
        ).toBeGreaterThan(0);
        expect(
          screen.getAllByText("The capital of France is Paris.").length,
        ).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });
});

// ---------------------------------------------------------------------------
// PII persistence: reload from IndexedDB with placeholders
// ---------------------------------------------------------------------------

describe("ChatPage — PII reload from history", () => {
  it("restores PII blur when loading a saved conversation with placeholders", async () => {
    const convId = crypto.randomUUID();
    const savedMessages: import("@/lib/schema/message").Message[] = [
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        message: "Who is $1?",
        type: "question",
      },
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        message: "The person you mentioned is $1, born on $2.",
        type: "answer",
        pii: ["John Doe", "02/02/1994"],
      },
    ];

    mockConversations = [
      {
        id: convId,
        date: new Date().toISOString(),
        messages: savedMessages,
        messageIds: savedMessages.map((m) => m.id),
      },
    ];
    mockLoadConversation.mockResolvedValue(savedMessages);

    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(
      screen.getByRole("button", { name: /open conversation history/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /conversation from/i }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: /conversation from/i }));

    await waitFor(
      () => {
        const blurred = document.querySelectorAll(".blur-sm");
        expect(blurred.length).toBeGreaterThan(0);
        const blurredTexts = Array.from(blurred).map((el) => el.textContent);
        expect(blurredTexts).toContain("[REDACTED]");
      },
      { timeout: 3000 },
    );
  });
});

// ---------------------------------------------------------------------------
// PII blur rendering
// ---------------------------------------------------------------------------

// Stream that includes a message-metadata event with pii values
function makeUIMessageStreamWithPII(
  text: string,
  pii: string[],
): ReadableStream {
  const encoder = new TextEncoder();
  const textId = crypto.randomUUID();
  const chunks = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: textId },
    { type: "text-delta", delta: text, id: textId },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "message-metadata", messageMetadata: { pii } },
    { type: "finish" },
  ];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

describe("ChatPage — PII blur rendering", () => {
  it("renders assistant message text without blur when no PII", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() =>
      expect(screen.getByText("Hello from mock!")).toBeDefined(),
    );
    // No blur spans present
    const blurred = document.querySelectorAll(".blur-sm");
    expect(blurred.length).toBe(0);
  });

  it("wraps detected PII in a blur-sm span in the assistant message", async () => {
    server.use(
      http.post(
        "/api/chat",
        () =>
          new HttpResponse(
            makeUIMessageStreamWithPII("Hello $1, how are you?", ["John Doe"]),
            {
              headers: {
                "Content-Type": "text/event-stream",
                "x-vercel-ai-ui-message-stream": "v1",
              },
            },
          ),
      ),
    );

    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(
      () => {
        const blurred = document.querySelectorAll(".blur-sm");
        expect(blurred.length).toBeGreaterThan(0);
        expect(blurred[0].textContent).toBe("[REDACTED]");
      },
      { timeout: 5000 },
    );
  });

  it("does not blur user messages", async () => {
    server.use(
      http.post(
        "/api/chat",
        () =>
          new HttpResponse(
            makeUIMessageStreamWithPII("You said: $1", ["John Doe"]),
            {
              headers: {
                "Content-Type": "text/event-stream",
                "x-vercel-ai-ui-message-stream": "v1",
              },
            },
          ),
      ),
    );

    const user = userEvent.setup();
    render(<ChatPage />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "John Doe");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0),
    );

    // User bubble: no blur-sm wrapper on the user message element
    const userBubbles = document.querySelectorAll(".justify-end .blur-sm");
    expect(userBubbles.length).toBe(0);
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
