// The readable copy kept in a workspace folder's Markdown/ folder: one file per top-level bullet,
// with everything under it as a nested list. It is rewritten after every save and never read
// back (the workspace file is the source), so it is safe to open, search or copy elsewhere.
import {index} from './domain.mjs';
import {bulletMarkdown} from './ai-markdown.mjs';
import {displayText} from './relations.mjs';

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** A safe, readable file name (without extension) for a bullet title. */
export function fileTitle(text) {
  let name = String(text || '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  name = name.replace(/^[.\s]+/, '').slice(0, 80).replace(/[.\s]+$/, '');
  if (!name) name = 'Untitled';
  if (RESERVED.test(name)) name += ' (note)';
  return name;
}

function lines(idx, parent, depth, out) {
  for (const n of idx.children.get(parent) || []) {
    const body = bulletMarkdown(n).split('\n'), pad = '  '.repeat(depth), marker = n.listType === 'ORDERED' ? '1.' : '-';
    out.push(`${pad}${marker} ${body[0]}`);
    for (const extra of body.slice(1)) out.push(`${pad}  ${extra}`);
    lines(idx, n.id, depth + 1, out);
  }
}

/** [file name, Markdown] for every top-level bullet, in outline order; names are unique. */
export function workspaceMarkdown(doc) {
  const idx = index(doc.tables.bullets), used = new Set(), files = [];
  for (const top of idx.children.get(null) || []) {
    const title = fileTitle(displayText(top.text));
    let name = title, n = 2;
    while (used.has(name.toLowerCase())) name = `${title} (${n++})`;
    used.add(name.toLowerCase());
    const out = [`# ${bulletMarkdown(top).split('\n')[0] || 'Untitled'}`, ''];
    lines(idx, top.id, 0, out);
    files.push([name + '.md', out.join('\n').trimEnd() + '\n']);
  }
  return files;
}
