import { z } from 'zod';

export const PossessOptions = z.union([
  z.object({ clean: z.literal(true) }).strict(),
  z.object({ count: z.number().int().min(1).max(3) }).strict(),
  z.object({ demo: z.literal(true) }).strict(),
  z.object({ cloneOf: z.string() }).strict(),
  z.object({ mutantIds: z.array(z.string()) }).strict(),
]);

export type PossessOptions = z.infer<typeof PossessOptions>;
