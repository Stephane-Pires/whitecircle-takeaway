import Dexie, { type Table } from "dexie";
import type { History } from "@/lib/schema/history";

export class AppDatabase extends Dexie {
  histories!: Table<History, string>;

  constructor() {
    super("whitecircle-chat");
    this.version(1).stores({
      // "id" is the primary key (UUID supplied by us).
      // "date" is indexed for chronological ordering.
      // "messages" is stored as an opaque JSON blob — not listed here.
      histories: "id, date",
    });
  }
}

export const db = new AppDatabase();
