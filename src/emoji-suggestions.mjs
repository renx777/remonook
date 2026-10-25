// Match only a fresh shortcode at the caret, not URLs, times, or saved tokens.
export function emojiQuery(text, caret) {
  const match = /(?:^|[\s([{])(:([\p{L}\p{N}_+\-]{0,64}))$/u.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length, end: caret, query: match[2] } : null;
}

export function emojiSuggestions(items, query, limit = 8) {
  const words = query.toLowerCase().replace(/[_-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return items.map((item, order) => {
    const label = (item.label || '').toLowerCase(), searchable = [label, item.token, item.fallback, ...(item.tags || [])].join(' ').toLowerCase().replace(/[_-]/g, ' ');
    return { item, order, score: label === words.join(' ') ? 0 : label.startsWith(words.join(' ')) ? 1 : 2, matches: words.every(word => searchable.includes(word)) };
  }).filter(result => result.matches).sort((a, b) => a.score - b.score || a.order - b.order).slice(0, limit).map(result => result.item);
}
