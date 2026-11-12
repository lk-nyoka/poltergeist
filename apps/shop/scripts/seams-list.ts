/**
 * `pnpm --filter @poltergeist/shop seams:list` prints every registered seam key, one per line.
 * The registry is uniform (every exported pricing, session, data-access, validation and render function is
 * wrapped), so this list says nothing about which seams are mutated. mutant-maker uses it to check that each
 * override names a real seam.
 */
import '@/seams/all';
import { listSeamKeys } from '@/seams/registry';

for (const key of listSeamKeys()) console.log(key);
