import { AsyncLocalStorage } from 'node:async_hooks';
import type { ComponentType } from 'react';
import type { MutantOverride } from '@poltergeist/protocol';
import { overrides as shipped } from '@/mutants/index';

export type RequestCtx = { sid: string; token: string; mutants: ReadonlySet<string> };
export const requestContext = new AsyncLocalStorage<RequestCtx>();

let overrides: readonly MutantOverride[] = shipped;
const originals = new Map<string, unknown>();

/** Test-only hook for registry unit tests. Never import outside *.test.ts. */
export function _setOverridesForTest(o: readonly MutantOverride[]) { overrides = o; }
export function getOverrides() { return overrides; }

export function seam<A extends unknown[], R>(key: string, fn: (...args: A) => R): (...args: A) => R {
  if (originals.has(key)) throw new Error(`duplicate seam key: ${key}`);
  originals.set(key, fn);
  return (...args: A): R => {
    const active = requestContext.getStore()?.mutants;
    if (active && active.size > 0) {
      const o = overrides.find((x) => x.seam === key && active.has(x.id));
      if (o) return (o.impl as (orig: (...a: A) => R, ...a: A) => R)(fn, ...args);
    }
    return fn(...args);
  };
}

/** Render seam: returns the component to render for the current request. Call inside withPage(). */
export function seamComponent<P>(key: string, C: ComponentType<P>) {
  const pick = seam(key, () => C);
  return { resolve: (): ComponentType<P> => pick() };
}

export const listSeamKeys = () => [...originals.keys()].sort();
