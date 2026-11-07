import {noteLinks} from './relations.mjs';

/* Tags are #word, optionally nested with slashes (#study/ml). They are
   case-insensitive: the key is lower case, the label keeps the first spelling seen. */
export const TAG_SOURCE = '#[\\p{L}\\p{N}_-]+(?:\\/[\\p{L}\\p{N}_-]+)*';
export const tagPattern = () => new RegExp(`(?:^|(?<=\\s))(${TAG_SOURCE})`, 'gu');
export const isTagQuery = q => new RegExp(`^${TAG_SOURCE}$`, 'u').test(q.trim());
export const tagKey = tag => tag.replace(/^#/, '').toLowerCase();
/** True when `tag` is `query` or nested under it (#study matches #study/ml). */
export const tagMatches = (tag, query) => { const t = tagKey(tag), q = tagKey(query); return t === q || t.startsWith(q + '/'); };

/** Tags in one bullet's text, skipping internal links. */
export function tagsInText(text) {
  if (!text || !text.includes('#')) return [];
  const links = noteLinks(text);
  return [...text.matchAll(tagPattern())].filter(m => !links.some(l => m.index >= l.start && m.index < l.end))
    .map(m => ({ raw: m[0], key: tagKey(m[0]), start: m.index, end: m.index + m[0].length }));
}

/** Every tag with its count of tagged bullets (a parent counts bullets of its sub-tags too). */
export function tagIndex(nodes) {
  const tags = new Map();
  const entry = (key, label) => { let t = tags.get(key); if (!t) { t = { key, label, count: 0, own: 0, children: [], parent: key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : null, lastUsed: 0 }; tags.set(key, t); } return t; };
  for (const n of nodes) {
    if (n.codeLanguage || n.mirrorSourceId) continue;
    const found = tagsInText(n.text); if (!found.length) continue;
    const counted = new Set();
    for (const { raw, key } of found) {
      const parts = key.split('/'), labels = raw.slice(1).split('/');
      for (let i = 1; i <= parts.length; i++) {
        const k = parts.slice(0, i).join('/'), t = entry(k, labels.slice(0, i).join('/'));
        if (i === parts.length) t.own++;
        if (!counted.has(k)) { counted.add(k); t.count++; t.lastUsed = Math.max(t.lastUsed, Number(n.updatedAt || n.modifiedAt || 0) || 0); }
      }
    }
  }
  for (const t of tags.values()) if (t.parent && tags.has(t.parent)) tags.get(t.parent).children.push(t.key);
  for (const t of tags.values()) t.children.sort((a, b) => tags.get(b).count - tags.get(a).count || a.localeCompare(b));
  return tags;
}
export const tagLeaf = t => t.label.split('/').at(-1);
/** Top-level tags, most used first. */
export const rootTags = idx => [...idx.values()].filter(t => !t.parent || !idx.has(t.parent)).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

/** Tags that appear on the same bullets as `query`, excluding it and its sub-tags. */
export function relatedTags(nodes, query, limit = 6) {
  const counts = new Map();
  for (const n of nodes) {
    if (n.codeLanguage || n.mirrorSourceId) continue;
    const found = tagsInText(n.text); if (!found.some(t => tagMatches(t.raw, query))) continue;
    for (const t of new Set(found.filter(t => !tagMatches(t.raw, query)).map(t => t.key))) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([key, count]) => ({ key, count }));
}

/** Suggestions for `#query` typed in the editor: prefix matches first, then contains, by use. */
export function tagSuggestions(idx, query, limit = 8) {
  const q = query.toLowerCase(), all = [...idx.values()];
  const score = t => t.key === q ? 0 : t.key.startsWith(q) ? 1 : t.key.split('/').some(p => p.startsWith(q)) ? 2 : t.key.includes(q) ? 3 : 9;
  return all.filter(t => score(t) < 9).sort((a, b) => score(a) - score(b) || b.lastUsed - a.lastUsed || b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);
}

/* ---------- Tag settings (synced in web.tags) and smart tags ---------- */
export const TAG_COLORS = { gray: '#8a8f98', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
export const TAG_EFFECTS = ['none', 'ring', 'band', 'dim', 'blur', 'strike', 'checkbox', 'question', 'quote'];
export const EFFECT_LABELS = { none: 'None', ring: 'Ring', band: 'Band', dim: 'Dim', blur: 'Blur', strike: 'Strike', checkbox: 'Checkbox', question: 'Question', quote: 'Quote' };
/** Built-in smart tags; a user's settings for the same tag override these. */
export const BUILTIN_TAGS = {
  imp: { color: 'red', effect: 'ring' }, important: { color: 'red', effect: 'ring' }, urgent: { color: 'red', effect: 'ring' },
  todo: { color: 'yellow', effect: 'checkbox' }, pending: { color: 'yellow' },
  done: { color: 'green', effect: 'strike' }, complete: { color: 'green', effect: 'strike' },
  later: { effect: 'dim' }, someday: { effect: 'dim' },
  key: { color: 'yellow', effect: 'band' }, highlight: { color: 'yellow', effect: 'band' },
  private: { color: 'gray', effect: 'blur' },
  idea: { color: 'yellow', icon: '💡' }, q: { color: 'purple', effect: 'question' }, question: { color: 'purple', effect: 'question' }, answered: { color: 'green' },
  quote: { color: 'brown', effect: 'quote' }, pin: { icon: '📌' }, review: { color: 'blue' }, today: { color: 'blue' }, tomorrow: { color: 'blue' },
};
const oneEmoji = v => typeof v === 'string' && v.trim() && [...v.trim()].length <= 8 && !/[<>\s]/.test(v.trim()) ? v.trim() : undefined;
/** Keeps only valid settings; unknown or malformed values are dropped, never thrown. */
export function sanitizeTagSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(key) || key !== key.toLowerCase() || !v || typeof v !== 'object') continue;
    const s = {};
    if (TAG_COLORS[v.color]) s.color = v.color;
    if (TAG_EFFECTS.includes(v.effect)) s.effect = v.effect;
    if (oneEmoji(v.icon)) s.icon = oneEmoji(v.icon);
    if (typeof v.description === 'string' && v.description.trim()) s.description = v.description.slice(0, 500);
    if (v.pinned === true) s.pinned = true;
    if (Object.keys(s).length) out[key] = s;
  }
  return out;
}
let registry = {};
/** Set by the app whenever the workspace's tag settings change. */
let registryVersion = 0;
export function setTagRegistry(settings) { if (settings !== registry) { registry = settings || {}; registryVersion++; } }
export const tagRegistryVersion = () => registryVersion;
export const tagRegistry = () => registry;
/** Effective settings: built-in, then the user's; a nested tag inherits its parent's colour, icon and effect. */
export function tagSettings(key, settings = registry) {
  const k = tagKey(key), own = { ...(BUILTIN_TAGS[k] || {}), ...(settings[k] || {}) };
  if (!own.color || !own.icon || !own.effect) { const parts = k.split('/'); for (let i = parts.length - 1; i > 0; i--) { const p = parts.slice(0, i).join('/'), ps = { ...(BUILTIN_TAGS[p] || {}), ...(settings[p] || {}) }; own.color ??= ps.color; own.icon ??= ps.icon; own.effect ??= ps.effect; } }
  return own;
}
export const namedTagColor = (key, settings = registry) => TAG_COLORS[tagSettings(key, settings).color] || null;

