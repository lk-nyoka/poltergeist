import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared';

export default mergeConfig(shared, {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
