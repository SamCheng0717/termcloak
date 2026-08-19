import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hasPythonPty = process.platform !== 'win32'
  && spawnSync('python3', ['-c', 'import pty'], { stdio: 'ignore' }).status === 0;

const ptyDriver = String.raw`
import os, pty, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:])
time.sleep(0.8 if os.environ.get('TERMCLOAK_PTY_ACTION') == 'animate' else 0.2)
if os.environ.get('TERMCLOAK_PTY_ACTION') == 'signal':
    os.kill(pid, 15)
else:
    os.write(fd, b'q')
chunks = []
while True:
    ready, _, _ = select.select([fd], [], [], 8)
    if not ready:
        os.kill(pid, 15)
        break
    try:
        data = os.read(fd, 65536)
    except OSError:
        break
    if not data:
        break
    chunks.append(data)
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(b''.join(chunks))
sys.exit(os.waitstatus_to_exitcode(status))
`;

async function runInPty(action = 'quit') {
  const cliArgs = ['./bin/termcloak.js', '--demo', '--no-save'];
  if (action !== 'animate') cliArgs.push('--reduced-motion');
  const child = spawn('python3', [
    '-c',
    ptyDriver,
    process.execPath,
    ...cliArgs
  ], {
    cwd: projectRoot,
    env: { ...process.env, TERM: 'xterm-256color', TERMCLOAK_PTY_ACTION: action },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const code = await new Promise((resolveClose, rejectClose) => {
    child.once('error', rejectClose);
    child.once('close', resolveClose);
  });
  return { code, output };
}

test('真实 PTY 中启动、绘制并退出后恢复备用屏幕', {
  skip: !hasPythonPty,
  timeout: 10000
}, async () => {
  const { code, output } = await runInPty();

  assert.equal(code, 0, output);
  assert.equal(output.includes('\x1b[?1049h'), true, output);
  assert.equal(output.includes('\x1b[?1049l'), true, output);
  assert.doesNotMatch(output, /termcloak: /u);

  const rows = [...output.matchAll(/\x1b\[(\d+);1H/gu)].map((match) => Number(match[1]));
  assert.ok(rows.length > 0);
  assert.ok(Math.max(...rows) <= 27, `wrote outside reserved viewport row: ${Math.max(...rows)}`);
});

test('真实 PTY 收到 SIGTERM 后仍恢复终端', {
  skip: !hasPythonPty,
  timeout: 10000
}, async () => {
  const { code, output } = await runInPty('signal');
  assert.equal(code, 143, output);
  assert.equal(output.includes('\x1b[?1049h'), true, output);
  assert.equal(output.includes('\x1b[?1049l'), true, output);
});

test('真实 PTY 动画持续刷新时不写出保留视口', {
  skip: !hasPythonPty,
  timeout: 10000
}, async () => {
  const { code, output } = await runInPty('animate');
  assert.equal(code, 0, output);
  const rows = [...output.matchAll(/\x1b\[(\d+);1H/gu)].map((match) => Number(match[1]));
  assert.ok(rows.length > 4, 'animation did not produce multiple differential frame writes');
  assert.ok(Math.max(...rows) <= 27, `animated outside reserved viewport row: ${Math.max(...rows)}`);
  assert.equal(output.includes('\x1b[?1049l'), true);
});
