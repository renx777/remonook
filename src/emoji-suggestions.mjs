// Match only a fresh shortcode at the caret, not URLs, times, or saved tokens.
export function emojiQuery(text, caret) {
  const match = /(?:^|[\s([{])(:([\p{L}\p{N}_+\-]{0,64}))$/u.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length, end: caret, query: match[2] } : null;
}

export function emojiSuggestions(items, query, limit = 8) {
  return searchEmojiIndex(createEmojiSearchIndex(items), query, limit);
}
export function createEmojiSearchIndex(items) {
  return items.map(item => {
    const labels = [item.label || '', ...(item.searchLabels || [])].map(label => label.toLowerCase().replace(/[_-]/g, ' '));
    return {item, labels, searchable: [...labels,item.token,item.fallback,...(item.tags || [])].join(' ').toLowerCase().replace(/[_-]/g,' ')};
  });
}
/** @returns {any[]} */
export function searchEmojiIndex(index, query, limit = 8, accept = _item => true) {
  const words = query.toLowerCase().replace(/[_-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const phrase=words.join(' '), buckets=[[],[],[]];
  for(const entry of index){
    if(!accept(entry.item)||!words.every(word=>entry.searchable.includes(word)))continue;
    const score=entry.labels.includes(phrase)?0:entry.labels.some(label=>label.startsWith(phrase))?1:2;
    if(buckets[score].length<limit)buckets[score].push(entry.item);
  }
  return buckets.flat().slice(0,limit);
}
