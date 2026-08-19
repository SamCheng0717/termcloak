const encodingAliases = new Map([
  ['utf8', 'utf-8'],
  ['utf-8', 'utf-8'],
  ['gbk', 'gbk'],
  ['gb18030', 'gb18030']
]);

function decoder(label, fatal = false) {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    throw new Error(`当前 Node.js 运行时不支持编码：${label}`);
  }
}

export function normalizeEncoding(value) {
  if (!value || value === 'auto') return 'auto';
  const normalized = encodingAliases.get(String(value).toLowerCase());
  if (!normalized) throw new Error(`不支持的编码：${value}；可选 auto、utf-8、gbk、gb18030`);
  return normalized;
}

export function decodeBook(buffer, requestedEncoding = 'auto') {
  const encoding = normalizeEncoding(requestedEncoding);
  if (encoding !== 'auto') {
    return { text: decoder(encoding).decode(buffer), encoding };
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: decoder('utf-8').decode(buffer), encoding: 'utf-8' };
  }
  try {
    return { text: decoder('utf-8', true).decode(buffer), encoding: 'utf-8' };
  } catch {
    return { text: decoder('gb18030').decode(buffer), encoding: 'gb18030' };
  }
}
