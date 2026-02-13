"use client";

import { PenSquare } from "lucide-react";
import { ConversationItem } from "@/components/conversation-item";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { History } from "@/lib/schema/history";

interface ConversationDrawerProps {
  conversations: History[] | undefined;
  activeId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationDrawer({
  conversations,
  activeId,
  isOpen,
  onOpenChange,
  onSelect,
  onNew,
}: ConversationDrawerProps) {
  function handleSelect(id: string) {
    onSelect(id);
    onOpenChange(false);
  }

  function handleNew() {
    onNew();
    onOpenChange(false);
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange} direction="left">
      <DrawerContent aria-label="Chat history">
        <DrawerHeader className="flex flex-row items-center justify-between border-b pb-3">
          <DrawerTitle>History</DrawerTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNew}
            aria-label="New conversation"
          >
            <PenSquare className="h-4 w-4" />
          </Button>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-2 py-3">
          {conversations === undefined && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
          )}
          {conversations?.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          )}
          {conversations?.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              isActive={c.id === activeId}
              onSelect={handleSelect}
            />
          ))}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
