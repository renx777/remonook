import {roughPattern} from './rough-annotations.mjs';
export function safeRandomUUID() {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function' && crypto.randomUUID !== safeRandomUUID) {
      try {
        return crypto.randomUUID();
      } catch {}
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (
      Number(c) ^
      (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))
    ).toString(16)
  );
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis;
  if (!g.crypto) {
    try {
      g.crypto = {};
    } catch {}
  }
  const c = g.crypto;
  if (c && typeof c.randomUUID !== 'function') {
    try {
      c.randomUUID = safeRandomUUID;
    } catch {
      try {
        Object.defineProperty(c, 'randomUUID', {
          value: safeRandomUUID,
          configurable: true,
          writable: true,
        });
      } catch {}
    }
  }
  if (typeof Crypto !== 'undefined' && Crypto.prototype && typeof Crypto.prototype.randomUUID !== 'function') {
    try {
      Crypto.prototype.randomUUID = safeRandomUUID;
    } catch {
      try {
        Object.defineProperty(Crypto.prototype, 'randomUUID', {
          value: safeRandomUUID,
          configurable: true,
          writable: true,
        });
      } catch {}
    }
  }
}

/** @returns {string} */
export const uuid = () => safeRandomUUID();
export const bullet = (id = uuid(), extra = {}) => ({
  id,
  parentId: null,
  position: 0,
  text: "",
  kind: "NOTE",
  collapsed: false,
  formatting: "",
  autoHighlight: false,
  listType: "NONE",
  codeLanguage: "",
  taskState: "NONE",
  dueDate: "",
  journalDate: "",
  ...extra,
});
export function index(nodes) {
  const byId = new Map(),
    children = new Map();
  for (const n of nodes) {
    byId.set(n.id, n);
    const a = children.get(n.parentId) || [];
    a.push(n);
    children.set(n.parentId, a);
  }
  for (const a of children.values())
    a.sort(
      (a, b) =>
        a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return { byId, children };
}
export function validate(nodes) {
  const { byId } = index(nodes);
  if (byId.size !== nodes.length) throw Error("Duplicate bullet IDs");
  const complete = new Set();
  for (const n of nodes) {
    if (
      typeof n.id !== "string" ||
      !n.id ||
      typeof n.text !== "string" ||
      !Number.isInteger(n.position) ||
      ![null, "string"].includes(n.parentId === null ? null : typeof n.parentId)
    )
      throw Error("Invalid bullet record");
    if (
      !["NOTE", "QUESTION", "ANSWER"].includes(n.kind) ||
      !["NONE", "UNORDERED", "ORDERED"].includes(n.listType) ||
      !["NONE", "TODO", "DONE"].includes(n.taskState)
    )
      throw Error("Unsupported bullet metadata; data has not been replaced");
    for (const date of [n.dueDate, n.journalDate]) {
      if (typeof date !== "string") throw Error("Invalid date field");
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
      )
        throw Error("Invalid calendar date");
    }
    const path = new Set();
    let id = n.id;
    while (id !== null && !complete.has(id)) {
      if (path.has(id)) throw Error("A branch cannot contain itself");
      path.add(id);
      const item = byId.get(id);
      if (!item) throw Error("Missing parent");
      id = item.parentId;
    }
    for (const id of path) complete.add(id);
  }
}
/** @param {string|null} scope */
export function rows(nodes, scope = null, expand = false) {
  return indexedRows(index(nodes), scope, expand);
}
/** @param {string|null} scope */
export function indexedRows(idx, scope = null, expand = false) {
  const out = [],
    stack = (idx.children.get(scope) || [])
      .slice()
      .reverse()
      .map((b) => ({ bullet: b, depth: 0 }));
  while (stack.length) {
    const r = stack.pop();
    out.push(r);
    if (expand || !r.bullet.collapsed) {
      const cs = idx.children.get(r.bullet.id) || [];
      for (let i = cs.length - 1; i >= 0; i--)
        stack.push({ bullet: cs[i], depth: r.depth + 1 });
    }
  }
  return out;
}
export function descendants(nodes, id) {
  const idx = index(nodes),
    ids = new Set(),
    stack = [id];
  while (stack.length) {
    const x = stack.pop();
    if (ids.has(x)) continue;
    ids.add(x);
    for (const c of idx.children.get(x) || []) stack.push(c.id);
  }
  return ids;
}
export function move(nodes, id, parentId, at) {
  const idx = index(nodes),
    n = idx.byId.get(id);
  if (!n) throw Error("This bullet no longer exists");
  if (parentId !== null && !idx.byId.has(parentId))
    throw Error("Missing destination");
  if (descendants(nodes, id).has(parentId))
    throw Error("Cannot move into own branch");
  const siblings = (idx.children.get(parentId) || []).filter(
    (x) => x.id !== id,
  );
  siblings.splice(Math.max(0, Math.min(at, siblings.length)), 0, {
    ...n,
    parentId,
  });
  const changed = new Map(
    siblings.map((b, i) => [b.id, { ...b, position: i }]),
  );
  return nodes.map((b) => changed.get(b.id) || b);
}
export function indent(nodes, id) {
  const idx = index(nodes),
    n = idx.byId.get(id),
    siblings = idx.children.get(n.parentId) || [],
    at = siblings.findIndex((x) => x.id === id);
  if (at <= 0) return nodes;
  const p = siblings[at - 1];
  return move(nodes, id, p.id, (idx.children.get(p.id) || []).length).map(
    (x) => (x.id === p.id ? { ...x, collapsed: false } : x),
  );
}
export function outdent(nodes, id) {
  const idx = index(nodes),
    n = idx.byId.get(id),
    p = idx.byId.get(n.parentId);
  if (!p) return nodes;
  return move(
    nodes,
    id,
    p.parentId,
    (idx.children.get(p.parentId) || []).findIndex((x) => x.id === p.id) + 1,
  );
}
export function moveSibling(nodes, id, direction) {
  const idx = index(nodes),
    n = idx.byId.get(id);
  if (!n || ![-1, 1].includes(direction)) return nodes;
  const siblings = idx.children.get(n.parentId) || [],
    at = siblings.findIndex((x) => x.id === id),
    target = at + direction;
  if (at < 0 || target < 0 || target >= siblings.length) return nodes;
  return move(nodes, id, n.parentId, target);
}
export function parseOutlineText(value) {
  const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  const parsed = lines.map((raw) => {
    const indent = raw.match(/^[\t ]*/)?.[0] || "",
      width = [...indent].reduce((sum, char) => sum + (char === "\t" ? 2 : 1), 0);
    let text = raw.slice(indent.length),
      listType = "NONE",
      taskState = "NONE",
      match = text.match(/^(?:[-*\u2022]\s+)?\[([ xX])\]\s*/);
    if (match) {
      taskState = match[1].toLowerCase() === "x" ? "DONE" : "TODO";
      text = text.slice(match[0].length);
    } else if ((match = text.match(/^[-*+\u2022\u25e6\u25aa\u2023\u2219\u25cf\u25cb\u25a0\u25a1]\s+/))) {
      listType = "UNORDERED";
      text = text.slice(match[0].length);
    } else if ((match = text.match(/^\d+[.)]\s+/))) {
      listType = "ORDERED";
      text = text.slice(match[0].length);
    }
    return { depth: width, text, listType, taskState };
  });
  const widths = [];
  return parsed.map((line, i) => {
    const width = line.depth;
    if (!i) widths.push(width);
    else {
      while (widths.length > 1 && width < widths.at(-1)) widths.pop();
      if (widths.length === 1 && width < widths[0]) widths[0] = width;
      if (width > widths.at(-1)) widths.push(width);
    }
    return { ...line, depth: widths.length - 1 };
  });
}
export function pasteOutline(nodes, id, start, end, value, newIds = []) {
  const lines = Array.isArray(value) ? value : parseOutlineText(value);
  if (!lines.length) return null;
  const idx = index(nodes),
    n = idx.byId.get(id);
  if (!n) throw Error("This bullet no longer exists");
  start = Math.max(0, Math.min(start, n.text.length));
  end = Math.max(start, Math.min(end, n.text.length));
  if (newIds.length < lines.length - 1) throw Error("Missing pasted bullet IDs");
  const prefix = n.text.slice(0, start),
    suffix = n.text.slice(end),
    oldMarks = marks(n.formatting, n.text.length),
    leftMarks = oldMarks
      .filter((m) => m.start < start)
      .map((m) => ({ ...m, end: Math.min(m.end, start) }))
      .filter((m) => m.end > m.start),
    replaceWholeBullet = start === 0 && end === n.text.length,
    first = lines[0];
  let changed = nodes.map((item) =>
    item.id === id
      ? {
          ...item,
          text: prefix + first.text,
          formatting: encode([...leftMarks, ...marks(first.formatting || "", first.text.length).map(m => ({ ...m, start: m.start + prefix.length, end: m.end + prefix.length }))]),
          ...(replaceWholeBullet ? { codeLanguage: first.codeLanguage || "" } : {}),
          ...(replaceWholeBullet ? { blockStyle: n.blockStyle === 'divider' && lines.length === 1 && !first.codeLanguage && (!first.blockStyle || first.blockStyle === 'paragraph') ? 'divider' : first.blockStyle || 'paragraph' } : {}),
          ...(replaceWholeBullet && first.dividerStyle ? { dividerStyle: first.dividerStyle } : {}),
          ...(replaceWholeBullet && first.dividerColor ? { dividerColor: first.dividerColor } : {}),
          ...(lines[1]?.depth > 0 ? { collapsed: false } : {}),
          ...(replaceWholeBullet && first.listType !== "NONE"
            ? { listType: first.listType }
            : {}),
          ...(replaceWholeBullet && first.taskState !== "NONE"
            ? { taskState: first.taskState }
            : {}),
        }
      : item,
  );
  const depthIds = new Map([[0, id]]),
    insertions = new Map(),
    rootSiblings = idx.children.get(n.parentId) || [];
  insertions.set(n.parentId, rootSiblings.findIndex((item) => item.id === id) + 1);
  insertions.set(id, 0);
  let lastId = id,
    lastPastedLength = prefix.length + first.text.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i],
      newId = newIds[i - 1],
      parentId = line.depth === 0 ? n.parentId : depthIds.get(line.depth - 1) || id,
      added = bullet(newId, {
        text: line.text,
        listType: line.listType,
        taskState: line.taskState,
        formatting: line.formatting || "",
        codeLanguage: line.codeLanguage || "",
        ...(line.blockStyle ? { blockStyle: line.blockStyle } : {}),
        ...(line.dividerStyle ? { dividerStyle: line.dividerStyle } : {}),
        ...(line.dividerColor ? { dividerColor: line.dividerColor } : {}),
      });
    changed = [...changed, added];
    const at = insertions.get(parentId) ?? 0;
    changed = move(changed, newId, parentId, at);
    insertions.set(parentId, at + 1);
    if (!insertions.has(newId)) insertions.set(newId, 0);
    depthIds.set(line.depth, newId);
    for (const depth of [...depthIds.keys()])
      if (depth > line.depth) depthIds.delete(depth);
    lastId = newId;
    lastPastedLength = line.text.length;
  }
  const rightMarks = oldMarks
    .filter((m) => m.end > end)
    .map((m) => ({
      ...m,
      start: Math.max(m.start, end) - end + lastPastedLength,
      end: m.end - end + lastPastedLength,
    }))
    .filter((m) => m.end > m.start);
  changed = changed.map((item) =>
    item.id === lastId
      ? {
          ...item,
          text: item.text + suffix,
          formatting: encode([...marks(item.formatting, item.text.length), ...rightMarks]),
        }
      : item,
  );
  return {
    nodes: changed,
    lastId,
    caret: lastPastedLength,
    count: lines.length,
  };
}
export function marks(encoded, length) {
  return encoded
    .split(";")
    .map((s) => {
      const [a, b, style] = s.split(":");
      return { start: Number(a), end: Number(b), style };
    })
    .filter(
      (m) =>
        Number.isInteger(m.start) &&
        Number.isInteger(m.end) &&
        m.start >= 0 &&
        m.end > m.start &&
        m.end <= length &&
        (/^(BOLD|ITALIC|UNDERLINE|HIGHLIGHT|CODE|MASK)$/.test(m.style) ||
          /^(COLOR|HIGHLIGHT)_[0-9a-f]{6}$/i.test(m.style) || roughPattern.test(m.style)),
    );
}
export const encode = (ms) =>
  ms.map((m) => `${m.start}:${m.end}:${m.style}`).join(";");
