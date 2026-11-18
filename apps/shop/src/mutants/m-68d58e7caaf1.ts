import type { MutantOverride } from '@poltergeist/protocol';

type Add = (sid: string, productId: string, body: unknown) => Promise<{ productId: string; body: string }>;

export const override: MutantOverride = {
  id: '68d58e7caaf1',
  seam: 'reviews/add',
  public: false,
  // The review is stored in decomposed Unicode form (NFD), so composed text no longer round-trips.
  impl: (original: Add, sid: string, productId: string, body: unknown) =>
    original(sid, productId, typeof body === 'string' && body.isWellFormed() ? body.normalize('NFD') : body),
};
