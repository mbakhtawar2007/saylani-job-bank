import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = path.join(root, 'services', 'matching');
const action = process.argv[2];
const python = path.join(
  service,
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
);

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: service, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (action === 'install') {
  const status = run(process.env.PYTHON || 'python', ['-m', 'venv', '.venv']);
  if (status !== 0) process.exit(status);
} else if (action !== 'test' && action !== 'dev') {
  console.error('Usage: matching-python.mjs <install|test|dev>');
  process.exit(2);
}

if (!existsSync(python)) {
  console.error('Matching virtual environment is missing; run pnpm matching:install first.');
  process.exit(1);
}

const args =
  action === 'install'
    ? ['-m', 'pip', 'install', '-e', '.[dev]']
    : action === 'test'
      ? ['-m', 'pytest', '-q']
      : ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'];
process.exit(run(python, args));
