import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManifestError, readManifest, sha256Hex } from './manifest';

// The tests use the fixture manifest only. The real bench/mutant-manifest.json is never touched.
const FIXTURE = fileURLToPath(new URL('../test/fixtures/manifest.fixture.json', import.meta.url));

let dir: string;
let manifestPath: string;
let hashPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'poltergeist-manifest-'));
  manifestPath = join(dir, 'manifest.json');
  hashPath = join(dir, 'manifest.sha256');
  writeFileSync(manifestPath, readFileSync(FIXTURE));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const hashOf = (p: string) => sha256Hex(readFileSync(p));

describe('readManifest', () => {
  it('reads the fixture when the hash matches', () => {
    writeFileSync(hashPath, hashOf(manifestPath) + '\n');
    const m = readManifest(manifestPath, hashPath);
    expect(m.version).toBe(1);
    expect(m.mutants).toHaveLength(6);
  });

  it('accepts sha256sum format and upper-case digests', () => {
    writeFileSync(hashPath, `${hashOf(manifestPath).toUpperCase()}  mutant-manifest.json\r\n`);
    expect(readManifest(manifestPath, hashPath).mutants).toHaveLength(6);
  });

  it('refuses when the manifest changed after the hash was committed', () => {
    writeFileSync(hashPath, hashOf(manifestPath));
    writeFileSync(manifestPath, readFileSync(FIXTURE, 'utf8').replace('"public": false', '"public": true'));
    expect(() => readManifest(manifestPath, hashPath)).toThrow(ManifestError);
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/does not match/);
  });

  it('refuses on a one-byte change, even trailing whitespace', () => {
    writeFileSync(hashPath, hashOf(manifestPath));
    writeFileSync(manifestPath, readFileSync(FIXTURE, 'utf8') + ' ');
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/does not match/);
  });

  it('refuses when the hash file is missing, empty or has no digest', () => {
    expect(() => readManifest(manifestPath, join(dir, 'absent.sha256'))).toThrow(/hash file/);
    writeFileSync(hashPath, '');
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/digest/);
    writeFileSync(hashPath, 'not-a-hash');
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/digest/);
  });

  it('refuses when the manifest is missing', () => {
    writeFileSync(hashPath, 'a'.repeat(64));
    expect(() => readManifest(join(dir, 'absent.json'), hashPath)).toThrow(ManifestError);
  });

  it('refuses content that matches its hash but is not a valid manifest', () => {
    writeFileSync(manifestPath, JSON.stringify({ version: 2, mutants: [] }));
    writeFileSync(hashPath, hashOf(manifestPath));
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/schema/);
    writeFileSync(manifestPath, '{ nope');
    writeFileSync(hashPath, hashOf(manifestPath));
    expect(() => readManifest(manifestPath, hashPath)).toThrow(/JSON/);
  });

  it('does not leak manifest contents in its error messages', () => {
    writeFileSync(hashPath, 'b'.repeat(64));
    try {
      readManifest(manifestPath, hashPath);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toMatch(/f1x0000/);
    }
  });
});
