// Boots the Traklet AutoDev control plane (vite-node) and the Lit dashboard
// (vite) together, and tears both down on exit. Run from the repo root:
//   npm run demo
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = (name) => join(ROOT, 'node_modules', '.bin', name);

const procs = [
  ['server', bin('vite-node'), ['traklet-autodev/server/index.ts']],
  ['dashboard', bin('vite'), ['--config', 'traklet-autodev/dashboard/vite.config.ts']],
].map(([label, cmd, args]) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  p.on('exit', (code) => {
    console.log(`[${label}] exited (${code}); shutting down`);
    shutdown();
  });
  return p;
});

let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const p of procs) {
    try {
      p.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[autodev] dashboard: http://localhost:5990   control plane: http://localhost:8787');
