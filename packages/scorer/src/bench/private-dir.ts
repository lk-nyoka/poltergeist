import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `<repo>/bench/.private`: the only place until S08 where per-(mutant,seed) detail may be written. */
export const DEFAULT_PRIVATE_ROOT = fileURLToPath(new URL('../../../../bench/.private', import.meta.url));

/** Throws unless `target` is inside `privateRoot`. */
export function assertInsidePrivate(target: string, privateRoot: string = DEFAULT_PRIVATE_ROOT): string {
  const abs = resolve(target);
  const rel = relative(resolve(privateRoot), abs);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error('refusing to write benchmark detail outside bench/.private');
  }
  return abs;
}

export type PrivateWriter = {
  /** Writes `text` to `<dir>/<name>`, where `dir` must be inside the private root. */
  write(dir: string, name: string, text: string): Promise<string>;
};

export function privateWriter(privateRoot: string = DEFAULT_PRIVATE_ROOT): PrivateWriter {
  return {
    async write(dir, name, text) {
      const abs = assertInsidePrivate(dir, privateRoot);
      if (name.includes('/') || name.includes('\\') || name === '..') throw new Error('invalid file name');
      await mkdir(abs, { recursive: true });
      const file = join(abs, name);
      assertInsidePrivate(dirname(file), privateRoot);
      await writeFile(file, text, 'utf8');
      return file;
    },
  };
}
