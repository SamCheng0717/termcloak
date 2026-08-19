import { createHash, randomBytes } from 'node:crypto';
import { chmod, copyFile, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const FORMAT_VERSION = 2;
const LOCK_TIMEOUT_MS = 2000;
const STALE_LOCK_MS = 15000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function legacyBookId(filePath) {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

export function bookId(book) {
  return typeof book === 'string' ? legacyBookId(book) : book.identity;
}

export function defaultProgressPath() {
  const base = process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, 'termcloak')
    : join(homedir(), '.termcloak');
  return join(base, 'progress.json');
}

function normalizeStore(content) {
  if (content?.version === FORMAT_VERSION && content.books && typeof content.books === 'object') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return { version: FORMAT_VERSION, books: content };
  }
  return { version: FORMAT_VERSION, books: {} };
}

async function readStore(statePath) {
  try {
    return normalizeStore(JSON.parse(await readFile(statePath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
      try {
        return normalizeStore(JSON.parse(await readFile(`${statePath}.bak`, 'utf8')));
      } catch (backupError) {
        if (backupError.code === 'ENOENT' || backupError instanceof SyntaxError) {
          return { version: FORMAT_VERSION, books: {} };
        }
        throw backupError;
      }
    }
    throw error;
  }
}

export async function loadProgress(book, statePath = defaultProgressPath()) {
  const store = await readStore(statePath);
  const direct = store.books[bookId(book)];
  if (direct) return direct;
  if (typeof book === 'object' && book.filePath) {
    const pathHash = legacyBookId(book.filePath);
    const legacy = store.books[pathHash];
    if (legacy) return legacy;
    return Object.values(store.books)
      .filter((progress) => progress.filePathHash === pathHash)
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0] || null;
  }
  return null;
}

export async function listProgress(statePath = defaultProgressPath()) {
  const store = await readStore(statePath);
  return Object.entries(store.books)
    .map(([identity, progress]) => ({ identity, ...progress }))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

async function acquireLock(lockPath) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      return await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
          await unlink(lockPath);
          continue;
        }
      } catch (lockError) {
        if (lockError.code !== 'ENOENT') throw lockError;
      }
      await sleep(25);
    }
  }
  throw new Error('进度文件正被其他 Termcloak 进程使用，请稍后重试');
}

async function atomicWrite(statePath, content) {
  const temporaryPath = `${statePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    try {
      JSON.parse(await readFile(statePath, 'utf8'));
      await copyFile(statePath, `${statePath}.bak`);
      await chmod(`${statePath}.bak`, 0o600).catch((error) => {
        if (error.code !== 'EPERM') throw error;
      });
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await rename(temporaryPath, statePath);
    await chmod(statePath, 0o600).catch((error) => {
      if (error.code !== 'EPERM') throw error;
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporaryPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function saveProgress(book, progress, statePath = defaultProgressPath()) {
  const directory = dirname(statePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch((error) => {
    if (error.code !== 'EPERM') throw error;
  });

  const lockPath = `${statePath}.lock`;
  const lock = await acquireLock(lockPath);
  try {
    const store = await readStore(statePath);
    store.books[bookId(book)] = {
      ...progress,
      filePath: typeof book === 'object' ? book.filePath : undefined,
      filePathHash: typeof book === 'object' && book.filePath ? legacyBookId(book.filePath) : undefined,
      updatedAt: new Date().toISOString()
    };
    await atomicWrite(statePath, JSON.stringify(store, null, 2) + '\n');
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
