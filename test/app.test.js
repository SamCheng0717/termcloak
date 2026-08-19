import test from 'node:test';
import assert from 'node:assert/strict';
import { internals } from '../src/app.js';
import { displayWidth } from '../src/text.js';

function makeBook(paragraphs = ['这是一段用于测试的正文。']) {
  return {
    title: '测试小说',
    identity: 'test-book',
    chapters: [{ id: 'chapter-1', title: '第一章', paragraphs, text: paragraphs.join('\n\n') }]
  };
}

test('静态画面包含中立 Agent Session 组件和阅读进度', () => {
  const book = makeBook();
  const state = { chapterIndex: 0, pageIndex: 0, contentOffset: 0, autoplay: false, cover: false, showHelp: false };
  const output = internals.frame(book, state, { width: 70, height: 22, colors: false });
  assert.match(output, /Agent Session/u);
  assert.doesNotMatch(output, /Claude Code|Codex/u);
  assert.match(output, /Read\(chapters\/001\.txt\)/u);
  assert.match(output, /这是一段用于测试的正文/u);
  assert.match(output, /100%/u);
  assert.match(output, /Recombobulating… \(1m 1s · ↓ 1\.6k tokens\)/u);
  assert.match(output, /Tip: Use \/btw <note>/u);
  assert.match(output, /recap:/u);
  assert.match(output, /❯ █/u);
  assert.match(output, /manual mode on/u);
});

test('工作遮罩不包含小说内容', () => {
  const book = makeBook(['绝不能出现在伪装页']);
  const state = { chapterIndex: 0, pageIndex: 0, contentOffset: 0, autoplay: false, cover: true, showHelp: false };
  const output = internals.frame(book, state, { width: 70, height: 22, colors: false });
  assert.doesNotMatch(output, /绝不能出现/u);
  assert.match(output, /git status --short/u);
  assert.match(output, /❯ █/u);
});

test('输入框命令可以执行并给未知命令建议', () => {
  const book = makeBook(['第一行', '第二行', '第三行']);
  const state = {
    chapterIndex: 0,
    pageIndex: 0,
    contentOffset: 0,
    autoplay: false,
    cover: false,
    showHelp: false,
    inputMode: true,
    input: '/nex'
  };
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.inputMode, false);
  assert.equal(state.input, '');
  assert.match(state.notification, /Try \/next/u);
});

test('/btw 显示本地旁注且不改变阅读位置', () => {
  const book = makeBook();
  const state = {
    chapterIndex: 0,
    pageIndex: 0,
    contentOffset: 12,
    autoplay: false,
    cover: false,
    showHelp: false,
    inputMode: true,
    input: '/btw 先确认边界'
  };
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.sideNote, '先确认边界');
  assert.equal(state.contentOffset, 12);
  const output = internals.frame(book, state, { width: 70, height: 22, colors: false });
  assert.match(output, /btw: 先确认边界/u);
});

test('真实终端渲染为最后一列和最后一行保留空间', () => {
  assert.deepEqual(internals.terminalViewport(80, 24), { width: 79, height: 23 });
  assert.deepEqual(internals.terminalViewport(120, 40), { width: 119, height: 39 });
});

test('多尺寸、多模式帧均不超过视口边界', () => {
  const book = makeBook(['中文 mixed 👨‍👩‍👧‍👦 '.repeat(80)]);
  for (const [width, height] of [[48, 20], [60, 23], [80, 28], [119, 39]]) {
    for (const cover of [false, true]) {
      for (const colors of [false, true]) {
        const state = {
          chapterIndex: 0,
          pageIndex: 0,
          contentOffset: 0,
          autoplay: false,
          cover,
          showHelp: false,
          search: { query: 'mixed', results: [], index: 0 }
        };
        const output = internals.frame(book, state, { width, height, colors });
        const lines = output.split('\n');
        assert.ok(lines.length <= height, `${width}x${height} exceeded row count`);
        for (const line of lines) assert.ok(displayWidth(line) <= width, `${width}x${height} exceeded column count: ${line}`);
      }
    }
  }
});

test('内容偏移在窗口尺寸变化后仍落在原文附近', () => {
  const book = makeBook(['甲'.repeat(300)]);
  const state = { chapterIndex: 0, pageIndex: 0, contentOffset: 90, autoplay: false, cover: false, showHelp: false };
  const narrow = internals.currentPage(book, state, { width: 50, height: 22 });
  const wide = internals.currentPage(book, state, { width: 90, height: 30 });
  assert.ok(narrow.pages[narrow.pageIndex].startOffset <= 90);
  assert.ok(wide.pages[wide.pageIndex].startOffset <= 90);
  assert.equal(state.contentOffset, 90);
});

test('搜索、跳章和书签通过统一命令系统工作', () => {
  const book = {
    title: '命令测试',
    identity: 'commands',
    chapters: [
      { id: 'a', title: '第一章', paragraphs: ['开头'], text: '开头' },
      { id: 'b', title: '第二章 目标', paragraphs: ['这里有关键词'], text: '这里有关键词' }
    ]
  };
  const state = {
    chapterIndex: 0,
    pageIndex: 0,
    contentOffset: 0,
    autoplay: false,
    cover: false,
    showHelp: false,
    inputMode: true,
    input: '/search 关键词',
    bookmarks: [],
    commandHistory: [],
    historyIndex: 0
  };
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.chapterIndex, 1);
  assert.match(state.notification, /Search 1\/1/u);

  state.input = '/bookmark 重要位置';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.bookmarks.length, 1);
  assert.equal(state.bookmarks[0].note, '重要位置');

  state.input = '/jump 1';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.chapterIndex, 0);
  assert.match(state.notification, /Jumped to 1\/2/u);

  state.input = '/goto 75%';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.chapterIndex, 1);
  assert.match(state.notification, /75%/u);
  state.input = '/back';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.chapterIndex, 0);

  state.input = '/bookmark-open 1';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.chapterIndex, 1);
  state.input = '/bookmark-delete 1';
  internals.submitInput(book, state, { width: 70, height: 22 });
  assert.equal(state.bookmarks.length, 0);
});

test('books 子命令解析阅读记录序号', () => {
  const options = internals.parseArgs(['books', '2'], '/demo.txt');
  assert.equal(options.command, 'books');
  assert.equal(options.bookIndex, 2);
  assert.equal(options.filePath, null);
});
