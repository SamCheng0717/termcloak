import { displayWidth, padEndDisplay, truncate } from './text.js';

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  orange: '\x1b[38;5;173m',
  cream: '\x1b[38;5;223m',
  gray: '\x1b[38;5;245m',
  green: '\x1b[38;5;114m',
  white: '\x1b[97m'
};

const spinnerFrames = ['✢', '✣', '✤', '✥', '✦', '✧'];

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function formatTokens(value) {
  const tokens = Math.max(0, Math.floor(value));
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/u, '')}k`;
}

function palette(enabled) {
  if (enabled) return color;
  return { ...Object.fromEntries(Object.keys(color).map((key) => [key, ''])), cursor: '█' };
}

function borderLine(width, title = '') {
  if (!title) return `╰${'─'.repeat(Math.max(0, width - 2))}╯`;
  const label = ` ${title} `;
  const remaining = Math.max(0, width - displayWidth(label) - 2);
  return `╭${'─'.repeat(Math.floor(remaining / 2))}${label}${'─'.repeat(Math.ceil(remaining / 2))}╮`;
}

function boxedLine(value, width) {
  const inner = Math.max(1, width - 4);
  return `│ ${padEndDisplay(truncate(value, inner), inner)} │`;
}

function inputBox(width, c, { cover = false, input = '', inputMode = false } = {}) {
  const innerWidth = Math.max(1, width - 2);
  const divider = `${c.gray} ${'─'.repeat(innerWidth)}${c.reset}`;
  const cursor = c.cursor || `${c.white}\x1b[7m \x1b[27m${c.reset}`;
  const visibleInput = truncate(input, Math.max(1, width - 6));
  const prompt = ` ${c.cream}❯${c.reset} ${c.white}${visibleInput}${c.reset}${cursor}`;
  const mode = inputMode
    ? '  INSERT  ·  Enter to run  ·  Esc to cancel'
    : cover
      ? '  ⏸ cover active  ·  Esc to return  ·  q to quit'
      : '  ⏸ manual mode on  ·  h for shortcuts  ·  Esc for cover';
  return [divider, prompt, divider, `${c.dim}${truncate(mode, width - 1)}${c.reset}`];
}

function activityLines(width, c, activity = {}) {
  const spinner = spinnerFrames[(activity.frame || 0) % spinnerFrames.length];
  const label = activity.label || 'Recombobulating';
  const duration = formatDuration(activity.elapsedSeconds ?? 61);
  const tokens = formatTokens(activity.tokens ?? 1600);
  const status = `${spinner} ${label}… (${duration} · ↓ ${tokens} tokens)`;
  const tip = `Tip: ${activity.tip || 'Use /btw <note> to show a local side note without losing your place'}`;
  return [
    `${c.cream}${truncate(status, width - 1)}${c.reset}`,
    `${c.dim}${truncate(tip, width - 1)}${c.reset}`
  ];
}

function highlightText(value, query, c) {
  if (!query) return value;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return value.replace(new RegExp(escaped, 'giu'), (match) => `${c.orange}${match}${c.white}`);
}

export function renderReader({
  width,
  height,
  bookTitle,
  chapterTitle,
  chapterIndex,
  chapterCount,
  pageIndex,
  pageCount,
  lines,
  autoplay,
  showHelp,
  input = '',
  inputMode = false,
  notification = '',
  sideNote = '',
  searchQuery = '',
  activity,
  colors = true
}) {
  const c = palette(colors);
  const safeWidth = Math.max(48, width);
  const output = [];
  output.push(`${c.orange}${borderLine(safeWidth, 'Agent Session')}${c.reset}`);
  output.push(`${c.orange}${boxedLine(`✳  ${truncate(bookTitle, safeWidth - 10)}`, safeWidth)}${c.reset}`);
  output.push(`${c.orange}${boxedLine('Working in local reading session', safeWidth)}${c.reset}`);
  output.push(`${c.orange}${borderLine(safeWidth)}${c.reset}`);
  output.push('');
  output.push(`${c.cream}● Read(chapters/${String(chapterIndex + 1).padStart(3, '0')}.txt)${c.reset}`);
  output.push(`${c.gray}  ⎿  ${chapterTitle}${c.reset}`);
  output.push('');
  output.push(`${c.cream}● Analyzing narrative context…${c.reset}`);
  output.push('');
  for (const line of lines) output.push(`${c.white}  ${highlightText(line, searchQuery, c)}${c.reset}`);

  const footerRows = showHelp ? 12 : 9;
  while (output.length < height - footerRows) output.push('');
  if (showHelp) {
    output.push(`${c.dim}  j/空格 下一页   k 上一页   [/] 切章节   a 自动播放${c.reset}`);
    output.push(`${c.dim}  i 或 / 输入命令  Esc 紧急伪装  q 退出并保存${c.reset}`);
    output.push('');
  }
  const percentage = Math.round(((chapterIndex + (pageIndex + 1) / pageCount) / chapterCount) * 100);
  output.push(...activityLines(safeWidth, c, activity));
  if (notification) output.push(`${c.gray}↳ ${truncate(notification, safeWidth - 3)}${c.reset}`);
  else if (sideNote) output.push(`${c.gray}↳ btw: ${truncate(sideNote, safeWidth - 8)}${c.reset}`);
  else output.push('');
  const recap = `※ recap: 已读取 ${chapterTitle}，进度 ${chapterIndex + 1}/${chapterCount} · ${pageIndex + 1}/${pageCount} · ${percentage}%${autoplay ? ' · auto' : ''}`;
  output.push(`${c.gray}${truncate(recap, safeWidth - 1)}${c.reset}`);
  output.push('');
  output.push(...inputBox(safeWidth, c, { input, inputMode }));
  return output.slice(0, height).join('\n');
}

export function renderCover({ width, height, input = '', inputMode = false, activity, colors = true }) {
  const c = palette(colors);
  const safeWidth = Math.max(48, width);
  const output = [
    `${c.orange}${borderLine(safeWidth, 'Agent Session')}${c.reset}`,
    `${c.orange}${boxedLine('✳  Repository analysis', safeWidth)}${c.reset}`,
    `${c.orange}${boxedLine('Working in ~/project', safeWidth)}${c.reset}`,
    `${c.orange}${borderLine(safeWidth)}${c.reset}`,
    '',
    `${c.cream}● Bash(git status --short)${c.reset}`,
    `${c.gray}  ⎿  Working tree clean${c.reset}`,
    '',
    `${c.cream}${truncate('● Search(pattern: "TODO|FIXME", path: "src")', safeWidth - 1)}${c.reset}`,
    `${c.gray}  ⎿  Found 3 files${c.reset}`,
    '',
    `${c.cream}${truncate('● Inspecting the current execution path…', safeWidth - 1)}${c.reset}`,
    '',
    `${c.white}${truncate('  I’m tracing the request lifecycle before proposing a minimal change.', safeWidth - 1)}${c.reset}`
  ];
  while (output.length < height - 9) output.push('');
  output.push(...activityLines(safeWidth, c, activity));
  output.push('');
  output.push(`${c.gray}${truncate('※ recap: repository inspection is still in progress.', safeWidth - 1)}${c.reset}`);
  output.push('');
  output.push(...inputBox(safeWidth, c, { cover: true, input, inputMode }));
  return output.slice(0, height).join('\n');
}
