import catalog from './noto-emoji-catalog.json' with { type: 'json' };

export const NOTO_CREDIT_PATH = 'emoji/noto-LICENSE.txt';
export const NOTO_CREDIT = 'Noto Animated Emoji artwork by Google, licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).\nLicense: https://creativecommons.org/licenses/by/4.0/\nSource: https://googlefonts.github.io/noto-emoji-animation/\nAnimation bytes are unmodified. Static SVG export metadata may be normalized to remove DTDs and resolve fixed Adobe namespace declarations; artwork is unchanged. Catalog labels are reformatted for display.\n';
export const NOTO_MAX_BYTES = 16 * 1024 * 1024;
export const notoEmojis = catalog.items.map(item => ({ ...item, token: `:noto_${item.codepoint}:`, fileName: `noto_${item.codepoint}.webp`, fallback: String.fromCodePoint(...item.codepoint.split('_').map(part => Number.parseInt(part, 16))) }));
const byToken = new Map(notoEmojis.map(item => [item.token, item]));
export const getNotoEmoji = token => byToken.get(token);
export function isNotoEmoji(item) {
  return typeof item?.token === 'string' && /^:noto_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:$/.test(item.token) && item.fileName === item.token.slice(1, -1) + '.webp';
}
export const notoPosterPath = item => 'emoji/' + item.fileName.replace(/\.webp$/, '.svg');
export function notoAssetUrl(item, poster = false) {
  const known = getNotoEmoji(item.token);
  if (!known) throw Error('Unknown Noto emoji.');
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${known.assetCodepoint || known.codepoint}/${poster ? 'emoji.svg' : '512.webp'}`;
}
export function validateNotoWebp(bytes) {
  const text = (start, end) => new TextDecoder().decode(bytes.slice(start, end));
  if (bytes.length < 30 || bytes.length > NOTO_MAX_BYTES || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP') throw Error('Google returned an invalid animated WebP.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) throw Error('Incomplete animated WebP.');
  let header = false, animation = false, frames = 0;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw Error('Incomplete WebP chunk.');
    const type = text(at, at + 4), size = view.getUint32(at + 4, true), end = at + 8 + size;
    if (end > bytes.length) throw Error('Incomplete WebP chunk.');
    if (type === 'VP8X' && size >= 10) {
      const number = offset => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
      if (!(bytes[at + 8] & 2) || number(at + 12) + 1 > 2048 || number(at + 15) + 1 > 2048) throw Error('Unsupported animated WebP dimensions.');
      header = true;
    }
    if (type === 'ANIM') animation = true;
    if (type === 'ANMF') frames++;
    at = end + (size % 2);
  }
  if (!header || !animation || !frames) throw Error('This WebP is not animated.');
  return bytes;
}
export function validateNotoPoster(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (bytes.length > 1024 * 1024 || !/<svg\b/i.test(text) || /<script\b|<foreignObject\b|<animate(?:Motion|Transform)?\b|<set\b|<!DOCTYPE|<!ENTITY|\son\w+\s*=/i.test(text) || /\b(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(text)) throw Error('Google returned an unsupported static emoji image.');
  return bytes;
}
const adobeNamespaces = new Map([
  ['ns_extend', 'http://ns.adobe.com/Extensibility/1.0/'],
  ['ns_ai', 'http://ns.adobe.com/AdobeIllustrator/10.0/'],
  ['ns_graphs', 'http://ns.adobe.com/Graphs/1.0/'],
  ['ns_vars', 'http://ns.adobe.com/Variables/1.0/'],
  ['ns_imrep', 'http://ns.adobe.com/ImageReplacement/1.0/'],
  ['ns_sfw', 'http://ns.adobe.com/SaveForWeb/1.0/'],
  ['ns_custom', 'http://ns.adobe.com/GenericCustomNamespace/1.0/'],
  ['ns_adobe_xpath', 'http://ns.adobe.com/XPath/1.0/'],
]);
export function prepareNotoPoster(bytes) {
  try { return validateNotoPoster(bytes); } catch { /* Handle only the known legacy Illustrator export below. */ }
  if (bytes.length > 1024 * 1024) throw Error('Google returned an unsupported static emoji image.');
  let text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const doctype = /<!DOCTYPE\s+svg\s+PUBLIC\s+(["'])-\/\/W3C\/\/DTD SVG 1\.1\/\/EN\1\s+(["'])https?:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd\2\s*(?:\[([\s\S]*?)\]\s*)?>/i;
  const match = doctype.exec(text);
  if (!match) throw Error('Google returned an unsupported static emoji image.');
  const entities = new Map();
  const remainder = (match[3] || '').replace(/<!ENTITY\s+(ns_[a-z_]+)\s+(["'])([^"']*)\2\s*>/g, (declaration, name, _quote, value) => {
    if (adobeNamespaces.get(name) !== value || entities.has(name)) return declaration;
    entities.set(name, value); return '';
  });
  // Never expand arbitrary entities, recursive references, parameter entities or SYSTEM resources.
  if (remainder.trim()) throw Error('This SVG contains unsupported entity declarations.');
  text = text.replace(doctype, '').replace(/^\s*<\?xml\s+[^?]*\?>/i, '');
  for (const [name, value] of entities) text = text.replaceAll(`&${name};`, value);
  return validateNotoPoster(new TextEncoder().encode(text));
}
export async function resource(url, signal, maximum) {
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' });
  if (!response.ok) throw Error(`Emoji download failed (${response.status}). Try again when online.`);
  if (Number(response.headers.get('content-length')) > maximum) throw Error('Emoji download exceeds its size limit.');
  const reader = response.body?.getReader();
  if (!reader) { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > maximum) throw Error('Emoji download exceeds its size limit.'); return bytes; }
  const chunks = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maximum) throw Error('Emoji download exceeds its size limit.'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
export async function downloadNotoEmoji(item, signal) {
  // Resolve through the bundled allow-list, not caller-controlled URLs or file names.
  const known = getNotoEmoji(item.token);
  if (!known) throw Error('Unknown Noto emoji.');
  const timeout = AbortSignal.timeout(30000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let animation, poster;
  try {
    [animation, poster] = await Promise.all([resource(notoAssetUrl(known), combined, NOTO_MAX_BYTES), resource(notoAssetUrl(known, true), combined, 1024 * 1024)]);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw Error(error?.name === 'TimeoutError' ? 'Emoji download timed out. Try again.' : `Could not download this emoji. Check your connection and try again. ${error?.message || ''}`);
  }
  // Validation failures are not connection failures. Preserve their actionable error message.
  validateNotoWebp(animation); const safePoster = prepareNotoPoster(poster);
  return new Map([['emoji/' + known.fileName, new Blob([animation], { type: 'image/webp' })], [notoPosterPath(known), new Blob([safePoster], { type: 'image/svg+xml' })], [NOTO_CREDIT_PATH, new Blob([NOTO_CREDIT], { type: 'text/plain' })]]);
}
