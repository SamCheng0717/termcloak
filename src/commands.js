import { sanitizeTerminalText, truncate } from './text.js';

export const commandDefinitions = [
  {
    name: '/next',
    aliases: ['next', '下一页'],
    description: '下一页',
    tip: 'Use /next to continue without leaving the input box',
    run: ({ actions }) => actions.move(1)
  },
  {
    name: '/prev',
    aliases: ['prev', '上一页'],
    description: '上一页',
    run: ({ actions }) => actions.move(-1)
  },
  {
    name: '/next-chapter',
    aliases: ['下一章'],
    description: '下一章',
    tip: 'Use /next-chapter to jump without leaving the input box',
    run: ({ actions }) => actions.changeChapter(1)
  },
  {
    name: '/prev-chapter',
    aliases: ['上一章'],
    description: '上一章',
    run: ({ actions }) => actions.changeChapter(-1)
  },
  {
    name: '/auto',
    aliases: ['自动'],
    description: '切换自动翻页',
    tip: 'Press a to let the local reader advance automatically',
    run: ({ actions }) => actions.toggleAutoplay()
  },
  {
    name: '/cover',
    aliases: ['伪装'],
    description: '切换工作遮罩',
    tip: 'Press Esc to switch to the local work cover instantly',
    run: ({ actions }) => actions.toggleCover()
  },
  {
    name: '/help',
    aliases: ['帮助'],
    description: '切换帮助',
    run: ({ actions }) => actions.toggleHelp()
  },
  {
    name: '/chapters',
    aliases: ['目录'],
    description: '显示章节目录摘要',
    run: ({ actions }) => actions.showChapters()
  },
  {
    name: '/jump',
    aliases: ['跳章'],
    description: '按序号或标题跳到章节',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.jump(argument)
  },
  {
    name: '/goto',
    aliases: ['跳转'],
    description: '按全书百分比跳转',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.gotoPercentage(argument)
  },
  {
    name: '/back',
    aliases: ['返回'],
    description: '返回跳转前的位置',
    run: ({ actions }) => actions.goBack()
  },
  {
    name: '/search',
    aliases: ['搜索'],
    description: '全文搜索并跳到第一个结果',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.search(argument)
  },
  {
    name: '/search-next',
    aliases: ['下一个结果'],
    description: '跳到下一个搜索结果',
    run: ({ actions }) => actions.searchNext(1)
  },
  {
    name: '/search-prev',
    aliases: ['上一个结果'],
    description: '跳到上一个搜索结果',
    run: ({ actions }) => actions.searchNext(-1)
  },
  {
    name: '/bookmark',
    aliases: ['书签'],
    description: '在当前位置添加书签',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.addBookmark(argument)
  },
  {
    name: '/bookmarks',
    aliases: ['书签列表'],
    description: '显示书签摘要',
    run: ({ actions }) => actions.showBookmarks()
  },
  {
    name: '/bookmark-open',
    aliases: ['打开书签'],
    description: '跳到指定书签',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.openBookmark(argument)
  },
  {
    name: '/bookmark-delete',
    aliases: ['删除书签'],
    description: '删除指定书签',
    acceptsArguments: true,
    run: ({ argument, actions }) => actions.deleteBookmark(argument)
  },
  {
    name: '/btw',
    aliases: [],
    description: '显示一条不打断阅读位置的本地旁注',
    tip: 'Use /btw <note> to show a local side note without losing your place',
    acceptsArguments: true,
    run: ({ argument, state }) => {
      state.sideNote = argument
        ? truncate(sanitizeTerminalText(argument).replace(/\s+/gu, ' ').trim(), 72)
        : 'Usage: /btw <note> · local display only';
      state.activityLabel = 'Thinking';
      state.activityStartedAt = Date.now();
    }
  },
  {
    name: '/quit',
    aliases: ['退出'],
    description: '保存并退出',
    run: () => 'quit'
  }
];

const lookup = new Map(commandDefinitions.flatMap((definition) => [
  [definition.name, definition],
  ...definition.aliases.map((alias) => [alias, definition])
]));

const btwTip = commandDefinitions.find(({ name }) => name === '/btw')?.tip;
export const commandTips = [
  btwTip,
  ...commandDefinitions.filter(({ name }) => name !== '/btw').flatMap((definition) => definition.tip ? [definition.tip] : [])
].filter(Boolean);

export function commandSummary() {
  return commandDefinitions.map(({ name }) => name).join(' ');
}

export function completeCommand(input) {
  if (!input.startsWith('/') || /\s/u.test(input)) return input;
  const matches = commandDefinitions.map(({ name }) => name).filter((name) => name.startsWith(input));
  if (matches.length === 0) return input;
  if (matches.length === 1) {
    const definition = commandDefinitions.find(({ name }) => name === matches[0]);
    return matches[0] + (definition.acceptsArguments ? ' ' : '');
  }
  let prefix = input;
  while (matches.every((name) => name.startsWith(prefix + matches[0][prefix.length]))) {
    prefix += matches[0][prefix.length];
  }
  return prefix;
}

function nearestCommand(input) {
  const normalized = input.replace(/^\//u, '');
  return commandDefinitions.find(({ name }) => name.slice(1).startsWith(normalized.slice(0, 2)))?.name;
}

export function executeCommand(rawInput, context) {
  const input = sanitizeTerminalText(rawInput).trim();
  if (!input) return { action: 'continue', message: '' };
  const [token, ...argumentParts] = input.split(/\s+/u);
  const definition = lookup.get(token.toLowerCase()) || lookup.get(token);
  if (!definition) {
    const suggestion = nearestCommand(token);
    return {
      action: 'continue',
      message: suggestion ? `Unknown command: ${token} · Try ${suggestion}` : `Unknown command: ${token} · Try /help`
    };
  }
  const result = definition.run({ ...context, argument: argumentParts.join(' ') });
  return { action: result === 'quit' ? 'quit' : 'continue', message: '' };
}
