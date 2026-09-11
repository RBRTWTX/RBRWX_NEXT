import { spawnSync } from 'node:child_process';

function resolveSpawn(command, args) {
  if (process.platform === 'win32' && command === 'npm') {
    return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/c', 'npm', ...args] };
  }
  return { executable: command, args };
}

function run(command, args) {
  const resolved = resolveSpawn(command, args);
  console.log(`> ${[command, ...args].join(' ')}`);
  const result = spawnSync(resolved.executable, resolved.args, { stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with code ${String(result.status)}.`);
}

run('node', ['scripts/broadcast/validate-broadcast-payload.mjs']);
run('node', ['scripts/broadcast/validate-broadcast-package.mjs']);
run('node', ['--test', 'scripts/broadcast/compiler-api.test.mjs', 'scripts/broadcast/broadcast-state.test.mjs']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'build']);
console.log('RBRWX standalone Broadcast verification: PASS');

run('node', ['scripts/graphics/verify.mjs']);
