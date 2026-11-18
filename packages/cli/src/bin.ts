#!/usr/bin/env -S npx tsx
import { main } from './cli';

const code = await main(process.argv.slice(2), process.env, {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
});
process.exit(code);
