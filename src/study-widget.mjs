// Native widgets are views of normal study data. Only this canonical app path grades cards.
import { bullet, flashcardSources } from "./domain.mjs";
import {
  createStudyContext,
  dueCards,
  scopedCards,
  reviewCard,
  reviewSettings,
} from "./study.mjs";
import { displayText } from "./relations.mjs";

export const WIDGET_ALL_DECKS = "__all_flashcards__";
export const WIDGET_LIMITS = Object.freeze({
  decks: 32,
  cards: 30,
  question: 2000,
  answer: 8000,
});
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const GRADES = new Set(["AGAIN", "HARD", "GOOD", "EASY"]);
const safeScope = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 300;
const safeTime = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

// SHA-256 is synchronous because fingerprinting must be inside the same mutation/read turn.
// This identifies changed content, never authorizes an action. Native entry points also validate scope.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotate = (x, n) => (x >>> n) | (x << (32 - n));
export function widgetDigest(text) {
  const input = new TextEncoder().encode(text),
    bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input);
  bytes[input.length] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
  view.setUint32(bytes.length - 4, input.length * 8);
  const state = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ],
    w = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15],
        b = w[i - 2],
        s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3),
        s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25),
        ch = (e & f) ^ (~e & g),
        t1 = (h + s1 + ch + K[i] + w[i]) >>> 0,
        s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22),
        maj = (a & b) ^ (a & c) ^ (b & c),
        t2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      state[i] = (state[i] + value) >>> 0;
    });
  }
  return state.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function sourceContext(doc) {
  const media = new Set((doc.tables.media || []).map((item) => item.bulletId));
  const sources = new Map(
    flashcardSources(
      doc.tables.bullets,
      doc.tables.decks,
      doc.tables.media || [],
    ).map((source) => [source.id, source]),
  );
  return { media, sources };
}
function supportedSource(doc, card, context) {
  const source = context.sources.get(card.id);
  if (
    !source ||
    doc.web?.mcqs?.[card.id] ||
    doc.web?.occlusions?.[card.id] ||
    source.node.mirrorSourceId
  )
    return null;
  const nodes = [source.node, ...source.answerRows.map((row) => row.node)];
  if (
    nodes.some(
      (node) =>
        context.media.has(node.id) ||
        node.formatting ||
        node.codeLanguage ||
        (node.blockStyle && node.blockStyle !== "paragraph") ||
        /\$|```|\[\[|https?:\/\/|!\[/.test(node.text),
    )
  )
    return null;
  const question = source.question,
    answer = source.answer;
  if (
    !question.trim() ||
    !answer.trim() ||
    question.length > WIDGET_LIMITS.question ||
    answer.length > WIDGET_LIMITS.answer
  )
    return null;
  if (card.question !== question || card.answer !== answer) return null;
  const fingerprint = widgetDigest(
    JSON.stringify(
      canonical({
        card,
        source: nodes.map((node) => ({
          id: node.id,
          parentId: node.parentId,
          position: node.position,
          text: node.text,
          kind: node.kind,
          formatting: node.formatting,
          listType: node.listType,
          taskState: node.taskState,
        })),
        settings: reviewSettings(doc, card),
      }),
    ),
  );
  return { id: card.id, fingerprint, question, answer };
}

export function createWidgetSnapshot(
  doc,
  scope,
  workspaceName,
  now = Date.now(),
) {
  if (!safeScope(scope) || !safeTime(now))
    throw Error("Invalid widget workspace.");
  const source = sourceContext(doc),
    context = createStudyContext(doc, now),
    definitions = [
      { id: WIDGET_ALL_DECKS, title: "All flashcards" },
      ...doc.tables.decks
        .filter(
          (deck) =>
            doc.web?.deckTypes?.[deck.rootId] !== "MCQ" &&
            doc.tables.bullets.some(
              (node) => node.id === deck.rootId && !node.mirrorSourceId,
            ),
        )
        .slice(0, WIDGET_LIMITS.decks - 1)
        .map((deck) => ({
          id: deck.rootId,
          title: displayText(
            doc.tables.bullets.find((node) => node.id === deck.rootId)?.text ||
              "Untitled deck",
          ).slice(0, 200),
        })),
    ];
  let remaining = 3 * 1024 * 1024;
  const cached = new Map();
  const decks = definitions.map((deck) => {
    const cards = [];
    for (const card of dueCards(
      doc,
      deck.id === WIDGET_ALL_DECKS ? null : deck.id,
      now,
      context,
    )) {
      if (!cached.has(card.id))
        cached.set(card.id, supportedSource(doc, card, source));
      const item = cached.get(card.id);
      if (!item) continue;
      const size = new TextEncoder().encode(JSON.stringify(item)).length + 2;
      if (size > remaining) continue;
      cards.push(item);
      remaining -= size;
      if (cards.length === WIDGET_LIMITS.cards) break;
    }
    return { ...deck, cards };
  });
  return {
    schema: 1,
    scope,
    workspaceName: String(workspaceName || "My notes").slice(0, 200),
    revision:
      Number.isSafeInteger(doc.revision) && doc.revision >= 0
        ? doc.revision
        : 0,
    updatedAt: now,
    decks,
  };
}

function recovery(doc, intent, reason, now) {
  const root = "remonook-widget-recovery",
    id = "widget-review-" + intent.id.toLowerCase(),
    nodes = [...doc.tables.bullets];
  if (!nodes.some((node) => node.id === root))
    nodes.push(
      bullet(root, {
        text: "Recovered widget reviews",
        position:
          Math.max(
            -1,
            ...nodes
              .filter((node) => !node.parentId)
              .map((node) => node.position),
          ) + 1,
      }),
    );
  if (!nodes.some((node) => node.id === id)) {
    const text = `Widget review preserved\n${reason}\n\nQuestion: ${intent.question}\n\nAnswer: ${intent.answer}\n\nGrade: ${intent.grade}\nRecorded on this device: ${new Date(intent.reviewedAt).toISOString()}\nEvent: ${intent.id}`;
    nodes.push(
      bullet(id, {
        parentId: root,
        position: nodes.filter((node) => node.parentId === root).length,
        text,
      }),
    );
  }
  return {
    doc: {
      ...doc,
      tables: { ...doc.tables, bullets: nodes },
      web: {
        ...doc.web,
        widgetReviewRecoveries: {
          ...doc.web?.widgetReviewRecoveries,
          [intent.id.toLowerCase()]: {
            at: now,
            cardId: intent.cardId,
            grade: intent.grade,
            reason,
          },
        },
      },
    },
    outcome: "recovered",
    notice:
      "A widget review could not be applied to the current card. Its question, answer and grade were kept in “Recovered widget reviews”.",
  };
}

export function applyWidgetReview(doc, intent, scope, now = Date.now()) {
  if (
    !intent ||
    intent.schema !== 1 ||
    !UUID.test(intent.id || "") ||
    !safeScope(scope) ||
    intent.scope !== scope
  )
    throw Error("Widget review belongs to another workspace or is invalid.");
  if (
    !GRADES.has(intent.grade) ||
    typeof intent.deckId !== "string" ||
    !intent.deckId ||
    typeof intent.cardId !== "string" ||
    !intent.cardId ||
    typeof intent.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(intent.fingerprint) ||
    typeof intent.question !== "string" ||
    intent.question.length > WIDGET_LIMITS.question ||
    typeof intent.answer !== "string" ||
    intent.answer.length > WIDGET_LIMITS.answer ||
    !safeTime(intent.reviewedAt) ||
    !safeTime(now)
  )
    throw Error(
      "Invalid widget review. The pending event is kept on this device.",
    );
  const id = intent.id.toLowerCase();
  if (
    doc.tables.review_logs.some(
      (log) => log.widgetEventId?.toLowerCase() === id,
    ) ||
    doc.web?.widgetReviewRecoveries?.[id]
  )
    return { doc, outcome: "duplicate", notice: undefined };
  if (intent.reviewedAt > now + 5 * 60000)
    return recovery(
      doc,
      intent,
      "The device clock recorded this review in the future.",
      now,
    );
  const deckScope = intent.deckId === WIDGET_ALL_DECKS ? null : intent.deckId;
  if (deckScope && !doc.tables.decks.some((deck) => deck.rootId === deckScope))
    return recovery(
      doc,
      intent,
      "The selected deck is no longer available.",
      now,
    );
  if (doc.web?.deckTypes?.[deckScope] === "MCQ")
    return recovery(
      doc,
      intent,
      "This deck is now a multiple-choice notebook.",
      now,
    );
  const card = doc.tables.cards.find((card) => card.id === intent.cardId),
    source = card && supportedSource(doc, card, sourceContext(doc));
  if (
    !source ||
    source.fingerprint !== intent.fingerprint ||
    source.question !== intent.question ||
    source.answer !== intent.answer
  )
    return recovery(
      doc,
      intent,
      "The source content or study schedule changed after this question was cached.",
      now,
    );
  if (
    intent.reviewedAt < card.createdAtEpochMillis ||
    intent.reviewedAt < (card.lastReviewAtEpochMillis || 0)
  )
    return recovery(
      doc,
      intent,
      "The review time is earlier than the current card history.",
      now,
    );
  if (
    !scopedCards(doc, deckScope, intent.reviewedAt).some(
      (item) => item.id === card.id,
    ) ||
    !dueCards(doc, deckScope, intent.reviewedAt).some(
      (item) => item.id === card.id,
    )
  )
    return recovery(
      doc,
      intent,
      "This card was no longer available for a due review.",
      now,
    );
  const session = {
    id: "widget-" + id,
    scope: deckScope,
    mode: "SPACED",
    tag: "native-widget",
    queueJson: JSON.stringify([card.id]),
    cursor: 0,
    reviewed: 0,
    revealed: 1,
    updatedAt: intent.reviewedAt,
  };
  let next;
  try {
    next = reviewCard(doc, session, intent.grade, 0, intent.reviewedAt);
  } catch (error) {
    return recovery(
      doc,
      intent,
      "The current schedule could not accept this review: " +
        String(error?.message || error).slice(0, 180),
      now,
    );
  }
  const originalIds = new Set(doc.tables.review_logs.map((log) => log.id));
  const review_logs = next.tables.review_logs.map((log) =>
    originalIds.has(log.id) ? log : { ...log, widgetEventId: id },
  );
  const columns = next.columns
    ? {
        ...next.columns,
        review_logs: [
          ...new Set([...next.columns.review_logs, "widgetEventId"]),
        ],
      }
    : undefined;
  return {
    doc: {
      ...next,
      ...(columns ? { columns } : {}),
      tables: {
        ...next.tables,
        review_logs,
        study_sessions: doc.tables.study_sessions,
      },
    },
    outcome: "applied",
    notice: undefined,
  };
}
