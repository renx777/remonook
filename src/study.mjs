import {occlusionDefinition} from "./occlusion.mjs";
import { index, indexedRows, rows, schedule } from "./domain.mjs";
import { ALL_MCQS, mcqDefinition } from "./mcq.mjs";

export const STUDY_SESSION = "web-current";
export const availableCard = (card, now) => card.state === "ACTIVE" && !card.suspended && (card.buriedUntilEpochMillis || 0) <= now;

const mcqScope = (doc, scope) => scope === ALL_MCQS || doc.web?.deckTypes?.[scope] === "MCQ" || !!doc.web?.mcqs?.[scope];

// Reuse tree indexes and daily history across every notebook on the shelf.
// The context is render-local, not a stale global cache of mutable imports.
export function createStudyContext(doc, now = Date.now()) {
  const idx = index(doc.tables.bullets), order = indexedRows(idx, null, true), rank = new Map(), ranges = new Map(), stack = [], owners = new Map(), roots = new Set(doc.tables.decks.map(deck => deck.rootId));
  for (let i = 0; i < order.length; i++) {
    const row = order[i], node = row.bullet;
    while (stack.length && stack.at(-1).depth >= row.depth) ranges.get(stack.pop().id).end = i;
    rank.set(node.id, i); ranges.set(node.id, { start: i, end: order.length }); stack.push({ id: node.id, depth: row.depth });
    owners.set(node.id, roots.has(node.id) ? node.id : owners.get(node.parentId) || "__default__");
  }
  const day = localDay(now), seen = new Map(), counts = new Map(), firstSpaced = new Map();
  for (const log of doc.tables.review_logs.filter(log => log.mode === "SPACED").sort((a, b) => a.reviewedAtEpochMillis - b.reviewedAtEpochMillis)) {
    if (!firstSpaced.has(log.cardId)) firstSpaced.set(log.cardId, log.reviewedAtEpochMillis);
    if (log.reviewedAtEpochMillis < day || seen.has(log.cardId)) continue;
    const owner = owners.get(log.cardId) || "__default__", kind = firstSpaced.get(log.cardId) >= day ? "newCards" : "reviewCards", key = owner + ":" + kind;
    seen.set(log.cardId, kind); counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { idx, rank, ranges, owners, definitions: new Map(), seen, counts, limits: new Map(doc.tables.study_limits.map(limit => [limit.deckId, limit])) };
}

export function deckOwners(nodes, decks) {
  const roots = new Set(decks.map(deck => deck.rootId)), owners = new Map();
  for (const row of rows(nodes, null, true))
    owners.set(row.bullet.id, roots.has(row.bullet.id) ? row.bullet.id : owners.get(row.bullet.parentId) || "__default__");
  return owners;
}

/** @param {string|null} scope @param {string|null} topicId */
export function scopedCards(doc, scope = null, now = Date.now(), context = createStudyContext(doc, now), topicId = null) {
  const { idx, rank, ranges, definitions } = context, range = ranges.get(scope), scoped = scope && scope !== ALL_MCQS;
  const topicRange = topicId ? ranges.get(topicId) : null;
  const excluded=new Set(doc.web?.studyExcludedCards||[]);
  const validTopic = !topicId || !!(scoped && topicRange && idx.byId.get(topicId)?.parentId === scope);
  return doc.tables.cards.filter(card => {
    if(excluded.has(card.id))return false;
    if(doc.web?.occlusions?.[card.id]&&!occlusionDefinition(doc,card.id)?.valid)return false;
    const at = rank.get(card.id);
    if (!validTopic || (topicId && (at === undefined || at <= topicRange.start || at >= topicRange.end))) return false;
    if (!availableCard(card, now) || (scoped && card.id !== scope && (!range || at === undefined || at < range.start || at >= range.end))) return false;
    if (!definitions.has(card.id)) definitions.set(card.id, mcqDefinition(doc, card.id, idx));
    const mcq = definitions.get(card.id);
    return mcqScope(doc, scope) ? !!mcq?.valid : !mcq;
  })
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.createdAtEpochMillis - b.createdAtEpochMillis || a.id.localeCompare(b.id));
}

