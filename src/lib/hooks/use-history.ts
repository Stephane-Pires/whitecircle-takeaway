"use client";

import type { UIMessage } from "ai";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db";
import type { History } from "@/lib/schema/history";
import type { Message } from "@/lib/schema/message";

export function mapAiMessages(aiMessages: UIMessage[]): Message[] {
  return aiMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const message = m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("");
      const pii = (m.metadata as { pii?: string[] } | undefined)?.pii;
      return {
        id: m.id,
        date: new Date().toISOString(),
        message,
        type: m.role === "user" ? ("question" as const) : ("answer" as const),
        ...(pii?.length ? { pii } : {}),
      };
    });
}

export function useHistory() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const conversations = useLiveQuery(
    () => db.histories.orderBy("date").reverse().toArray(),
    [],
  );

  async function saveConversation(id: string, aiMessages: UIMessage[]) {
    const mapped = mapAiMessages(aiMessages);
    if (mapped.length === 0) return;

    const record: History = {
      id,
      date: new Date().toISOString(),
      messages: mapped,
      messageIds: mapped.map((m) => m.id),
    };

    await db.histories.put(record);
    setActiveId(id);
  }

  async function loadConversation(id: string): Promise<Message[] | null> {
    const record = await db.histories.get(id);
    if (!record) return null;
    setActiveId(id);
    return record.messages;
  }

  function newConversation() {
    setActiveId(null);
  }

  return {
    conversations,
    activeId,
    saveConversation,
    loadConversation,
    newConversation,
  };
}
