import {widgetExtras} from './widget-suite.mjs';
import {contentDigest as widgetDigest} from './content-digest.mjs';
export {widgetDigest};
// Native widgets are views of normal study data. Only this canonical app path grades cards.
import { bullet, flashcardSources } from "./domain.mjs";
import {
  createStudyContext,
  dueCards,
  scopedCards,
  reviewCard,
  deckOwners,
  intervalLabel,
} from "./study.mjs";
import { displayText } from "./relations.mjs";
import { fsrsSettings } from "./fsrs-scheduler.mjs";

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
  typeof value === "string" &&
  value.length > 0 &&
  !value.includes("\0") &&
  new TextEncoder().encode(value).length <= 200;
// Presentation labels may shorten; study questions and answers never do.
function label(value, limit) {
  let result = "",
    size = 0;
  for (const character of String(value)) {
    const bytes = new TextEncoder().encode(character).length;
    if (size + bytes > limit) break;
    result += character;
    size += bytes;
  }
  return result;
}
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

function sourceContext(
  doc,
  owners = deckOwners(doc.tables.bullets, doc.tables.decks),
) {
  const media = new Set((doc.tables.media || []).map((item) => item.bulletId));
  const sources = new Map(
    flashcardSources(
      doc.tables.bullets,
      doc.tables.decks,
      doc.tables.media || [],
    ).map((source) => [source.id, source]),
  );
  return { media, sources, owners, settings: new Map() };
}
function supportedSource(doc, card, context) {
  const source = context.sources.get(card.id);
  if (
    !source ||
    doc.web?.mcqs?.[card.id] ||
    doc.web?.occlusions?.[card.id] ||
    source.node.mirrorSourceId ||
    !safeScope(card.id)
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
    question.includes("\0") ||
    answer.includes("\0") ||
    question.length > WIDGET_LIMITS.question ||
    answer.length > WIDGET_LIMITS.answer
  )
    return null;
  if (card.question !== question || card.answer !== answer) return null;
  const owner = context.owners.get(card.id) || "__default__";
  if (!context.settings.has(owner))
    context.settings.set(owner, fsrsSettings(doc, owner));
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
        settings: context.settings.get(owner),
      }),
    ),
  );
  return { id: card.id, fingerprint, question, answer, intervals: Object.fromEntries([...GRADES].map(grade=>[grade,intervalLabel(card,grade,context.now,doc)])) };
}

export function createWidgetSnapshot(
  doc,
  scope,
  workspaceName,
  now = Date.now(),
) {
  if (!safeScope(scope) || !safeTime(now))
    throw Error("Invalid widget workspace.");
  const context = createStudyContext(doc, now),
    source = {...sourceContext(doc, context.owners),now},
    definitions = [
      { id: WIDGET_ALL_DECKS, title: "All flashcards" },
      ...doc.tables.decks
        .filter(
          (deck) =>
            safeScope(deck.rootId) &&
            doc.web?.deckTypes?.[deck.rootId] !== "MCQ" &&
            doc.tables.bullets.some(
              (node) => node.id === deck.rootId && !node.mirrorSourceId,
            ),
        )
        .slice(0, WIDGET_LIMITS.decks - 1)
        .map((deck) => ({
          id: deck.rootId,
          title: label(
            displayText(
              doc.tables.bullets.find((node) => node.id === deck.rootId)
                ?.text || "Untitled deck",
            ),
            500,
          ),
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
    const deckCards=scopedCards(doc,deck.id===WIDGET_ALL_DECKS?null:deck.id,now,context);
    const ids=new Set(deckCards.map(card=>card.id));
    const day=new Date(now);day.setHours(0,0,0,0);
    const morning=new Date(day);morning.setDate(morning.getDate()+1);morning.setHours(9);
    const doneToday=new Set(doc.tables.review_logs.filter(log=>ids.has(log.cardId)&&log.mode==="SPACED"&&log.reviewedAtEpochMillis>=day.getTime()&&log.reviewedAtEpochMillis<=now).map(log=>log.cardId)).size;
    const tomorrow=deckCards.filter(card=>card.dueAtEpochMillis>now&&card.dueAtEpochMillis<=morning.getTime()).length;
    return { ...deck, cards, doneToday, tomorrow };
  });
  return {
    schema: 3,
    ...widgetExtras(doc,now),
    appearance: {palette: "marigold", dynamic: false},
    scope,
    workspaceName: label(workspaceName || "My notes", 200),
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
