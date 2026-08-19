import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBook, normalizeEncoding } from '../src/encoding.js';

test('自动识别 UTF-8', () => {
  const decoded = decodeBook(Buffer.from('第一章\n正文。', 'utf8'));
  assert.equal(decoded.encoding, 'utf-8');
  assert.equal(decoded.text, '第一章\n正文。');
});

test('UTF-8 校验失败时回退到 GB18030', () => {
  const decoded = decodeBook(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
  assert.equal(decoded.encoding, 'gb18030');
  assert.equal(decoded.text, '中文');
});

test('允许明确指定 GBK 并拒绝未知编码', () => {
  assert.equal(decodeBook(Buffer.from([0xd6, 0xd0]), 'gbk').text, '中');
  assert.equal(normalizeEncoding('UTF8'), 'utf-8');
  assert.throws(() => normalizeEncoding('big5'), /不支持的编码/u);
});
