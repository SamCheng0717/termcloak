const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const oscPattern = /(?:\u001B\]|\u009D)[\s\S]*?(?:\u0007|\u001B\\|\u009C)/gu;
const stringControlPattern = /\u001B[P^_X][\s\S]*?(?:\u001B\\|\u009C)/gu;
const csiPattern = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu;
const escapePattern = /\u001B[ -/]*[@-~]/gu;
const remainingControlsPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

export function stripTerminalSequences(value) {
  return String(value)
    .replace(oscPattern, '')
    .replace(stringControlPattern, '')
    .replace(csiPattern, '')
    .replace(escapePattern, '')
    .replace(remainingControlsPattern, '');
}

export function sanitizeTerminalText(value) {
  return stripTerminalSequences(value)
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, '')
    .replace(/\t/gu, '    ');
}

export const stripAnsi = stripTerminalSequences;

export function graphemes(value) {
  return [...graphemeSegmenter.segment(String(value))].map(({ segment, index }) => ({ segment, index }));
}

function isFullwidthCodePoint(codePoint) {
  if (codePoint < 0x1100) return false;
  return codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0x303e)
    || (codePoint >= 0x3040 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1b000 && codePoint <= 0x1b2ff)
    || (codePoint >= 0x1f200 && codePoint <= 0x1f251)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd);
}

export function charWidth(grapheme) {
  if (!grapheme) return 0;
  const first = grapheme.codePointAt(0);
  if (first === undefined || first < 32 || (first >= 0x7f && first < 0xa0)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u20E3/u.test(grapheme)) return 2;
  if ([...grapheme].every((character) => /\p{Mark}|\u200D|\uFE0E/u.test(character))) return 0;
  return isFullwidthCodePoint(first) ? 2 : 1;
}

export function displayWidth(value) {
  return graphemes(stripTerminalSequences(value))
    .reduce((total, { segment }) => total + charWidth(segment), 0);
}

export function truncate(value, width, suffix = '…') {
  if (width <= 0) return '';
  if (displayWidth(value) <= width) return value;
  const suffixWidth = displayWidth(suffix);
  if (suffixWidth > width) return '';
  let result = '';
  let used = 0;
  for (const { segment } of graphemes(value)) {
    const next = charWidth(segment);
    if (used + next + suffixWidth > width) break;
    result += segment;
    used += next;
  }
  return result + suffix;
}

export function padEndDisplay(value, width) {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

export function wrapTextWithOffsets(value, width, baseOffset = 0) {
  if (width < 1 || !value) return [{ text: '', startOffset: baseOffset, endOffset: baseOffset }];

  const segments = graphemes(value);
  const lines = [];
  let line = '';
  let used = 0;
  let lineStart = 0;

  const pushLine = (endOffset) => {
    lines.push({
      text: line.replace(/\s+$/u, ''),
      startOffset: baseOffset + lineStart,
      endOffset: baseOffset + endOffset
    });
    line = '';
    used = 0;
  };

  for (let position = 0; position < segments.length; position += 1) {
    const { segment, index } = segments[position];
    const end = segments[position + 1]?.index ?? value.length;
    if (segment === '\n') {
      pushLine(index);
      lineStart = end;
      continue;
    }

    const next = charWidth(segment);
    if (used > 0 && used + next > width) {
      pushLine(index);
      lineStart = index;
      if (/^\s$/u.test(segment)) {
        lineStart = end;
        continue;
      }
    }
    line += segment;
    used += next;
  }

  if (line || lines.length === 0) pushLine(value.length);
  return lines;
}

export function wrapText(value, width) {
  return wrapTextWithOffsets(value, width).map(({ text }) => text);
}
