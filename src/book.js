import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { sanitizeTerminalText, wrapText, wrapTextWithOffsets } from './text.js';

const numberedChapter = /^(?:第.{1,16}[章回卷部集篇]|chapter\s+(?:\d+|[ivxlcdm]+)\b).{0,80}$/iu;
const namedChapter = /^(?:序章|序言|前言|楔子|引子|番外(?:篇)?|后记|尾声|终章|大结局)(?:[\s：:].{0,70})?$/iu;

function hash(value, length = 24) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function compactParagraph(lines) {
  const parts = lines.map((line) => line.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  return parts.reduce((result, part, index) => {
    if (index === 0) return part;
    const previous = result.at(-1) ?? '';
    const needsSpace = /[\x00-\xff]/u.test(previous) && /^[\x00-\xff]/u.test(part);
    return result + (needsSpace ? ' ' : '') + part;
  }, '');
}

function toParagraphs(lines) {
  const paragraphs = [];
  let buffer = [];

  const flush = () => {
    const paragraph = compactParagraph(buffer);
    if (paragraph) paragraphs.push(paragraph);
    buffer = [];
  };

  for (const line of lines) {
    if (line.trim()) buffer.push(line);
    else flush();
  }
  flush();
  return paragraphs;
}

function makeChapter(title, paragraphs) {
  const text = paragraphs.join('\n\n');
  return {
    id: hash(`${title}\n${text}`, 16),
    title,
    paragraphs,
    text
  };
}

export function parseBook(rawText, filePath = '未命名.txt') {
  const safeName = sanitizeTerminalText(basename(filePath))
    .replace(/\.[^.]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim() || '未命名';
  const normalized = sanitizeTerminalText(rawText)
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .trim();
  if (!normalized) throw new Error('小说文件是空的');

  const lines = normalized.split('\n');
  const chapters = [];
  let title = safeName;
  let body = [];
  let sawHeading = false;

  const flush = () => {
    const paragraphs = toParagraphs(body);
    if (paragraphs.length > 0) chapters.push(makeChapter(title, paragraphs));
    body = [];
  };

  for (const line of lines) {
    const candidate = line.trim();
    if (numberedChapter.test(candidate) || namedChapter.test(candidate)) {
      if (body.some((item) => item.trim())) flush();
      title = candidate;
      sawHeading = true;
    } else {
      body.push(line);
    }
  }
  flush();

  if (chapters.length === 0 && sawHeading) chapters.push(makeChapter(title, ['（本章暂无正文）']));
  return { title: safeName, identity: hash(normalized), chapters };
}

export function layoutChapter(chapter, contentWidth) {
  const lines = [];
  chapter.paragraphs.forEach((paragraph, index) => {
    lines.push(...wrapText(paragraph, contentWidth));
    if (index < chapter.paragraphs.length - 1) lines.push('');
  });
  return lines;
}

export function layoutChapterWithOffsets(chapter, contentWidth) {
  const lines = [];
  let offset = 0;
  chapter.paragraphs.forEach((paragraph, index) => {
    lines.push(...wrapTextWithOffsets(paragraph, contentWidth, offset));
    offset += paragraph.length;
    if (index < chapter.paragraphs.length - 1) {
      lines.push({ text: '', startOffset: offset, endOffset: offset + 2 });
      offset += 2;
    }
  });
  return lines;
}

export function paginateChapterWithOffsets(chapter, contentWidth, pageSize) {
  const lines = layoutChapterWithOffsets(chapter, contentWidth);
  const pages = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    const page = lines.slice(index, index + pageSize);
    pages.push({
      lines: page.map(({ text }) => text),
      startOffset: page[0]?.startOffset ?? 0,
      endOffset: page.at(-1)?.endOffset ?? 0
    });
  }
  return pages.length ? pages : [{ lines: [], startOffset: 0, endOffset: 0 }];
}

export function paginateChapter(chapter, contentWidth, pageSize) {
  return paginateChapterWithOffsets(chapter, contentWidth, pageSize).map(({ lines }) => lines);
}
