// Per-device reading progress for saved articles. Progress is a reading convenience,
// not shared workspace data, so it stays in this browser and never enters sync.
const key = (account: string, id: string) => `remo-bookmark-progress:${account}:${id}`;

export function readProgress(account: string, id: string): number {
  try {
    const value = Number(localStorage.getItem(key(account, id)));
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  } catch {
    return 0;
  }
}

export function writeProgress(account: string, id: string, fraction: number) {
  try {
    localStorage.setItem(key(account, id), String(Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 1000));
  } catch {}
}

export function progressLabel(fraction: number, minutes?: number) {
  const percent = Math.round(fraction * 100);
  if (percent >= 98) return 'Finished';
  const left = minutes ? Math.max(1, Math.round(minutes * (1 - fraction))) : 0;
  return left ? `${percent}% · ${left} min left` : `${percent}% read`;
}

export function savedLabel(createdAt: number, now = Date.now()) {
  const day = 86400000,
    start = new Date(now).setHours(0, 0, 0, 0),
    days = Math.floor((start - new Date(createdAt).setHours(0, 0, 0, 0)) / day);
  if (days <= 0) return 'Saved today';
  if (days === 1) return 'Saved yesterday';
  if (days < 7) return `Saved ${days} days ago`;
  return 'Saved ' + new Date(createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const tiles = [
  ['#e8f1f5', '#22617e'],
  ['#f1ece4', '#6b4f26'],
  ['#e9eef8', '#2c4b85'],
  ['#efe9f3', '#5b3b72'],
  ['#e7f2ea', '#2d6a3e'],
  ['#f6e9ea', '#8a3440'],
];

// A stable letter tile per website, so a long list scans by source.
export function siteTile(host: string) {
  let hash = 0;
  for (const c of host) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = tiles[hash % tiles.length];
  return { letter: (host.replace(/^www\./, '')[0] || '?').toUpperCase(), bg, fg };
}
