// File Save hook: run the saved package's property tests in fast mode (brief §13.3).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
const m = raw.match(/packages[\\/]+([^\\/"]+)/);
if (!m) process.exit(0);
try {
  execSync(`pnpm --filter @poltergeist/${m[1]} run --if-present test:prop`, {
    stdio: 'inherit', env: { ...process.env, FC_NUM_RUNS: '100' },
  });
} catch { process.exit(1); }
