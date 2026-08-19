import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProgress, saveProgress } from '../src/progress.js';

test('进度按内容身份保存，移动文件后仍能加载', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'termcloak-progress-'));
  const statePath = join(directory, 'progress.json');
  const original = { identity: 'same-content', filePath: '/books/old.txt' };
  const moved = { identity: 'same-content', filePath: '/other/new.txt' };
  await saveProgress(original, { chapterId: 'chapter-a', contentOffset: 128 }, statePath);
  const restored = await loadProgress(moved, statePath);
  assert.equal(restored.chapterId, 'chapter-a');
  assert.equal(restored.contentOffset, 128);
  assert.equal(restored.filePath, '/books/old.txt');
});

test('并发保存经过锁和原子替换，不损坏 JSON 或丢失其他书籍', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'termcloak-concurrent-'));
  const statePath = join(directory, 'progress.json');
  await Promise.all([
    saveProgress({ identity: 'book-a', filePath: '/a.txt' }, { contentOffset: 10 }, statePath),
    saveProgress({ identity: 'book-b', filePath: '/b.txt' }, { contentOffset: 20 }, statePath)
  ]);
  assert.equal((await loadProgress({ identity: 'book-a', filePath: '/a.txt' }, statePath)).contentOffset, 10);
  assert.equal((await loadProgress({ identity: 'book-b', filePath: '/b.txt' }, statePath)).contentOffset, 20);
  const serialized = await readFile(statePath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.deepEqual((await readdir(directory)).filter((name) => /\.lock$|\.tmp$/u.test(name)), []);
  if (process.platform !== 'win32') assert.equal((await stat(statePath)).mode & 0o777, 0o600);
});

test('同一路径内容变化后可以回退到旧内容锚点记录', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'termcloak-anchor-'));
  const statePath = join(directory, 'progress.json');
  const before = { identity: 'content-v1', filePath: '/books/editing.txt' };
  const after = { identity: 'content-v2', filePath: '/books/editing.txt' };
  await saveProgress(before, { contentOffset: 80, paragraphHash: 'hashed-context', paragraphInnerOffset: 8 }, statePath);
  const restored = await loadProgress(after, statePath);
  assert.equal(restored.contentOffset, 80);
  assert.equal(restored.paragraphHash, 'hashed-context');
  assert.equal(restored.paragraphInnerOffset, 8);
  assert.doesNotMatch(await readFile(statePath, 'utf8'), /保持不变的上下文/u);
});

test('主进度文件损坏时恢复上一个有效备份', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'termcloak-backup-'));
  const statePath = join(directory, 'progress.json');
  const book = { identity: 'recoverable', filePath: '/recover.txt' };
  await saveProgress(book, { contentOffset: 10 }, statePath);
  await saveProgress(book, { contentOffset: 20 }, statePath);
  await writeFile(statePath, '{broken', 'utf8');
  assert.equal((await loadProgress(book, statePath)).contentOffset, 10);
});

test('读取 0.1 旧格式进度并在下次保存时迁移', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'termcloak-migrate-'));
  const statePath = join(directory, 'progress.json');
  const book = { identity: 'migrated-book', filePath: '/migrated.txt' };
  await writeFile(statePath, JSON.stringify({ 'migrated-book': { contentOffset: 3 } }), 'utf8');
  assert.equal((await loadProgress(book, statePath)).contentOffset, 3);
  await saveProgress(book, { contentOffset: 4 }, statePath);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).version, 2);
});
