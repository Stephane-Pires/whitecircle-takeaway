import { z } from "zod";
import { MESSAGE } from "./message";

export const HISTORY = z.object({
  id: z.string().uuid(),
  date: z.string().datetime(),
  messages: z.array(MESSAGE),
  messageIds: z.array(z.string().uuid()),
});

export type History = z.infer<typeof HISTORY>;
