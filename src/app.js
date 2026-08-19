import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import readline from 'node:readline';
import { parseBook, paginateChapterWithOffsets } from './book.js';
import { commandSummary, commandTips, completeCommand, executeCommand } from './commands.js';
import { decodeBook } from './encoding.js';
import { defaultProgressPath, listProgress, loadProgress, saveProgress } from './progress.js';
import { TerminalSession } from './terminal.js';
import { renderCover, renderReader } from './theme.js';

function usage() {
  return `Termcloak — 通用 AI 编程会话外观的本地终端阅读器

用法：
  termcloak <小说.txt>
  termcloak read <小说.txt>
  termcloak preview <小说.txt> [--width 90] [--height 28]
  termcloak books [序号]
  termcloak doctor
  termcloak --demo

选项：
  --demo           打开内置示例
  --interval <秒>  自动翻页间隔，默认 5
  --encoding <编码> auto、utf-8、gbk 或 gb18030
  --no-color       关闭 ANSI 颜色
  --reduced-motion 减少动画
  --no-save        不读取或保存进度
  -h, --help       显示帮助

阅读快捷键：j/空格 下一页，k 上一页，[ ] 切章节，a 自动播放，
            i 或 / 输入命令，Esc 工作遮罩，h 帮助，q 退出并保存。

输入命令：${commandSummary()}

所有状态、耗时和 token 数均为本地界面动画，不调用任何 AI 服务。`;
}

function setActivity(state, label) {
  if (state.activityLabel === label) return;
  state.activityLabel = label;
  state.activityStartedAt = Date.now();
}

function activityFor(state) {
  if (!state.activityStartedAt) {
    return {
      label: state.activityLabel || 'Recombobulating',
      elapsedSeconds: 61,
      tokens: 1600,
      frame: state.animationFrame || 0,
      tip: commandTips[0]
    };
  }
  const now = Date.now();
  const elapsedSeconds = Math.max(1, Math.floor((now - state.activityStartedAt) / 1000));
  const sessionSeconds = Math.max(0, Math.floor((now - (state.startedAt || now)) / 1000));
  return {
    label: state.activityLabel,
    elapsedSeconds,
    tokens: (state.tokenBase ?? 1600) + Math.floor(sessionSeconds * 4.2),
    frame: state.animationFrame,
    tip: commandTips[Math.floor(sessionSeconds / 12) % commandTips.length]
  };
}

function parseArgs(argv, demoPath) {
  const args = [...argv];
  let command = 'read';
  if (['read', 'preview', 'books', 'doctor'].includes(args[0])) command = args.shift();

  const options = {
    command,
    filePath: null,
    interval: 5,
    encoding: 'auto',
    colors: !process.env.NO_COLOR,
    reducedMotion: false,
    save: true,
    width: null,
    height: null,
    bookIndex: null
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === '--demo') options.filePath = demoPath;
    else if (arg === '--no-color') options.colors = false;
    else if (arg === '--reduced-motion') options.reducedMotion = true;
    else if (arg === '--no-save') options.save = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--interval') options.interval = Number(args.shift());
    else if (arg === '--encoding') options.encoding = args.shift();
    else if (arg === '--width') options.width = Number(args.shift());
    else if (arg === '--height') options.height = Number(args.shift());
    else if (options.command === 'books' && options.bookIndex === null) options.bookIndex = Number(arg);
    else if (!options.filePath) options.filePath = resolve(arg);
    else throw new Error(`无法识别参数：${arg}`);
  }

  if (!Number.isFinite(options.interval) || options.interval < 1) throw new Error('--interval 必须是不小于 1 的数字');
  return options;
}

