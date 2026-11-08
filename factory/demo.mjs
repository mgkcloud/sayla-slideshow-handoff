import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const scripts = [
  'spanish-isnt-speaking-spanish.json',
  'duolingo-isnt-practice.json',
  'more-words-less-panic.json',
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [join(root, 'generate-slides.js'), join(root, 'examples', script)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `--require=${join(root, 'test', 'block-network.cjs')}` },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Three local draft sets created. Manual approval is required; nothing was uploaded or scheduled.');
