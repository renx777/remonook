import { marks, encode } from './domain.mjs';
// Local, vector-only Lottie/TGS. Never pass arbitrary scripts or resource URLs to a player.
export const MAX_EMOJI_BYTES = 1024 * 1024;
export const MAX_DECODED_BYTES = 2 * 1024 * 1024;
export function validateAnimation(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.layers) ||
      typeof data.v !== 'string' || ![data.w, data.h, data.fr, data.ip, data.op].every(Number.isFinite) ||
      data.w < 1 || data.h < 1 || data.w > 2048 || data.h > 2048 || data.fr < 1 || data.fr > 120 ||
      data.op <= data.ip || (data.op - data.ip) / data.fr > 30)
    throw Error('Choose a valid Lottie animation (up to 2048px, 120 fps and 30 seconds).');
  if (data.segments?.length || data.fonts || data.chars?.length)
    throw Error('Use a self-contained vector emoji without fonts, text or animation segments.');
  const assets = data.assets || [];
  if (!Array.isArray(assets) || assets.some(a => !a || typeof a.id !== 'string' || !Array.isArray(a.layers)) ||
      new Set(assets.map(a => a.id)).size !== assets.length)
    throw Error('External images, audio and other linked assets are not supported.');
  let count = 0, layers = 0;
  const pending = [[data, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++count > 60000 || depth > 80) throw Error('This animation is too complex.');
    if (typeof item === 'number' && (!Number.isFinite(item) || Math.abs(item) > 1e7)) throw Error('Invalid animation number.');
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item)) { for (const value of item) pending.push([value, depth + 1]); continue; }
    if (Array.isArray(item.layers)) {
      layers += item.layers.length;
      if (layers > 500 || item.layers.some(layer => !layer || ![0, 1, 3, 4].includes(layer.ty)))
        throw Error('Only vector shape, solid and composition layers are supported (up to 500).');
      const ids = new Set(item.layers.map(layer => layer.ind));
      for (const layer of item.layers) {
        let current = layer, visited = new Set();
        while (current?.parent !== undefined) {
          if (visited.has(current.parent) || !ids.has(current.parent)) throw Error('Invalid layer hierarchy.');
          visited.add(current.parent);
          current = item.layers.find(candidate => candidate.ind === current.parent);
        }
      }
    }
    if (item.ty === 'rp' && (item.c?.a || typeof item.c?.k !== 'number' || item.c.k > 64 || item.c.k < 0))
      throw Error('Use an emoji with no animated or large repeaters.');
    if (item.sc !== undefined && (typeof item.sc !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(item.sc)))
      throw Error('Invalid solid-layer color.');
    for (const [key, value] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) ||
          (key === 'x' && typeof value === 'string') ||
          (['p', 'u'].includes(key) && typeof value === 'string') ||
          key === 'fonts' || key === 'chars')
        throw Error('Scripts, expressions, fonts and external resources are not allowed in emojis.');
      pending.push([value, depth + 1]);
    }
  }
  const byId = new Map(assets.map(asset => [asset.id, asset])), visiting = new Set(), done = new Set();
  const visit = (composition) => {
    if (visiting.has(composition)) throw Error('Circular animation compositions are not supported.');
    if (done.has(composition)) return;
    visiting.add(composition);
    for (const layer of composition.layers) if (layer.refId !== undefined) {
      const asset = byId.get(layer.refId);
      if (!asset) throw Error('The animation references a missing asset.');
      visit(asset);
    }
    visiting.delete(composition); done.add(composition);
  };
  visit(data); for (const asset of assets) visit(asset);
  return data;
}
export async function decodeAnimation(blob) {
  if (blob.size > MAX_EMOJI_BYTES) throw Error('Choose an emoji file up to 1 MB.');
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 31 && bytes[1] === 139) {
    if (typeof DecompressionStream === 'undefined') throw Error('TGS decoding is unavailable in this browser. Import the Lottie JSON instead.');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_DECODED_BYTES) throw Error('The expanded animation exceeds 2 MB.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    bytes = new Uint8Array(size);
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  }
  if (bytes.length > MAX_DECODED_BYTES) throw Error('The expanded animation exceeds 2 MB.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw Error('This file is not valid Lottie JSON or Telegram TGS.'); }
  return validateAnimation(data);
}
export function emojiMatcher(emojis) {
  const tokens = [...new Set(emojis.map(e => e.token).filter(t => typeof t === 'string' && t.length > 0 && t.length <= 256))].sort((a, b) => b.length - a.length);
  return tokens.length ? new RegExp(tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
}
export function emojiParts(text, matcher) {
  if (!matcher) return [{ text }];
  const result = []; let last = 0;
  for (const match of text.matchAll(new RegExp(matcher.source, 'g'))) {
    if (match.index > last) result.push({ text: text.slice(last, match.index) });
    result.push({ token: match[0] }); last = match.index + match[0].length;
  }
  if (last < text.length) result.push({ text: text.slice(last) });
  return result;
}
export function insertEmoji(node, token, start = node.text.length, end = start) {
  start = Math.max(0, Math.min(start, node.text.length));
  end = Math.max(start, Math.min(end, node.text.length));
  // Keep an appended token out of a preceding share URL's query/path.
  if (/https?:\/\/\S*$/.test(node.text.slice(0, start))) token = ' ' + token;
  const spans = marks(node.formatting, node.text.length), delta = token.length - (end - start);
  return { ...node, text: node.text.slice(0, start) + token + node.text.slice(end), formatting: encode(spans.flatMap(span => {
    const parts = [];
    if (span.start < start) parts.push({ ...span, end: Math.min(start, span.end) });
    if (span.end > end) parts.push({ ...span, start: Math.max(end, span.start) + delta, end: span.end + delta });
    return parts;
  })) };
}