export async function run(argv, { demoPath }) {
  const options = parseArgs(argv, demoPath);
  if (options.help) {
    process.stdout.write(usage() + '\n');
    return;
  }

  if (options.command === 'doctor') {
    process.stdout.write([
      'Termcloak doctor',
      `Node: ${process.version}`,
      `Platform: ${process.platform} ${process.arch}`,
      `stdin TTY: ${Boolean(process.stdin.isTTY)}`,
      `stdout TTY: ${Boolean(process.stdout.isTTY)}`,
      `Color: ${options.colors ? 'enabled' : 'disabled'}`,
      `State: ${defaultProgressPath()}`
    ].join('\n') + '\n');
    return;
  }

  if (options.command === 'books') {
    const books = await listProgress();
    if (options.bookIndex !== null) {
      if (!Number.isInteger(options.bookIndex) || options.bookIndex < 1 || !books[options.bookIndex - 1]?.filePath) {
        throw new Error(`阅读记录不存在：${options.bookIndex}`);
      }
      return run(['read', books[options.bookIndex - 1].filePath], { demoPath });
    }
    if (books.length === 0) process.stdout.write('还没有阅读记录。\n');
    else process.stdout.write(books.map((item, index) => (
      `${index + 1}. ${item.bookTitle || '未命名'} · ${item.filePath || '路径未记录'} · ${item.updatedAt || '未知时间'}`
    )).join('\n') + '\n');
    return;
  }

  if (!options.filePath) {
    process.stdout.write(usage() + '\n');
    return;
  }

  const filePath = resolve(options.filePath);
  const decoded = decodeBook(await readFile(filePath), options.encoding);
  const book = parseBook(decoded.text, filePath);
  const bookReference = { filePath, identity: book.identity };
  const saved = options.save ? await loadProgress(bookReference) : null;
  const savedChapterIndex = saved?.chapterId
    ? book.chapters.findIndex(({ id }) => id === saved.chapterId)
    : -1;
  let anchoredChapterIndex = -1;
  let anchoredOffset = -1;
  if (saved?.paragraphHash) {
    book.chapters.some((chapter, index) => {
      let paragraphStart = 0;
      for (const paragraph of chapter.paragraphs) {
        if (hashParagraph(paragraph) === saved.paragraphHash) {
          anchoredChapterIndex = index;
          anchoredOffset = paragraphStart + Math.min(saved.paragraphInnerOffset || 0, paragraph.length);
          return true;
        }
        paragraphStart += paragraph.length + 2;
      }
      return false;
    });
  }
  const state = {
    chapterIndex: Math.min(
      anchoredChapterIndex >= 0
        ? anchoredChapterIndex
        : (savedChapterIndex >= 0 ? savedChapterIndex : (saved?.chapterIndex || 0)),
      book.chapters.length - 1
    ),
    pageIndex: Math.max(0, saved?.pageIndex || 0),
    contentOffset: anchoredOffset >= 0
      ? anchoredOffset
      : (Number.isFinite(saved?.contentOffset) ? saved.contentOffset : null),
    autoplay: false,
    cover: false,
    showHelp: false,
    input: '',
    inputMode: false,
    notification: '',
    sideNote: '',
    encoding: decoded.encoding,
    bookmarks: Array.isArray(saved?.bookmarks) ? saved.bookmarks : [],
    search: null,
    returnLocation: null,
    commandHistory: [],
    historyIndex: 0,
    startedAt: Date.now(),
    activityStartedAt: Date.now(),
    activityLabel: 'Recombobulating',
    animationFrame: 0,
    tokenBase: 1600
  };

  if (options.command === 'preview') {
    const width = Math.max(48, options.width || 90);
    const height = Math.max(23, options.height || 28);
    process.stdout.write(frame(book, state, { width, height, colors: options.colors }) + '\n');
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('交互阅读需要 TTY；可使用 preview 子命令生成静态预览');
  }
  await interactive(book, state, bookReference, options);
}

function dimensions(custom = {}) {
  if (custom.width || custom.height) {
    return {
      width: Math.max(1, custom.width || process.stdout.columns || 90),
      height: Math.max(1, custom.height || process.stdout.rows || 28)
    };
  }
  return terminalViewport(process.stdout.columns || 90, process.stdout.rows || 28);
}

function terminalViewport(columns, rows) {
  return {
    // Reserve the last column and bottom row: painting the bottom-right cell
    // enables auto-wrap in many terminals and makes animated frames scroll.
    width: Math.max(1, columns - 1),
    height: Math.max(1, rows - 1)
  };
}

