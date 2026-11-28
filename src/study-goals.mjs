import { bullet, uuid } from "./domain.mjs";
import { internalLink, noteLinks } from "./relations.mjs";
import { noteTrait } from "./traits-block.mjs";
import { withNodes } from "./workspace-nodes.mjs";
import { createStudyContext, scopedCards, dueCards } from "./study.mjs";
import { dayKey } from "./weekly-review.mjs";
const tagged = (n) =>
  /(?:^|\s)#StudyGoal(?=$|\s)/i.test(n.text) && !n.mirrorSourceId;
export function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function calendarDays(from, to) {
  if (!validDay(from) || !validDay(to))
    throw Error("Choose a valid target date.");
  return (
    Math.round(
      (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
        86400000,
    ) + 1
  );
}
export function studyGoals(doc) {
  return doc.tables.bullets.filter(tagged).map((node) => {
    const field = (k) => noteTrait(doc, node.id, k) || "",
      deck = noteLinks(field("Deck"))[0]?.id,
      group = doc.tables.bullets.find(
        (n) => n.parentId === node.id && n.text === "Cards",
      ),
      ids = group
        ? doc.tables.bullets
            .filter((n) => n.parentId === group.id)
            .flatMap((n) => noteLinks(n.text).map((l) => l.id))
        : [];
    return {
      id: node.id,
      title: node.text.replace(/#StudyGoal\b/gi, "").trim(),
      deck,
      target: field("Target date"),
      minutes: Number(field("Daily minutes")),
      seconds: field("Seconds per card")
        ? Number(field("Seconds per card"))
        : null,
      created: Number(field("Created")),
      cards: [...new Set(ids)],
    };
  });
}
export function goalForecast(
  doc,
  goal,
  now = Date.now(),
  context = createStudyContext(doc, now),
) {
  const deck = doc.tables.decks.find((d) => d.rootId === goal.deck),
    node = doc.tables.bullets.find((n) => n.id === goal.deck);
  if (!deck || !node)
    return {
      error:
        "The deck is unavailable. Open the goal note to choose an existing deck.",
    };
  if (
    !validDay(goal.target) ||
    !Number.isInteger(goal.minutes) ||
    goal.minutes < 1 ||
    goal.minutes > 240 ||
    (goal.seconds !== null &&
      (!Number.isInteger(goal.seconds) ||
        goal.seconds < 5 ||
        goal.seconds > 600)) ||
    !Number.isFinite(goal.created) ||
    goal.created <= 0 ||
    !goal.cards.length
  )
    return {
      error:
        "Some goal fields are missing or invalid. Open the goal note to fix them.",
    };
  const eligible = scopedCards(doc, goal.deck, now, context),
    by = new Map(doc.tables.cards.map((c) => [c.id, c])),
    eligibleIds = new Set(eligible.map((c) => c.id)),
    logged = new Set(
      doc.tables.review_logs
        .filter(
          (l) =>
            l.mode === "SPACED" &&
            l.reviewedAtEpochMillis >= goal.created &&
            l.reviewedAtEpochMillis <= now,
        )
        .map((l) => l.cardId),
    );
  const completed = goal.cards.filter(
      (id) =>
        logged.has(id) ||
        (by.get(id)?.lastReviewAtEpochMillis >= goal.created &&
          by.get(id)?.lastReviewAtEpochMillis <= now),
    ),
    done = new Set(completed),
    unavailable = goal.cards.filter(
      (id) => !done.has(id) && !eligibleIds.has(id),
    ),
    remaining = goal.cards.length - completed.length;
  const samples = doc.tables.review_logs
    .filter(
      (l) =>
        l.mode === "SPACED" &&
        eligibleIds.has(l.cardId) &&
        l.reviewedAtEpochMillis <= now &&
        l.reviewedAtEpochMillis >= now - 90 * 86400000 &&
        Number.isFinite(l.responseTimeMillis) &&
        l.responseTimeMillis >= 5000 &&
        l.responseTimeMillis <= 600000,
    )
    .sort((a, b) => b.reviewedAtEpochMillis - a.reviewedAtEpochMillis)
    .slice(0, 100)
    .map((l) => l.responseTimeMillis / 1000)
    .sort((a, b) => a - b);
  const seconds =
      goal.seconds ??
      (samples.length >= 5
        ? Math.max(10, Math.ceil(samples[Math.floor(samples.length / 2)]))
        : 45),
    pace = goal.seconds
      ? "your pace"
      : samples.length >= 5
        ? "recent response-time estimate"
        : "45-second fallback";
  const days = calendarDays(dayKey(now), goal.target),
    activeDays = Math.max(1, days),
    due = dueCards(doc, goal.deck, now, context),
    reviews = due.filter((c) => !!c.lastReviewAtEpochMillis).length,
    newAllowed = due.filter(
      (c) =>
        !c.lastReviewAtEpochMillis &&
        goal.cards.includes(c.id) &&
        !done.has(c.id),
    ).length,
    perDay = Math.ceil(remaining / activeDays),
    room = Math.max(
      0,
      Math.floor((goal.minutes * 60 - reviews * seconds) / (seconds * 2)),
    ),
    newToday = days < 1 ? 0 : Math.min(newAllowed, perDay, room);
  const horizon = new Date(goal.target + "T23:59:59.999").getTime(),
    scheduled = eligible.filter(
      (c) => c.lastReviewAtEpochMillis && c.dueAtEpochMillis <= horizon,
    ).length,
    knownMinutes = Math.ceil(((scheduled + remaining * 2) * seconds) / 60);
  return {
    title: node.text,
    total: goal.cards.length,
    completed: completed.length,
    remaining,
    unavailable: unavailable.length,
    days,
    seconds,
    pace,
    reviews,
    newToday,
    perDay,
    knownMinutes,
    overBudget: knownMinutes > goal.minutes * activeDays,
    expired: days < 1,
  };
}
export function createStudyGoal(doc, draft, make = uuid, now = Date.now()) {
  if (doc.tables.bullets.some((n) => n.id === draft.id)) return doc;
  if (
    typeof draft.id !== "string" ||
    !draft.id ||
    typeof draft.title !== "string" ||
    !draft.title.trim() ||
    draft.title.length > 160 ||
    !validDay(draft.target) ||
    calendarDays(dayKey(now), draft.target) < 1 ||
    calendarDays(dayKey(now), draft.target) > 366 ||
    !Number.isInteger(draft.minutes) ||
    draft.minutes < 1 ||
    draft.minutes > 240 ||
    !Number.isInteger(draft.count) ||
    draft.count < 1 ||
    draft.count > 500 ||
    (draft.seconds !== null &&
      (!Number.isInteger(draft.seconds) ||
        draft.seconds < 5 ||
        draft.seconds > 600))
  )
    throw Error(
      "Choose a title, target within one year, 1–240 daily minutes and 1–500 new cards.",
    );
  const deck = doc.tables.decks.find((d) => d.rootId === draft.deck),
    source = doc.tables.bullets.find((n) => n.id === draft.deck);
  if (!deck || !source) throw Error("The selected deck was removed.");
  const introduced = new Set(
    doc.tables.review_logs
      .filter((l) => l.mode === "SPACED" && l.reviewedAtEpochMillis <= now)
      .map((l) => l.cardId),
  );
  const cards = scopedCards(doc, draft.deck, now)
    .filter((c) => !c.lastReviewAtEpochMillis && !introduced.has(c.id))
    .slice(0, draft.count);
  if (cards.length < draft.count)
    throw Error("There are fewer available new cards than this goal requests.");
  const traits = make(),
    group = make(),
    rows = [
      bullet(draft.id, {
        text: draft.title.trim() + " #StudyGoal",
        position:
          Math.max(
            -1,
            ...doc.tables.bullets
              .filter((n) => !n.parentId)
              .map((n) => n.position),
          ) + 1,
      }),
      bullet(traits, { parentId: draft.id, text: "Traits", traitsBlock: true }),
      bullet(group, { parentId: draft.id, position: 1, text: "Cards" }),
    ];
  for (const [i, [key, value]] of [
    ["Deck", internalLink(source)],
    ["Target date", draft.target],
    ["Daily minutes", draft.minutes],
    ["Seconds per card", draft.seconds ?? ""],
    ["Created", now],
  ].entries())
    rows.push(
      bullet(make(), {
        parentId: traits,
        position: i,
        text: key + ": " + value,
      }),
    );
  cards.forEach((c, i) => {
    const n = doc.tables.bullets.find((n) => n.id === c.id);
    if (!n) throw Error("A card source is unavailable.");
    rows.push(
      bullet(make(), { parentId: group, position: i, text: internalLink(n) }),
    );
  });
  return withNodes(doc, [...doc.tables.bullets, ...rows]);
}
export function archiveStudyGoal(doc, id) {
  const node = doc.tables.bullets.find((n) => n.id === id);
  if (!node || !tagged(node)) throw Error("This goal changed. Reopen it.");
  return withNodes(
    doc,
    doc.tables.bullets.map((n) =>
      n.id === id
        ? { ...n, text: n.text.replace(/#StudyGoal\b/gi, "#StudyGoalArchived") }
        : n,
    ),
  );
}
