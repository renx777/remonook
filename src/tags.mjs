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