export function localDay(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
export function tomorrow(now) {
  const day = new Date(now);
  day.setDate(day.getDate() + 1);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** @param {string|null} scope @param {string|null} topicId */
export function dueCards(doc, scope = null, now = Date.now(), context = createStudyContext(doc, now), topicId = null) {
  const { owners, limits, seen } = context, counts = new Map(context.counts);
  return scopedCards(doc, scope, now, context, topicId).filter(card => card.dueAtEpochMillis <= now)
    .sort((a, b) => a.dueAtEpochMillis - b.dueAtEpochMillis || a.createdAtEpochMillis - b.createdAtEpochMillis || a.id.localeCompare(b.id))
    .filter(card => {
      if (seen.has(card.id)) return true;
      const owner = owners.get(card.id) || "__default__",
        kind = card.lastReviewAtEpochMillis ? "reviewCards" : "newCards",
        key = owner + ":" + kind,
        cap = limits.get(owner)?.[kind] ?? -1;
      if (cap !== -1 && (counts.get(key) || 0) >= cap) return false;
      counts.set(key, (counts.get(key) || 0) + 1);
      return true;
    });
}

export function deckTopics(doc, scope, now = Date.now(), context = createStudyContext(doc, now)) {
  if (!scope || scope === ALL_MCQS) return [];
  const cards = scopedCards(doc, scope, now, context), cardIds = new Set(cards.map(card => card.id));
  const topics = (context.idx.children.get(scope) || []).filter(node => !cardIds.has(node.id) && node.blockStyle !== 'divider').map(node => ({ id: node.id, title: node.text || 'Untitled topic', cards: 0, due: 0, range: context.ranges.get(node.id), counts: new Map() }));
  let at = 0;
  for (const card of cards) {
    const rank = context.rank.get(card.id);
    while (at < topics.length && rank >= topics[at].range.end) at++;
    const topic = topics[at];
    if (!topic || rank <= topic.range.start) continue;
    topic.cards++;
    if (card.dueAtEpochMillis > now) continue;
    if (context.seen.has(card.id)) { topic.due++; continue; }
    const owner = context.owners.get(card.id) || '__default__', kind = card.lastReviewAtEpochMillis ? 'reviewCards' : 'newCards', key = owner + ':' + kind;
    const used = topic.counts.get(key) ?? context.counts.get(key) ?? 0, cap = context.limits.get(owner)?.[kind] ?? -1;
    if (cap === -1 || used < cap) { topic.due++; topic.counts.set(key, used + 1); }
  }
  const topical = doc.tables.decks.find(deck => deck.rootId === scope)?.layout === 'TOPICS';
  return topics.filter(topic => topical || topic.cards).map(({range, counts, ...topic}) => topic);
}

/** @param {string|null} topicId */
export function studyQueue(doc, scope, mode, now = Date.now(), random = Math.random, topicId = null) {
  const context = createStudyContext(doc, now), cards = mode === "SPACED" ? dueCards(doc, scope, now, context, topicId) : scopedCards(doc, scope, now, context, topicId),
    queue = cards.map(card => card.id);
  if (mode === "SPACED") for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

/** @param {string|null} topicId */
export function newStudySession(doc, scope, mode, now = Date.now(), random = Math.random, topicId = null) {
  if (!["NORMAL", "SPACED"].includes(mode)) throw Error("Unknown study mode");
  return { id: STUDY_SESSION, scope, mode, tag: "", ...(topicId ? { topicId } : {}), queueJson: JSON.stringify(studyQueue(doc, scope, mode, now, random, topicId)), cursor: 0, reviewed: 0, revealed: 0, updatedAt: now };
}

export function sessionQueue(session) {
  try {
    const queue = JSON.parse(session.queueJson);
    return Array.isArray(queue) && queue.every(id => typeof id === "string") ? queue : [];
  } catch { return []; }
}

// Older flashcard sessions may contain MCQs. Keep their progress and review
// history while removing those entries from the saved queue.
export function separateFlashcardSession(doc, session) {
  if (mcqScope(doc, session.scope)) return session;
  const queue = sessionQueue(session), keep = id => !doc.web?.mcqs?.[id];
  const filtered = queue.filter(keep);
  if (filtered.length === queue.length) return session;
  return { ...session, queueJson: JSON.stringify(filtered),
    cursor: queue.slice(0, session.cursor).filter(keep).length,
    ...(session.furthestCursor !== undefined ? { furthestCursor: queue.slice(0, studyFrontier(session)).filter(keep).length } : {}),
    revealed: keep(queue[session.cursor]) ? session.revealed : 0 };
}
export function saveSession(doc, session) {
  const extras = ['topicId', 'furthestCursor'].filter(key => session[key] !== undefined && !doc.columns?.study_sessions.includes(key));
  return { ...doc, ...(doc.columns && extras.length ? { columns: { ...doc.columns, study_sessions: [...doc.columns.study_sessions, ...extras] } } : {}), tables: { ...doc.tables, study_sessions: [...doc.tables.study_sessions.filter(item => item.id !== session.id), session] } };
}

export const studyFrontier = session => Math.max(session.cursor, Number(session.furthestCursor) || 0);
export function navigateStudyCard(doc, session, direction, now = Date.now()) {
  const queue = sessionQueue(session), frontier = studyFrontier(session);
  if (direction === 'next' && !session.revealed) return doc;
  let cursor = session.cursor + (direction === 'previous' ? -1 : 1);
  const cards = new Map(doc.tables.cards.map(card => [card.id, card]));
  while (cursor >= 0 && cursor < queue.length && !availableCard(cards.get(queue[cursor]) || {}, now)) cursor += direction === 'previous' ? -1 : 1;
  if (cursor < 0 || cursor > queue.length) return doc;
  return saveSession(doc, { ...session, cursor, furthestCursor: Math.max(frontier, cursor), revealed: direction === 'previous' ? 1 : 0, updatedAt: now });
}

export function reviewCard(doc, session, grade, responseTimeMillis, now = Date.now()) {
  const queue = sessionQueue(session), id = queue[session.cursor],
    card = doc.tables.cards.find(card => card.id === id);
  if (!card || !availableCard(card, now) || !session.revealed) throw Error("Reveal an available card before grading it");
  if (!["AGAIN", "HARD", "GOOD", "EASY"].includes(grade)) throw Error("Unknown grade");
  // A revisited card is history: moving forward must never reschedule or log it twice.
  if (session.cursor < studyFrontier(session)) return navigateStudyCard(doc, session, 'next', now);
  const updated = session.mode === "SPACED" ? schedule(card, grade, now) : card,
    log = {
      id: doc.tables.review_logs.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
      cardId: id, grade: session.mode === "NORMAL" ? "PRACTICE" : grade,
      reviewedAtEpochMillis: now, responseTimeMillis: Math.max(0, Math.round(responseTimeMillis)),
      scheduledNextAtEpochMillis: updated.dueAtEpochMillis, mode: session.mode,
    },
    next = { ...session, cursor: session.cursor + 1, ...(session.furthestCursor !== undefined ? { furthestCursor: session.cursor + 1 } : {}), reviewed: session.reviewed + 1, revealed: 0, updatedAt: now };
  return saveSession({ ...doc, tables: { ...doc.tables, cards: doc.tables.cards.map(item => item.id === id ? updated : item), review_logs: [...doc.tables.review_logs, log] } }, next);
}

export function intervalLabel(card, grade, now = Date.now()) {
  const next = schedule(card, grade, now).dueAtEpochMillis - now;
  if (next < 3600000) return `${Math.round(next / 60000)} min`;
  const days = Math.round(next / 86400000);
  return days === 1 ? "1 day" : `${days} days`;
}