export function split(nodes, id, start, end, newId = uuid()) {
  const idx = index(nodes),
    n = idx.byId.get(id);
  start = Math.max(0, Math.min(start, n.text.length));
  end = Math.max(start, Math.min(end, n.text.length));
  const cs = idx.children.get(id) || [];
  // An empty final child exits its branch on the next Enter.
  const siblings = idx.children.get(n.parentId) || [];
  if (!n.text && !cs.length && n.parentId && siblings.at(-1)?.id === id)
    return outdent(nodes, id);
  // At the start, insert above; keep the existing identity and children intact.
  if (start === 0 && end === 0 && n.text.length) {
    return move([...nodes, bullet(newId, { listType: n.listType })], newId,
      n.parentId, siblings.findIndex(x => x.id === id));
  }
  if (start === end && start === n.text.length && cs.length && !n.collapsed) {
    const added = bullet(newId, {
      listType: cs[0].listType,
      taskState: n.taskState === "NONE" ? "NONE" : "TODO",
      dueDate: n.taskState === "NONE" ? "" : n.dueDate,
    });
    return move([...nodes, added], newId, id, 0).map((x) =>
      x.id === id ? { ...x, collapsed: false } : x,
    );
  }
  const ms = marks(n.formatting, n.text.length),
    left = ms
      .filter((m) => m.start < start)
      .map((m) => ({ ...m, end: Math.min(m.end, start) }))
      .filter((m) => m.end > m.start),
    right = ms
      .filter((m) => m.end > end)
      .map((m) => ({
        ...m,
        start: Math.max(m.start, end) - end,
        end: m.end - end,
      }));
  const changed = nodes.map((x) =>
      x.id === id
        ? { ...x, text: n.text.slice(0, start), formatting: encode(left) }
        : x,
    ),
    added = bullet(newId, {
      text: n.text.slice(end),
      formatting: encode(right),
      listType: n.listType,
      taskState: n.taskState === "NONE" ? "NONE" : "TODO",
      dueDate: n.dueDate,
    });
  return move(
    [...changed, added],
    newId,
    n.parentId,
    (idx.children.get(n.parentId) || []).findIndex((x) => x.id === id) + 1,
  );
}
/** @param {string|null} scope */
export function merge(nodes, id, scope = null) {
  const rs = rows(nodes, scope),
    at = rs.findIndex((r) => r.bullet.id === id);
  if (at <= 0) return null;
  const n = rs[at].bullet,
    p = rs[at - 1].bullet,
    caret = p.text.length;
  let changed = nodes.map((x) =>
    x.id === p.id
      ? {
          ...x,
          text: p.text + n.text,
          formatting: encode([
            ...marks(p.formatting, p.text.length),
            ...marks(n.formatting, n.text.length).map((m) => ({
              ...m,
              start: m.start + caret,
              end: m.end + caret,
            })),
          ]),
        }
      : x,
  );
  for (const c of index(nodes).children.get(id) || [])
    changed = move(
      changed,
      c.id,
      p.id,
      (index(changed).children.get(p.id) || []).length,
    );
  changed = changed
    .filter((x) => x.id !== id)
    .map((x) =>
      x.id === p.id && (index(nodes).children.get(id) || []).length
        ? { ...x, collapsed: false }
        : x,
    );
  return { nodes: changed, id: p.id, caret };
}
export function inferDeckLayout(nodes, rootId) {
  const idx = index(nodes), children = (idx.children.get(rootId) || []).filter(n => n.blockStyle !== 'divider');
  if (idx.byId.get(rootId)?.kind === 'QUESTION' || children.some(node => node.kind === 'QUESTION')) return 'FLAT';
  return children.some(topic => (idx.children.get(topic.id) || []).filter(n => n.blockStyle !== 'divider').some(question => (idx.children.get(question.id) || []).filter(n => n.blockStyle !== 'divider').length)) ? 'TOPICS' : 'FLAT';
}
export function flashcardSources(nodes, decks, media = []) {
  const idx = index(nodes),
    questionIds = new Set(
      nodes.filter((n) => n.kind === "QUESTION" && n.blockStyle !== 'divider').map((n) => n.id),
    ),
    generated = new Set();
  const ordinals = new Map();
  for (const siblings of idx.children.values())
    siblings
      .filter((n) => n.listType === "ORDERED")
      .forEach((n, i) => ordinals.set(n.id, i + 1));
  for (const d of decks) {
    if (d.layout === 'TOPICS') {
      for (const topic of (idx.children.get(d.rootId) || []).filter(t => t.blockStyle !== 'divider')) {
        questionIds.delete(topic.id);
        for (const question of idx.children.get(topic.id) || [])
          if (question.blockStyle !== 'divider' && (idx.children.get(question.id) || []).filter(c => c.blockStyle !== 'divider').length) generated.add(question.id);
      }
      continue;
    }
    const stack = [[d.rootId, 0]];
    let pairs = 0;
    while (stack.length) {
      const [id, depth] = stack.pop(),
        cs = (idx.children.get(id) || []).filter(c => c.blockStyle !== 'divider');
      if (depth % 2 === 1 && cs.length && idx.byId.get(id)?.blockStyle !== 'divider') { generated.add(id); pairs++; }
      for (let i = cs.length - 1; i >= 0; i--)
        stack.push([cs[i].id, depth + 1]);
    }
    // A single question with direct answer bullets is also a useful one-card deck.
    if (!pairs && (idx.children.get(d.rootId) || []).filter(c => c.blockStyle !== 'divider').length && idx.byId.get(d.rootId)?.blockStyle !== 'divider') generated.add(d.rootId);
  }
  const excluded = new Set([...questionIds, ...generated]),
    mediaIds = new Set(media.map((m) => m.bulletId)),
    out = [];
  for (const { bullet: q } of indexedRows(idx, null, true)) {
    if (q.mirrorSourceId || q.blockStyle === 'divider' || (!q.text.trim() && !mediaIds.has(q.id)) || !excluded.has(q.id)) continue;
    const answers = (idx.children.get(q.id) || []).filter(a => !excluded.has(a.id) && a.blockStyle !== 'divider');
    const lines = [], answerRows = [],
      stack = answers
        .slice()
        .reverse()
        .map((b) => [b, 0]);
    while (stack.length) {
      const [b, depth] = stack.pop(),
        ordinal = ordinals.get(b.id) || 1;
      answerRows.push({ node: b, depth, ordinal });
      const prefix =
        b.taskState === "TODO"
          ? "☐ "
          : b.taskState === "DONE"
            ? "☑ "
            : b.listType === "UNORDERED"
              ? "• "
              : b.listType === "ORDERED"
                ? `${ordinal}. `
                : "";
      if (b.text.trim() || mediaIds.has(b.id))
        lines.push("  ".repeat(Math.min(depth, 100)) + prefix + (b.text.trim() || "[Image]"));
      const cs = idx.children.get(b.id) || [];
      for (let i = cs.length - 1; i >= 0; i--)
        if (!excluded.has(cs[i].id) && cs[i].kind !== "QUESTION" && cs[i].blockStyle !== 'divider')
          stack.push([cs[i], depth + 1]);
    }
    if (lines.length) out.push({ id: q.id, question: q.text.trim() || "[Image question]", answer: lines.join("\n"), node: q, answerRows });
  }
  return out;
}
export function generatedCards(nodes, decks, media = []) {
  return flashcardSources(nodes, decks, media).map(({ id, question, answer }) => ({ id, question, answer }));
}
export function refreshCards(nodes, decks, media, cards, now) {
  const derived = generatedCards(nodes, decks, media),
    ids = new Set(derived.map((c) => c.id)),
    old = new Map(cards.map((c) => [c.id, c]));
  const result = cards.map((c) =>
    !ids.has(c.id) && c.state === "ACTIVE" ? { ...c, state: "INACTIVE" } : c,
  );
  const positions = new Map(result.map((c, i) => [c.id, i]));
  for (const c of derived) {
    const prior = old.get(c.id),
      next = prior
        ? prior.question===c.question&&prior.answer===c.answer&&prior.state==="ACTIVE"?prior:{ ...prior, question: c.question, answer: c.answer, state: "ACTIVE" }
        : {
            ...c,
            conceptId: c.id,
            sourceLabel: null,
            state: "ACTIVE",
            dueAtEpochMillis: now,
            difficulty: 5,
            stability: 0,
            retrievability: 1,
            createdAtEpochMillis: now,
            repetitionCount: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            lastReviewAtEpochMillis: 0,
            suspended: 0,
            buriedUntilEpochMillis: 0,
          };
    const i = positions.get(c.id);
    if (i === undefined) {
      positions.set(c.id, result.length);
      result.push(next);
    } else result[i] = next;
  }
  return result;
}
export function schedule(card, grade, now) {
  if (!["AGAIN", "HARD", "GOOD", "EASY"].includes(grade))
    throw Error("Invalid grade");
  const q = { AGAIN: 2, HARD: 3, GOOD: 4, EASY: 5 }[grade],
    ease = Math.max(
      1.3,
      Math.min(3.5, card.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    ),
    rep = grade === "AGAIN" ? 0 : card.repetitionCount + 1,
    base =
      rep === 0
        ? 0
        : rep === 1
          ? 1
          : rep === 2
            ? 6
            : Math.ceil(Math.max(1, card.intervalDays) * card.easeFactor);
  const days = Math.max(
    0,
    Math.min(
      36500,
      grade === "AGAIN"
        ? 0
        : grade === "HARD"
          ? rep === 1
            ? 1
            : Math.max(card.intervalDays + 1, Math.ceil(base * 0.8))
          : grade === "EASY"
            ? rep === 1
              ? 3
              : Math.ceil(base * 1.3)
            : base,
    ),
  );
  return {
    ...card,
    repetitionCount: rep,
    intervalDays: days,
    easeFactor: ease,
    lastReviewAtEpochMillis: now,
    dueAtEpochMillis: now + (grade === "AGAIN" ? 600000 : days * 86400000),
  };
}