/** How a bullet's tags change its look: row classes, an icon bullet, a checkbox state, a ring colour. */
export function bulletTagStyle(text, settings = registry) {
  const found = tagsInText(text); if (!found.length) return null;
  const keys = new Set(found.map(t => t.key)), classes = new Set(); let icon = null, checkbox = null, question = null, ring = null;
  for (const t of found) {
    const s = tagSettings(t.key, settings);
    if (s.icon && !icon) icon = s.icon;
    switch (s.effect) {
      case 'ring': classes.add('tag-ring'); ring ??= TAG_COLORS[s.color] || TAG_COLORS.red; break;
      case 'band': classes.add('tag-band'); classes.add('tag-band-' + (s.color || 'yellow')); break;
      case 'dim': classes.add('tag-dim'); break;
      case 'blur': classes.add('tag-blur'); break;
      case 'strike': classes.add('tag-strike'); break;
      case 'quote': classes.add('tag-quote'); break;
      case 'checkbox': checkbox = { tag: t, done: false }; break;
      case 'question': question = keys.has('answered') ? 'answered' : 'open'; break;
    }
  }
  if (!checkbox && (keys.has('done') || keys.has('complete')) && found.some(t => tagSettings(t.key, settings).effect === 'strike')) {
    const t = found.find(x => x.key === 'done' || x.key === 'complete'); checkbox = { tag: t, done: true };
  }
  return { classes: [...classes].join(' '), icon, checkbox, question, ring };
}

