// PreToolUse guard for builder, ghost-smith and judge (brief §13.2).
// Checks ONLY path-like fields and shell command strings, never file contents.
// Exit 2 = block the tool call. Works on Windows (reads stdin via fd 0).
import { readFileSync } from 'node:fs';

const PROTECTED = /apps[\\/]shop[\\/]src[\\/]mutants|mutant-manifest\.json|manifest\.sha256|bench[\\/]\.private|S03-mutation-engine|steering[\\/]mutants\.md/i;
const PATH_KEY = /^(path|paths|file|files|file_path|filepath|filename|target|targets|dir|directory|cwd|pattern|glob|include|command|cmd|args)$/i;
const CONTENT_KEY = /^(content|contents|text|new_str|old_str|new_string|old_string|body|data|diff|patch)$/i;

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }

const hits = [];
function walk(value, key = '') {
  if (CONTENT_KEY.test(key)) return;
  if (typeof value === 'string') { if (PATH_KEY.test(key) && PROTECTED.test(value)) hits.push(key); return; }
  if (Array.isArray(value)) { for (const v of value) walk(v, key); return; }
  if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) walk(v, k); }
}
walk(input.tool_input ?? input);

if (hits.length) {
  process.stderr.write('Access denied: mutant paths are protected (brief §13.2).\n');
  process.exit(2);
}
process.exit(0);
