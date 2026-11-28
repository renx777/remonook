import { bullet, index, uuid } from "./domain.mjs";
import { internalLink } from "./relations.mjs";
import { taskCatalog } from "./tasks.mjs";
import { inboxItems } from "./inbox.mjs";
import { traitBulletIds } from "./traits-block.mjs";
import { withNodes } from "./workspace-nodes.mjs";
import { addDays } from "./natural-date.mjs";
export const dayKey = (now = Date.now()) => {
  const d = new Date(now);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export function weekKey(now = Date.now()) {
  const d = new Date(now);
  return addDays(dayKey(now), -((d.getDay() + 6) % 7));
}
export function weeklyReview(doc, now = Date.now()) {
  const today = dayKey(now),
    from = addDays(today, -6),
    until = addDays(today, 7),
    start = new Date(from + "T00:00:00").getTime(),
    tasks = taskCatalog(doc, today).tasks,
    hidden = traitBulletIds(doc.tables.bullets),
    idx = index(doc.tables.bullets);
  const omit = new Set();
  for (const n of doc.tables.bullets)
    if (/(?:^|\s)#(?:WeeklyReview|StudyGoal|Citation)(?=$|\s)/i.test(n.text)) {
      const stack = [n.id];
      while (stack.length) {
        const id = stack.pop();
        if (omit.has(id)) continue;
        omit.add(id);
        for (const c of idx.children.get(id) || []) stack.push(c.id);
      }
    }
  const logs = doc.tables.review_logs.filter(
    (l) =>
      l.mode === "SPACED" &&
      Number.isFinite(l.reviewedAtEpochMillis) &&
      l.reviewedAtEpochMillis >= start &&
      l.reviewedAtEpochMillis <= now,
  );
  const measured = logs.filter(
    (l) =>
      Number.isFinite(l.responseTimeMillis) &&
      l.responseTimeMillis >= 0 &&
      l.responseTimeMillis <= 600000,
  );
  const recent = doc.tables.bullets
    .filter(
      (n) =>
        !n.mirrorSourceId &&
        !hidden.has(n.id) &&
        !omit.has(n.id) &&
        (doc.web.noteTimes?.[n.id]?.updatedAt || 0) >= start &&
        (doc.web.noteTimes?.[n.id]?.updatedAt || 0) <= now,
    )
    .sort(
      (a, b) =>
        doc.web.noteTimes[b.id].updatedAt - doc.web.noteTimes[a.id].updatedAt ||
        a.id.localeCompare(b.id),
    );
  return {
    today,
    from,
    until,
    inbox: inboxItems(doc),
    overdue: tasks
      .filter(
        (t) => t.node.taskState === "TODO" && t.deadline && t.deadline < today,
      )
      .map((t) => t.node),
    waiting: tasks
      .filter(
        (t) => t.node.taskState === "TODO" && t.plan.taskPlanning === "WAITING",
      )
      .map((t) => t.node),
    upcoming: tasks
      .filter(
        (t) =>
          t.node.taskState === "TODO" &&
          [t.deadline, t.plan.scheduledDate].some(
            (d) => d > today && d <= until,
          ),
      )
      .map((t) => t.node),
    completed: tasks.filter((t) => t.node.taskState === "DONE").length,
    recent,
    reviews: logs.length,
    distinctCards: new Set(logs.map((l) => l.cardId)).size,
    recordedMinutes: Math.round(
      measured.reduce((n, l) => n + l.responseTimeMillis, 0) / 60000,
    ),
    unmeasured: logs.length - measured.length,
  };
}
export function saveWeeklyReview(doc, draft, now = Date.now(), make = uuid) {
  if (
    typeof draft.id !== "string" ||
    !draft.id ||
    typeof draft.wins !== "string" ||
    typeof draft.next !== "string" ||
    draft.wins.length > 4000 ||
    draft.next.length > 4000
  )
    throw Error("Keep each reflection to 4,000 characters.");
  if (doc.tables.bullets.some((n) => n.id === draft.id)) return doc;
  const s = weeklyReview(doc, now),
    rows = [
      bullet(draft.id, {
        text: "Weekly review · " + s.today + " #WeeklyReview",
        position:
          Math.max(
            -1,
            ...doc.tables.bullets
              .filter((n) => !n.parentId)
              .map((n) => n.position),
          ) + 1,
      }),
    ];
  const section = (title, lines) => {
    const id = make();
    rows.push(
      bullet(id, {
        parentId: draft.id,
        position: rows.filter((n) => n.parentId === draft.id).length,
        text: title,
      }),
    );
    for (const [i, text] of lines.entries())
      rows.push(bullet(make(), { parentId: id, position: i, text }));
  };
  section("Summary", [
    s.inbox.length + " Inbox captures",
    s.overdue.length + " overdue deadlines",
    s.waiting.length + " waiting tasks",
    s.upcoming.length + " upcoming tasks",
    s.completed + " completed tasks (all time)",
    s.reviews +
      " spaced reviews across " +
      s.distinctCards +
      " cards in the past seven days",
    s.recordedMinutes +
      " minutes of recorded response time (not total study time)",
  ]);
  for (const [name, list] of [
    ["Inbox", s.inbox],
    ["Overdue", s.overdue],
    ["Waiting", s.waiting],
    ["Upcoming", s.upcoming],
    ["Recently edited", s.recent],
  ])
    section(
      name,
      list
        .slice(0, 30)
        .map(internalLink)
        .concat(
          list.length > 30
            ? [
                list.length -
                  30 +
                  " additional items remain in the original view",
              ]
            : [],
        ),
    );
  section("Wins", [draft.wins.trim() || ""]);
  section("Next week", [draft.next.trim() || ""]);
  return withNodes(doc, [...doc.tables.bullets, ...rows]);
}