/** Replaces text ranges and keeps formatting marks on the characters they covered. */
export function editText(node, edits, marks, encode) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let text = '', at = 0; for (const e of sorted) { text += node.text.slice(at, e.start) + e.text; at = e.end; } text += node.text.slice(at);
  const map = p => { let shift = 0; for (const e of sorted) { if (p <= e.start) break; if (p >= e.end) shift += e.text.length - (e.end - e.start); else return e.start + shift + Math.min(p - e.start, e.text.length); } return p + shift; };
  const ms = marks(node.formatting || '', node.text.length).map(m => ({ ...m, start: map(m.start), end: map(m.end) })).filter(m => m.end > m.start);
  return { text, formatting: encode(ms) };
}
/** Edits that rename (or, with `to` null, remove) a tag and its sub-tags in one text. */
export function tagEdits(text, from, to) {
  const f = tagKey(from), edits = [];
  for (const t of tagsInText(text)) {
    if (!(t.key === f || t.key.startsWith(f + '/'))) continue;
    if (to === null) { const before = t.start > 0 && /\s/.test(text[t.start - 1]) ? 1 : 0, after = !before && /\s/.test(text[t.end] || '') ? 1 : 0; edits.push({ start: t.start - before, end: t.end + after, text: '' }); }
    else edits.push({ start: t.start, end: t.end, text: '#' + to.replace(/^#/, '') + t.raw.slice(1 + f.length) });
  }
  return edits;
}
/** Renames, merges (rename into an existing tag) or removes a tag across all bullets. */
export function renameTagInNodes(nodes, from, to, marks, encode) {
  let changed = 0;
  const next = nodes.map(n => { if (n.codeLanguage || n.mirrorSourceId || !n.text.includes('#')) return n; const edits = tagEdits(n.text, from, to); if (!edits.length) return n; changed++; return { ...n, ...editText(n, edits, marks, encode) }; });
  return { nodes: next, changed };
}
/** Moves settings with a renamed tag (merging into the target's), or drops them on removal. */
export function renameTagSettings(settings, from, to) {
  const f = tagKey(from), out = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (k === f || k.startsWith(f + '/')) { if (to === null) continue; const nk = tagKey(to) + k.slice(f.length); out[nk] = { ...v, ...(out[nk] || settings[nk] || {}) }; }
    else if (!out[k]) out[k] = v;
  }
  return out;
}
/** Swaps #todo for #done (or back) for a tag checkbox. */
export function toggleTagCheckbox(node, marks, encode) {
  const style = bulletTagStyle(node.text); if (!style?.checkbox) return null;
  const t = style.checkbox.tag, label = style.checkbox.done ? 'todo' : 'done';
  return editText(node, [{ start: t.start, end: t.end, text: '#' + label }], marks, encode);
}
/** #today / #tomorrow become the bullet's date; returns null when nothing changes. */
export function resolveDateTags(node, today, marks, encode) {
  const hits = tagsInText(node.text).filter(t => t.key === 'today' || t.key === 'tomorrow'); if (!hits.length) return null;
  const date = hits.some(t => t.key === 'tomorrow') ? addDay(today) : today;
  const edits = tagEdits(node.text, '#today', null).concat(tagEdits(node.text, '#tomorrow', null));
  return { ...editText(node, edits, marks, encode), dueDate: date };
}
const addDay = d => { const [y, m, day] = d.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, day + 1)); return t.toISOString().slice(0, 10); };
export const hasTag = (text, key) => tagsInText(text).some(t => tagMatches(t.raw, '#' + key));
