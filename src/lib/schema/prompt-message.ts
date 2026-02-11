import { z } from "zod";

export const PROMPT_MESSAGE = z.object({
  message: z.string().min(1),
  created_date: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PromptMessage = z.infer<typeof PROMPT_MESSAGE>;
