"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PROMPT_MESSAGE } from "@/lib/schema/prompt-message";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: msgs }) => {
        const last = msgs[msgs.length - 1];
        const text = last.parts.find((p) => p.type === "text")?.text ?? "";
        const body = PROMPT_MESSAGE.parse({
          message: text,
          created_date: new Date().toISOString(),
        });
        return { body };
      },
    }),
  });

  console.log("messages", messages);

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Chat</h1>
      </header>

      <ScrollArea className="flex-1 px-6 py-4">
        <div className="mx-auto max w-2xl space-y-4">
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
                  {text}
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
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