function currentPage(book, state, viewport) {
  const chapter = book.chapters[state.chapterIndex];
  const contentWidth = Math.max(30, viewport.width - 4);
  const reserved = state.showHelp ? 22 : 19;
  const pageSize = Math.max(1, viewport.height - reserved);
  const pages = paginateChapterWithOffsets(chapter, contentWidth, pageSize);
  let pageIndex = Math.min(state.pageIndex, pages.length - 1);
  if (Number.isFinite(state.contentOffset)) {
    pageIndex = 0;
    for (let index = 0; index < pages.length; index += 1) {
      if (pages[index].startOffset <= state.contentOffset) pageIndex = index;
      else break;
    }
  } else {
    state.contentOffset = pages[pageIndex].startOffset;
  }
  state.pageIndex = pageIndex;
  return { chapter, pages, pageIndex, lines: pages[pageIndex].lines };
}

function frame(book, state, custom = {}) {
  const viewport = dimensions(custom);
  if (viewport.width < 48 || viewport.height < 20) {
    const lines = [
      'Termcloak',
      'Terminal too small. Resize to at least 49 columns x 21 rows.'
    ];
    return lines
      .slice(0, viewport.height)
      .map((line) => line.slice(0, viewport.width))
      .join('\n');
  }
  const activity = activityFor(state);
  if (state.cover) return renderCover({
    ...viewport,
    colors: custom.colors,
    input: state.input || '',
    inputMode: Boolean(state.inputMode),
    activity
  });
  const { chapter, pages, lines } = currentPage(book, state, viewport);
  return renderReader({
    ...viewport,
    colors: custom.colors,
    bookTitle: book.title,
    chapterTitle: chapter.title,
    chapterIndex: state.chapterIndex,
    chapterCount: book.chapters.length,
    pageIndex: state.pageIndex,
    pageCount: pages.length,
    lines,
    autoplay: state.autoplay,
    showHelp: state.showHelp,
    input: state.input || '',
    inputMode: Boolean(state.inputMode),
    notification: state.notification,
    sideNote: state.sideNote,
    searchQuery: state.search?.query || '',
    activity
  });
}

function move(book, state, direction, viewport) {
  setActivity(state, direction > 0 ? 'Reading' : 'Revisiting');
  state.notification = '';
  const { pages, pageIndex } = currentPage(book, state, viewport);
  let moved = false;
  if (direction > 0) {
    if (pageIndex < pages.length - 1) {
      state.contentOffset = pages[pageIndex + 1].startOffset;
      moved = true;
    }
    else if (state.chapterIndex < book.chapters.length - 1) {
      state.chapterIndex += 1;
      state.pageIndex = 0;
      state.contentOffset = 0;
      moved = true;
    }
  } else if (pageIndex > 0) {
    state.contentOffset = pages[pageIndex - 1].startOffset;
    moved = true;
  }
  else if (state.chapterIndex > 0) {
    state.chapterIndex -= 1;
    state.pageIndex = Number.MAX_SAFE_INTEGER;
    state.contentOffset = null;
    const previous = currentPage(book, state, viewport);
    state.contentOffset = previous.pages.at(-1).startOffset;
    moved = true;
  }
  return moved;
}

function changeChapter(book, state, direction) {
  setActivity(state, 'Recombobulating');
  state.chapterIndex = Math.max(0, Math.min(book.chapters.length - 1, state.chapterIndex + direction));
  state.pageIndex = 0;
  state.contentOffset = 0;
  state.notification = '';
}

function jumpToChapter(book, state, input) {
  const query = input.trim();
  if (!query) {
    state.notification = 'Usage: /jump <chapter number or title>';
    return;
  }
  const numeric = Number(query);
  const index = Number.isInteger(numeric)
    ? numeric - 1
    : book.chapters.findIndex(({ title }) => title.toLowerCase().includes(query.toLowerCase()));
  if (index < 0 || index >= book.chapters.length) {
    state.notification = `Chapter not found: ${query}`;
    return;
  }
  rememberLocation(state);
  state.chapterIndex = index;
  state.pageIndex = 0;
  state.contentOffset = 0;
  state.notification = `Jumped to ${index + 1}/${book.chapters.length}: ${book.chapters[index].title}`;
  setActivity(state, 'Recombobulating');
}

function rememberLocation(state) {
  state.returnLocation = {
    chapterIndex: state.chapterIndex,
    contentOffset: state.contentOffset || 0
  };
}

