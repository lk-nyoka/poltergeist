import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MutantManifest } from '@poltergeist/protocol';

/** Default locations, resolved from this file. Nothing is read until `readManifest` is called. */
export const DEFAULT_MANIFEST_PATH = fileURLToPath(new URL('../../../bench/mutant-manifest.json', import.meta.url));
export const DEFAULT_HASH_PATH = fileURLToPath(new URL('../../../bench/manifest.sha256', import.meta.url));

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reads the mutant manifest. Refuses unless the SHA-256 of the file's exact bytes equals the
 * committed hash (the first 64-hex token of the hash file, `sha256sum` style files included),
 * and the content passes the `MutantManifest` schema. The hash is committed before the first
 * scored run, so a changed manifest can never score quietly.
 */
export function readManifest(
  manifestPath: string = DEFAULT_MANIFEST_PATH,
  hashPath: string = DEFAULT_HASH_PATH,
): MutantManifest {
  let bytes: Buffer;
  let hashFile: string;
  try {
    bytes = readFileSync(manifestPath);
  } catch {
    throw new ManifestError('manifest file could not be read');
  }
  try {
    hashFile = readFileSync(hashPath, 'utf8');
  } catch {
    throw new ManifestError('manifest hash file could not be read; refusing to score without it');
  }
  const expected = /\b[0-9a-fA-F]{64}\b/.exec(hashFile)?.[0]?.toLowerCase();
  if (!expected) throw new ManifestError('hash file does not contain a SHA-256 digest');
  if (sha256Hex(bytes) !== expected) {
    throw new ManifestError('manifest SHA-256 does not match the committed hash; refusing to score');
  }
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ManifestError('manifest is not valid JSON');
  }
  const parsed = MutantManifest.safeParse(json);
  if (!parsed.success) throw new ManifestError('manifest does not match the MutantManifest schema');
  return parsed.data;
}
