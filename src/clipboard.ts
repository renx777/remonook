import { marked } from 'marked';
import { encode, marks, parseOutlineText } from './domain.mjs';
import {parseRoughStyle,roughStyle} from './rough-annotations.mjs';

export type ClipboardInput = string | { text: string; html?: string; opml?: string };
export type OutlineLine = { depth: number; text: string; formatting: string; listType: string; taskState: string; codeLanguage: string; blockStyle?: string; dividerStyle?: string; dividerColor?: string; collapsed?: boolean };
const line = (depth: number, extra: Partial<OutlineLine> = {}): OutlineLine => ({ depth, text: '', formatting: '', listType: 'NONE', taskState: 'NONE', codeLanguage: '', ...extra });
const ignored = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'TEMPLATE', 'HEAD', 'META', 'LINK']);
const blocks = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'TABLE', 'TR', 'DL', 'DT', 'DD']);
function color(value: string) {
  if (/^#[\da-f]{6}$/i.test(value)) return value.slice(1).toUpperCase();
  if (/^#[\da-f]{3}$/i.test(value)) return value.slice(1).split('').map(c => c + c).join('').toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:[, /]+([\d.]+))?\s*\)$/);
  if (rgb && (!rgb[4] || Number(rgb[4]) > 0)) return rgb.slice(1, 4).map(c => Math.min(255, Number(c)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return '';
}
const bulletPrefix = /^\s*([-*+•◦▪‣∙●○■□]|\d+[.)])\s+/u;
function isNeutralColor(value: string) {
  const rgb = value.match(/[a-f\d]{2}/gi)?.map(value => parseInt(value, 16));
  return rgb?.length === 3 && Math.max(...rgb) - Math.min(...rgb) <= 24;
}
function normalizeExternalLine(item: OutlineLine, preserve = false): OutlineLine {
  if (preserve || item.codeLanguage) return item;
  const task = item.text.match(/^\s*(?:[-*+•]\s+)?(?:\[([ xX])\]|([☐☑]))\s+/u);
  const prefix = task || item.text.match(bulletPrefix), removed = prefix?.[0].length || 0;
  const old = marks(item.formatting, item.text.length);
  if (removed && old.some((m: any) => m.style === 'CODE' && m.start === 0 && m.end >= removed)) return item;
  const text = item.text.slice(removed);
  const spans = old.map((m: any) => ({ ...m, start: Math.max(0, m.start - removed), end: m.end - removed })).filter((m: any) => m.end > m.start);
  // External apps commonly serialize their neutral foreground as inline color.
  // Treat a whole-line neutral color as the source theme, not user emphasis.
  const fullNeutral = new Set(spans.filter((m: any) => m.start === 0 && m.end === text.length && m.style.startsWith('COLOR_') && isNeutralColor(m.style.slice(6))).map((m: any) => m.style));
  return { ...item, text,
    listType: prefix && !task ? /^\d/.test(prefix[1]) ? 'ORDERED' : item.listType === 'ORDERED' ? 'ORDERED' : 'UNORDERED' : item.listType,
    taskState: task ? task[1]?.toLowerCase() === 'x' || task[2] === '☑' ? 'DONE' : 'TODO' : item.taskState,
    formatting: encode(spans.filter((m: any) => !fullNeutral.has(m.style))),
  };
}
const hasRemoFormatting = (nodes: Iterable<globalThis.Node>) => Array.from(nodes).some(node => node.nodeType === 1 && ((node as Element).matches('[data-remo-color], [data-remo-list-type]') || (node as Element).querySelector('[data-remo-color], [data-remo-list-type]')));
/** Read supported text styles only. No clipboard DOM is ever attached to the page. */
function inline(nodes: Iterable<globalThis.Node>, preserveWhitespace = false) {
  let text = '';
  const spans: { start: number; end: number; style: string }[] = [];
  function append(value: string, styles: string[]) {
    const start = text.length;
    text += preserveWhitespace ? value : value.replace(/[\t\r\n ]+/g, ' ');
    if (text.length > start) for (const style of new Set(styles)) spans.push({ start, end: text.length, style });
  }
  function walk(node: globalThis.Node, inherited: string[]) {
    if (node.nodeType === 3) { append(node.textContent || '', inherited); return; }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement, tag = el.tagName.toUpperCase();
    if (ignored.has(tag) || tag === 'INPUT' || tag === 'UL' || tag === 'OL') return;
    if (/mso-list:\s*Ignore/i.test(el.getAttribute('style') || '') || el.matches('.list-marker, .bullet-dot-btn, .triangle-toggle, .row-end')) return;
    if (el.style.display === 'none' || el.style.visibility === 'hidden') return;
    const styles = [...inherited];
    if (['B', 'STRONG'].includes(tag) || /^(bold|[6-9]00)$/.test(el.style.fontWeight)) styles.push('BOLD');
    if (['I', 'EM'].includes(tag) || el.style.fontStyle === 'italic') styles.push('ITALIC');
    if (tag === 'U' || /underline/.test(el.style.textDecoration)) styles.push('UNDERLINE');
    if (tag === 'CODE') styles.push('CODE');
    if (el.hasAttribute('data-remo-mask') || el.classList.contains('masked-text')) styles.push('MASK');
    const rough=roughStyle(el.dataset.remoRough,el.dataset.remoRoughColor||'AUTO');if(rough)styles.push(rough);
    const fg = color(el.style.color || el.getAttribute('color') || ''), bg = color(el.style.backgroundColor);
    if (fg && !(blocks.has(tag) && isNeutralColor(fg) && !el.hasAttribute('data-remo-color'))) {
      for (let i = styles.length - 1; i >= 0; i--) if (styles[i].startsWith('COLOR_')) styles.splice(i, 1);
      styles.push('COLOR_' + fg);
    }
    if (bg || tag === 'MARK') styles.push('HIGHLIGHT_' + (bg || 'FFE082'));
    if (tag === 'BR') { const start = text.length; text += '\n'; for (const style of styles) spans.push({ start, end: text.length, style }); return; }
    if (tag === 'IMG') { append(el.getAttribute('alt') || '', styles); return; }
    const block = blocks.has(tag);
    if (block && text && !text.endsWith('\n')) text += '\n';
    el.childNodes.forEach(child => walk(child, styles));
    if (block && text && !text.endsWith('\n')) text += '\n';
  }
  for (const node of nodes) walk(node, []);
  const leading = preserveWhitespace ? 0 : text.length - text.trimStart().length;
  text = preserveWhitespace ? text : text.trim();
  const clipped = spans.map(m => ({ ...m, start: Math.max(0, m.start - leading), end: Math.min(text.length, m.end - leading) })).filter(m => m.end > m.start);
  // Coalesce adjacent spans of the same style without losing overlapping marks.
  const grouped = new Map<string, typeof clipped>();
  for (const span of clipped) { const group = grouped.get(span.style) || [], last = group.at(-1); if (last && last.end >= span.start) last.end = Math.max(last.end, span.end); else group.push({ ...span }); grouped.set(span.style, group); }
  return { text, formatting: encode([...grouped.values()].flat()) };
}
function htmlLines(html: string): OutlineLine[] {
  const doc = new DOMParser().parseFromString(html, 'text/html'), result: OutlineLine[] = [];
  function container(nodes: Iterable<globalThis.Node>, depth: number) {
    let buffer: globalThis.Node[] = [];
    const headings: { level: number; depth: number }[] = [];
    const currentDepth = () => headings.length ? headings.at(-1)!.depth + 1 : depth;
    function emitInline() { const value = inline(buffer); if (value.text) result.push(normalizeExternalLine(line(currentDepth(), value), hasRemoFormatting(buffer))); buffer = []; }
    for (const node of nodes) {
      if (node.nodeType !== 1) { buffer.push(node); continue; }
      const el = node as HTMLElement, tag = el.tagName;
      if (ignored.has(tag)) continue;
      if (!blocks.has(tag)) { buffer.push(node); continue; }
      emitInline();
      if (/^H[1-6]$/.test(tag)) {
        const level = Number(tag[1]); while (headings.length && headings.at(-1)!.level >= level) headings.pop();
        const headingDepth = currentDepth(), value = inline([el]);
        result.push(line(headingDepth, { ...value, blockStyle: `h${Math.min(3, level)}` })); headings.push({ level, depth: headingDepth });
      } else if (tag === 'HR') {
        result.push(line(currentDepth(), { blockStyle: 'divider' }));
      } else if (tag === 'UL' || tag === 'OL') {
        for (const child of Array.from(el.children)) if (child.tagName === 'LI') listItem(child as HTMLElement, currentDepth(), tag === 'OL' ? 'ORDERED' : 'UNORDERED');
      } else if (tag === 'PRE') {
        const code = el.querySelector('code'), language = (code?.className || el.className).match(/(?:language-|lang-)([\w+-]+)/)?.[1] || 'plaintext';
        result.push(line(currentDepth(), { text: el.textContent?.replace(/\n$/, '') || '', codeLanguage: language }));
      } else if (tag === 'LI') listItem(el, currentDepth(), 'UNORDERED');
      else if (tag === 'P' || /^D[TD]$/.test(tag)) {
        const value = inline([el]);
        const wordLevel = el.getAttribute('style')?.match(/mso-list:[^;]*\blevel(\d+)/i)?.[1];
        const margin = el.style.marginLeft || el.style.paddingLeft;
        const extraDepth = wordLevel ? Math.max(0, Number(wordLevel) - 1) : margin ? Math.max(0, Math.round(parseFloat(margin) / (margin.endsWith('pt') ? 24 : 32))) : 0;
        if (value.text || el.querySelector('br')) result.push(normalizeExternalLine(line(currentDepth() + extraDepth, { ...value, listType: wordLevel ? 'UNORDERED' : 'NONE' }), hasRemoFormatting([el])));
      } else container(el.childNodes, currentDepth());
    }
    emitInline();
  }
  function listItem(el: HTMLElement, depth: number, listType: string) {
    const ownBlocks = Array.from(el.querySelectorAll('ul,ol,pre')).filter(block => block.parentElement?.closest('li') === el);
    const ownCode = ownBlocks.filter(block => block.tagName === 'PRE');
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('pre').forEach(pre => pre.remove());
    // Heading structure is stored separately; do not turn its closing tag into
    // an extra text newline when copying our own outline back into Remo.
    copy.querySelectorAll('h1,h2,h3').forEach(heading => heading.replaceWith(...heading.childNodes));
    const ownValue = inline(copy.childNodes, el.hasAttribute('data-remo-list-type'));
    const codeOnly = ownCode.length === 1 && !ownValue.text.trim();
    const value = ownValue;
    const checkbox = Array.from(el.querySelectorAll('input[type="checkbox"]')).find(input => input.closest('li') === el);
    const item = line(depth, { ...value, listType, taskState: checkbox ? checkbox.hasAttribute('checked') ? 'DONE' : 'TODO' : 'NONE' });
    const blockStyle = el.getAttribute('data-remo-block-style');
    if (blockStyle && /^(h[1-3]|paragraph|quote|divider)$/.test(blockStyle)) item.blockStyle = blockStyle;
    else { const heading = Array.from(el.children).find(child => /^H[1-3]$/.test(child.tagName)); if (heading) item.blockStyle = heading.tagName.toLowerCase(); else if (Array.from(el.children).some(child => child.tagName === 'HR')) item.blockStyle = 'divider'; }
    const dividerStyle = el.getAttribute('data-remo-divider-style');
    if (dividerStyle) item.dividerStyle = dividerStyle;
    const dividerColor = el.getAttribute('data-remo-divider-color');
    if (dividerColor) item.dividerColor = dividerColor;
    const storedList = el.getAttribute('data-remo-list-type'), storedTask = el.getAttribute('data-remo-task');
    if (storedList && ['NONE', 'ORDERED', 'UNORDERED'].includes(storedList)) item.listType = storedList;
    if (storedTask && ['NONE', 'TODO', 'DONE'].includes(storedTask)) item.taskState = storedTask;
    const readCode = (pre: Element) => ({ codeLanguage: pre.querySelector('code')?.className.match(/(?:language-|lang-)([\w+-]+)/)?.[1] || 'plaintext', text: pre.textContent?.replace(/\n$/, '') || '', formatting: '' });
    if (codeOnly) { Object.assign(item, readCode(ownCode[0])); if (el.hasAttribute('data-remo-list-type')) item.formatting = inline((ownCode[0].querySelector('code') || ownCode[0]).childNodes, true).formatting; }
    result.push(normalizeExternalLine(item, hasRemoFormatting([el])));
    for (const block of ownBlocks) {
      if (block.tagName === 'PRE') {
        if (!codeOnly) result.push(line(depth + 1, readCode(block)));
      } else for (const child of Array.from(block.children)) if (child.tagName === 'LI') listItem(child as HTMLElement, depth + 1, block.tagName === 'OL' ? 'ORDERED' : 'UNORDERED');
    }
  }
  container(doc.body.childNodes, 0);
  return result;
}
function opmlLines(source: string): OutlineLine[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('OPML containing document types or entities cannot be pasted.');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'opml' || !doc.querySelector('body')) throw Error('This OPML is incomplete or invalid. Copy the complete <opml> document and try again.');
  const result: OutlineLine[] = [], stack = Array.from(doc.querySelector('body')!.children).reverse().map(el => ({ el, depth: 0 }));
  while (stack.length) {
    const { el, depth } = stack.pop()!;
    if (el.localName !== 'outline') continue;
    const raw = el.getAttribute('text') ?? el.getAttribute('title') ?? '';
    const value = /<\/?[a-z][\s\S]*>/i.test(raw) ? inline(new DOMParser().parseFromString(raw, 'text/html').body.childNodes) : { text: raw, formatting: '' };
    result.push(line(depth, value));
    const note = el.getAttribute('_note') || el.getAttribute('note');
    if (note) result.push(line(depth + 1, { text: note }));
    for (const child of Array.from(el.children).reverse()) stack.push({ el: child, depth: depth + 1 });
  }
  return result;
}
export function parseClipboard(input: ClipboardInput): { lines: OutlineLine[]; format: string } {
  const { text, html, opml } = typeof input === 'string' ? { text: input, html: '', opml: '' } : input;
  if (text.length + (html?.length || 0) + (opml?.length || 0) > 4 * 1024 * 1024) throw Error('Paste up to 4 MB of text at a time.');
  let lines: OutlineLine[], format: string;
  if (opml || /^(?:\s*<\?xml[^>]*\?>)?\s*<opml\b/i.test(text)) { lines = opmlLines(opml || text); format = 'OPML'; }
  else if (html && /<[a-z][\s\S]*>/i.test(html)) { lines = htmlLines(html); format = 'Formatted text'; }
  else if (/^\s{0,3}(?:#{1,6}\s|```|~~~|[-*+]\s|\d+[.)]\s|>\s)|\*\*[^*]+\*\*|__[^_]+__|`[^`\n]+`|(?:^|\s)\*[^*\n]+\*(?:\s|$)/m.test(text)) {
    lines = htmlLines(marked.parse(text, { async: false, breaks: true, gfm: true })); format = 'Markdown';
  } else { lines = /[\r\n]/.test(text) || bulletPrefix.test(text) ? parseOutlineText(text).map((item: any) => line(item.depth, item)) : [line(0, { text })]; format = 'Plain text'; }
  if (format === 'Formatted text' && lines.length === 1 && !lines[0].codeLanguage && !/[\r\n]/.test(text) && text.trim() === lines[0].text) {
    const leading = text.length - text.trimStart().length;
    lines[0].formatting = encode(marks(lines[0].formatting, lines[0].text.length).map((m: any) => ({ ...m, start: m.start + leading, end: m.end + leading })));
    lines[0].text = text;
  }
  if (!lines.length) throw Error('No outline text was found in the clipboard.');
  // Normalize absolute external indentation while retaining relative levels.
  const base = Math.min(...lines.map(item => item.depth));
  let previous = 0;
  lines = lines.map((item, i) => { const depth = i ? Math.min(Math.max(0, item.depth - base), previous + 1) : 0; previous = depth; return { ...item, depth }; });
  return { lines, format };
}

/** Safe HTML for copying Remo branches, including formatting and metadata. */
export function outlineClipboardHtml(lines: OutlineLine[]) {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inlineHtml = (item: OutlineLine) => {
    const ms = marks(item.formatting, item.text.length), points: number[] = [...new Set<number>([0, item.text.length, ...ms.flatMap((m: any) => [m.start, m.end])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((a, i) => {
      const b = points[i + 1]; let html = escape(item.text.slice(a, b)).replace(/\n/g, '<br>');
      for (const m of ms.filter((m: any) => m.start <= a && m.end >= b)) {
        const style = m.style;
        const rough=parseRoughStyle(style);
        if(rough)html=`<span data-remo-rough="${rough.type}" data-remo-rough-color="${rough.color}">${html}</span>`;
        else if (style === 'MASK') html = `<span data-remo-mask="true">${html}</span>`;
        else if (style.startsWith('COLOR_')) html = `<span style="color:#${style.slice(6)}">${html}</span>`;
        else if (style.startsWith('HIGHLIGHT')) html = `<mark style="background-color:#${style.includes('_') ? style.slice(10) : 'FFE082'}">${html}</mark>`;
        else { const tag = ({ BOLD: 'strong', ITALIC: 'em', UNDERLINE: 'u', CODE: 'code' } as Record<string, string>)[style]; if (tag) html = `<${tag}>${html}</${tag}>`; }
      }
      return html;
    }).join('');
  };
  // Lists encode hierarchy using standard HTML, so other outliners can also read it.
  let html = '', depth = -1;
  for (const item of lines) {
    while (depth > item.depth) { html += '</li></ul>'; depth--; }
    if (depth === item.depth) html += '</li>';
    while (depth < item.depth) { html += '<ul><li>'; depth++; }
    if (!html.endsWith('<li>')) html += '<li>';
    const style = /^(h[1-3]|paragraph|quote|divider)$/.test(item.blockStyle || '') ? item.blockStyle : 'paragraph';
    const divAttrs = (style === 'divider' ? (item.dividerStyle ? ` data-remo-divider-style="${escape(item.dividerStyle)}"` : '') + (item.dividerColor ? ` data-remo-divider-color="${escape(item.dividerColor)}"` : '') : '');
    html = html.replace(/<li>$/, `<li data-remo-list-type="${escape(item.listType)}" data-remo-task="${escape(item.taskState)}" data-remo-block-style="${style}"${divAttrs}>`);
    html += item.codeLanguage ? `<pre><code class="language-${escape(item.codeLanguage)}">${inlineHtml(item).replace(/<br>/g, "\n")}</code></pre>` : style === 'quote' ? '<blockquote>'+inlineHtml(item)+'</blockquote>' : style === 'divider' ? '<hr>' + inlineHtml(item) : /^h[1-3]$/.test(style!) ? `<${style}>${inlineHtml(item)}</${style}>` : inlineHtml(item);
  }
  while (depth >= 0) { html += '</li></ul>'; depth--; }
  return html;
}
