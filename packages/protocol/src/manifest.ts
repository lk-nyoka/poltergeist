import { z } from 'zod';

export const MutantManifest = z.object({
  version: z.literal(1),
  mutants: z.array(
    z.object({
      id: z.string(),
      rule: z.enum(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12']),
      seam: z.string(),
      public: z.boolean(),
    }),
  ),
});

export type MutantManifest = z.infer<typeof MutantManifest>;