function createSearchResults(book, query) {
  const normalized = query.toLocaleLowerCase();
  const results = [];
  book.chapters.forEach((chapter, chapterIndex) => {
    if (results.length >= 1000) return;
    const text = chapter.text || chapter.paragraphs.join('\n\n');
    const searchable = text.toLocaleLowerCase();
    let offset = 0;
    while (offset <= searchable.length) {
      const found = searchable.indexOf(normalized, offset);
      if (found < 0) break;
      results.push({ chapterIndex, contentOffset: found });
      offset = found + Math.max(1, normalized.length);
      if (results.length >= 1000) return;
    }
  });
  return results;
}

function applySearchResult(book, state, direction = 0) {
  if (!state.search?.results.length) {
    state.notification = 'No active search · Use /search <text>';
    return;
  }
  if (direction) {
    const count = state.search.results.length;
    state.search.index = (state.search.index + direction + count) % count;
  }
  const result = state.search.results[state.search.index];
  state.chapterIndex = result.chapterIndex;
  state.pageIndex = 0;
  state.contentOffset = result.contentOffset;
  state.notification = `Search ${state.search.index + 1}/${state.search.results.length}: ${state.search.query}`;
  setActivity(state, 'Searching');
}

function searchBook(book, state, input) {
  const query = input.trim();
  if (!query) {
    state.notification = 'Usage: /search <text>';
    return;
  }
  const results = createSearchResults(book, query);
  rememberLocation(state);
  state.search = { query, results, index: 0 };
  if (results.length === 0) state.notification = `No results: ${query}`;
  else applySearchResult(book, state);
}

function commandActions(book, state, viewport) {
  return {
    move: (direction) => move(book, state, direction, viewport),
    changeChapter: (direction) => changeChapter(book, state, direction),
    toggleAutoplay: () => {
      state.autoplay = !state.autoplay;
      setActivity(state, state.autoplay ? 'Churning' : 'Thinking');
    },
    toggleCover: () => {
      state.cover = !state.cover;
      setActivity(state, state.cover ? 'Inspecting' : 'Recombobulating');
    },
    toggleHelp: () => {
      state.showHelp = !state.showHelp;
      setActivity(state, 'Thinking');
    },
    showChapters: () => {
      const start = Math.max(0, state.chapterIndex - 1);
      state.notification = book.chapters.slice(start, start + 3)
        .map(({ title }, offset) => `${start + offset + 1}. ${title}`)
        .join(' · ');
    },
    jump: (input) => jumpToChapter(book, state, input),
    gotoPercentage: (input) => {
      const percentage = Number(String(input).replace(/%$/u, ''));
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        state.notification = 'Usage: /goto <0-100%>';
        return;
      }
      rememberLocation(state);
      const scaled = (percentage / 100) * book.chapters.length;
      const chapterIndex = Math.min(book.chapters.length - 1, Math.floor(scaled));
      const fraction = percentage === 100 ? 1 : scaled - chapterIndex;
      state.chapterIndex = chapterIndex;
      state.pageIndex = 0;
      state.contentOffset = Math.floor(book.chapters[chapterIndex].text.length * fraction);
      state.notification = `Jumped to ${percentage}%`;
      setActivity(state, 'Recombobulating');
    },
    goBack: () => {
      if (!state.returnLocation) {
        state.notification = 'No previous jump location';
        return;
      }
      const current = { chapterIndex: state.chapterIndex, contentOffset: state.contentOffset || 0 };
      state.chapterIndex = state.returnLocation.chapterIndex;
      state.pageIndex = 0;
      state.contentOffset = state.returnLocation.contentOffset;
      state.returnLocation = current;
      state.notification = 'Returned to previous location';
      setActivity(state, 'Revisiting');
    },
    search: (input) => searchBook(book, state, input),
    searchNext: (direction) => applySearchResult(book, state, direction),
    addBookmark: (note) => {
      const chapter = book.chapters[state.chapterIndex];
      const bookmark = {
        chapterId: chapter.id,
        chapterIndex: state.chapterIndex,
        contentOffset: state.contentOffset || 0,
        note: note.trim(),
        createdAt: new Date().toISOString()
      };
      const duplicate = state.bookmarks.findIndex((item) => (
        item.chapterId === bookmark.chapterId && item.contentOffset === bookmark.contentOffset
      ));
      if (duplicate >= 0) state.bookmarks[duplicate] = bookmark;
      else state.bookmarks.push(bookmark);
      state.notification = `Bookmark saved · ${chapter.title}${bookmark.note ? ` · ${bookmark.note}` : ''}`;
    },
    showBookmarks: () => {
      const start = Math.max(0, state.bookmarks.length - 3);
      state.notification = state.bookmarks.length
        ? state.bookmarks.slice(start).map((item, index) => `${start + index + 1}. chapter ${item.chapterIndex + 1}${item.note ? ` ${item.note}` : ''}`).join(' · ')
        : 'No bookmarks yet · Use /bookmark <note>';
    },
    openBookmark: (input) => {
      const index = Number(input) - 1;
      const bookmark = state.bookmarks[index];
      if (!bookmark) {
        state.notification = 'Bookmark not found · Use /bookmarks';
        return;
      }
      rememberLocation(state);
      const chapterIndex = book.chapters.findIndex(({ id }) => id === bookmark.chapterId);
      state.chapterIndex = Math.max(0, Math.min(book.chapters.length - 1, chapterIndex >= 0 ? chapterIndex : bookmark.chapterIndex));
      state.pageIndex = 0;
      state.contentOffset = bookmark.contentOffset;
      state.notification = `Opened bookmark ${index + 1}${bookmark.note ? ` · ${bookmark.note}` : ''}`;
      setActivity(state, 'Revisiting');
    },
    deleteBookmark: (input) => {
      const index = Number(input) - 1;
      if (!state.bookmarks[index]) {
        state.notification = 'Bookmark not found · Use /bookmarks';
        return;
      }
      state.bookmarks.splice(index, 1);
      state.notification = `Deleted bookmark ${index + 1}`;
    }
  };
}

