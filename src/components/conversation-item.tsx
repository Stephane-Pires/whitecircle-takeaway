"use client";

import { useEffect, useState } from "react";
import type { History } from "@/lib/schema/history";
import { cn } from "@/lib/utils";

interface ConversationItemProps {
  conversation: History;
  isActive: boolean;
  onSelect: (id: string) => void;
}

function getRelativeTime(from: Date): string {
  const diffMs = Date.now() - from.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const lastMessage = conversation.messages.at(-1);
  const lastDate = new Date(lastMessage?.date ?? conversation.date);

  const [relativeTime, setRelativeTime] = useState(() =>
    getRelativeTime(lastDate),
  );

  useEffect(() => {
    setRelativeTime(getRelativeTime(lastDate));
    const interval = setInterval(() => {
      setRelativeTime(getRelativeTime(lastDate));
    }, 60_000);
    return () => clearInterval(interval);
  }, [lastDate]);

  const firstQuestion = conversation.messages.find(
    (m) => m.type === "question",
  );
  const preview = firstQuestion?.message ?? "Empty conversation";
  const date = new Date(conversation.date);
  const formattedDate = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Conversation from ${formattedDate}, ${relativeTime}`}
      className={cn(
        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isActive && "bg-accent text-accent-foreground font-medium",
      )}
    >
      <div className="mb-0.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {formattedDate} · {formattedTime}
        </span>
        <span>{relativeTime}</span>
      </div>
      <p className="truncate">{preview}</p>
    </button>
  );
}
