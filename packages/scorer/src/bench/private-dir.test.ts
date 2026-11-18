import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRIVATE_ROOT, assertInsidePrivate, privateWriter } from './private-dir';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pg-private-'));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('assertInsidePrivate', () => {
  it('accepts the root and anything below it', () => {
    expect(assertInsidePrivate(root, root)).toBe(resolve(root));
    expect(assertInsidePrivate(join(root, 'runs', 'a'), root)).toBe(join(resolve(root), 'runs', 'a'));
  });

  it.each([['..'], [join('..', 'elsewhere')], [join('runs', '..', '..', 'x')]])('refuses a path that escapes the root (%s)', (rel) => {
    expect(() => assertInsidePrivate(join(root, rel), root)).toThrow(/outside bench\/\.private/);
  });

  it('refuses a sibling whose name merely starts with the root name', () => {
    expect(() => assertInsidePrivate(`${root}-evil`, root)).toThrow();
  });

  it('refuses bench/results and the repo root, which is where scored results must not go before S08', () => {
    expect(() => assertInsidePrivate(join(DEFAULT_PRIVATE_ROOT, '..', 'results'))).toThrow();
    expect(() => assertInsidePrivate(join(DEFAULT_PRIVATE_ROOT, '..', '..'))).toThrow();
    expect(DEFAULT_PRIVATE_ROOT.replace(/\\/g, '/')).toMatch(/\/bench\/\.private$/);
  });
});

describe('privateWriter', () => {
  it('writes inside the root, creating directories', async () => {
    const file = await privateWriter(root).write(join(root, 'runs', 'x'), 'a.json', '{"a":1}');
    expect(await readFile(file, 'utf8')).toBe('{"a":1}');
  });

  it('refuses a directory outside the root and file names with separators', async () => {
    const w = privateWriter(root);
    await expect(w.write(join(root, '..'), 'a.json', '')).rejects.toThrow();
    await expect(w.write(root, '../a.json', '')).rejects.toThrow(/invalid file name/);
    await expect(w.write(root, 'sub\\a.json', '')).rejects.toThrow(/invalid file name/);
  });
});