function submitInput(book, state, viewport) {
  const input = state.input;
  state.input = '';
  state.inputMode = false;
  state.commandHistory ||= [];
  if (input.trim()) {
    if (state.commandHistory.at(-1) !== input) state.commandHistory.push(input);
    state.commandHistory = state.commandHistory.slice(-100);
    state.historyIndex = state.commandHistory.length;
  }
  state.notification = '';
  const result = executeCommand(input, {
    state,
    actions: commandActions(book, state, viewport)
  });
  if (result.message) state.notification = result.message;
  return result.action;
}

function normalizeError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason));
}

async function interactive(book, state, bookReference, options) {
  readline.emitKeypressEvents(process.stdin);
  const terminal = new TerminalSession(process.stdin, process.stdout);
  terminal.enter();

  await new Promise((resolvePromise, rejectPromise) => {
    let timer = null;
    let animationTimer = null;
    let closing = false;
    const viewport = () => dimensions();
    const draw = () => terminal.render(frame(book, state, { ...viewport(), colors: options.colors }));

    const syncTimer = () => {
      if (timer) clearInterval(timer);
      timer = state.autoplay ? setInterval(() => {
        if (!move(book, state, 1, viewport())) {
          state.autoplay = false;
          setActivity(state, 'Waiting');
          syncTimer();
        }
        draw();
      }, options.interval * 1000) : null;
    };

    const signalHandlers = new Map();
    const cleanupListeners = () => {
      process.stdout.off('resize', resize);
      process.stdin.off('keypress', onKeypress);
      process.off('uncaughtException', onUncaughtException);
      process.off('unhandledRejection', onUnhandledRejection);
      for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    };

    const finish = async ({ error = null, exitCode = null } = {}) => {
      if (closing) return;
      closing = true;
      if (timer) clearInterval(timer);
      if (animationTimer) clearInterval(animationTimer);
      cleanupListeners();
      terminal.close();
      try {
        if (options.save) {
          const chapter = book.chapters[state.chapterIndex];
          const anchor = paragraphAnchor(chapter, state.contentOffset || 0);
          await saveProgress(bookReference, {
            bookTitle: book.title,
            chapterId: chapter.id,
            chapterIndex: state.chapterIndex,
            contentOffset: state.contentOffset || 0,
            ...anchor,
            bookmarks: state.bookmarks
          });
        }
        if (exitCode !== null) process.exitCode = exitCode;
        if (error) rejectPromise(error);
        else resolvePromise();
      } catch (saveError) {
        rejectPromise(saveError);
      }
    };

    const resize = () => {
      terminal.resetFrame();
      draw();
    };
    const onUncaughtException = (error) => void finish({ error: normalizeError(error), exitCode: 1 });
    const onUnhandledRejection = (reason) => void finish({ error: normalizeError(reason), exitCode: 1 });

    const onKeypress = async (text, key = {}) => {
      try {
        if (key.ctrl && key.name === 'c') {
          await finish();
          return;
        }
        if (state.inputMode) {
          if (key.name === 'escape') {
            state.input = '';
            state.inputMode = false;
          } else if (key.name === 'up' && state.commandHistory.length) {
            state.historyIndex = Math.max(0, state.historyIndex - 1);
            state.input = state.commandHistory[state.historyIndex] || '';
          } else if (key.name === 'down' && state.commandHistory.length) {
            state.historyIndex = Math.min(state.commandHistory.length, state.historyIndex + 1);
            state.input = state.historyIndex === state.commandHistory.length
              ? ''
              : state.commandHistory[state.historyIndex];
          } else if (key.name === 'tab') {
            state.input = completeCommand(state.input);
          } else if (key.name === 'return' || key.name === 'enter') {
            const action = submitInput(book, state, viewport());
            syncTimer();
            if (action === 'quit') {
              await finish();
              return;
            }
          } else if (key.name === 'backspace') {
            state.input = [...state.input].slice(0, -1).join('');
          } else if (text && !key.ctrl && !key.meta && !/[\u0000-\u001f\u007f]/u.test(text)) {
            state.input += text;
          }
          draw();
          return;
        }
        if (key.name === 'q') {
          await finish();
          return;
        }
        if (key.name === 'escape') {
          state.cover = !state.cover;
          setActivity(state, state.cover ? 'Inspecting' : 'Recombobulating');
        } else if (!state.cover && (key.name === 'i' || text === '/')) {
          state.inputMode = true;
          state.input = text === '/' ? '/' : '';
          setActivity(state, 'Waiting');
        } else if (!state.cover && (key.name === 'j' || key.name === 'n' || key.name === 'space' || key.name === 'right' || key.name === 'down')) move(book, state, 1, viewport());
        else if (!state.cover && (key.name === 'k' || key.name === 'p' || key.name === 'left' || key.name === 'up')) move(book, state, -1, viewport());
        else if (!state.cover && text === ']') changeChapter(book, state, 1);
        else if (!state.cover && text === '[') changeChapter(book, state, -1);
        else if (!state.cover && key.name === 'a') {
          state.autoplay = !state.autoplay;
          setActivity(state, state.autoplay ? 'Churning' : 'Thinking');
          syncTimer();
        } else if (!state.cover && (key.name === 'h' || text === '?')) {
          state.showHelp = !state.showHelp;
          setActivity(state, 'Thinking');
        }
        draw();
      } catch (error) {
        await finish({ error: normalizeError(error), exitCode: 1 });
      }
    };

    process.stdout.on('resize', resize);
    process.stdin.on('keypress', onKeypress);
    process.on('uncaughtException', onUncaughtException);
    process.on('unhandledRejection', onUnhandledRejection);
    for (const [signal, exitCode] of [['SIGINT', 130], ['SIGHUP', 129], ['SIGTERM', 143]]) {
      const handler = () => void finish({ exitCode });
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    if (!options.reducedMotion) {
      animationTimer = setInterval(() => {
        state.animationFrame = (state.animationFrame + 1) % 6000;
        draw();
      }, 160);
    }
    draw();
  });
}

function hashParagraph(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function paragraphAnchor(chapter, contentOffset) {
  let paragraphStart = 0;
  for (const paragraph of chapter.paragraphs) {
    if (contentOffset <= paragraphStart + paragraph.length) {
      return {
        paragraphHash: hashParagraph(paragraph),
        paragraphInnerOffset: Math.max(0, contentOffset - paragraphStart)
      };
    }
    paragraphStart += paragraph.length + 2;
  }
  const paragraph = chapter.paragraphs.at(-1) || '';
  return {
    paragraphHash: hashParagraph(paragraph),
    paragraphInnerOffset: paragraph.length
  };
}

export const internals = {
  parseArgs,
  frame,
  move,
  changeChapter,
  submitInput,
  activityFor,
  setActivity,
  terminalViewport,
  currentPage
};
