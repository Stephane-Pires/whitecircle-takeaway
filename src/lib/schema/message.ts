import { z } from "zod";

export const MESSAGE = z.object({
  id: z.string().uuid(),
  date: z.string().datetime(),
  message: z.string().min(1),
  type: z.enum(["answer", "question"]),
  pii: z.array(z.string()).optional(),
});

export type Message = z.infer<typeof MESSAGE>;
