"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { History, Send } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConversationDrawer } from "@/components/conversation-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHistory } from "@/lib/hooks/use-history";
import type { Message } from "@/lib/schema/message";
import { MESSAGE } from "@/lib/schema/message";

function toUIMessages(saved: Message[]): UIMessage[] {
  return saved.map((m) => ({
    id: m.id,
    role: m.type === "question" ? ("user" as const) : ("assistant" as const),
    parts: [{ type: "text" as const, text: m.message }],
    content: m.message,
    ...(m.pii?.length ? { metadata: { pii: m.pii } } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Inner component — owns useChat, keyed per conversation
// ---------------------------------------------------------------------------

interface ChatContentProps {
  initialMessages: UIMessage[];
  conversationId: string;
  onSave: (id: string, messages: UIMessage[]) => Promise<void>;
}

function PIIToken({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      onClick={() => setRevealed((r) => !r)}
      className={`inline-block cursor-pointer rounded px-0.5 transition-all duration-200 ${
        revealed ? "blur-none" : "blur-sm select-none"
      }`}
      aria-label={
        revealed ? value : "Redacted personal information — hover to reveal"
      }
    >
      {revealed ? value : "[REDACTED]"}
    </button>
  );
}

function renderWithPII(text: string, pii: string[]): ReactNode {
  if (!pii.length) return text;

  // Match $1, $2, … placeholders inserted by Sonnet
  const regex = /(\$\d+)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const match = part.match(/^\$(\d+)$/);
    if (match) {
      const index = Number.parseInt(match[1], 10) - 1;
      const value = pii[index];
      if (value !== undefined) {
        return <PIIToken key={`pii-${match[1]}-${i}`} value={value} />;
      }
    }
    return part;
  });
}

function ChatContent({
  initialMessages,
  conversationId,
  onSave,
}: ChatContentProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: msgs }) => {
        const last = msgs[msgs.length - 1];
        const text = last.parts.find((p) => p.type === "text")?.text ?? "";
        const body = MESSAGE.parse({
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          message: text,
          type: "question",
        });
        return { body };
      },
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Save conversation to DB when streaming completes.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready") {
      if (messages.length > 0) {
        onSave(conversationId, messages);
      }
    }
    prevStatusRef.current = status;
  }, [status, messages, onSave, conversationId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <>
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Start a conversation.
            </p>
          )}
          {messages.map((m) => {
            const text = m.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("");
            return (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.role === "assistant"
                    ? renderWithPII(
                        text,
                        (m.metadata as { pii?: string[] } | undefined)?.pii ??
                          [],
                      )
                    : text}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="border-t px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Outer shell — owns drawer + conversation switching
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversationKey, setConversationKey] = useState(() =>
    crypto.randomUUID(),
  );
  // Ref holds the messages for the next ChatContent mount.
  // Using a ref (not state) avoids the async batching race: the ref is written
  // synchronously before the key change, so ChatContent always reads the
  // correct messages on its first render.
  const pendingMessages = useRef<UIMessage[]>([]);

  const {
    conversations,
    activeId,
    saveConversation,
    loadConversation,
    newConversation,
  } = useHistory();

  async function handleSelectConversation(id: string) {
    const saved = await loadConversation(id);
    if (!saved) return;
    pendingMessages.current = toUIMessages(saved);
    setConversationKey(id);
  }

  function handleNewConversation() {
    newConversation();
    pendingMessages.current = [];
    setConversationKey(crypto.randomUUID());
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open conversation history"
          aria-expanded={drawerOpen}
        >
          <History className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Chat</h1>
      </header>

      <ConversationDrawer
        conversations={conversations}
        activeId={activeId}
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />

      <ChatContent
        key={conversationKey}
        initialMessages={pendingMessages.current}
        conversationId={conversationKey}
        onSave={saveConversation}
      />
    </div>
  );
}
