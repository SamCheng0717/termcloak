import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBook, paginateChapter } from '../src/book.js';
import { displayWidth, sanitizeTerminalText, wrapText } from '../src/text.js';
import { formatDuration, formatTokens } from '../src/theme.js';

test('解析中文章节并保留段落', () => {
  const book = parseBook('\uFEFF第一章 开始\r\n\r\n第一段。\r\n\r\n第二段。\r\n第二行。\r\n\r\n第二章 后续\r\n\r\n结尾。', '测试.txt');
  assert.equal(book.title, '测试');
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].title, '第一章 开始');
  assert.deepEqual(book.chapters[0].paragraphs, ['第一段。', '第二段。第二行。']);
});

test('没有章节标题时使用文件名', () => {
  const book = parseBook('只有一段正文。', '/tmp/我的小说.txt');
  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].title, '我的小说');
});

test('中英文混排按终端显示宽度折行', () => {
  assert.equal(displayWidth('ab中文'), 6);
  assert.deepEqual(wrapText('ab中文cd', 4), ['ab中', '文cd']);
});

test('框线、组合字符和 emoji 使用真实终端宽度', () => {
  assert.equal(displayWidth('╭──╮'), 4);
  assert.equal(displayWidth('e\u0301'), 1);
  assert.equal(displayWidth('👨‍👩‍👧‍👦'), 2);
  assert.equal(displayWidth('🇨🇳'), 2);
});

test('清除正文中的 ANSI、OSC 和方向覆盖字符', () => {
  const malicious = '\u001b[31m红色\u001b[0m\u001b]52;c;AAAA\u0007正文\u202Etxt';
  const safe = sanitizeTerminalText(malicious);
  assert.equal(safe, '红色正文txt');
  assert.doesNotMatch(safe, /\u001b|\u0007|\u202E/u);
});

test('识别序章、楔子、番外和后记', () => {
  const book = parseBook('序章\n\n一。\n\n楔子：旧事\n\n二。\n\n番外篇\n\n三。\n\n后记\n\n四。', '扩展.txt');
  assert.deepEqual(book.chapters.map(({ title }) => title), ['序章', '楔子：旧事', '番外篇', '后记']);
});

test('同一正文移动路径后保持相同内容身份', () => {
  const first = parseBook('第一章\n\n正文。', '/tmp/a.txt');
  const moved = parseBook('第一章\n\n正文。', '/tmp/renamed.txt');
  assert.equal(first.identity, moved.identity);
});

test('分页不会丢失正文行', () => {
  const chapter = { title: '一', paragraphs: ['甲乙丙丁戊己庚辛', '第二段'] };
  const pages = paginateChapter(chapter, 4, 2);
  assert.deepEqual(pages.flat(), ['甲乙', '丙丁', '戊己', '庚辛', '', '第二', '段']);
});

test('运行状态格式化耗时和 token 数', () => {
  assert.equal(formatDuration(61), '1m 1s');
  assert.equal(formatTokens(1600), '1.6k');
});
